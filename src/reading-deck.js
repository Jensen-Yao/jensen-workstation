class ReadingDeck {
  constructor(view, host, papers) {
    this.view = view; this.plugin = view.plugin; this.host = host; this.allPapers = papers;
    this.filter = this.plugin.settings.deckFilter || 'active'; this.papers = this.filtered();
    const selectedPath = this.plugin._contextPaperPath || this.plugin.settings.lastReadingPath;
    this.index = Math.max(0, this.papers.findIndex((paper) => paper.path === selectedPath));
    this.cards = []; this.mode = this.plugin.settings.deckMode || '3d'; this.render();
  }
  destroy() { window.clearInterval(this._tour); this._tour = null; }
  filtered() {
    return this.allPapers.filter((paper) => this.filter === 'all' || this.filter === 'reading' && paper.status === '阅读中'
      || this.filter === 'todo' && paper.status === '待读' || this.filter === 'active' && ['阅读中', '待读'].includes(paper.status));
  }
  setFilter(filter, path) {
    this.destroy(); this.filter = filter; this.papers = this.filtered();
    this.index = Math.max(0, this.papers.findIndex((paper) => paper.path === path));
    this.plugin.settings.deckFilter = filter;
    this.plugin.saveSettings().catch((error) => new Notice(`筛选保存失败：${error.message}`));
    this.render(); if (this.papers.length) this.select(this.index);
  }
  selectPath(path) {
    let index = this.papers.findIndex((paper) => paper.path === path);
    if (index < 0 && this.allPapers.some((paper) => paper.path === path)) { this.setFilter('all', path); return; }
    if (index >= 0) this.select(index);
  }
  updatePosition(pdf) { if (this.papers[this.index]?.pdf === pdf) this.updateSummary(); }
  async open(index = this.index, split = false) {
    if (this._opening || !this.papers[index]) return;
    this._opening = true; this.destroy(); this.tourButton?.setAttribute('aria-pressed', 'false');
    if (this.tourButton) this.tourButton.lastElementChild.textContent = '自动浏览';
    try { this.select(index); await this.plugin.openReading(this.papers[index], { split }); }
    finally { this._opening = false; }
  }
  updateSummary() {
    const paper = this.papers[this.index]; if (!paper || !this.selectedTitle) return;
    this.selectedTitle.textContent = paper.title;
    const position = this.plugin.pdfResearch?.readingPosition(paper.pdf);
    this.selectedMeta.textContent = [paper.status, paper.year, paper.authorsShort, position ? `上次读至 ${position.page} / ${position.pages} 页` : paper.topics[0]].filter(Boolean).join(' · ');
  }

  render() {
    const host = this.host; host.empty(); host.addClass('jrs-reading-deck');
    const bar = host.createEl('div', { cls: 'jrs-deck-toolbar' });
    const title = bar.createEl('div', { cls: 'jrs-deck-label' }); setIcon(title.createSpan(), 'layers-3'); title.createSpan({ text: '文献阅读台' });
    const filter = bar.createEl('select', { cls: 'jrs-select jrs-deck-filter', attr: { 'aria-label': '阅读台文献范围' } });
    [['active', '阅读队列'], ['reading', '正在阅读'], ['todo', '待读文献'], ['all', '全部文献']].forEach(([value, text]) => filter.createEl('option', { value, text }));
    filter.value = this.filter; filter.onchange = () => this.setFilter(filter.value);

    this.tourButton = uiButton(bar, '自动浏览', 'rotate-cw', () => this.toggleTour(), 'jrs-deck-tool');
    this.tourButton.setAttribute('aria-pressed', 'false');
    this.modeButton = uiButton(bar, '列表视图', 'list', async () => { this.mode = this.mode === '3d' ? 'list' : '3d'; this.plugin.settings.deckMode = this.mode; await this.plugin.saveSettings(); this.renderStage(); }, 'jrs-deck-tool');
    if (!this.papers.length) {
      this.selectedTitle = null; this.stage = null; this.cards = []; this.position = null; this.readButton = null;
      this.tourButton.disabled = true; this.modeButton.disabled = true;
      uiEmpty(host, this.allPapers.length ? '当前队列没有文献' : '从第一篇文献开始', this.allPapers.length ? '切换范围可以回顾已经完成的文献。' : '添加文献后，阅读卡片会与右侧助手联动。', this.allPapers.length ? '查看全部文献' : '添加文献', () => this.allPapers.length ? this.setFilter('all') : new AddPaperModal(this.plugin, () => this.view.render()).open(), 'layers-3');
      return;
    }
    this.stage = host.createEl('div', { cls: 'jrs-deck-stage', attr: { tabindex: '0', role: 'group', 'aria-label': '文献卡组，使用左右方向键切换文献' } });
    this.stage.onkeydown = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.select(this.index + (event.key === 'ArrowRight' ? 1 : -1)); this.cards[this.index]?.focus({ preventScroll: true }); }
    };
    this.stage.onpointerenter = () => { this._hover = true; };
    this.stage.onpointerleave = () => { this._hover = false; this.stage.style.setProperty('--jrs-look', '0deg'); };
    this.stage.onpointermove = (event) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || event.pointerType === 'touch') return;
      const rect = this.stage.getBoundingClientRect();
      this.stage.style.setProperty('--jrs-look', `${Math.max(-5, Math.min(5, (event.clientX - rect.left - rect.width / 2) / rect.width * 10))}deg`);
    };
    let start;
    this.stage.onpointerdown = (event) => { start = event.clientX; this._suppressClick = false; };
    this.stage.onpointerup = (event) => {
      if (event.pointerType === 'touch' && start != null && Math.abs(event.clientX - start) > 45) { this._suppressClick = true; this.select(this.index + (event.clientX < start ? 1 : -1)); }
      start = null;
    };
    this.renderStage();
    const summary = host.createEl('div', { cls: 'jrs-deck-selection' });
    this.selectedTitle = uiButton(summary, '', '', () => this.open(), 'jrs-deck-selected-title');
    this.selectedTitle.title = '点击直接打开 PDF';
    this.selectedMeta = summary.createEl('div', { cls: 'jrs-deck-selected-meta' });
    const foot = host.createEl('div', { cls: 'jrs-deck-footer' });
    uiButton(foot, '', 'chevron-left', () => this.select(this.index - 1), 'jrs-deck-arrow').setAttribute('aria-label', '上一篇文献');
    this.position = foot.createEl('span', { cls: 'jrs-deck-position', attr: { 'aria-live': 'polite' } });
    uiButton(foot, '', 'chevron-right', () => this.select(this.index + 1), 'jrs-deck-arrow').setAttribute('aria-label', '下一篇文献');
    const actions = foot.createEl('div', { cls: 'jrs-deck-read-actions' });
    this.splitButton = uiButton(actions, '分栏阅读', 'columns-2', () => this.open(this.index, true), 'od-btn');
    this.splitButton.title = '并排打开文献笔记与 PDF';
    this.readButton = uiButton(actions, '阅读 PDF', 'book-open', () => this.open(), 'od-btn od-btn--primary');
    this.readButton.title = '在当前区域打开 PDF 标签页';
    this.update();
  }

  renderStage() {
    if (!this.stage) return;
    this.stage.empty(); this.cards = [];
    this.stage.classList.toggle('is-list', this.mode === 'list');
    this.modeButton.lastElementChild.textContent = this.mode === '3d' ? '列表视图' : '3D 视图';
    if (this.mode === 'list') {
      this.papers.forEach((paper, index) => {
        const row = uiButton(this.stage, '', '', () => this.open(index), 'jrs-deck-list-item');
        row.setAttribute('aria-label', `打开 PDF：${paper.title}`); row.title = '点击直接打开 PDF';
        row.createSpan({ cls: 'jrs-deck-list-index', text: String(index + 1).padStart(2, '0') });
        const copy = row.createEl('div'); copy.createEl('strong', { text: paper.title });
        copy.createEl('span', { text: `${paper.status} · ${paper.progress}%${paper.year ? ' · ' + paper.year : ''}` });
        this.cards.push(row);
      });
    } else {
      this.stage.createEl('div', { cls: 'jrs-deck-aura', attr: { 'aria-hidden': 'true' } });
      const all = this.plugin.getPapers(); const completed = all.filter((paper) => paper.status === '已完成').length;
      const badge = this.stage.createEl('div', { cls: 'jrs-deck-floating-stat' });
      badge.createSpan({ text: '阅读完成率' }); badge.createEl('strong', { text: `${Math.round(completed / Math.max(1, all.length) * 100)}%` });
      badge.createEl('small', { text: `${completed} / ${all.length} 篇文献` });
      badge.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${completed / Math.max(1, all.length) * 100}%`;
      // Keep only the visible cards mounted, including in larger vaults.
      this.cards = new Array(this.papers.length).fill(null);
    }
    this.update();
  }

  createCard(paper, index) {
    const card = uiButton(this.stage, '', '', () => {
      if (this._suppressClick) { this._suppressClick = false; return; }
      return this.open(index);
    }, 'jrs-reading-card');
    card.setAttribute('aria-label', `打开 PDF：${paper.title}`); card.title = '点击直接打开 PDF';
    card.createEl('div', { cls: 'jrs-reading-card-top', text: `PAPER · ${String(index + 1).padStart(2, '0')}` });
    const lines = card.createEl('div', { cls: 'jrs-reading-card-lines', attr: { 'aria-hidden': 'true' } });
    for (let line = 0; line < 7; line++) lines.createEl('i');
    card.createEl('div', { cls: 'jrs-reading-card-topic', text: paper.topics[0] || paper.project || 'RESEARCH NOTE' });
    card.createEl('strong', { cls: 'jrs-reading-card-title', text: paper.title });
    card.createEl('div', { cls: 'jrs-reading-card-meta', text: `${paper.year || '文献笔记'} · ${paper.status}` });
    return card;
  }

  select(index) {
    if (!this.papers.length) return;
    this.index = (index + this.papers.length) % this.papers.length;
    const paper = this.papers[this.index]; this.plugin._contextPaperPath = paper.path;
    this.plugin.app.workspace.getLeavesOfType(VIEW_SIDE).forEach((leaf) => leaf.view.setPaper?.(paper));
    this.update();
    this.host.dispatchEvent(new CustomEvent('jrs-paper-select', { detail: paper.path }));
  }

  update() {
    if (!this.papers.length) return;
    const length = this.papers.length;
    this.papers.forEach((paper, index) => {
      let card = this.cards[index];
      let offset = index - this.index;
      if (offset > length / 2) offset -= length;
      if (offset < -length / 2) offset += length;
      const distance = Math.abs(offset);
      const shown = this.mode === 'list' || distance <= 3;
      if (!shown) { card?.remove(); this.cards[index] = null; return; }
      if (!card) card = this.cards[index] = this.createCard(paper, index);
      card.classList.toggle('is-active', index === this.index);
      card.setAttribute('aria-current', index === this.index ? 'true' : 'false');
      card.tabIndex = index === this.index ? 0 : -1;
      card.style.visibility = shown ? 'visible' : 'hidden';
      if (this.mode === '3d') {
        card.style.setProperty('--jrs-card-x', `${offset * 106}px`);
        card.style.setProperty('--jrs-card-z', `${-distance * 75}px`);
        card.style.setProperty('--jrs-card-angle', `${offset === 0 ? 0 : -Math.sign(offset) * (24 + distance * 4)}deg`);
        card.style.zIndex = String(20 - distance);
      }
    });
    this.updateSummary();
    if (this.position) this.position.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(length).padStart(2, '0')}`;
    if (this.readButton) this.readButton.lastElementChild.textContent = this.papers[this.index].pdf ? '阅读 PDF' : '打开笔记';
  }

  toggleTour() {
    if (this._tour) { window.clearInterval(this._tour); this._tour = null; }
    else this._tour = window.setInterval(() => { if (!this._hover && document.visibilityState === 'visible' && this.host.isConnected) this.select(this.index + 1); }, 5000);
    this.tourButton.setAttribute('aria-pressed', String(!!this._tour));
    this.tourButton.lastElementChild.textContent = this._tour ? '停止浏览' : '自动浏览';
  }
}
