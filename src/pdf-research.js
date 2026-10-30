const PDF_MARK_COLORS = { mint: '#35d6a1', amber: '#f2c65c', violet: '#ae8ff0' };

async function openResearchLink(address) {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('常用链接仅支持 HTTP 或 HTTPS');
  const shell = window.require?.('electron')?.shell;
  if (shell?.openExternal) await shell.openExternal(url.href);
  else window.open(url.href, '_blank', 'noopener,noreferrer');
}

class PdfResearch {
  constructor(plugin) {
    this.plugin = plugin; this.app = plugin.app; this.revision = 0;
    this._queues = new Map(); this._deleted = new Map(); this._readers = new Map();
    if (!plugin.settings.pdfReadingPositions) plugin.settings.pdfReadingPositions = {};
  }
  start() {
    this.plugin.registerDomEvent(this.app.workspace.containerEl, 'pointerup', () => {
      window.clearTimeout(this._selectionTimer);
      this._selectionTimer = window.setTimeout(() => this.captureSelection(), 80);
    });
    this.observer = new MutationObserver(() => this.schedulePaint());
    this.observe(); this.schedulePaint();
  }
  observe() { this.observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true }); }
  destroy() {
    this._closed = true; this.observer.disconnect(); window.clearTimeout(this._paintTimer); window.clearTimeout(this._selectionTimer); window.clearTimeout(this._positionTimer);
    for (const reader of this._readers.values()) { reader.bus.off('pagechanging', reader.change); reader.bus.off('scalechanging', reader.change); }
    this._readers.clear(); this.flushPositions();
    this.app.workspace.containerEl.querySelectorAll('.jrs-pdf-highlights').forEach((node) => node.remove());
  }
  schedulePaint() {
    if (this._closed) return;
    if (this._paintTimer) return;
    this._paintTimer = window.setTimeout(() => { this._paintTimer = null; this.paint(); }, 140);
  }
  activeContext() {
    const leaves = this.app.workspace.getLeavesOfType('pdf').filter((leaf) => leaf.view.file && leaf.view.contentEl);
    const leaf = leaves.find((entry) => entry === this.app.workspace.activeLeaf) || leaves.find((entry) => entry.view.contentEl.getBoundingClientRect().width > 0) || leaves[0];
    if (!leaf) return null;
    const viewer = leaf.view.viewer?.child?.pdfViewer?.pdfViewer;
    return { leaf, file: leaf.view.file, viewer, page: Number(viewer?.currentPageNumber || leaf.view.contentEl.querySelector('.pdf-page-input')?.value) || 1, pages: Number(viewer?.pagesCount) || Number(leaf.view.viewer?.child?.pdfViewer?.pagesCount) || 1 };
  }
  readingPosition(pdf) { return this.plugin.settings.pdfReadingPositions[pdf] || null; }
  trackReaders() {
    if (this._closed) return;
    const live = new Set();
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      const viewer = leaf.view.viewer?.child?.pdfViewer?.pdfViewer;
      const bus = viewer?.eventBus; const pdf = leaf.view.file?.path;
      if (!pdf || !bus?.on || !bus?.off) continue;
      live.add(leaf);
      const old = this._readers.get(leaf);
      if (old?.viewer === viewer && old.pdf === pdf) continue;
      if (old) { old.bus.off('pagechanging', old.change); old.bus.off('scalechanging', old.change); }
      const change = () => { if (leaf.view.contentEl?.isConnected !== false) this.rememberPosition(pdf, viewer); };
      bus.on('pagechanging', change); bus.on('scalechanging', change);
      this._readers.set(leaf, { pdf, viewer, bus, change });
    }
    for (const [leaf, reader] of this._readers) {
      if (live.has(leaf)) continue;
      reader.bus.off('pagechanging', reader.change); reader.bus.off('scalechanging', reader.change); this._readers.delete(leaf);
    }
  }
  rememberPosition(pdf, viewer) {
    if (this._closed || !viewer?.pagesCount) return;
    const position = ResearchCore.normalizeReadingPosition({ page: viewer.currentPageNumber, pages: viewer.pagesCount, scale: viewer.currentScaleValue, updated: Date.now() });
    this.plugin.settings.pdfReadingPositions[pdf] = position; this._positionDirty = true;
    this.app.workspace.getLeavesOfType(VIEW_SIDE).forEach((leaf) => leaf.view.onPdfPosition?.(pdf, position));
    this.app.workspace.getLeavesOfType(VIEW_DASHBOARD).forEach((leaf) => leaf.view._readingDeck?.updatePosition?.(pdf));
    window.clearTimeout(this._positionTimer);
    this._positionTimer = window.setTimeout(() => this.flushPositions(), 700);
    return position;
  }
  async flushPositions() {
    if (!this._positionDirty) return;
    this._positionDirty = false;
    try { await this.plugin.saveSettings(); }
    catch (error) { this._positionDirty = true; console.error('[JRS] 阅读位置保存失败', error); }
  }
  async restorePosition(pdf, leaf, saved = this.readingPosition(pdf)) {
    let viewer;
    for (let attempt = 0; attempt < 40; attempt++) {
      viewer = leaf.view.viewer?.child?.pdfViewer?.pdfViewer;
      if (viewer?.pagesCount) break;
      await new Promise((resolve) => window.setTimeout(resolve, 75));
    }
    if (!viewer?.pagesCount) return;
    this.trackReaders();
    if (saved) {
      const position = ResearchCore.normalizeReadingPosition(saved, viewer.pagesCount);
      viewer.currentScaleValue = position.scale; viewer.currentPageNumber = position.page;
    }
    return this.rememberPosition(pdf, viewer);
  }
  enqueue(pdf, action) {
    const previous = this._queues.get(pdf) || Promise.resolve();
    const job = previous.catch(() => {}).then(action); this._queues.set(pdf, job);
    const clear = () => { if (this._queues.get(pdf) === job) this._queues.delete(pdf); };
    job.then(clear, clear); return job;
  }
  captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const element = (node) => node.nodeType === 1 ? node : node.parentElement;
    const firstPage = element(range.startContainer)?.closest('.page[data-page-number]');
    const lastPage = element(range.endContainer)?.closest('.page[data-page-number]');
    if (!firstPage) return null;
    if (firstPage !== lastPage) {
      this.selection = null;
      this.app.workspace.getLeavesOfType(VIEW_SIDE).forEach((entry) => {
        entry.view._pdfSelection = null; entry.view._pdfError = '请在同一 PDF 页面中选择原文；跨页内容请分段保存或翻译。';
        if (entry.view.tab === 'pdf') entry.view.renderBody();
      });
      return null;
    }
    const leaf = this.app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file && entry.view.contentEl?.contains(firstPage));
    if (!leaf) return null;
    const text = selection.toString().trim(); if (!text) return null;
    const rect = firstPage.getBoundingClientRect(); if (!rect.width || !rect.height) return null;
    const seen = new Set();
    const rects = [...range.getClientRects()].filter((entry) => entry.width > 1 && entry.height > 1).map((entry) => {
      const x = Math.max(0, (entry.left - rect.left) / rect.width); const y = Math.max(0, (entry.top - rect.top) / rect.height);
      return { x, y, w: Math.max(0, Math.min(1 - x, entry.width / rect.width)), h: Math.max(0, Math.min(1 - y, entry.height / rect.height)) };
    }).filter((entry) => {
      const key = [entry.x, entry.y, entry.w, entry.h].map((value) => value.toFixed(4)).join(',');
      if (entry.w <= 0 || entry.h <= 0 || seen.has(key)) return false;
      seen.add(key); return true;
    });
    let anchor;
    const textLayer = firstPage.querySelector('.textLayer');
    if (textLayer?.contains(range.startContainer)) {
      const prefix = document.createRange(); prefix.selectNodeContents(textLayer); prefix.setEnd(range.startContainer, range.startOffset);
      anchor = prefix.toString().length;
    }
    const captured = { pdf: leaf.view.file.path, page: Number(firstPage.dataset.pageNumber), text, rects, ...(anchor == null ? {} : { anchor }) };
    this.selection = captured;
    this.app.workspace.getLeavesOfType(VIEW_SIDE).forEach((entry) => entry.view.setPdfSelection?.(captured));
    return captured;
  }
  annotations(path) { return this.plugin.settings.pdfAnnotations[path] || []; }
  notePath(pdf) {
    let hash = 2166136261;
    for (const char of pdf) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const basename = pdf.split('/').pop().replace(/\.pdf$/i, '');
    return `${this.plugin.settings.annotationsFolder}/${sanitizeFilename(basename)}-${(hash >>> 0).toString(36)}.md`;
  }
  async writeAnnotation(entry) {
    const path = this.notePath(entry.pdf);
    await this.plugin.ensureFolder(this.plugin.settings.annotationsFolder);
    const old = this.app.vault.getAbstractFileByPath(path);
    const block = ResearchCore.annotationBlock(entry, window.moment(entry.created).format('YYYY-MM-DD HH:mm'));
    if (old instanceof TFile) await this.app.vault.process(old, (content) => ResearchCore.replaceAnnotationBlock(content, entry.id, block));
    else await this.app.vault.create(path, `# PDF 阅读批注\n\n来源：[[${entry.pdf}]]\n\n${block}\n`);
  }
  save(selection, note, color) {
    if (!selection?.pdf || typeof selection.text !== 'string' || !selection.text.trim() || !Number.isInteger(selection.page) || selection.page < 1) return Promise.reject(new Error('请先在 PDF 中选中一段文字'));
    if (selection.text.length > 12000) return Promise.reject(new Error('选区过长，请按段落保存批注'));
    const annotation = { ...structuredClone(selection), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), note: String(note || '').trim(), color: Object.hasOwn(PDF_MARK_COLORS, color) ? color : 'mint', created: new Date().toISOString() };
    return this.enqueue(annotation.pdf, async () => {
      await this.writeAnnotation(annotation);
      this.plugin.settings.pdfAnnotations[annotation.pdf] = [...this.annotations(annotation.pdf), annotation];
      await this.plugin.saveSettings(); this.revision++; this.paint(); return annotation;
    });
  }
  update(pdf, id, patch, expected) {
    return this.enqueue(pdf, async () => {
      const original = this.annotations(pdf).find((entry) => entry.id === id);
      if (!original) throw new Error('这条批注已被删除');
      if (expected && (String(original.note || '') !== String(expected.note || '') || original.color !== expected.color || original.updated !== expected.updated)) throw new Error('批注已被其他操作修改，请重新打开编辑');
      const next = { ...original, note: String(patch.note ?? original.note ?? '').trim(), color: Object.hasOwn(PDF_MARK_COLORS, patch.color) ? patch.color : original.color, updated: new Date().toISOString() };
      await this.writeAnnotation(next);
      this.plugin.settings.pdfAnnotations[pdf] = this.annotations(pdf).map((entry) => entry.id === id ? next : entry);
      await this.plugin.saveSettings(); this.revision++; this.paint(); return next;
    });
  }
  remove(pdf, id) {
    return this.enqueue(pdf, async () => {
      const entries = this.annotations(pdf); const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const annotation = structuredClone(entries[index]);
      const file = this.app.vault.getAbstractFileByPath(this.notePath(pdf));
      if (file instanceof TFile) await this.app.vault.process(file, (content) => ResearchCore.replaceAnnotationBlock(content, id, ''));
      this.plugin.settings.pdfAnnotations[pdf] = entries.filter((entry) => entry.id !== id);
      this._deleted.set(pdf, { annotation, index });
      await this.plugin.saveSettings(); this.revision++; this.paint(); return annotation;
    });
  }
  canUndoDelete(pdf) { return this._deleted.has(pdf); }
  undoDelete(pdf) {
    return this.enqueue(pdf, async () => {
      const deleted = this._deleted.get(pdf); if (!deleted) return;
      const entries = [...this.annotations(pdf)];
      if (entries.some((entry) => entry.id === deleted.annotation.id)) throw new Error('此批注已恢复');
      await this.writeAnnotation(deleted.annotation);
      entries.splice(Math.min(deleted.index, entries.length), 0, deleted.annotation);
      this.plugin.settings.pdfAnnotations[pdf] = entries; this._deleted.delete(pdf);
      await this.plugin.saveSettings(); this.revision++; this.paint(); return deleted.annotation;
    });
  }
  async jump(pdf, page) {
    const file = this.app.vault.getAbstractFileByPath(pdf); if (!(file instanceof TFile)) throw new Error('PDF 文件不存在');
    let leaf = this.app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdf);
    if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.openFile(file, { eState: { subpath: `#page=${page}` } }); }
    this.app.workspace.revealLeaf(leaf);
    const viewer = leaf.view.viewer?.child?.pdfViewer?.pdfViewer;
    if (viewer) viewer.currentPageNumber = Math.max(1, Math.min(Number(viewer.pagesCount) || 1, page));
    else leaf.view.setEphemeralState?.({ subpath: `#page=${page}` });
    this.trackReaders(); if (viewer) this.rememberPosition(pdf, viewer);
    this.schedulePaint();
  }
  async readText(path, maxPages = 8, maxCharacters = 18000) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'pdf') throw new Error('PDF 尚未在当前知识库中，请先入库或打开原文');
    let leaf = this.app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === path);
    const savedPosition = structuredClone(this.readingPosition(path));
    const newlyOpened = !leaf;
    if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.openFile(file, { active: false }); }
    let document;
    for (let attempt = 0; attempt < 40; attempt++) {
      document = leaf.view.viewer?.child?.pdfViewer?.pdfDocument || leaf.view.viewer?.child?.pdfViewer?.pdfViewer?.pdfDocument;
      if (document) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!document) throw new Error('PDF 还未加载完成，请打开原文后重试');
    if (newlyOpened && savedPosition) await this.restorePosition(path, leaf, savedPosition);
    const pages = Math.min(maxPages, document.numPages); const chunks = []; let length = 0;
    for (let number = 1; number <= pages && length < maxCharacters; number++) {
      const page = await document.getPage(number); const content = await page.getTextContent();
      const text = content.items.map((item) => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      if (text) { chunks.push(`[PDF 第 ${number} 页]\n${text}`); length += text.length; }
    }
    if (!chunks.length) throw new Error('此 PDF 没有可提取的文本层，请先 OCR 后再生成摘要');
    return `以下为 PDF 前 ${pages}/${document.numPages} 页的正文摘取（最多 ${maxCharacters} 字符）：\n` + chunks.join('\n\n').slice(0, maxCharacters);
  }
  paint() {
    if (this._closed) return;
    this.observer?.disconnect();
    try {
      this.trackReaders();
      this.app.workspace.getLeavesOfType('pdf').forEach((leaf) => {
        const file = leaf.view.file; if (!file || !leaf.view.contentEl) return;
        const list = this.annotations(file.path);
        leaf.view.contentEl.querySelectorAll('.page[data-page-number]').forEach((page) => {
          const signature = file.path + ':' + this.revision;
          const entries = list.filter((entry) => entry.page === Number(page.dataset.pageNumber));
          if (page.dataset.jrsMarks === signature && (page.querySelector('.jrs-pdf-highlights') || !entries.length)) return;
          page.querySelectorAll('.jrs-pdf-highlights').forEach((layer) => layer.remove());
          if (entries.length) {
            const layer = page.createEl('div', { cls: 'jrs-pdf-highlights', attr: { 'aria-hidden': 'true' } });
            entries.forEach((entry) => (entry.rects || []).forEach((rect) => {
              if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return;
              const mark = layer.createEl('span', { cls: 'jrs-pdf-mark' });
              mark.style.cssText = `left:${rect.x * 100}%;top:${rect.y * 100}%;width:${rect.w * 100}%;height:${rect.h * 100}%;background:${PDF_MARK_COLORS[entry.color] || PDF_MARK_COLORS.mint};`;
              mark.dataset.annotationId = entry.id;
            }));
          }
          page.dataset.jrsMarks = signature;
        });
      });
    } finally { if (!this._closed) this.observe(); }
  }
}

