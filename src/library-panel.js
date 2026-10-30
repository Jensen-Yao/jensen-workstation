// This source is embedded in main.js by tools/build.mjs. It uses the host's UI helpers.
class LibraryPanel {
  constructor(plugin, rerender) {
    this.plugin = plugin;
    this.rerender = rerender || (() => {});
    this.q = ''; this.statusFilter = '全部'; this.prioFilter = '全部';
    this.topicFilter = ''; this.projectFilter = ''; this.sort = 'added';
    this.viewMode = plugin.settings.libraryViewMode || 'list';
    this.selected = new Set(); this.page = 0; this.pageSize = 30;
    this.filtersOpen = false; this.busy = false;
  }

  applyIncomingTopic() {
    if (this.plugin.libFilterTopic) {
      this.topicFilter = this.plugin.libFilterTopic;
      this.plugin.libFilterTopic = ''; this.filtersOpen = true;
    }
    if (this.plugin.libFilterState) {
      Object.assign(this, this.plugin.libFilterState);
      this.plugin.libFilterState = null;
      this.selected.clear(); this.page = 0;
    }
  }

  state() {
    return Object.fromEntries(['q', 'statusFilter', 'prioFilter', 'topicFilter', 'projectFilter', 'sort', 'viewMode'].map((key) => [key, this[key]]));
  }

  changed() { this.page = 0; this.selected.clear(); this.renderList(); }

  reset() {
    Object.assign(this, { q: '', statusFilter: '全部', prioFilter: '全部', topicFilter: '', projectFilter: '', page: 0 });
    this.selected.clear(); this.render();
  }

