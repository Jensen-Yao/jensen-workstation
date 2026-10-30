// Task-specific workspaces share materials, not identical page layouts.
class SectionWorkspace {
  constructor(view) { this.view = view; this.plugin = view.plugin; this.app = view.app; }
  static async metadata(app, file, predicate) {
    if (predicate(app.metadataCache.getFileCache(file)?.frontmatter || {})) return;
    await new Promise(resolve => {
      const finish = () => { window.clearTimeout(timer); app.metadataCache.offref(event); resolve(); };
      const event = app.metadataCache.on('changed', changed => { if (changed.path === file.path && predicate(app.metadataCache.getFileCache(file)?.frontmatter || {})) finish(); });
      const timer = window.setTimeout(finish, 2500);
    });
  }
  metrics(page, items) {
    const strip = document.createElement('div'); strip.className = 'jrs-section-metrics';
    for (const [label, value, detail] of items) {
      const tile = strip.createEl('div', { cls: 'jrs-section-metric' });
      tile.createSpan({ text: label }); tile.createEl('strong', { text: String(value) });
      if (detail) tile.createEl('small', { text: detail });
    }
    page.prepend(strip); return strip;
  }
  paper(paper, host, index) {
    const card = host.createEl('article', { cls: 'jrs-work-paper' });
    const top = card.createEl('div', { cls: 'jrs-work-paper-top' });
    top.createSpan({ text: `PAPER ${String(index + 1).padStart(2, '0')}` });
    top.createSpan({ cls: 'od-status', text: paper.status, attr: { 'data-status': paper.status } });
    uiButton(card, paper.title, '', () => this.plugin.openReading(paper), 'jrs-work-paper-title');
    card.createEl('p', { cls: 'od-hint', text: [paper.year, paper.authorsShort, paper.venue].filter(Boolean).join(' · ') || '本地文献 · 待补充元数据' });
    if (paper.summary) card.createEl('p', { cls: 'jrs-work-summary', text: paper.summary });
    const position = this.plugin.pdfResearch.readingPosition(paper.pdf);
    const count = this.plugin.pdfResearch.annotations(paper.pdf).length;
    card.createEl('div', { cls: 'jrs-work-paper-detail', text: [position ? `读至 ${position.page} / ${position.pages} 页` : '尚无阅读位置', `${count} 条批注`, paper.priority ? paper.priority + '优先级' : ''].filter(Boolean).join(' · ') });
    const bar = card.createEl('div', { cls: 'od-progressbar' }); bar.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${paper.progress}%`;
    const actions = card.createEl('div', { cls: 'jrs-row-actions' });
    uiButton(actions, paper.pdf ? '阅读 PDF' : '打开笔记', 'book-open', () => this.plugin.openReading(paper), 'od-btn od-btn--primary od-btn--sm');
    uiButton(actions, '笔记', 'file-text', () => this.plugin.openPaper(paper), 'od-btn od-btn--sm');
    if (this.view.section === 'reader') uiButton(actions, '批注', 'highlighter', async () => {
      if (!paper.pdf) return;
      await this.plugin.openReading(paper); await this.plugin.activateSidePanel(false);
      const side = this.app.workspace.getLeavesOfType(VIEW_SIDE)[0]?.view;
      if (side) { side.usePdf(paper.pdf); side.tab = 'pdf'; side.showCompanionMode('assistant'); side.render(); }
    }, 'od-btn od-btn--sm').disabled = !paper.pdf;
    else {
      const status = actions.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': `设置状态：${paper.title}` } });
      STATUSES.forEach(value => status.createEl('option', { value, text: value })); status.value = paper.status;
      status.onchange = async () => { status.disabled = true; try { await this.plugin.setPaperStatus(paper, status.value); await this.view.render(); } catch (e) { status.value = paper.status; status.disabled = false; new Notice(e.message); } };
    }
    return card;
  }
  renderReading(page, reader = false) {
    const papers = this.plugin.getPapers();
    this.metrics(page, [['正在阅读', papers.filter(p => p.status === '阅读中').length, '继续上次的思考'], ['等待阅读', papers.filter(p => p.status === '待读').length, '按优先级安排下一篇'], ['已保存批注', papers.reduce((n, p) => n + this.plugin.pdfResearch.annotations(p.pdf).length, 0), '关联原文与页码']]);
    const controls = page.createEl('div', { cls: 'jrs-work-controls' });
    const search = controls.createEl('input', { type: 'search', attr: { placeholder: '查找标题、作者、方向…', 'aria-label': '检索阅读文献' } });
    const scope = controls.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '阅读文献范围' } });
    [['active', '阅读队列'], ['all', '全部文献'], ['marked', '有批注的文献']].forEach(([value, text]) => scope.createEl('option', { value, text }));
    if (reader) scope.value = 'all';
    const sort = controls.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '阅读排序' } });
    [['priority', '优先级优先'], ['resume', '最近阅读'], ['title', '标题排序']].forEach(([value, text]) => sort.createEl('option', { value, text }));
    const body = page.createEl('div', { cls: reader ? 'jrs-reader-shelf' : 'jrs-queue-board' });
    const draw = () => {
      body.empty(); const query = search.value.trim();
      const filtered = papers.filter(p => (scope.value === 'all' || scope.value === 'marked' && this.plugin.pdfResearch.annotations(p.pdf).length || scope.value === 'active' && ['待读', '阅读中'].includes(p.status)) && ResearchCore.matchPaperQuery(p, query));
      filtered.sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title, 'zh') : sort.value === 'resume' ? (this.plugin.pdfResearch.readingPosition(b.pdf)?.updated || 0) - (this.plugin.pdfResearch.readingPosition(a.pdf)?.updated || 0) : PRIORITIES.indexOf(a.priority || '低') - PRIORITIES.indexOf(b.priority || '低'));
      if (!filtered.length) { uiEmpty(body, '当前范围没有文献', '调整关键词或查看全部文献。', '查看全部', () => { scope.value = 'all'; search.value = ''; draw(); }); return; }
      if (reader) filtered.forEach((p, index) => this.paper(p, body, index));
      else {
        const groups = scope.value === 'active' ? [['阅读中', '继续阅读'], ['待读', '接下来阅读']] : [...new Set(filtered.map(p => p.status))].map(status => [status, status]);
        groups.forEach(([status, title]) => {
          const column = body.createEl('section', { cls: 'jrs-queue-column' }); const list = filtered.filter(p => p.status === status);
          const heading = column.createEl('div', { cls: 'jrs-section-heading' }); heading.createEl('h2', { text: title }); heading.createSpan({ cls: 'jrs-count-pill', text: String(list.length) });
          if (!list.length) column.createEl('p', { cls: 'od-hint', text: '这一列暂时没有文献。' });
          list.forEach((p, index) => this.paper(p, column, index));
        });
      }
    };
    search.oninput = scope.onchange = sort.onchange = draw; draw();
  }
  renderGraph(page) {
    const papers = this.plugin.getPapers(); const topics = [...new Set(papers.flatMap(p => p.topics.length ? p.topics : ['未分类']))];
    this.metrics(page, [['文献节点', papers.length, '当前来源目录'], ['研究方向', topics.length, '点击节点筛选文献'], ['归属连线', papers.reduce((n, p) => n + Math.max(1, p.topics.length), 0), '表示主题归属，不代表引用关系']]);
    const controls = page.createEl('div', { cls: 'jrs-work-controls' });
    uiButton(controls, '导出 / 更新 Canvas', 'git-fork', () => this.plugin.generateGraphCanvas(true), 'od-btn od-btn--primary');
    uiButton(controls, '打开 Canvas', 'external-link', () => this.plugin.openGraphCanvas(), 'od-btn').disabled = !this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    const layout = page.createEl('div', { cls: 'jrs-graph-explorer' });
    const map = layout.createEl('section', { cls: 'jrs-card jrs-live-map' });
    const chips = map.createEl('div', { cls: 'jrs-row-actions' });
    const list = layout.createEl('section', { cls: 'jrs-card jrs-graph-papers' });
    let selected = '';
    const draw = () => {
      list.empty(); chips.empty();
      [['', '全部方向'], ...topics.map(t => [t, t])].forEach(([value, label]) => {
        const button = uiButton(chips, label, '', () => { selected = value; draw(); }, `od-filter${selected === value ? ' is-active' : ''}`); button.setAttribute('aria-pressed', String(selected === value));
      });
      map.querySelector('svg')?.remove();
      const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 600 450'); svg.setAttribute('aria-label', '当前文献的主题归属图'); svg.setAttribute('role', 'img');
      const element = (tag, attrs, text) => { const node = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v))); if (text) node.textContent = text; svg.appendChild(node); return node; };
      const topicNodes = topics.map((topic, i) => { const angle = i / Math.max(1, topics.length) * Math.PI * 2 - Math.PI / 2; return { topic, x: 300 + Math.cos(angle) * 135, y: 225 + Math.sin(angle) * 135 }; });
      papers.forEach((p, i) => { const angle = i / Math.max(1, papers.length) * Math.PI * 2; const x = 300 + Math.cos(angle) * 205, y = 225 + Math.sin(angle) * 205;
        const included = !selected || p.topics.includes(selected) || selected === '未分类' && !p.topics.length;
        topicNodes.filter(t => p.topics.includes(t.topic) || t.topic === '未分类' && !p.topics.length).forEach(t => element('line', { x1: x, y1: y, x2: t.x, y2: t.y, class: included ? 'is-highlighted' : '' }));
        const dot = element('circle', { cx: x, cy: y, r: included ? 5 : 3, class: included ? 'is-highlighted' : '' }); const title = document.createElementNS(ns, 'title'); title.textContent = p.title; dot.appendChild(title);
      });
      topicNodes.forEach(t => { const dot = element('circle', { cx: t.x, cy: t.y, r: 12, class: 'jrs-topic-node' }); dot.onclick = () => { selected = t.topic; draw(); }; element('text', { x: t.x, y: t.y + 28, 'text-anchor': 'middle' }, t.topic.length > 12 ? t.topic.slice(0, 12) + '…' : t.topic); });
      map.appendChild(svg);
      const filtered = papers.filter(p => !selected || p.topics.includes(selected) || selected === '未分类' && !p.topics.length);
      list.createEl('h2', { text: `${selected || '全部文献'} · ${filtered.length}` });
      filtered.forEach(p => uiButton(list, p.title, 'file-text', () => this.plugin.openReading(p), 'jrs-graph-paper-link'));
      if (!papers.length) list.createEl('p', { cls: 'od-hint', text: '选择有 PDF 的文献来源目录后显示关系。' });
    }; draw();
  }
  renderDiscover(page) {
    const view = this.view;
    view._discoverSrc ||= 'arxiv'; view._discoverQueries ||= {}; view._discoverResults ||= {};
    const source = view._discoverSrc;
    const hero = page.createEl('section', { cls: 'jrs-discovery-hero' });
    hero.createSpan({ cls: 'jrs-work-eyebrow', text: 'DISCOVER / 发现新的研究线索' });
    hero.createEl('h2', { text: '找到值得读的下一篇' });
    hero.createEl('p', { text: '从预印本到正式发表的论文，检索、筛选，再收进你的研究资料。' });
    const layout = page.createEl('div', { cls: 'jrs-discovery-layout' });
    const control = layout.createEl('section', { cls: 'jrs-card jrs-discovery-control' });
    control.createEl('h3', { text: '01 / 选择检索来源' });
    for (const [id, icon, name, desc] of [['arxiv', 'file-search', 'arXiv', '探索最新的预印本'], ['crossref', 'library', 'Crossref', '检索正式发表的论文']]) {
      const button = uiButton(control, '', '', async () => { view._discoverSrc = id; await view.render(); }, `jrs-source-option${source === id ? ' is-active' : ''}`);
      setIcon(button.createSpan(), icon); const copy = button.createEl('div'); copy.createEl('strong', { text: name }); copy.createEl('span', { text: desc });
      button.setAttribute('aria-pressed', String(source === id)); button.setAttribute('aria-label', name + ' 检索来源');
    }
    control.createEl('h3', { text: '02 / 描述你的研究方向' });
    const form = control.createEl('div', { cls: 'jrs-discover-form' });
    const input = form.createEl('input', { type: 'text', attr: { placeholder: '例如 satellite scheduling', 'aria-label': '论文检索关键词' } });
    input.value = view._discoverQueries[source] ?? (source === 'arxiv' ? this.plugin.settings.arxivQuery : '');
    input.oninput = () => { view._discoverQueries[source] = input.value; };
    const tagHost = document.createElement('div'); tagHost.className = 'jrs-direction-tags'; form.before(tagHost);
    const tagEditor = control.createEl('details', { cls: 'jrs-direction-editor' });
    tagEditor.createEl('summary', { text: '＋ 定制研究方向标签' });
    const nameInput = tagEditor.createEl('input', { type: 'text', attr: { placeholder: '标签名称，例如：多星协同', 'aria-label': '方向标签名称', maxlength: '40' } });
    const queryInput = tagEditor.createEl('textarea', { attr: { placeholder: '对应的关键词或完整检索式', 'aria-label': '方向标签检索式', rows: '3' } });
    queryInput.value = input.value;
    const drawTags = () => {
      tagHost.empty();
      const tags = this.plugin.settings.discoveryTags || [];
      for (const tag of tags) {
        const wrap = tagHost.createEl('span', { cls: 'jrs-direction-tag' });
        const chip = uiButton(wrap, tag.label, '', () => { input.value = tag.query; view._discoverQueries[source] = tag.query; queryInput.value = tag.query; nameInput.value = tag.label; drawTags(); input.focus(); }, input.value === tag.query ? 'is-active' : '');
        chip.title = tag.query; chip.setAttribute('aria-pressed', String(input.value === tag.query));
        const remove = uiButton(wrap, '', 'x', async () => { this.plugin.settings.discoveryTags = tags.filter(entry => entry.label !== tag.label); await this.plugin.saveSettings(); drawTags(); }, 'jrs-direction-remove'); remove.setAttribute('aria-label', '删除方向标签：' + tag.label);
      }
      if (!tags.length) tagHost.createEl('p', { cls: 'od-hint', text: '把常用关键词保存为方向标签，之后点击即可填入。' });
    };
    uiButton(tagEditor, '保存方向标签', 'plus', async () => {
      const label = nameInput.value.trim(), query = queryInput.value.trim();
      if (!label || !query) { new Notice('填写标签名称和检索关键词后保存'); return; }
      const tags = (this.plugin.settings.discoveryTags || []).filter(tag => tag.label !== label);
      tags.push({ label, query }); this.plugin.settings.discoveryTags = tags; await this.plugin.saveSettings();
      input.value = query; view._discoverQueries[source] = query; tagEditor.open = false; drawTags();
    }, 'od-btn od-btn--sm');
    input.oninput = () => { view._discoverQueries[source] = input.value; drawTags(); };
    drawTags();
    const amount = form.createEl('label'); amount.createSpan({ text: '结果数量' });
    const num = amount.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '检索结果数量' } });
    [5, 8, 12, 20].forEach(n => num.createEl('option', { value: String(n), text: n + ' 篇' })); num.value = ['5','8','12','20'].includes(String(this.plugin.settings.arxivMax)) ? String(this.plugin.settings.arxivMax) : '8';
    const btn = uiButton(form, '检索论文', 'search', () => run(), 'od-btn od-btn--primary');
    const hint = control.createEl('p', { cls: 'od-hint', text: '建议使用英文关键词。检索不消耗 AI API 额度；翻译和文献问答在研究助手中进行。' });
    hint.style.lineHeight = '1.8';
    const results = layout.createEl('section', { cls: 'jrs-discovery-results-pane' });
    const head = results.createEl('div', { cls: 'jrs-section-heading' }); head.createEl('h2', { text: '发现结果' }); const count = head.createSpan({ text: source === 'arxiv' ? 'arXiv 预印本' : 'Crossref 期刊论文' });
    const host = results.createEl('div', { cls: 'jrs-discover-results' });
    const draw = items => {
      host.empty(); count.textContent = `${source === 'arxiv' ? 'arXiv' : 'Crossref'} · ${items.length} 篇`;
      if (!items.length) { uiEmpty(host, '暂时没有匹配的论文', '尝试缩短关键词，或切换另一个检索来源。', '修改关键词', () => input.focus(), 'search'); return; }
      items.forEach((item, index) => {
        const card = host.createEl('article', { cls: 'jrs-card jrs-discovery-result' });
        const meta = card.createEl('div', { cls: 'jrs-work-paper-top' }); meta.createSpan({ text: `${source.toUpperCase()} / ${String(index + 1).padStart(2, '0')}` }); meta.createSpan({ text: item.date || item.year || '' });
        const title = uiButton(card, item.title, '', () => this.plugin.openResearchWeb(item.url || (item.doi ? 'https://doi.org/' + item.doi : source === 'arxiv' ? 'https://arxiv.org/' : 'https://search.crossref.org/')), 'jrs-work-paper-title jrs-row-title');
        card.createEl('p', { cls: 'od-hint', text: [item.authors, item.venue].filter(Boolean).join(' · ') });
        if (item.summary) { const details = card.createEl('details', { cls: 'jrs-result-abstract' }); details.createEl('summary', { text: '阅读摘要' }); details.createEl('p', { text: item.summary }); }
        const actions = card.createEl('div', { cls: 'jrs-row-actions' });
        const existing = this.plugin.getPaperNotes().find(p => p.title.toLowerCase() === item.title.toLowerCase());
        let note = existing?.file;
        const add = uiButton(actions, existing ? '已入库 · 打开笔记' : '收进文献库', existing ? 'file-text' : 'plus', async () => {
          if (note) { await this.plugin.smartOpenFile(note); return; }
          note = await (source === 'crossref' ? this.plugin.crossrefToLibrary(item) : this.plugin.arxivToLibrary(item));
          add.lastElementChild.textContent = '已入库 · 打开笔记'; new Notice('文献信息已保存；点击可打开笔记。PDF 需另行下载。');
        }, 'od-btn od-btn--primary od-btn--sm');
        uiButton(actions, '右栏查看原文', 'panel-right', () => title.click(), 'od-btn od-btn--sm');
      });
    };
    const run = async () => {
      const query = input.value.trim();
      if (!query) { new Notice('请输入检索关键词'); input.focus(); return; }
      view._discoverQueries[source] = query; const n = Number(num.value);
      btn.disabled = true; btn.lastElementChild.textContent = '正在检索…'; host.empty();
      host.createEl('div', { cls: 'jrs-search-loading', text: `正在从 ${source === 'arxiv' ? 'arXiv' : 'Crossref'} 检索论文…`, attr: { role: 'status' } });
      try {
        let items;
        if (source === 'arxiv') { this.plugin.settings.arxivQuery = query; this.plugin.settings.arxivMax = n; await this.plugin.saveSettings(); items = (await this.plugin.fetchArxiv(true)).items.slice(0,n); }
        else items = await this.plugin.searchCrossref(query,n);
        view._discoverResults[source] = items;
        if (host.isConnected) draw(items);
      } catch (e) { if (host.isConnected) { host.empty(); uiEmpty(host,'检索没有完成',e.message,'重新检索',()=>btn.click(),'wifi-off'); } }
      finally { btn.disabled = false; btn.lastElementChild.textContent = '检索论文'; }
    };
    input.onkeydown = event => { if (event.key === 'Enter' && !btn.disabled) { event.preventDefault(); btn.click(); } };
    const items = view._discoverResults[source] || (source === 'arxiv' ? this.plugin.settings.arxivCache?.items?.slice(0,Number(num.value)) : null);
    if (items) draw(items);
    else { uiEmpty(host, '下一篇灵感，从一个关键词开始', '选择左侧来源，输入研究主题。结果会显示标题、作者和摘要，原文可直接在右栏查看。', '填写检索关键词', () => input.focus(), 'sparkles'); }
    results.createEl('p', { cls: 'jrs-work-notice', text: '外部检索结果不计入当前文件夹的本地 PDF 数量。入库保存文献信息，下载 PDF 后可本地阅读、批注和翻译。' });
  }
  async enhance(page) {
    const section = this.view.section; const papers = this.plugin.getPapers();
    page.classList.add('jrs-workspace-' + section);
    if (section === 'home') {
      const heading = page.querySelector('.jrs-board-heading .jrs-row-actions'); const board = this.view._board;
      if (heading && board) {
        board.hidden = !!this.plugin.settings.boardCollapsed;
        const button = uiButton(heading, board.hidden ? '展开桌面' : '收起桌面', 'chevrons-up-down', async () => { board.hidden = !board.hidden; this.plugin.settings.boardCollapsed = board.hidden; button.lastElementChild.textContent = board.hidden ? '展开桌面' : '收起桌面'; await this.plugin.saveSettings(); if (!board.hidden) { this.view.computeMetrics(); this.view.applyPositions(); } }, 'od-btn od-btn--sm');
      } return;
    }
    if (section === 'progress') {
      const sections = await this.plugin.getSurveyProgress();
      const done = sections.reduce((n, s) => n + s.done, 0), total = sections.reduce((n, s) => n + s.total, 0);
      this.metrics(page, [['写作完成', total ? Math.round(done / total * 100) + '%' : '0%', `${done} / ${total} 项任务`], ['综述章节', sections.length, '逐章推进研究'], ['研究问题', (await this.plugin.getQuestions()).filter(q => q.status !== 'answered').length, '待回答的问题']]);
      const survey = page.querySelector('section');
      const grid = document.createElement('div'); grid.className = 'jrs-chapter-grid';
      [...survey.querySelectorAll(':scope > .od-progress-item')].forEach((item, i) => { item.dataset.chapter = String(i + 1).padStart(2, '0'); grid.appendChild(item); });
      survey.appendChild(grid);
    }
    if (section === 'submit') {
      const subs = this.plugin.getSubmissions();
      this.metrics(page, [['进行中的投稿', subs.filter(s => !['已接收', '已拒稿'].includes(s.status)).length, '写作、审稿与修回'], ['已接收', subs.filter(s => s.status === '已接收').length, '科研成果归档'], ['设有截稿日', subs.filter(s => s.deadline).length, '在条目中查看剩余天数']]);
      const groups = [...page.querySelectorAll('.jrs-submit-group')];
      if (groups.length) { const board = document.createElement('div'); board.className = 'jrs-submission-board'; groups[0].before(board); groups.forEach(g => board.appendChild(g)); }
      const sections = [...page.querySelectorAll(':scope > section')];
      const lookup = sections.find(el => el.querySelector('h2')?.textContent === '期刊速查器');
      const pipeline = sections.find(el => el.querySelector('h2')?.textContent === '我的投稿管线');
      const journals = sections.find(el => el.querySelector('h2')?.textContent === '目标期刊速查');
      const tabs = document.createElement('nav'); tabs.className = 'jrs-submission-tabs'; tabs.setAttribute('aria-label','投稿工作区视图');
      const strip = page.querySelector('.jrs-section-metrics'); strip.before(tabs);
      const modes = [['pipeline','kanban','我的投稿',pipeline], ['lookup','search','期刊速查',lookup], ['journals','library','目标期刊',journals]];
      const buttons = {};
      const activate = id => { this.view._submissionTab = id; for (const [key,,,el] of modes) if(el) { el.hidden = key !== id; buttons[key]?.setAttribute('aria-pressed',String(key===id)); buttons[key]?.classList.toggle('is-active',key===id); } strip.hidden = id !== 'pipeline'; };
      for (const [id,icon,label] of modes) buttons[id] = uiButton(tabs,label,icon,()=>activate(id),'jrs-submission-tab');
      activate(this.view._submissionTab || 'pipeline');
      if (pipeline) { pipeline.addClass('jrs-pipeline-workspace'); if (!subs.length) { const empty=pipeline.querySelector('.od-task-empty'); if(empty) { empty.empty(); setIcon(empty.createSpan(),'send'); empty.createEl('h3',{text:'让下一篇论文，有清晰的下一步'}); empty.createEl('p',{text:'建立投稿档案，记录目标期刊、截稿日和每次审稿进展。'}); uiButton(empty,'建立第一项投稿','plus',()=>new AddSubmissionModal(this.plugin,()=>this.view.render()).open(),'od-btn od-btn--primary'); } } }
      if (journals) {
        const toolbar=journals.createEl('div',{cls:'jrs-work-controls'});
        const input=toolbar.createEl('input',{type:'search',cls:'jrs-journal-search',attr:{placeholder:'按期刊名称、研究方向或出版社筛选…','aria-label':'筛选目标期刊'}});
        const density=toolbar.createEl('select',{cls:'jrs-select',attr:{'aria-label':'目标期刊卡片密度'}}); density.createEl('option',{value:'compact',text:'紧凑卡片'}); density.createEl('option',{value:'comfortable',text:'舒展卡片'}); density.value=this.plugin.settings.journalDensity || 'compact';
        const setDensity=()=>journals.classList.toggle('is-comfortable',density.value==='comfortable'); setDensity();
        density.onchange=async()=>{this.plugin.settings.journalDensity=density.value;setDensity();await this.plugin.saveSettings();};
        journals.querySelector('.jrs-journal-grid').before(toolbar);
        const summary=journals.createEl('p',{cls:'od-hint'}); toolbar.after(summary);
        const filter=()=>{const q=input.value.trim().toLowerCase();let count=0;journals.querySelectorAll('.jrs-journal').forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(q);if(!card.hidden)count++;});summary.textContent=count ? `${count} 本参考期刊` : '没有匹配的期刊，请调整关键词。';};input.oninput=filter;filter();
        journals.querySelector('.jrs-section-heading > span').textContent='内置参考目录 · 期刊分区请以相应年份官方目录为准';
        journals.querySelectorAll('.jrs-journal').forEach(card=>{const note=card.querySelector('.jrs-journal-note');if(note){const details=card.createEl('details',{cls:'jrs-journal-details'});details.createEl('summary',{text:'详细说明'});details.appendChild(note);}});
        journals.querySelectorAll('.jrs-journal-link').forEach(link=>{link.onclick=event=>{event.preventDefault();this.plugin.openResearchWeb(link.href);};});
      }
    }
    if (section === 'ask') {
      this.metrics(page, [['检索文献', papers.length, '来自当前选择的文件夹'], ['回答存档', (await this.plugin.getAskLogToday()).length, '今日已保存的问答'], ['AI 配置', this.plugin.settings.ai.apiKey ? '已配置' : '待配置', this.plugin.settings.ai.model || '设置模型后开始提问']]);
      const row = page.querySelector('.jrs-ask-input');
      uiButton(row, '在右栏问 DeepSeek', 'globe', () => this.plugin.openResearchWeb('https://chat.deepseek.com/'), 'od-btn');
    }
  }
  static settings(tab) {
    const root = tab.containerEl; root.addClass('jrs-settings');
    const groups = []; let group;
    [...root.children].forEach(child => { if (child.tagName === 'H3') { group = document.createElement('section'); group.className = 'jrs-settings-group'; groups.push({ title: child.textContent, el: group }); } if (group) group.appendChild(child); });
    root.empty();
    const hero = root.createEl('header', { cls: 'jrs-settings-hero' }); setIcon(hero.createSpan(), 'settings-2');
    const text = hero.createEl('div'); text.createEl('h2', { text: '工作站设置' }); text.createEl('p', { text: `Jensen ${tab.plugin.manifest.version} · 更适合你的阅读与研究习惯` });
    const search = root.createEl('input', { type: 'search', cls: 'jrs-settings-search', attr: { placeholder: '查找设置…', 'aria-label': '搜索工作站设置' } });
    const layout = root.createEl('div', { cls: 'jrs-settings-layout' }); const nav = layout.createEl('nav', { attr: { 'aria-label': '设置分类' } }); const content = layout.createEl('div');
    const draw = () => { nav.empty(); const query = search.value.trim().toLowerCase();
      groups.forEach(({ title, el }, index) => {
        const selected = title === (tab._groupName || groups[0].title);
        const button = uiButton(nav, title, '', () => { tab._groupName = title; search.value = ''; draw(); }, selected && !query ? 'is-active' : ''); button.setAttribute('aria-pressed', String(selected && !query));
        el.hidden = !query && !selected; let matches = 0;
        el.querySelectorAll('.setting-item').forEach(row => { row.hidden = !!query && !row.textContent.toLowerCase().includes(query); if (!row.hidden) matches++; });
        if (query) el.hidden = !matches && !title.toLowerCase().includes(query);
      });
    };
    groups.forEach(g => content.appendChild(g.el)); search.oninput = draw; draw();
  }
}