class EditAnnotationModal extends Modal {
  constructor(plugin, pdf, entry, onDone) {
    super(plugin.app); this.plugin = plugin; this.pdf = pdf; this.entry = structuredClone(entry); this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`编辑批注 · 第 ${this.entry.page} 页`);
    this.contentEl.addClass('jrs-side', 'jrs-annotation-editor');
    this.contentEl.createEl('blockquote', { cls: 'jrs-selection-preview', text: this.entry.text });
    let note = this.entry.note || ''; let color = this.entry.color;
    new Setting(this.contentEl).setName('我的评论').addTextArea((input) => {
      input.setValue(note).onChange((value) => { note = value; }); input.inputEl.rows = 6; input.inputEl.setAttribute('aria-label', '修改批注评论');
    });
    new Setting(this.contentEl).setName('高亮颜色').addDropdown((select) => {
      select.addOption('mint', '薄荷绿').addOption('amber', '琥珀黄').addOption('violet', '紫罗兰').setValue(color).onChange((value) => { color = value; });
    });
    const actions = this.contentEl.createEl('div', { cls: 'jrs-row-actions' });
    uiButton(actions, '保存修改', 'check', async () => {
      await this.plugin.pdfResearch.update(this.pdf, this.entry.id, { note, color }, this.entry);
      this.onDone?.(); this.close(); new Notice('批注与 Markdown 已更新');
    }, 'od-btn od-btn--primary');
    uiButton(actions, '取消', '', () => this.close(), 'od-btn');
  }
}

class ResearchLinksModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.links = structuredClone(plugin.settings.commonLinks); }
  onOpen() {
    this.titleEl.setText('常用研究链接'); this.contentEl.empty();
    this.contentEl.createEl('p', { cls: 'od-hint', text: '直接在右侧网页面板打开，登录状态在此设备保留。' });
    this.links.forEach((link, index) => {
      new Setting(this.contentEl).addText((text) => text.setValue(link.name).setPlaceholder('名称').onChange((value) => { link.name = value; }))
        .addText((text) => text.setValue(link.url).setPlaceholder('https://…').onChange((value) => { link.url = value; }))
        .addExtraButton((button) => button.setIcon('trash-2').setTooltip('移除链接').onClick(() => { this.links.splice(index, 1); this.onOpen(); }));
    });
    const actions = this.contentEl.createEl('div', { cls: 'jrs-row-actions' });
    uiButton(actions, '添加链接', 'plus', () => { this.links.push({ name: '', url: '' }); this.onOpen(); }, 'od-btn');
    uiButton(actions, '保存', 'check', async () => {
      for (const link of this.links) {
        if (!link.name.trim() || !['http:', 'https:'].includes(new URL(link.url).protocol)) throw new Error('请为每个链接填写名称和 HTTP(S) 地址');
      }
      this.plugin.settings.commonLinks = this.links.map((link) => ({ name: link.name.trim(), url: link.url.trim() }));
      await this.plugin.saveSettings(); this.app.workspace.getLeavesOfType(VIEW_SIDE).forEach((leaf) => leaf.view.refreshLinks()); this.close();
    }, 'od-btn od-btn--primary');
  }
}