  render() {
    const root = this.host;
    root.empty(); root.addClass('jrs-library-panel');
    this.applyIncomingTopic();
    const allPapers = this.plugin.getPapers();
    root.addClass('jrs-workspace-library');
    new SectionWorkspace({ plugin: this.plugin, app: this.plugin.app }).metrics(root, [['当前收集', allPapers.length, this.plugin.settings.sourceFolder || '当前知识库'], ['可直接阅读', allPapers.filter(p => p.pdf).length, '本地 PDF 与关联文献'], ['待补充笔记', allPapers.filter(p => p.isPdfOnly).length, '首次写笔记时建立索引']]);

    const workbench = root.createEl('section', { cls: 'jrs-library-workbench' });
    const source = workbench.createEl('div', { cls: 'jrs-source-bar' });
    const label = source.createEl('label', { cls: 'jrs-source-label' });
    setIcon(label.createSpan(), 'folder-open'); label.createSpan({ text: '文献来源' });
    const folder = label.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '当前文献来源文件夹' } });
    this.plugin.sourceFolderOptions().forEach((option) => folder.createEl('option', { value: option.path, text: `${option.path || this.plugin.app.vault.getName() + ' / 全库'} · ${option.count} PDF` }));
    folder.value = this.plugin.settings.sourceFolder;
    folder.onchange = async () => { try { await this.plugin.setSourceFolder(folder.value); } catch (error) { new Notice(error.message); } };
    uiButton(source, '使用当前目录', 'locate-fixed', () => this.plugin.setSourceFolder(this.plugin.currentDocumentFolder()), 'jrs-text-button');
    source.createEl('p', { cls: 'od-hint', text: '仅显示此目录及子目录中的本地 PDF 与文献笔记。首次写笔记时建立索引，原 PDF 保留在原处。' });
    const bar = workbench.createEl('div', { cls: 'od-lib-toolbar' });
    const search = bar.createEl('div', { cls: 'od-search jrs-library-search' });
    setIcon(search.createSpan(), 'search');
    const input = search.createEl('input', { type: 'search', attr: { 'aria-label': '搜索文献，支持 status、topic、year 等字段', placeholder: '搜索标题、作者、方向…' } });
    input.value = this.q;
    input.oninput = () => { this.q = input.value; this.changed(); };
    input.onkeydown = (e) => { if (e.key === 'Escape') { input.value = ''; this.q = ''; this.changed(); } };

    const sortSel = bar.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '文献排序' } });
    [['added', '最近添加'], ['year', '年份从新到旧'], ['title', '标题 A–Z'], ['rating', '评分从高到低'], ['priority', '优先级']].forEach(([value, text]) => sortSel.createEl('option', { value, text }));
    sortSel.value = this.sort;
    sortSel.onchange = () => { this.sort = sortSel.value; this.page = 0; this.renderList(); };
    const views = bar.createEl('div', { cls: 'jrs-view-switch', attr: { role: 'group', 'aria-label': '显示方式' } });
    [['list', 'list', '列表'], ['grid', 'layout-grid', '卡片']].forEach(([mode, icon, label]) => {
      const button = uiButton(views, '', icon, async () => {
        this.viewMode = mode; this.plugin.settings.libraryViewMode = mode;
        await this.plugin.saveSettings(); this.render();
      }, `od-icon-btn${this.viewMode === mode ? ' is-active' : ''}`);
      button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(this.viewMode === mode)); button.title = label;
    });

    const more = bar.createEl('details', { cls: 'jrs-more' });
    more.createEl('summary', { text: '工具', attr: { 'aria-label': '文献工具' } });
    const menu = more.createEl('div', { cls: 'jrs-more-menu' });
    [['import', '导入 PDF 文件夹', () => new ImportFolderModal(this.plugin, () => this.render()).open()],
      ['table', '生成文献矩阵', () => this.plugin.generateMatrix()],
      ['database', '生成 Bases', () => this.plugin.generateBases()],
      ['folder-input', '外部 PDF 入库', () => this.plugin.migrateExternalPdfs()]].forEach(([icon, label, fn]) => uiButton(menu, label, icon, async () => { more.open = false; await fn(); }, 'jrs-menu-button'));

    const tabs = workbench.createEl('div', { cls: 'jrs-library-tabs', attr: { role: 'group', 'aria-label': '阅读状态筛选' } });
    ['全部', ...STATUSES].forEach((status) => {
      const count = status === '全部' ? allPapers.length : allPapers.filter((p) => p.status === status).length;
      const button = uiButton(tabs, status, '', () => { this.statusFilter = status; this.selected.clear(); this.page = 0; this.render(); }, `jrs-library-tab${this.statusFilter === status ? ' is-active' : ''}`);
      button.createSpan({ cls: 'jrs-tab-count', text: String(count) });
      button.setAttribute('aria-pressed', String(this.statusFilter === status));
    });

    const filters = workbench.createEl('details', { cls: 'jrs-filter-details' });
    filters.open = this.filtersOpen || !!(this.topicFilter || this.projectFilter || this.prioFilter !== '全部');
    filters.ontoggle = () => { this.filtersOpen = filters.open; };
    const summary = filters.createEl('summary');
    setIcon(summary.createSpan(), 'sliders-horizontal'); summary.createSpan({ text: '筛选与搜索语法' });
    const active = [this.topicFilter, this.projectFilter, this.prioFilter !== '全部' ? this.prioFilter : ''].filter(Boolean).length;
    if (active) summary.createSpan({ cls: 'jrs-tab-count', text: String(active) });
    const fields = filters.createEl('div', { cls: 'jrs-filter-fields' });
    const select = (label, key, options) => {
      const wrap = fields.createEl('label', { cls: 'jrs-field' });
      wrap.createSpan({ text: label });
      const control = wrap.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': label } });
      options.forEach(([value, text]) => control.createEl('option', { value, text }));
      control.value = this[key];
      control.onchange = () => { this[key] = control.value; this.changed(); };
    };
    select('优先级', 'prioFilter', [['全部', '全部优先级'], ...PRIORITIES.map((p) => [p, p + '优先级']), ['无', '未设置']]);
    const topics = [...new Set([...this.plugin.settings.topics, ...allPapers.flatMap((p) => p.topics)])];
    select('研究方向', 'topicFilter', [['', '全部方向'], ...topics.map((t) => [t, t])]);
    const projects = [...new Set(allPapers.map((p) => p.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
    select('论文项目', 'projectFilter', [['', '全部项目'], ['__none__', '未分配项目'], ...projects.map((p) => [p, p])]);
    const syntax = filters.createEl('div', { cls: 'jrs-search-help' });
    syntax.createSpan({ text: '组合检索：' });
    ['status:阅读中', 'topic:网格', 'year:>=2023', 'rating:>=4', 'has:pdf', '-status:已归档', 'project:"卫星规划"'].forEach((example) => {
      uiButton(syntax, example, '', () => {
        this.q = [this.q, example].filter(Boolean).join(' '); input.value = this.q; this.changed(); input.focus();
      }, 'jrs-query-example');
    });

    const saved = root.createEl('div', { cls: 'jrs-saved-views' });
    saved.createSpan({ cls: 'jrs-meta-label', text: '常用检索' });
    [['高优先待读', 'status:待读 priority:高'], ['精读候选', 'rating:>=4 -status:已归档'], ['有 PDF', 'has:pdf']].forEach(([label, query]) => {
      uiButton(saved, label, '', () => { this.resetStateForQuery(query); }, 'jrs-saved-view');
    });
    (this.plugin.settings.savedLibraryViews || []).forEach((view) => {
      const chip = saved.createEl('span', { cls: 'jrs-saved-view-wrap' });
      uiButton(chip, view.name, 'bookmark', () => { Object.assign(this, view.state); this.selected.clear(); this.page = 0; this.render(); }, 'jrs-saved-view');
      const remove = uiButton(chip, '', 'x', async () => {
        this.plugin.settings.savedLibraryViews = this.plugin.settings.savedLibraryViews.filter((v) => v.id !== view.id);
        await this.plugin.saveSettings(); this.render();
      }, 'jrs-saved-remove');
      remove.setAttribute('aria-label', `删除检索「${view.name}」`);
    });
    uiButton(saved, '保存当前检索', 'bookmark-plus', () => this.saveView(), 'jrs-save-view');

    this._listHost = root.createEl('div', { cls: 'jrs-library-results' });
    this.renderList();
  }

  resetStateForQuery(query) {
    Object.assign(this, { q: query, statusFilter: '全部', prioFilter: '全部', topicFilter: '', projectFilter: '', page: 0 });
    this.selected.clear(); this.render();
  }

  saveView() {
    const modal = new Modal(this.plugin.app);
    modal.titleEl.setText('保存常用检索');
    let name = '';
    new Setting(modal.contentEl).setName('检索名称').addText((text) => {
      text.setPlaceholder('例如：综述核心文献'); text.onChange((value) => { name = value.trim(); });
      window.setTimeout(() => text.inputEl.focus(), 20);
    });
    uiButton(modal.contentEl, '保存检索', 'bookmark', async () => {
      if (!name) { new Notice('请填写检索名称'); return; }
      const list = this.plugin.settings.savedLibraryViews;
      const existing = list.find((view) => view.name === name);
      const view = { id: existing?.id || Date.now().toString(36), name, state: this.state() };
      if (existing) list.splice(list.indexOf(existing), 1, view); else list.push(view);
      await this.plugin.saveSettings(); modal.close(); this.render();
    }, 'od-btn od-btn--primary');
    modal.open();
  }

  filtered() {
    const query = ResearchCore.parsePaperQuery(this.q);
    return this.plugin.getPapersSorted(this.sort).filter((p) => {
      if (this.statusFilter !== '全部' && p.status !== this.statusFilter) return false;
      if (this.prioFilter === '无' && p.priority) return false;
      if (this.prioFilter !== '全部' && this.prioFilter !== '无' && p.priority !== this.prioFilter) return false;
      if (this.topicFilter && !p.topics.includes(this.topicFilter)) return false;
      if (this.projectFilter === '__none__' ? !!p.project : this.projectFilter && p.project !== this.projectFilter) return false;
      return ResearchCore.matchPaperQuery(p, query);
    });
  }

  renderList() {
    if (!this._listHost) return;
    const oldScroll = this._listHost.closest('.jrs-page')?.scrollTop || 0;
    this._listHost.empty();
    const papers = this.filtered();
    const allPaths = new Set(this.plugin.getPapers().map((p) => p.path));
    for (const path of this.selected) if (!allPaths.has(path)) this.selected.delete(path);
    this.page = Math.max(0, Math.min(this.page, Math.ceil(papers.length / this.pageSize) - 1));
    const visible = papers.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
    const resultBar = this._listHost.createEl('div', { cls: 'jrs-result-bar' });
    const selectAll = resultBar.createEl('label', { cls: 'jrs-selection-label' });
    const checkbox = selectAll.createEl('input', { type: 'checkbox', attr: { 'aria-label': '选择所有筛选结果' } });
    const matched = papers.filter((p) => this.selected.has(p.path)).length;
    checkbox.checked = !!papers.length && matched === papers.length;
    checkbox.indeterminate = matched > 0 && matched < papers.length;
    checkbox.disabled = !papers.length || this.busy;
    checkbox.onchange = () => { papers.forEach((p) => checkbox.checked ? this.selected.add(p.path) : this.selected.delete(p.path)); this.renderList(); };
    selectAll.createSpan({ cls: 'jrs-result-count', text: `${papers.length} 篇文献` });
    const info = resultBar.createEl('span', { cls: 'od-hint', attr: { 'aria-live': 'polite' } });
    info.textContent = this.selected.size ? `已选 ${this.selected.size} 篇` : '勾选文献以批量管理';
    if (this.q || this.topicFilter || this.projectFilter || this.prioFilter !== '全部' || this.statusFilter !== '全部') uiButton(resultBar, '清除筛选', 'x', () => this.reset(), 'jrs-text-button');
    if (this.plugin._lastPaperBatch?.length) uiButton(resultBar, '撤销上次批量修改', 'undo-2', async () => {
      await this.plugin.undoPaperBatch(); this.render();
    }, 'jrs-text-button');
    const exportSelect = resultBar.createEl('select', { cls: 'jrs-select jrs-export-select', attr: { 'aria-label': this.selected.size ? '导出所选文献' : '导出筛选结果' } });
    exportSelect.createEl('option', { value: '', text: this.selected.size ? '导出所选' : '导出结果' });
    exportSelect.createEl('option', { value: 'csv', text: 'CSV · Excel 可打开' });
    exportSelect.createEl('option', { value: 'bib', text: 'BibTeX · 文献引用' });
    exportSelect.disabled = !papers.length || this.busy;
    exportSelect.onchange = async () => {
      const format = exportSelect.value; if (!format) return;
      exportSelect.disabled = true;
      try { await this.plugin.exportPapers(format, this.selected.size ? this.plugin.getPapers().filter((p) => this.selected.has(p.path)) : papers); }
      catch (error) { new Notice(`导出失败：${error.message}`); }
      finally { exportSelect.value = ''; exportSelect.disabled = false; }
    };
    if (this.selected.size) this.renderBatchBar();

    if (!papers.length) {
      uiEmpty(this._listHost, this.plugin.getPapers().length ? '没有匹配的文献' : '从第一篇文献开始',
        this.plugin.getPapers().length ? '试试减少筛选条件，或搜索标题、作者与研究方向。' : '添加论文或导入 PDF，把阅读、笔记和研究线索放在一起。',
        this.plugin.getPapers().length ? '清除筛选' : '添加文献',
        () => this.plugin.getPapers().length ? this.reset() : new AddPaperModal(this.plugin, () => this.render()).open(), 'library');
      return;
    }
    const grid = this._listHost.createEl('div', { cls: `od-papers jrs-library-${this.viewMode}` });
    visible.forEach((paper, i) => grid.appendChild(this.paperCard(paper, i)));
    if (papers.length > this.pageSize) {
      const pager = this._listHost.createEl('div', { cls: 'jrs-pagination' });
      const prev = uiButton(pager, '上一页', 'chevron-left', () => { this.page--; this.renderList(); }, 'od-btn');
      prev.disabled = this.page === 0;
      pager.createSpan({ text: `${this.page + 1} / ${Math.ceil(papers.length / this.pageSize)} · 每页 ${this.pageSize} 篇` });
      const next = uiButton(pager, '下一页', 'chevron-right', () => { this.page++; this.renderList(); }, 'od-btn');
      next.disabled = (this.page + 1) * this.pageSize >= papers.length;
    }
    const scroll = this._listHost.closest('.jrs-page');
    if (scroll) scroll.scrollTop = oldScroll;
  }

  renderBatchBar() {
    const bar = this._listHost.createEl('div', { cls: 'jrs-batch-bar', attr: { 'aria-label': '文献批量操作' } });
    bar.createSpan({ cls: 'jrs-batch-count', text: this.busy ? '正在保存…' : `已选 ${this.selected.size} 篇` });
    const action = (label, options, field) => {
      const select = bar.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': label } });
      select.createEl('option', { value: '__placeholder__', text: label });
      options.forEach((value) => select.createEl('option', { value, text: value || '清除优先级' }));
      select.disabled = this.busy;
      select.onchange = () => { if (select.value !== '__placeholder__') this.runBatch({ [field]: select.value }); };
    };
    action('设置状态', STATUSES, 'status'); action('设置优先级', [...PRIORITIES, ''], 'priority');
    const project = bar.createEl('input', { type: 'text', cls: 'jrs-batch-project', attr: { 'aria-label': '批量分配的项目名称', placeholder: '项目名称' } });
    project.disabled = this.busy;
    const assign = uiButton(bar, '分配项目', 'folder', () => {
      const value = project.value.trim();
      if (!value) { new Notice('填写项目名称后再分配'); project.focus(); return; }
      return this.runBatch({ project: value });
    }, 'od-btn od-btn--sm');
    assign.disabled = this.busy;
    uiButton(bar, '取消选择', 'x', () => { this.selected.clear(); this.renderList(); }, 'jrs-text-button').disabled = this.busy;
  }

  async runBatch(patch) {
    if (this.busy) return;
    const papers = this.plugin.getPapers().filter((p) => this.selected.has(p.path));
    this.busy = true; this.renderList();
    try { await this.plugin.applyPaperBatch(papers, patch); this.selected.clear(); }
    catch (error) { new Notice(`批量修改失败：${error.message}`); }
    finally { this.busy = false; this.render(); }
  }

  paperCard(paper, i) {
    const el = document.createElement('article');
    el.className = `od-paper${this.selected.has(paper.path) ? ' is-selected' : ''}`;
    el.dataset.paperPath = paper.path;
    const selectWrap = el.createEl('label', { cls: 'jrs-paper-select' });
    const checkbox = selectWrap.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${paper.title}` } });
    checkbox.checked = this.selected.has(paper.path); checkbox.disabled = this.busy;
    checkbox.onchange = () => { checkbox.checked ? this.selected.add(paper.path) : this.selected.delete(paper.path); this.renderList(); };
    const content = el.createEl('div', { cls: 'jrs-paper-content' });
    const heading = content.createEl('div', { cls: 'jrs-paper-heading' });
    const title = heading.createEl('button', { cls: 'od-paper-title', text: paper.title });
    title.title = `${paper.pdf ? '阅读 PDF' : '打开笔记'}：${paper.title}`; title.onclick = () => this.plugin.openReading(paper);
    const meta = content.createEl('div', { cls: 'od-paper-meta' });
    const zone = (paper.fmCas || paper.fmXr || paper.fmCcf || paper.fmTier) ? { cas: paper.fmCas, top: paper.fmCasTop, xr: paper.fmXr, ccf: paper.fmCcf, tier: paper.fmTier } : this.plugin.zoneOf(paper.venue);
    if (zone) { const badge = this.plugin.zoneBadge(zone); if (badge) meta.appendChild(badge); }
    const parts = [paper.year, paper.venue, paper.authorsShort].filter(Boolean);
    if (paper.isPdfOnly) parts.push('本地 PDF · 尚未建立笔记');
    parts.forEach((part) => meta.createSpan({ text: part }));
    if (paper.summary) content.createEl('p', { cls: 'jrs-paper-abstract', text: paper.summary });
    if (paper.topics.length || paper.project) {
      const chips = content.createEl('div', { cls: 'od-chips' });
      paper.topics.slice(0, 4).forEach((topic) => uiButton(chips, topic, '', () => { this.topicFilter = topic; this.changed(); this.render(); }, 'od-chip jrs-topic-filter'));
      if (paper.project) chips.createSpan({ cls: 'jrs-project-chip', text: paper.project });
    }
    const foot = content.createEl('div', { cls: 'od-paper-foot' });
    const status = foot.createEl('select', { cls: 'od-status jrs-paper-status', attr: { 'aria-label': `阅读状态：${paper.title}` } });
    status.dataset.status = paper.status;
    STATUSES.forEach((text) => status.createEl('option', { value: text, text })); status.value = paper.status;
    status.onchange = async () => {
      status.disabled = true;
      try { await this.plugin.setPaperStatus(paper, status.value); this.renderList(); }
      catch (error) { new Notice(`保存失败：${error.message}`); status.value = paper.status; }
      finally { status.disabled = false; }
    };
    if (paper.priority) foot.createSpan({ cls: 'jrs-priority-label', text: paper.priority + '优先级' });
    const stars = foot.createEl('span', { cls: 'od-stars', attr: { 'aria-label': `评分 ${paper.rating} 星` } });
    for (let n = 1; n <= 5; n++) {
      const star = uiButton(stars, '', 'star', async () => { await this.plugin.setPaperRating(paper, paper.rating === n ? 0 : n); this.renderList(); }, `od-star${n <= paper.rating ? ' is-on' : ''}`);
      star.setAttribute('aria-label', `${n} 星`); star.setAttribute('aria-pressed', String(n <= paper.rating));
    }
    const progress = foot.createEl('span', { cls: 'jrs-reading-percent', text: `${paper.progress}%`, attr: { title: '阅读进度' } });
    progress.style.setProperty('--jrs-read-progress', `${paper.progress}%`);
    const acts = content.createEl('div', { cls: 'od-paper-actions' });
    const iconButton = (icon, label, fn) => {
      const button = uiButton(acts, label, icon, fn, 'od-btn od-btn--sm');
      button.title = label; button.setAttribute('aria-label', `${label}：${paper.title}`);
    };
    if (paper.pdf) iconButton('book-open', '阅读 PDF', () => this.plugin.openReading(paper));
    iconButton('file-text', '文献笔记', () => this.plugin.openPaper(paper));
    if (paper.pdf) iconButton('columns-2', '分栏阅读', () => this.plugin.openReading(paper, { split: true }));
    iconButton('bot', 'AI 助手', () => new AiPaperModal(this.plugin, paper, () => this.renderList()).open());
    return el;
  }
}

module.exports = LibraryPanel;
