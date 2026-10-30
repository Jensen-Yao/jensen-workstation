// Contextual research assistant. Embedded in the dependency-free distribution.
class SidePanelView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf); this.plugin = plugin;
    this.tab = 'paper'; this._captureDraft = ''; this._journalQuery = '';
    this._pdfDrafts = new Map(); this._pdfTranslations = new Map(); this._pdfSelections = new Map();
  }
  getViewType() { return VIEW_SIDE; }
  getDisplayText() { return '研究助手'; }
  getIcon() { return 'panel-right'; }

  async onOpen() {
    this._closed = false;
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf?.view === this) return;
      if (leaf?.view?.editor && leaf.view.file) this._editorContext = { editor: leaf.view.editor, file: leaf.view.file };
      this.refreshContext(leaf?.view?.file);
    }));
    this.registerEvent(this.app.workspace.on('file-open', (file) => this.refreshContext(file)));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (file.path === this.paper?.path) {
        window.clearTimeout(this._contextTimer);
        this._contextTimer = window.setTimeout(() => this.refreshContext(), 160);
      }
    }));
    const captureSelection = (event) => {
      if (event.target instanceof Element && event.target.closest('.jrs-side')) return;
      window.clearTimeout(this._selectionTimer);
      this._selectionTimer = window.setTimeout(() => this.captureSelection(), 100);
    };
    this.registerDomEvent(this.app.workspace.containerEl, 'pointerup', captureSelection);
    this.registerDomEvent(this.app.workspace.containerEl, 'keyup', captureSelection);
    const active = this.app.workspace.activeLeaf?.view;
    if (active?.editor && active.file) this._editorContext = { editor: active.editor, file: active.file };
    this.refreshContext(active?.file, false); this.render();
  }

  onClose() {
    this._closed = true;
    window.clearTimeout(this._selectionTimer); window.clearTimeout(this._contextTimer); window.clearTimeout(this._lookupTimer);
  }

  refreshContext(file, render = true) {
    if (this._closed) return;
    const papers = this.plugin.getPapers();
    const current = file || this.app.workspace.activeLeaf?.view?.file;
    if (current?.extension?.toLowerCase() === 'pdf' && this._pdfDocumentPath !== current.path) this.usePdf(current.path, false);
    const matched = current && papers.find((paper) => paper.path === current.path || toPosix(paper.pdf) === current.path);
    const path = matched?.path || this.plugin._contextPaperPath || this.plugin.settings.lastReadingPath;
    this._paperContextKind = matched ? '当前文献' : current ? '来源目录中的阅读建议' : '已选择文献';
    this.paper = matched || papers.find((paper) => paper.path === path) || papers.filter((paper) => paper.status === '阅读中').sort((a, b) => b.progress - a.progress)[0] || papers[0] || null;
    if (render && this._body && (this.tab === 'paper' || this.tab === 'pdf')) this.renderBody();
    if (this._captureSource) this._captureSource.textContent = this.paper ? `关联文献：${this.paper.title}` : '保存到今日收件箱';
  }

  setPaper(paper) {
    this.paper = paper; this.plugin._contextPaperPath = paper.path;
    this._paperContextKind = '已选择文献';
    if (this.tab === 'pdf' && paper.pdf && !isHttp(paper.pdf) && !isExternalPath(paper.pdf)) this.usePdf(paper.pdf);
    if (this.tab === 'paper') this.renderBody();
    if (this._captureSource) this._captureSource.textContent = `关联文献：${paper.title}`;
  }

  captureSelection() {
    const context = this._editorContext;
    if (!context || !this.editorStillOpen(context)) return;
    const text = context.editor.getSelection();
    if (text.trim()) {
      this._selection = { ...context, text, from: { ...context.editor.getCursor('from') }, to: { ...context.editor.getCursor('to') } };
      if (this.tab === 'writing' && !this._aiBusy) this.renderBody();
    }
  }

  editorStillOpen(context) {
    return this.app.workspace.getLeavesOfType('markdown').some((leaf) => leaf.view.editor === context.editor && leaf.view.file?.path === context.file.path);
  }

  render() {
    if (!this._assistantPane) {
      const surface = this.contentEl; surface.empty(); surface.addClass('jrs-side', 'jrs-side-v2');
      const switcher = surface.createEl('div', { cls: 'jrs-companion-switch', attr: { role: 'group', 'aria-label': '右侧栏工作模式' } });
      this._modeButtons = {};
      [['assistant', 'panel-right', '研究助手'], ['web', 'globe', '研究网页']].forEach(([id, icon, label]) => {
        this._modeButtons[id] = uiButton(switcher, label, icon, () => id === 'web' ? this._browser ? this.showCompanionMode('web') : this.openWeb('https://chat.deepseek.com/') : this.showCompanionMode('assistant'), 'jrs-companion-mode');
      });
      const appearance = buildThemeToggle(switcher, this.plugin); appearance.addClass('jrs-theme-icon');
      appearance.setAttribute('title', '切换浅色或深色背景');
      const settings = uiButton(switcher, '', 'settings-2', () => { this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id); }, 'od-icon-btn');
      settings.setAttribute('aria-label', '研究伴侣设置');
      this._assistantPane = surface.createEl('div', { cls: 'jrs-companion-pane' });
      this._webPane = surface.createEl('div', { cls: 'jrs-companion-pane jrs-web-pane' }); this._webPane.hidden = true;
    }
    const root = this._assistantPane; root.empty();
    const tabs = root.createEl('div', { cls: 'jrs-assistant-tabs', attr: { role: 'group', 'aria-label': '研究助手模式' } });
    [['paper', 'book-open', '文献'], ['pdf', 'highlighter', '批注'], ['writing', 'pen-line', '写作'], ['tools', 'grid-2x2', '工具']].forEach(([id, icon, label]) => {
      const button = uiButton(tabs, label, icon, () => { this.tab = id; this.render(); }, `jrs-assistant-tab${this.tab === id ? ' is-active' : ''}`);
      button.setAttribute('aria-pressed', String(this.tab === id));
    });
    const dock = root.createEl('div', { cls: 'jrs-link-dock' });
    this.plugin.settings.commonLinks.slice(0, 3).forEach((link) => uiButton(dock, link.name, 'external-link', () => this.plugin.openResearchWeb(link.url), 'jrs-link-chip'));
    this._body = root.createEl('div', { cls: 'jrs-assistant-body' }); this.renderBody();
    this.renderCapture(root);
    this.showCompanionMode(this.companionMode || 'assistant');
  }

  showCompanionMode(mode) {
    this.companionMode = mode;
    this._assistantPane.hidden = mode !== 'assistant'; this._webPane.hidden = mode !== 'web';
    for (const [id, button] of Object.entries(this._modeButtons)) { button.classList.toggle('is-active', id === mode); button.setAttribute('aria-pressed', String(id === mode)); }
  }

  async openWeb(address) {
    if (!this._assistantPane) this.render();
    if (!this._browser) this._browser = new ResearchBrowserPanel(this, this._webPane, address);
    else this._browser.navigate(address);
    this.showCompanionMode('web');
  }

  refreshLinks() { this.render(); this._browser?.refreshLinks(); }

  renderBody() {
    if (!this._body || this._closed) return;
    this._pdfUi = null; this._paperPosition = null; this._body.empty();
    if (this.tab === 'paper') this.renderPaper();
    else if (this.tab === 'pdf') this.renderPdf();
    else if (this.tab === 'writing') this.renderWriting();
    else this.renderTools();
  }

  rememberPdfDraft() {
    const selection = this._pdfSelection;
    const key = ResearchCore.pdfSelectionKey(selection);
    if (key) this._pdfDrafts.set(key, this._annotationDraft || '');
    while (this._pdfDrafts.size > 20) this._pdfDrafts.delete(this._pdfDrafts.keys().next().value);
  }

  finishSavedSelection(selection) {
    const key = ResearchCore.pdfSelectionKey(selection);
    this._pdfDrafts.delete(key);
    if (ResearchCore.pdfSelectionKey(this._pdfSelections.get(selection.pdf)) === key) this._pdfSelections.delete(selection.pdf);
    if (ResearchCore.pdfSelectionKey(this._pdfSelection) === key) { this._pdfSelection = null; this._annotationDraft = ''; }
    if (ResearchCore.pdfSelectionKey(this.plugin.pdfResearch.selection) === key) this.plugin.pdfResearch.selection = null;
  }

  usePdf(path, render = true) {
    if (this._pdfDocumentPath === path) return;
    this.rememberPdfDraft(); this._pdfDocumentPath = path;
    this._pdfSelection = this._pdfSelections.get(path) || null;
    const key = ResearchCore.pdfSelectionKey(this._pdfSelection);
    this._annotationDraft = this._pdfDrafts.get(key) || ''; this._pdfTranslation = this._pdfTranslations.get(key) || null; this._pdfError = '';
    this._annotationLimit = 20;
    if (render && this.tab === 'pdf') this.renderBody();
  }

  setPdfSelection(selection) {
    const key = ResearchCore.pdfSelectionKey(selection);
    if (key === ResearchCore.pdfSelectionKey(this._pdfSelection)) return;
    this.rememberPdfDraft(); this._pdfDocumentPath = selection.pdf;
    this._pdfSelections.set(selection.pdf, selection);
    while (this._pdfSelections.size > 20) this._pdfSelections.delete(this._pdfSelections.keys().next().value);
    this._pdfSelection = selection; this._pdfTranslation = this._pdfTranslations.get(key) || null; this.tab = 'pdf';
    this.companionMode = 'assistant';
    this._annotationDraft = this._pdfDrafts.get(key) || ''; this._pdfError = ''; this.render();
  }

  onPdfPosition(pdf, position) {
    if (this._paperPosition?.pdf === pdf) this._paperPosition.element.textContent = `上次读至第 ${position.page} / ${position.pages} 页`;
    const ui = this._pdfUi; if (!ui || ui.pdf !== pdf) return;
    if (document.activeElement !== ui.page) ui.page.value = String(position.page);
    ui.total.textContent = `/ ${position.pages}`;
    ui.previous.disabled = position.page <= 1; ui.next.disabled = position.page >= position.pages;
    if (document.activeElement !== ui.zoom) {
      if (![...ui.zoom.options].some((option) => option.value === position.scale)) ui.zoom.createEl('option', { value: position.scale, text: `${Math.round(Number(position.scale) * 100)}%` });
      ui.zoom.value = position.scale;
    }
  }

  renderPdf() {
    const host = this._body;
    const research = this.plugin.pdfResearch;
    const context = research.activeContext();
    const candidate = this._pdfSelection || research.selection;
    const pdf = this._pdfDocumentPath || candidate?.pdf || context?.file.path || (this.paper?.pdf && !isHttp(this.paper.pdf) && !isExternalPath(this.paper.pdf) ? this.paper.pdf : '');
    this._pdfDocumentPath = pdf;
    const selection = candidate?.pdf === pdf ? candidate : null;
    const section = host.createEl('section', { cls: 'jrs-pdf-panel' });
    section.createEl('div', { cls: 'jrs-assistant-section-title', text: 'PDF 阅读 · 批注 · 翻译' });
    if (!pdf) {
      uiEmpty(section, '把阅读和理解连在一起', '在文献库打开 PDF，选中原文即可高亮、批注和翻译。', '选择文献', () => this.plugin.gotoSection('library'), 'highlighter'); return;
    }
    const title = section.createEl('div', { cls: 'jrs-pdf-document-title', text: pdf.split('/').pop() }); title.title = pdf;
    const controls = section.createEl('div', { cls: 'jrs-pdf-page-controls' });
    const currentPage = context?.file.path === pdf ? context.page : selection?.page || 1;
    const previous = uiButton(controls, '', 'chevron-left', () => research.jump(pdf, Math.max(1, Number(pageInput.value) - 1)), 'od-icon-btn'); previous.setAttribute('aria-label', 'PDF 上一页');
    const pageInput = controls.createEl('input', { type: 'number', attr: { min: '1', 'aria-label': '跳转 PDF 页码' } }); pageInput.value = String(currentPage);
    pageInput.onkeydown = async (event) => { if (event.key === 'Enter') { try { await research.jump(pdf, Math.max(1, Number(pageInput.value) || 1)); } catch (error) { new Notice(error.message); } } };
    const total = controls.createSpan({ cls: 'od-hint', text: context?.file.path === pdf ? `/ ${context.pages}` : '页' });
    const next = uiButton(controls, '', 'chevron-right', () => research.jump(pdf, Number(pageInput.value) + 1), 'od-icon-btn'); next.setAttribute('aria-label', 'PDF 下一页');
    const zoom = controls.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': 'PDF 缩放方式' } });
    [['page-width', '适合宽度'], ['page-fit', '适合整页'], ['1', '100%'], ['1.5', '150%']].forEach(([value, text]) => zoom.createEl('option', { value, text }));
    zoom.onchange = () => { const live = research.activeContext(); if (live?.file.path === pdf && live.viewer) live.viewer.currentScaleValue = zoom.value; else new Notice('先打开此 PDF 再调整缩放'); };
    this._pdfUi = { pdf, page: pageInput, total, previous, next, zoom };
    this.onPdfPosition(pdf, context?.file.path === pdf ? { page: context.page, pages: context.pages, scale: String(context.viewer?.currentScaleValue || 'page-width') } : research.readingPosition(pdf) || { page: currentPage, pages: currentPage, scale: 'page-width' });
    if (selection) {
      section.createEl('div', { cls: 'jrs-assistant-section-title', text: `已捕获第 ${selection.page} 页 · ${selection.text.length} 字符` });
      section.createEl('blockquote', { cls: 'jrs-selection-preview', text: selection.text });
      const note = section.createEl('textarea', { cls: 'jrs-side-input', attr: { rows: '2', placeholder: '这段内容对我的研究有什么启发？', 'aria-label': 'PDF 批注内容' } });
      note.value = this._annotationDraft || ''; note.oninput = () => { this._annotationDraft = note.value; this.rememberPdfDraft(); };
      const colors = section.createEl('div', { cls: 'jrs-highlight-colors', attr: { role: 'group', 'aria-label': '高亮颜色' } });
      [['mint', '薄荷绿'], ['amber', '琥珀黄'], ['violet', '紫罗兰']].forEach(([color, label]) => {
        const swatch = uiButton(colors, '', '', () => { this._annotationColor = color; this.renderBody(); }, 'jrs-highlight-color');
        swatch.style.setProperty('--mark-color', PDF_MARK_COLORS[color]); swatch.setAttribute('aria-label', label);
        swatch.setAttribute('aria-pressed', String((this._annotationColor || 'mint') === color));
      });
      const actions = section.createEl('div', { cls: 'jrs-assistant-actions' });
      uiButton(actions, '保存高亮批注', 'highlighter', async () => {
        await research.save(selection, note.value, this._annotationColor || 'mint');
        this.finishSavedSelection(selection); this.renderBody(); new Notice('批注与页码已保存，高亮会随 PDF 恢复');
      }, 'od-btn od-btn--primary od-btn--sm');
      uiButton(actions, '翻译选区', 'languages', () => this.translatePdfSelection(selection), 'od-btn od-btn--sm').disabled = !!this._pdfTranslating;
      uiButton(actions, '复制原文', 'copy', () => navigator.clipboard.writeText(selection.text), 'od-btn od-btn--sm');
      uiButton(actions, '复制并问 DeepSeek', 'external-link', async () => {
        await navigator.clipboard.writeText(`请帮我解释或翻译以下论文内容，并指出研究启发：\n\n${selection.text}\n\n来源：${pdf.split('/').pop()}，第 ${selection.page} 页`);
        await this.plugin.openResearchWeb('https://chat.deepseek.com/'); new Notice('选区与页码已复制，在 DeepSeek 粘贴即可提问');
      }, 'od-btn od-btn--sm');
    } else {
      section.createEl('p', { cls: 'od-hint', text: '在 PDF 中拖选文字，选区会自动出现在这里。高亮保存在工作站中，摘录与批注同步写入 Markdown。' });
      uiButton(section, '打开 PDF', 'book-open-text', () => research.jump(pdf, currentPage), 'od-btn od-btn--sm');
    }
    if (this._pdfTranslating) section.createEl('div', { cls: 'jrs-assistant-status', text: '正在翻译选区…', attr: { 'aria-live': 'polite' } });
    if (this._pdfError) section.createEl('p', { cls: 'jrs-assistant-error', text: this._pdfError });
    if (this._pdfTranslation) {
      const result = this._pdfTranslation;
      const translated = host.createEl('section', { cls: 'jrs-writing-result' });
      translated.createEl('div', { cls: 'jrs-assistant-section-title', text: '学术译文' });
      const output = translated.createEl('div', { cls: 'jrs-writing-output' }); MarkdownRenderer.renderMarkdown(result.text, output, '', this);
      const actions = translated.createEl('div', { cls: 'jrs-capture-actions' });
      uiButton(actions, '保存原文与译文', 'save', async () => {
        await research.save(result.selection, '译文：\n\n' + result.text, this._annotationColor || 'mint');
        const key = ResearchCore.pdfSelectionKey(result.selection); this._pdfTranslations.delete(key);
        if (ResearchCore.pdfSelectionKey(this._pdfTranslation?.selection) === key) this._pdfTranslation = null;
        this.renderBody(); new Notice('原文与译文已保存到 PDF 批注笔记');
      }, 'od-btn od-btn--primary od-btn--sm');
      uiButton(actions, '复制译文', 'copy', () => navigator.clipboard.writeText(result.text), 'od-btn od-btn--sm');
    }
    this.renderAnnotationHistory(host, pdf);
  }

  renderAnnotationHistory(host, pdf) {
    const research = this.plugin.pdfResearch;
    const history = host.createEl('section', { cls: 'jrs-pdf-annotation-history' });
    const heading = history.createEl('div', { cls: 'jrs-assistant-section-title' });
    const count = heading.createSpan();
    const actions = heading.createEl('div', { cls: 'jrs-annotation-heading-actions' });
    const undo = uiButton(actions, '撤销删除', 'undo-2', async () => { await research.undoDelete(pdf); draw(); }, 'jrs-text-button');
    uiButton(actions, '笔记', 'file-text', async () => {
      const file = this.app.vault.getAbstractFileByPath(research.notePath(pdf));
      if (file) await this.plugin.smartOpenFile(file); else new Notice('保存第一条批注后会建立批注笔记');
    }, 'jrs-text-button');
    const controls = history.createEl('div', { cls: 'jrs-annotation-filters' });
    const search = controls.createEl('input', { type: 'search', cls: 'jrs-side-input', attr: { 'aria-label': '搜索批注原文或评论', placeholder: '搜索原文、评论或页码…' } }); search.value = this._annotationQuery || '';
    const color = controls.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '按高亮颜色筛选' } });
    [['', '全部颜色'], ['mint', '薄荷绿'], ['amber', '琥珀黄'], ['violet', '紫罗兰']].forEach(([value, text]) => color.createEl('option', { value, text })); color.value = this._annotationFilter || '';
    const order = controls.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '批注排序' } });
    [['page', '按页码'], ['recent', '最近修改']].forEach(([value, text]) => order.createEl('option', { value, text })); order.value = this._annotationOrder || 'page';
    const list = history.createEl('div', { cls: 'jrs-annotation-list' });
    const draw = () => {
      list.empty();
      const all = research.annotations(pdf);
      const entries = ResearchCore.filterAnnotations(all, this._annotationQuery, this._annotationFilter, this._annotationOrder);
      count.textContent = `阅读批注 · ${entries.length}${entries.length !== all.length ? ' / ' + all.length : ''}`;
      undo.hidden = !research.canUndoDelete(pdf);
      if (!all.length) { list.createEl('p', { cls: 'od-hint', text: '选中 PDF 原文后，可以把论据、疑问与译文留在这里。' }); return; }
      if (!entries.length) { list.createEl('p', { cls: 'od-hint', text: '没有匹配的批注，试试其他关键词或颜色。' }); return; }
      entries.slice(0, this._annotationLimit || 20).forEach((entry) => {
        const item = list.createEl('article', { cls: 'jrs-pdf-annotation-item' }); item.dataset.annotationId = entry.id; item.style.setProperty('--mark-color', PDF_MARK_COLORS[entry.color]);
        const top = item.createEl('div', { cls: 'jrs-assistant-section-title' });
        uiButton(top, `第 ${entry.page} 页`, 'arrow-up-right', () => research.jump(pdf, entry.page), 'jrs-text-button');
        const tools = top.createEl('div', { cls: 'jrs-annotation-item-actions' });
        const edit = uiButton(tools, '', 'pencil', () => new EditAnnotationModal(this.plugin, pdf, entry, draw).open(), 'od-icon-btn'); edit.setAttribute('aria-label', '编辑这条批注'); edit.title = '编辑批注';
        const copy = uiButton(tools, '', 'copy', () => navigator.clipboard.writeText(`[[${pdf}#page=${entry.page}|第 ${entry.page} 页]]\n\n${entry.text}${entry.note ? '\n\n' + entry.note : ''}`), 'od-icon-btn'); copy.setAttribute('aria-label', '复制批注与页码引用'); copy.title = '复制原文、评论和页码';
        const remove = uiButton(tools, '', 'trash-2', async () => { await research.remove(pdf, entry.id); draw(); }, 'od-icon-btn'); remove.setAttribute('aria-label', '删除这条批注'); remove.title = '删除后可撤销';
        item.createEl('blockquote', { text: entry.text });
        if (entry.note) item.createEl('p', { text: entry.note });
        const foot = item.createEl('div', { cls: 'jrs-annotation-item-foot' });
        foot.createSpan({ text: window.moment(entry.updated || entry.created).format('M月D日 HH:mm') });
        uiButton(foot, '展开', 'chevrons-up-down', (event) => {
          const expanded = item.classList.toggle('is-expanded'); event.currentTarget.lastElementChild.textContent = expanded ? '收起' : '展开';
        }, 'jrs-text-button');
      });
      if (entries.length > (this._annotationLimit || 20)) uiButton(list, `再显示 ${Math.min(20, entries.length - (this._annotationLimit || 20))} 条`, 'chevrons-down', () => { this._annotationLimit = (this._annotationLimit || 20) + 20; draw(); }, 'od-btn od-btn--sm');
    };
    const filter = () => { this._annotationQuery = search.value; this._annotationFilter = color.value; this._annotationOrder = order.value; this._annotationLimit = 20; draw(); };
    search.oninput = filter; color.onchange = filter; order.onchange = filter; draw();
  }

  async translatePdfSelection(selection) {
    if (this._pdfTranslating) return;
    if (selection.text.length > 8000) { new Notice('选区超过 8000 字符，请分段翻译'); return; }
    this._pdfTranslating = true; this._pdfError = ''; this.renderBody();
    try {
      const text = await this.plugin.aiChat('你是运筹学与航天领域的学术翻译。将原文翻译为简体中文；如果原文以中文为主，则翻译为学术英语。保留公式、引用编号、专有名词和段落结构。不编造信息，只输出译文。', selection.text, 2600);
      const key = ResearchCore.pdfSelectionKey(selection); const result = { text, selection };
      this._pdfTranslations.set(key, result);
      while (this._pdfTranslations.size > 20) this._pdfTranslations.delete(this._pdfTranslations.keys().next().value);
      if (ResearchCore.pdfSelectionKey(this._pdfSelection || this.plugin.pdfResearch.selection) === key && this._pdfDocumentPath === selection.pdf) this._pdfTranslation = result;
    } catch (error) {
      if (ResearchCore.pdfSelectionKey(this._pdfSelection || this.plugin.pdfResearch.selection) === ResearchCore.pdfSelectionKey(selection) && this._pdfDocumentPath === selection.pdf) this._pdfError = error.message;
      else new Notice(`第 ${selection.page} 页选区翻译失败：${error.message}`);
    }
    finally { this._pdfTranslating = false; if (!this._closed && this.tab === 'pdf') this.renderBody(); }
  }

  renderPaper() {
    const host = this._body;
    const paper = this.paper;
    if (!paper) {
      uiEmpty(host, '让助手跟上你的阅读', '打开一篇文献笔记或 PDF，这里会显示精读操作和相关文献。', '前往文献库', () => this.plugin.gotoSection('library'), 'scan-text');
      return;
    }
    const card = host.createEl('section', { cls: 'jrs-assistant-paper' });
    const caption = card.createEl('div', { cls: 'jrs-assistant-section-title' });
    caption.createSpan({ text: this._paperContextKind || '当前文献' });
    const state = caption.createEl('span', { cls: 'od-status', text: paper.status }); state.dataset.status = paper.status;
    const title = uiButton(card, paper.title, '', () => this.plugin.openReading(paper), 'jrs-assistant-paper-title'); title.title = `${paper.pdf ? '阅读 PDF' : '打开笔记'}：${paper.title}`;
    card.createEl('div', { cls: 'od-hint', text: [paper.year, paper.authorsShort, paper.venue].filter(Boolean).join(' · ') || '打开笔记补充文献信息' });
    const position = this.plugin.pdfResearch.readingPosition(paper.pdf);
    const location = card.createEl('div', { cls: 'jrs-reader-location', text: position ? `上次读至第 ${position.page} / ${position.pages} 页` : '阅读位置会自动保存' });
    this._paperPosition = { pdf: paper.pdf, element: location };
    const zone = this.plugin.zoneOf(paper.venue); const badge = zone && this.plugin.zoneBadge(zone); if (badge) card.appendChild(badge);
    const progress = card.createEl('div', { cls: 'jrs-assistant-progress' });
    progress.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${paper.progress}%`;
    progress.createSpan({ text: `${paper.progress}%` });
    const advance = uiButton(progress, '+25%', '', async () => { await this.plugin.bumpProgress(paper, 25); this.refreshContext(); }, 'jrs-text-button');
    advance.disabled = paper.progress >= 100; advance.title = '推进阅读进度';
    const actions = card.createEl('div', { cls: 'jrs-assistant-actions' });
    uiButton(actions, '文献笔记', 'file-text', () => this.plugin.openPaper(paper), 'od-btn od-btn--sm');
    const pdf = uiButton(actions, position ? '继续 PDF' : '阅读 PDF', 'book-open', () => this.plugin.openReading(paper), 'od-btn od-btn--sm'); pdf.disabled = !paper.pdf;
    uiButton(actions, '分栏阅读', 'columns-2', () => this.plugin.openReading(paper, { split: true }), 'od-btn od-btn--sm').disabled = !paper.pdf;
    uiButton(actions, '结构化摘要', 'scan-text', () => this.runPaperAI('摘要', () => this.plugin.aiSummarize(paper)), 'od-btn od-btn--sm').disabled = !!this._aiBusy;
    uiButton(actions, '导读十问', 'list-checks', () => this.runPaperAI('导读十问', () => this.plugin.aiGuide(paper)), 'od-btn od-btn--sm').disabled = !!this._aiBusy;
    if (this._paperAIStatus && this._paperAIPath === paper.path) card.createEl('div', { cls: 'jrs-assistant-status', text: this._paperAIStatus, attr: { 'aria-live': 'polite' } });
    if (paper.topics.length) {
      const chips = card.createEl('div', { cls: 'od-chips' });
      paper.topics.slice(0, 4).forEach((topic) => chips.createSpan({ cls: 'od-chip', text: topic }));
    }
    this.renderRelated(host, paper);
  }

  async runPaperAI(label, run) {
    if (this._aiBusy) return;
    this._aiBusy = true; this._paperAIPath = this.paper?.path; this._paperAIStatus = `正在生成${label}…`; this.renderBody();
    try { await run(); this._paperAIStatus = `${label}已写入文献笔记`; }
    catch (error) { this._paperAIStatus = `${label}失败：${error.message}`; }
    finally { this._aiBusy = false; if (!this._closed) { this.refreshContext(null, false); this.renderBody(); } }
  }

  renderRelated(host, paper, text = '') {
    const section = host.createEl('section', { cls: 'jrs-related-papers' });
    const heading = section.createEl('div', { cls: 'jrs-assistant-section-title' });
    heading.createSpan({ text: text ? '段落引用建议' : '相关文献' });
    heading.createSpan({ cls: 'od-hint', text: text ? '关键词与方向匹配' : '共同方向与项目' });
    const related = this.plugin.relatedPapers(paper, text);
    if (!related.length) { section.createEl('p', { cls: 'od-hint', text: '为文献添加研究方向或项目后，这里会出现关联线索。' }); return; }
    related.slice(0, 4).forEach(({ paper: candidate, shared }) => {
      const row = section.createEl('article', { cls: 'jrs-related-paper' });
      const title = uiButton(row, candidate.title, '', () => this.plugin.openPaper(candidate), 'jrs-related-title'); title.title = candidate.title;
      row.createEl('div', { cls: 'od-hint', text: [candidate.year, ...shared.slice(0, 2)].filter(Boolean).join(' · ') || candidate.venue || '匹配当前段落' });
      uiButton(row, this._editorContext && this.editorStillOpen(this._editorContext) ? '插入引用' : '复制引用', 'link', () => this.insertCitation(candidate), 'jrs-text-button');
    });
  }

  async insertCitation(paper) {
    const alias = paper.title.replace(/[\[\]|\r\n]/g, ' ');
    const link = `[[${paper.path.replace(/\.md$/, '')}|${alias}]]`;
    const context = this._editorContext;
    if (context && this.editorStillOpen(context)) {
      context.editor.replaceRange(link, context.editor.getCursor('to'));
      new Notice(`引用已插入「${context.file.basename}」`);
    } else { await navigator.clipboard.writeText(link); new Notice('文献引用已复制'); }
  }

  renderWriting() {
    const host = this._body;
    const selection = this._selection;
    const intro = host.createEl('section', { cls: 'jrs-writing-context' });
    const caption = intro.createEl('div', { cls: 'jrs-assistant-section-title' });
    caption.createSpan({ text: '选区写作' });
    if (selection) {
      caption.createSpan({ cls: 'od-hint', text: `${selection.text.length} 字符` });
      intro.createEl('div', { cls: 'jrs-selection-source', text: selection.file.basename });
      intro.createEl('blockquote', { cls: 'jrs-selection-preview', text: selection.text });
    } else {
      intro.createEl('p', { cls: 'od-hint', text: '在笔记编辑器中选中一段文字。助手会保留选区，先生成预览，再由你决定如何采用。' });
    }
    const actions = intro.createEl('div', { cls: 'jrs-writing-actions' });
    [['polish', '学术润色', 'wand-2'], ['expand', '扩写深化', 'text-cursor-input'], ['condense', '精简提炼', 'align-left'], ['continue', '续写段落', 'pen-line']].forEach(([mode, label, icon]) => {
      const button = uiButton(actions, label, icon, () => this.previewWriting(mode), 'od-btn od-btn--sm');
      button.disabled = !selection || !!this._aiBusy;
    });
    if (this._aiBusy) intro.createEl('div', { cls: 'jrs-assistant-status', text: '正在生成写作建议…', attr: { 'aria-live': 'polite' } });
    if (this._writingError) intro.createEl('p', { cls: 'jrs-assistant-error', text: this._writingError });
    if (this._writingResult) {
      const result = this._writingResult;
      const preview = host.createEl('section', { cls: 'jrs-writing-result' });
      preview.createEl('div', { cls: 'jrs-assistant-section-title', text: '建议预览' });
      const output = preview.createEl('div', { cls: 'jrs-writing-output' });
      MarkdownRenderer.renderMarkdown(result.text, output, result.selection.file.path, this);
      const controls = preview.createEl('div', { cls: 'jrs-writing-result-actions' });
      uiButton(controls, '替换原选区', 'check', () => this.applyWriting(false), 'od-btn od-btn--primary od-btn--sm');
      uiButton(controls, '插在选区后', 'text-cursor-input', () => this.applyWriting(true), 'od-btn od-btn--sm');
      uiButton(controls, '复制', 'copy', () => navigator.clipboard.writeText(result.text), 'od-btn od-btn--sm');
    }
    if (selection) this.renderRelated(host, this.paper, selection.text);
  }

  async previewWriting(mode) {
    if (this._aiBusy || !this._selection) return;
    const selection = this._selection;
    if (selection.text.length > 6000) { new Notice('选区超过 6000 字符，请按段落处理'); return; }
    const instruction = {
      polish: '进行学术润色，保留论断与来源，改进术语、逻辑和表达，保持长度接近。',
      expand: '扩写到原文约1.5倍，深化解释与逻辑，不编造实验结果或引用。',
      condense: '精简到原文约一半，保留关键论断、术语和引用。',
      continue: '续写一个衔接自然的学术段落，只输出续写内容，不编造结果、数据或引用。',
    }[mode];
    this._aiBusy = true; this._writingError = ''; this.renderBody();
    try {
      const text = await this.plugin.aiChat(`你是运筹学与航天领域的科研写作助手。${instruction} 使用原文的语言。仅输出正文，不解释。`, selection.text.slice(0, 6000), 1800);
      this._writingResult = { text: text.trim().replace(/^```[a-z]*\n?|```$/g, ''), selection };
    } catch (error) { this._writingError = error.message; }
    finally { this._aiBusy = false; if (!this._closed) this.renderBody(); }
  }

  applyWriting(insertAfter) {
    const result = this._writingResult;
    if (!result) return;
    const context = result.selection;
    if (!this.editorStillOpen(context) || context.editor.getRange(context.from, context.to) !== context.text) {
      new Notice('原选区已变化，请复制建议，或重新选择文字生成建议。'); return;
    }
    if (insertAfter) context.editor.replaceRange('\n\n' + result.text, context.to);
    else context.editor.replaceRange(result.text, context.from, context.to);
    this._writingResult = null; this._selection = null; this.renderBody();
    new Notice('建议已采用，Ctrl+Z 可撤销');
  }

  renderTools() {
    const host = this._body;
    const links = host.createEl('section', { cls: 'jrs-assistant-tools-section' });
    const linksHeading = links.createEl('div', { cls: 'jrs-assistant-section-title' }); linksHeading.createSpan({ text: '常用研究链接' });
    uiButton(linksHeading, '管理', 'settings-2', () => new ResearchLinksModal(this.plugin).open(), 'jrs-text-button');
    const linkGrid = links.createEl('div', { cls: 'jrs-assistant-actions' });
    this.plugin.settings.commonLinks.forEach((link) => uiButton(linkGrid, link.name, 'external-link', () => this.plugin.openResearchWeb(link.url), 'od-btn od-btn--sm'));
    const journal = host.createEl('section', { cls: 'jrs-assistant-tools-section' });
    journal.createEl('div', { cls: 'jrs-assistant-section-title', text: '期刊分区速查' });
    const form = journal.createEl('div', { cls: 'jrs-assistant-lookup' });
    const input = form.createEl('input', { type: 'search', cls: 'jrs-side-input', attr: { placeholder: 'EJOR / 期刊或会议名称', 'aria-label': '查询期刊分区' } }); input.value = this._journalQuery;
    const output = journal.createEl('div', { cls: 'jrs-lookup-out', attr: { 'aria-live': 'polite' } });
    let sequence = 0;
    const lookup = async () => {
      const ticket = ++sequence; const query = input.value.trim();
      output.empty(); if (!query) return;
      output.createEl('div', { cls: 'od-hint', text: '正在查询…' });
      try {
        const result = await this.plugin.lookupJournal(query);
        if (ticket !== sequence || !output.isConnected) return;
        output.empty();
        if (!result.found) { output.createEl('p', { cls: 'od-hint', text: '未收录此名称，可尝试英文全名或常用缩写。' }); return; }
        const badges = output.createEl('div', { cls: 'jrs-side-badges' });
        [[result.cas && `中科院 ${result.cas}${result.casTop ? ' · Top' : ''}`, 'mid'], [result.xr && `新锐 ${result.xr}`, 'mid'],
          [result.ccf && `CCF-${result.ccf.grade}`, 'top'], [result.cast && `科协 ${result.cast}`, 'mid'], [result.warn, 'top']].forEach(([text, type]) => {
          if (text) { const badge = badges.createEl('span', { cls: 'jrs-zone-badge', text }); badge.dataset.zone = type; }
        });
        output.createEl('p', { cls: 'od-hint', text: '数据年份：中科院 2025 / CCF 2026，供选刊参考。' });
      } catch (error) { if (ticket === sequence) output.setText(`查询失败：${error.message}`); }
    };
    input.oninput = () => { this._journalQuery = input.value; window.clearTimeout(this._lookupTimer); this._lookupTimer = window.setTimeout(lookup, 300); };
    input.onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); window.clearTimeout(this._lookupTimer); lookup(); } };
    if (this._journalQuery) lookup();
    const shortcuts = host.createEl('section', { cls: 'jrs-assistant-tools-section' });
    shortcuts.createEl('div', { cls: 'jrs-assistant-section-title', text: '研究工具' });
    const grid = shortcuts.createEl('div', { cls: 'jrs-assistant-actions' });
    [['calendar-check', '今日小结', () => this.plugin.generateDailyDigest()],
      ['table', '文献矩阵', () => this.plugin.generateMatrix()],
      ['file-down', '导出 CSV', () => this.plugin.exportPapers('csv', this.plugin.getPapers())],
      ['braces', '导出 BibTeX', () => this.plugin.exportPapers('bib', this.plugin.getPapers())],
      ['target', '投稿冲刺', () => this.plugin.gotoSection('submit')],
      ['sprout', '综述大纲', () => this.plugin.gotoSection('progress')]].forEach(([icon, label, action]) => uiButton(grid, label, icon, action, 'od-btn od-btn--sm'));
    const submissions = this.plugin.getSubmissions().filter((submission) => submission.deadline).slice(0, 3);
    if (submissions.length) {
      const deadlines = host.createEl('section', { cls: 'jrs-assistant-tools-section' });
      deadlines.createEl('div', { cls: 'jrs-assistant-section-title', text: '投稿节点' });
      submissions.forEach((submission) => {
        const button = uiButton(deadlines, submission.title, 'target', () => this.plugin.smartOpenFile(submission.file), 'jrs-related-title');
        button.createSpan({ cls: 'od-hint', text: `${submission.target} · ${submission.deadline}` });
      });
    }
  }

  renderCapture(root) {
    const capture = root.createEl('details', { cls: 'jrs-side-capture' }); const mode = this.tab;
    capture.open = this._captureModes?.[mode] ?? mode === 'paper'; capture.ontoggle = () => { if (!this._captureModes) this._captureModes = {}; this._captureModes[mode] = capture.open; };
    capture.createEl('summary', { text: '随手记 · 把想法留下来' });
    const textarea = capture.createEl('textarea', { cls: 'jrs-side-input', attr: { rows: '2', placeholder: '这个方法能否用于我的研究？', 'aria-label': '研究想法' } });
    textarea.value = this._captureDraft; textarea.oninput = () => { this._captureDraft = textarea.value; };
    this._captureSource = capture.createEl('div', { cls: 'jrs-capture-source', text: this.paper ? `关联文献：${this.paper.title}` : '保存到今日收件箱' });
    const actions = capture.createEl('div', { cls: 'jrs-capture-actions' });
    uiButton(actions, '存入收件箱', 'inbox', async () => {
      const value = textarea.value.trim(); if (!value) { new Notice('先写下一点想法'); textarea.focus(); return; }
      const source = this.paper ? `\n来源：[[${this.paper.path.replace(/\.md$/, '')}]]` : '';
      await this.plugin.captureThought(value + source); this._captureDraft = ''; textarea.value = ''; new Notice('想法已保存，文献来源已关联');
    }, 'od-btn od-btn--primary od-btn--sm');
    const append = uiButton(actions, '写入笔记', 'file-pen-line', async () => {
      await this.plugin.appendPaperThought(this.paper, textarea.value); this._captureDraft = ''; textarea.value = ''; new Notice('已写入文献的「阅读想法」');
    }, 'od-btn od-btn--sm'); append.disabled = !this.paper;
    textarea.onkeydown = (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); actions.querySelector('button')?.click(); } };
  }


}

module.exports = SidePanelView;
