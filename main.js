/* ==========================================================================
 * Jensen 科研工作站 v0.4.0 —— 应用壳层版
 *
 * 本版对标 Research OS 的应用骨架（源码级对齐）：
 *   左侧栏（品牌 + 区段导航 + 库统计）· 区段 Topbar（大标题/副标题/搜索/主按钮）
 *   区段：总览看板 / AI 发现 / 阅读队列 / 文献库 / 论文图谱 / 研究进展 / 阅读笔记
 * 保留 v0.3 全部能力：自由拖拽看板、卡片配置、外观工作室、Bases、AI 全家桶、MinerU。
 * 致谢：Hearth (MIT) / Research OS (MIT)
 * ========================================================================== */

'use strict';

const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, TFile,
  normalizePath, setIcon, requestUrl, MarkdownRenderer,
} = require('obsidian');

/* ---------- 常量 ---------- */

const VIEW_DASHBOARD = 'jrs-dashboard';
const VIEW_LIBRARY = 'jrs-library';

const STATUSES = ['待读', '阅读中', '已完成', '已归档'];
const PRIORITIES = ['高', '中', '低'];

const ROW_H = 96;
const DEFAULT_COLS = 6;

const ACCENTS = {
  blue: { name: '科研蓝', hex: '#4c7def' },
  indigo: { name: '深空靛', hex: '#6366f1' },
  teal: { name: '深空青', hex: '#0d9488' },
  violet: { name: '星云紫', hex: '#8b5cf6' },
  amber: { name: '暖阳橙', hex: '#d97706' },
  rose: { name: '星尘红', hex: '#e11d48' },
};

const DEFAULT_TOPICS = [
  '卫星任务规划', '时空网格', '网格热力图', '区域目标覆盖',
  '成像卫星', '敏捷卫星', '电磁探测卫星', '巨星座', '天临空协同',
  '元启发式算法', '进化算法', '深度强化学习', '大模型驱动', '在轨自主', '任务生成',
];

/** 区段定义（对标 OS 的 sidebar nav + topbar titles） */
const SECTIONS = [
  { id: 'home', icon: 'orbit', label: '总览', title: '总览', sub: '今天的科研节奏，一屏掌握' },
  { id: 'discover', icon: 'sparkles', label: 'AI 发现', title: 'AI 论文发现', sub: '按关键词检索 arXiv 最新论文，一键入库' },
  { id: 'queue', icon: 'list-checks', label: '阅读队列', title: '阅读队列', sub: '明确下一篇，保持阅读节奏' },
  { id: 'library', icon: 'library', label: '文献库', title: '文献库', sub: '收集、搜索、分类与管理阅读状态' },
  { id: 'graph', icon: 'git-fork', label: '论文图谱', title: '论文图谱', sub: '探索论文与研究方向之间的联系' },
  { id: 'progress', icon: 'sprout', label: '研究进展', title: '研究进展', sub: '把读过的论文转化为判断与下一步' },
  { id: 'reader', icon: 'book-open', label: '阅读笔记', title: '阅读笔记', sub: '分栏精读：笔记 + PDF + AI 助手' },
  { id: 'submit', icon: 'target', label: '投稿冲刺', title: '投稿冲刺', sub: '目标期刊速查 · 投稿管线 · 截稿倒计时' },
  { id: 'ask', icon: 'bot', label: '知识问答', title: '知识问答', sub: '基于你的文献库回答，来源可溯源（ima 式）' },
];

/** 目标期刊库（EJOR 等运筹学顶刊 + 航天/卫星领域核心刊） */
const JOURNALS = [
  { abbr: 'EJOR', name: 'European Journal of Operational Research', field: '运筹学', tag: '顶刊', publisher: 'Elsevier', match: '调度/优化方法+充分实验', link: 'https://www.editorialmanager.com/ejor/', note: '偏方法严谨与计算实验，规划类综述与方法文均常见' },
  { abbr: 'OR', name: 'Operations Research', field: '运筹学', tag: '顶刊', publisher: 'INFORMS', match: '理论深度/算法贡献', link: 'https://pubsonline.informs.org/journal/opre', note: 'INFORMS 旗舰，理论要求高' },
  { abbr: 'INFORMS JoC', name: 'INFORMS Journal on Computing', field: '运筹/计算', tag: '顶刊', publisher: 'INFORMS', match: '元启发式/进化算法/学习+优化', link: 'https://pubsonline.informs.org/journal/ijoc', note: '算法与计算实验导向，适合智能调度算法' },
  { abbr: 'C&OR', name: 'Computers & Operations Research', field: '运筹/计算', tag: '主流', publisher: 'Elsevier', match: '调度算法/组合优化应用', link: 'https://www.editorialmanager.com/caor/', note: '应用型算法文友好' },
  { abbr: 'Omega', name: 'Omega - The International Journal of Management Science', field: '运筹/管理', tag: '顶刊', publisher: 'Elsevier', match: '决策支持/应用驱动', link: 'https://www.editorialmanager.com/omega/', note: '强调应用价值与管理洞察' },
  { abbr: 'Networks', name: 'Networks', field: '图论/网络', tag: '主流', publisher: 'Wiley', match: '网络流/图模型', link: 'https://onlinelibrary.wiley.com/journal/10970037', note: '网络结构建模对口' },
  { abbr: 'AST', name: 'Aerospace Science and Technology', field: '航空航天', tag: '顶刊', publisher: 'Elsevier', match: '卫星任务规划/星座调度', link: 'https://www.editorialmanager.com/aescte/', note: '航天技术与系统，卫星规划高频期刊' },
  { abbr: 'AA', name: 'Acta Astronautica', field: '航天', tag: '顶刊', publisher: 'Elsevier', match: '任务规划/在轨系统', link: 'https://www.editorialmanager.com/actaastro/', note: 'IAA 期刊，航天任务与系统工程' },
  { abbr: 'ASR', name: 'Advances in Space Research', field: '航天', tag: '主流', publisher: 'Elsevier', match: '对地观测/星座应用', link: 'https://www.editorialmanager.com/asesre/', note: 'COSPAR 期刊，观测任务方向' },
  { abbr: 'IEEE TAES', name: 'IEEE Trans. Aerospace and Electronic Systems', field: '航空电子', tag: '顶刊', publisher: 'IEEE', match: '调度系统/探测系统', link: 'https://ieee.atyponrex.com/journal/taes', note: '电子系统+任务规划结合' },
  { abbr: 'IEEE TSMC', name: 'IEEE Trans. Systems, Man, and Cybernetics: Systems', field: '系统工程', tag: '顶刊', publisher: 'IEEE', match: '智能调度系统', link: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=6221021', note: '系统智能方法' },
  { abbr: 'JAIS', name: 'Journal of Aerospace Information Systems', field: '航天信息', tag: '主流', publisher: 'AIAA', match: '规划信息系统', link: 'https://arc.aiaa.org/journal/jais', note: 'AIAA 信息系系统方向' },
  { abbr: '宇航学报', name: '宇航学报', field: '航天(中文)', tag: 'EI/中文核心', publisher: '中国宇航学会', match: '卫星任务规划主阵地', link: '', note: '国内卫星规划领域核心发表阵地' },
  { abbr: '航空学报', name: '航空学报', field: '航空(中文)', tag: 'EI/中文核心', publisher: '中国航空学会', match: '飞行器/任务系统', link: '', note: '国内航空领域旗舰' },
  { abbr: '系统工程与电子技术', name: '系统工程与电子技术', field: '系统工程(中文)', tag: 'EI/中文核心', publisher: '中国航天科工', match: '调度/优化应用', link: '', note: '系统工程应用，周期较快' },
];

const SUB_STATUSES = ['写作中', '准备投稿', '已投', '审稿中', '大修', '小修', '已接收', '已拒稿', '改投'];

const BUILTIN_CARDS = [
  { id: 'arxiv', name: 'arXiv 资讯', icon: 'newspaper', size: { w: 2, h: 4 } },
  { id: 'pomo', name: '番茄钟', icon: 'timer', size: { w: 2, h: 3 } },
  { id: 'calendar', name: '日历', icon: 'calendar-days', size: { w: 2, h: 3 } },
  { id: 'tasks', name: '今日待办', icon: 'list-checks', size: { w: 2, h: 3 } },
  { id: 'libstats', name: '文献统计', icon: 'book-open', size: { w: 2, h: 2 } },
  { id: 'focusbars', name: '专注趋势', icon: 'flame', size: { w: 2, h: 2 } },
  { id: 'topics', name: '研究方向', icon: 'compass', size: { w: 4, h: 2 } },
  { id: 'survey', name: '综述进度', icon: 'pen-line', size: { w: 2, h: 3 } },
  { id: 'launch', name: '快速启动', icon: 'rocket', size: { w: 4, h: 2 } },
  { id: 'recent', name: '最近文献', icon: 'library', size: { w: 2, h: 3 } },
];

const CUSTOM_TYPES = {
  note: { name: '笔记嵌入', icon: 'sticky-note', cfg: { path: '' } },
  countdown: { name: '倒计时 / DDL', icon: 'alarm-clock', cfg: { label: '投稿截止', date: '' } },
  web: { name: '网页', icon: 'globe', cfg: { url: 'https://arxiv.org/list/cs.AI/recent' } },
  commands: { name: '命令组', icon: 'terminal', cfg: { ids: '', labels: '' } },
};

const DEFAULT_SETTINGS = {
  libFolder: '科研工作台/文献',
  pdfFolder: '科研工作台/PDF',
  questionsFolder: '科研工作台/研究问题',
  submissionsFolder: '科研工作台/投稿',
  inboxFolder: '科研工作台/收件箱',
  graphCanvas: '科研工作台/论文图谱.canvas',
  dailyFolder: '',
  surveyNote: '科研工作台/综述大纲.md',
  basesFolder: '科研工作台/Bases',
  pomoWork: 25, pomoBreak: 5, pomoLongBreak: 15, pomoLongEvery: 4,
  researchStart: '',
  topics: [...DEFAULT_TOPICS],
  layout: {},
  hiddenCards: [], customCards: [], cardTitles: {}, cardCfg: {},
  pomoLog: {},
  sidebarMode: 'full', /* full | icon | hidden */
  accent: 'blue', accentCustom: '', glass: true,
  blurPx: 18, cardAlpha: 70, radiusPx: 16, gapPx: 14, bgDim: 30, columns: DEFAULT_COLS,
  bgMode: 'image', bgColor: '#e8edf7', bgImage: '',
  arxivQuery: 'all:"satellite scheduling" OR all:"earth observation scheduling"',
  arxivMax: 8, arxivCache: null,
  ai: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
  mineruCmd: 'mineru',
};

/* ---------- 工具 ---------- */

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function todayKey() { return window.moment().format('YYYY-MM-DD'); }
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function guessFromFilename(fn) {
  const base = fn.replace(/\.pdf$/i, '');
  const yearMatch = base.match(/(19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';
  const title = base.replace(/[_]+/g, ' ').replace(/\(\d{4}\)/g, '').replace(/\s{2,}/g, ' ').trim();
  return { title: title || base, year };
}
function isExternalPath(p) { return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p); }
function isHttp(p) { return /^https?:\/\//i.test(p); }
function toPosix(p) { return String(p).replace(/\\/g, '/'); }

function replaceSection(content, heading, body) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  const block = ['', body.trim(), ''];
  if (start === -1) return `${content.trimEnd()}\n\n## ${heading}\n${block.join('\n')}\n`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  lines.splice(start + 1, end - start - 1, ...block);
  return lines.join('\n');
}

function baseFile(filters, views) {
  return [
    `filters:`, `  and:`, ...filters.map((f) => `    - ${f}`),
    `properties:`,
    `  file.name:`, `    displayName: 名称`,
    `  authors:`, `    displayName: 作者`,
    `  year:`, `    displayName: 年份`,
    `  status:`, `    displayName: 状态`,
    `  priority:`, `    displayName: 优先级`,
    `  rating:`, `    displayName: 评分`,
    `  topics:`, `    displayName: 研究方向`,
    `views:`,
    ...views.flatMap((v) => [
      `  - type: table`, `    name: ${v.name}`,
      ...(v.filters ? [`    filters:`, `      and:`, ...v.filters.map((f) => `        - ${f}`)] : []),
      `    order:`, ...v.order.map((o) => `      - ${o}`),
    ]),
  ].join('\n') + '\n';
}

/* ==========================================================================
 * 番茄钟引擎
 * ========================================================================== */

class PomoEngine {
  constructor(plugin) {
    this.plugin = plugin;
    this.phase = 'idle'; this.total = 0; this.left = 0;
    this.completedToday = this.countToday();
    this.listeners = new Set(); this._timer = null;
  }
  onTick(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  countToday() { return ((this.plugin.settings.pomoLog || {})[todayKey()] || {}).count || 0; }
  start() {
    const s = this.plugin.settings;
    if (this.phase !== 'idle') return;
    this.phase = 'work'; this.total = s.pomoWork * 60; this.left = this.total;
    this.emit(); this._run();
  }
  _run() {
    this._clear();
    this._timer = window.setInterval(() => {
      this.left -= 1;
      if (this.left <= 0) this._complete(); else this.emit();
    }, 1000);
    this.plugin.registerInterval(this._timer);
  }
  _clear() { if (this._timer) { window.clearInterval(this._timer); this._timer = null; } }
  _complete() {
    this._clear();
    const s = this.plugin.settings;
    if (this.phase === 'work') {
      const log = s.pomoLog || (s.pomoLog = {});
      const t = log[todayKey()] || (log[todayKey()] = { count: 0, minutes: 0 });
      t.count += 1; t.minutes = (t.minutes || 0) + s.pomoWork;
      this.completedToday = t.count;
      this.plugin.saveSettings();
      this.plugin.appendPomoToDaily(s.pomoWork);
      const long = t.count % Math.max(1, s.pomoLongEvery) === 0;
      new Notice(`🍅 专注完成！${long ? '休息长一点吧' : `休息 ${s.pomoBreak} 分钟`}`);
      this.phase = long ? 'longbreak' : 'break';
      this.total = (long ? s.pomoLongBreak : s.pomoBreak) * 60;
      this.left = this.total; this._run();
    } else {
      new Notice('☕ 休息结束，继续冲刺！');
      this.phase = 'idle'; this.left = 0; this.total = 0;
    }
    this.emit();
  }
  reset() { this._clear(); this.phase = 'idle'; this.left = 0; this.total = 0; this.emit(); }
  get progress() { return this.total ? 1 - this.left / this.total : 0; }
  clockText() {
    const m = Math.floor(this.left / 60); const s = this.left % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  phaseText() { return ({ idle: '准备专注', work: '专注中', break: '小憩', longbreak: '长休' })[this.phase] || ''; }
  destroy() { this._clear(); }
}

/* ==========================================================================
 * 应用壳视图：左侧栏 + Topbar + 区段路由
 * ========================================================================== */

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.section = 'home';
    this.calMoment = window.moment();
    this.editing = false;
    this._unsub = plugin.pomo.onTick(() => this.renderPomo());
    this._metrics = { cols: DEFAULT_COLS, colW: 0, rowH: ROW_H, gap: 14, boardW: 0 };
    this._shells = new Map();
    this._ro = null;
    this._panel = null; /* 文献库面板实例 */
  }

  getViewType() { return VIEW_DASHBOARD; }
  getDisplayText() { return 'Jensen 科研工作站'; }
  getIcon() { return 'telescope'; }

  async onOpen() { await this.render(); }
  onClose() {
    if (this._unsub) this._unsub();
    if (this._ro) this._ro.disconnect();
  }

  async goto(section) { this.section = section; await this.render(); }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('jrs-view');

    const shell = root.createEl('div', { cls: 'jrs-shell' });
    if (this.plugin.settings.sidebarMode !== 'hidden') {
      shell.appendChild(this.buildSidebar());
    }
    const main = shell.createEl('div', { cls: 'jrs-main' });
    main.appendChild(this.buildTopbar());

    this._page = main.createEl('div', { cls: 'jrs-page' });
    await this.renderSection(this._page);
  }

  /* ---------- 左侧栏（对标 OS sidebar） ---------- */

  buildSidebar() {
    const mode = this.plugin.settings.sidebarMode;
    const aside = document.createElement('aside');
    aside.className = `jrs-sidebar${mode === 'icon' ? ' is-icon' : ''}`;

    const brand = aside.createEl('div', { cls: 'jrs-brand' });
    const mark = brand.createEl('span', { cls: 'jrs-brand-mark' });
    setIcon(mark, 'telescope');
    if (mode !== 'icon') {
      const copy = brand.createEl('div', { cls: 'jrs-brand-copy' });
      copy.createEl('div', { cls: 'jrs-brand-name', text: 'Jensen 科研工作站' });
      copy.createEl('div', { cls: 'jrs-brand-sub', text: 'Research Workstation' });
    } else {
      brand.setAttribute('title', 'Jensen 科研工作站');
    }

    const nav = aside.createEl('nav', { cls: 'jrs-nav' });
    SECTIONS.forEach((sec) => {
      const b = nav.createEl('button', {
        cls: `jrs-nav-item${this.section === sec.id ? ' is-active' : ''}`,
        attr: { title: sec.label },
      });
      const ic = b.createSpan({ cls: 'jrs-nav-icon' });
      setIcon(ic, sec.icon);
      if (mode !== 'icon') b.createSpan({ cls: 'jrs-nav-label', text: sec.label });
      b.onclick = () => this.goto(sec.id);
    });

    const bottom = aside.createEl('div', { cls: 'jrs-sidebar-bottom' });
    if (mode !== 'icon') {
      const papers = this.plugin.getPapers();
      bottom.createEl('div', { cls: 'jrs-meta-label', text: '当前文献库' });
      bottom.createEl('div', { cls: 'jrs-vault-name', text: this.app.vault.getName() });
      bottom.createEl('div', {
        cls: 'jrs-vault-stats',
        text: `${papers.length} 篇文献 · ${papers.filter((x) => x.status === '阅读中').length} 篇阅读中`,
      });
    }
    const collapse = bottom.createEl('button', { cls: 'jrs-nav-item jrs-sidebar-toggle', attr: { title: '切换侧栏宽度' } });
    const cic = collapse.createSpan({ cls: 'jrs-nav-icon' });
    setIcon(cic, mode === 'icon' ? 'chevrons-right' : 'chevrons-left');
    collapse.onclick = async () => {
      this.plugin.settings.sidebarMode = mode === 'icon' ? 'full' : 'icon';
      await this.plugin.saveSettings();
      this.render();
    };
    return aside;
  }

  /* ---------- Topbar（对标 OS：标题 + 副标题 + 搜索 + 主按钮） ---------- */

  buildTopbar() {
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];
    const bar = document.createElement('header');
    bar.className = 'jrs-topbar';

    const title = bar.createEl('div', { cls: 'jrs-page-title' });
    title.createEl('h1', { text: sec.title });
    title.createEl('p', { text: sec.sub });

    const tools = bar.createEl('div', { cls: 'jrs-tools' });
    const omni = tools.createEl('div', { cls: 'jrs-omnibox' });
    this.buildOmnibox(omni);

    const primary = tools.createEl('button', { cls: 'od-btn od-btn--primary' });
    let pIcon = 'plus'; let pLabel = '手动添加';
    if (this.section === 'discover') { pIcon = 'refresh-cw'; pLabel = '立即发现'; }
    if (this.section === 'progress') { pIcon = 'sprout'; pLabel = 'AI 综述'; }
    if (this.section === 'graph') { pIcon = 'git-fork'; pLabel = '重建图谱'; }
    if (this.section === 'queue') { pIcon = 'list-plus'; pLabel = '添加文献'; }
    if (this.section === 'reader') { pIcon = 'columns-2'; pLabel = '继续上次阅读'; }
    if (this.section === 'submit') { pIcon = 'plus'; pLabel = '新建投稿'; }
    if (this.section === 'ask') { pIcon = 'inbox'; pLabel = '快速记想法'; }
    setIcon(primary.createSpan(), pIcon);
    primary.createSpan({ text: pLabel });
    primary.onclick = async () => {
      if (this.section === 'discover') { await this.plugin.fetchArxiv(true); this.render(); return; }
      if (this.section === 'progress') { new AiSynthesisModal(this.plugin).open(); return; }
      if (this.section === 'graph') { await this.plugin.generateGraphCanvas(true); this.render(); return; }
      if (this.section === 'reader') { this.continueLastReading(); return; }
      if (this.section === 'submit') { new AddSubmissionModal(this.plugin, () => this.render()).open(); return; }
      if (this.section === 'ask') { new CaptureModal(this.plugin).open(); return; }
      new AddPaperModal(this.plugin, () => this.render()).open();
    };
    return bar;
  }

  continueLastReading() {
    const reading = this.plugin.getPapers().filter((p) => p.status === '阅读中');
    const target = reading[0] || this.plugin.getPapersSorted('added')[0];
    if (!target) { new Notice('文献库为空'); return; }
    this.plugin.openReading(target);
  }

  buildOmnibox(host) {
    const box = host.createEl('div', { cls: 'od-search jrs-omnibox-box' });
    setIcon(box.createSpan(), 'search');
    const input = box.createEl('input', { type: 'text', placeholder: '搜索笔记 / 文献 / 命令…' });
    box.createEl('span', { cls: 'jrs-omni-kbd', text: '↵' });
    const panel = host.createEl('div', { cls: 'jrs-omnibox-panel' });
    let active = -1; let items = [];
    const run = (sel) => {
      const it = items[sel];
      if (it) { it.run(); input.value = ''; panel.empty(); panel.removeClass('is-open'); input.blur(); }
    };
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      panel.empty(); items = []; active = -1;
      if (!q) { panel.removeClass('is-open'); return; }
      const group = (label) => { panel.createEl('div', { cls: 'jrs-omni-group', text: label }); return panel.createEl('div'); };
      const files = this.app.vault.getMarkdownFiles()
        .filter((f) => f.basename.toLowerCase().includes(q) || (f.parent?.path || '').toLowerCase().includes(q)).slice(0, 5);
      if (files.length) {
        const list = group('笔记');
        files.forEach((f) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'file-text');
          item.createSpan({ cls: 'jrs-omni-text', text: f.basename });
          item.createSpan({ cls: 'jrs-omni-sub', text: f.parent?.path || '' });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.app.workspace.getLeaf('tab').openFile(f), el: item });
        });
      }
      const papersHit = this.plugin.getPapers().filter((p) => p.title.toLowerCase().includes(q)).slice(0, 4);
      if (papersHit.length) {
        const list = group('文献');
        papersHit.forEach((p) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'book-open');
          item.createSpan({ cls: 'jrs-omni-text', text: p.title.length > 42 ? p.title.slice(0, 42) + '…' : p.title });
          item.createSpan({ cls: 'jrs-omni-sub', text: p.status });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.plugin.openPaper(p), el: item });
        });
      }
      const cmds = Object.entries(this.app.commands.commands)
        .filter(([cid, c]) => cid.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
      if (cmds.length) {
        const list = group('命令');
        cmds.forEach(([cid, c]) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'terminal');
          item.createSpan({ cls: 'jrs-omni-text', text: c.name || cid });
          item.createSpan({ cls: 'jrs-omni-sub', text: cid.split(':')[0] });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.app.commands.executeCommandById(cid), el: item });
        });
      }
      if (!items.length) panel.createEl('div', { cls: 'jrs-omni-empty', text: `没有匹配「${input.value.trim()}」的结果` });
      panel.addClass('is-open');
    };
    input.onkeydown = (e) => {
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); run(active >= 0 ? active : 0); return; }
      else if (e.key === 'Escape') { panel.removeClass('is-open'); input.blur(); return; }
      else return;
      items.forEach((it, i) => it.el.toggleClass('is-active', i === active));
    };
    input.onblur = () => window.setTimeout(() => panel.removeClass('is-open'), 150);
  }

  /* ---------- 区段路由 ---------- */

  async renderSection(page) {
    switch (this.section) {
      case 'home': return this.renderHome(page);
      case 'discover': return this.renderDiscover(page);
      case 'queue': return this.renderQueue(page);
      case 'library': return this.renderLibrarySection(page);
      case 'graph': return await this.renderGraph(page);
      case 'progress': return await this.renderProgress(page);
      case 'reader': return this.renderReader(page);
      case 'submit': return this.renderSubmit(page);
      case 'ask': return this.renderAsk(page);
      default: return this.renderHome(page);
    }
  }

  /* ========== 区段：总览（Hero + 自由看板，v0.3 保留） ========== */

  async renderHome(page) {
    this.packLayout();
    page.appendChild(this.buildHero());
    this._board = page.createEl('div', { cls: 'jrs-board' });
    if (this.editing) this._board.addClass('is-editing');
    this._shells.clear();
    for (const def of this.visibleCards()) {
      try {
        const shell = await this.buildShell(def);
        this._board.appendChild(shell);
        this._shells.set(def.id, shell);
      } catch (e) { console.error(`[JRS] 卡片「${def.id}」渲染失败`, e); }
    }
    this.computeMetrics();
    this.applyPositions();
    this.setupBoardObserver();
    this.plugin.ensureArxivFresh().then((r) => { if (r?.justFetched) this.softRefresh('arxiv'); });
  }

  cardDef(id) {
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return { id, name: b.name, icon: b.icon, size: { ...b.size }, custom: null };
    const c = this.plugin.settings.customCards.find((x) => `c:${c.uid}` === id);
    if (c) {
      const t = CUSTOM_TYPES[c.type] || {};
      return { id, name: c.title || t.name || '卡片', icon: t.icon || 'square', size: { w: 2, h: 2 }, custom: c };
    }
    return null;
  }

  visibleCards() {
    const s = this.plugin.settings;
    return [
      ...BUILTIN_CARDS.map((c) => c.id),
      ...s.customCards.map((c) => `c:${c.uid}`),
    ]
      .filter((id) => !s.hiddenCards.includes(id) && (id !== 'survey' || this.plugin.surveyExists()))
      .map((id) => this.cardDef(id))
      .filter(Boolean);
  }

  layoutOf(id) {
    const s = this.plugin.settings;
    if (!s.layout[id]) s.layout[id] = { ...this.cardDef(id).size, x: -1, y: -1 };
    return s.layout[id];
  }

  packLayout() {
    const s = this.plugin.settings;
    const cols = s.columns;
    const colBottom = new Array(cols).fill(0);
    let changed = false;
    for (const def of this.visibleCards()) {
      const l = this.layoutOf(def.id);
      if (l.x >= 0 && l.y >= 0) {
        const w = Math.min(Math.max(l.w, 1), cols);
        for (let c = l.x; c < Math.min(l.x + w, cols); c += 1) colBottom[c] = Math.max(colBottom[c], l.y + l.h);
        continue;
      }
      const w = Math.min(Math.max(l.w, 1), cols);
      const h = Math.max(l.h, 1);
      let bx = 0; let by = Number.MAX_SAFE_INTEGER;
      for (let x = 0; x + w <= cols; x += 1) {
        let y = 0;
        for (let c = x; c < x + w; c += 1) y = Math.max(y, colBottom[c]);
        if (y < by) { by = y; bx = x; }
      }
      if (by === Number.MAX_SAFE_INTEGER) { by = 0; bx = 0; }
      l.x = bx; l.y = by; l.w = w; l.h = h;
      for (let c = bx; c < bx + w; c += 1) colBottom[c] = by + h;
      changed = true;
    }
    if (changed) this.plugin.saveSettings();
  }

  computeMetrics() {
    const s = this.plugin.settings;
    const boardW = this._board ? this._board.clientWidth : 1000;
    const cols = s.columns; const gap = s.gapPx;
    const colW = Math.max(40, (boardW - (cols - 1) * gap) / cols);
    this._metrics = { cols, colW, rowH: ROW_H, gap, boardW };
  }

  positionShell(shell, l) {
    const { colW, rowH, gap, cols } = this._metrics;
    const w = Math.min(l.w, cols);
    shell.style.left = `${l.x * (colW + gap)}px`;
    shell.style.top = `${l.y * (rowH + gap)}px`;
    shell.style.width = `${w * colW + (w - 1) * gap}px`;
    shell.style.height = `${l.h * rowH + (l.h - 1) * gap}px`;
  }

  applyPositions() { for (const [id, shell] of this._shells) this.positionShell(shell, this.layoutOf(id)); }

  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => { this.computeMetrics(); this.applyPositions(); });
    this._ro.observe(this._board);
    this.registerEvent(this.app.workspace.on('resize', () => { this.computeMetrics(); this.applyPositions(); }));
  }

  async buildShell(def) {
    const s = this.plugin.settings;
    const shell = document.createElement('section');
    shell.className = 'jrs-card-shell od-card od-anim';
    shell.dataset.cardId = def.id;
    const head = shell.createEl('div', { cls: 'od-card-head jrs-card-handle' });
    const t = head.createEl('div', { cls: 'od-card-title' });
    setIcon(t, def.icon);
    t.createSpan({ text: s.cardTitles[def.id] || def.name });
    const ctrl = head.createEl('div', { cls: 'od-card-ctrl' });
    const cfgBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '卡片设置' });
    setIcon(cfgBtn, 'settings-2');
    cfgBtn.onclick = (e) => { e.stopPropagation(); new CardConfigModal(this.plugin, def, () => this.goto('home')).open(); };
    const hideBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '隐藏卡片' });
    setIcon(hideBtn, 'eye-off');
    hideBtn.onclick = async (e) => {
      e.stopPropagation();
      s.hiddenCards.push(def.id);
      await this.plugin.saveSettings();
      this.goto('home');
    };
    const body = shell.createEl('div', { cls: 'jrs-card-body' });
    const content = await this.renderCardContent(def.id, body);
    if (content && content !== body) body.appendChild(content);
    shell.createEl('div', { cls: 'jrs-resize' });
    this.bindCardDrag(shell, def.id);
    return shell;
  }

  bindCardDrag(shell, id) {
    shell.addEventListener('pointerdown', (e) => {
      if (!this.editing || e.button !== 0) return;
      const onResize = e.target instanceof Element && !!e.target.closest('.jrs-resize');
      const l = this.layoutOf(id);
      const { colW, rowH, gap, cols } = this._metrics;
      const startX = e.clientX; const startY = e.clientY;
      const orig = { x: l.x, y: l.y, w: l.w, h: l.h };
      shell.setPointerCapture(e.pointerId);
      shell.addClass('jrs-card--lift');
      const move = (ev) => {
        const dx = ev.clientX - startX; const dy = ev.clientY - startY;
        if (onResize) {
          l.w = Math.min(cols, Math.max(1, Math.round(orig.w + dx / (colW + gap))));
          l.h = Math.max(1, Math.round(orig.h + dy / (rowH + gap)));
        } else {
          l.x = Math.min(Math.max(0, Math.round(orig.x + dx / (colW + gap))), cols - Math.min(l.w, cols));
          l.y = Math.max(0, Math.round(orig.y + dy / (rowH + gap)));
        }
        this.positionShell(shell, l);
      };
      const up = async () => {
        shell.removeEventListener('pointermove', move);
        shell.removeEventListener('pointerup', up);
        shell.removeEventListener('pointercancel', up);
        shell.removeClass('jrs-card--lift');
        await this.plugin.saveSettings();
      };
      shell.addEventListener('pointermove', move);
      shell.addEventListener('pointerup', up);
      shell.addEventListener('pointercancel', up);
    });
    shell.addEventListener('dblclick', () => {
      if (this.editing) new CardConfigModal(this.plugin, this.cardDef(id), () => this.goto('home')).open();
    });
  }

  async softRefresh(id) {
    if (this.section !== 'home') return;
    const shell = this._shells.get(id);
    if (!shell) return;
    const def = this.cardDef(id);
    if (!def) return;
    const fresh = await this.buildShell(def);
    shell.replaceWith(fresh);
    this._shells.set(id, fresh);
    this.applyPositions();
  }

  toggleEditing() {
    this.editing = !this.editing;
    this.render();
    new Notice(this.editing ? '排版模式：拖动移动 / 右下角缩放 / 双击设置' : '已退出排版模式');
  }

  buildHero() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('jrs-hero', 'od-anim');
    const titleRow = h.createEl('div', { cls: 'jrs-hero-title-row' });
    const brand = titleRow.createEl('div', { cls: 'jrs-hero-brand' });
    const logo = brand.createEl('span', { cls: 'jrs-hero-logo' });
    setIcon(logo, 'telescope');
    brand.createEl('h1', { cls: 'jrs-hero-name', text: 'Jensen 科研工作站' });
    const editBtn = titleRow.createEl('button', { cls: `od-btn jrs-edit-toggle${this.editing ? ' is-on' : ''}` });
    setIcon(editBtn.createSpan(), this.editing ? 'check' : 'layout-grid');
    editBtn.createSpan({ text: this.editing ? '完成排版' : '排版' });
    editBtn.onclick = () => this.toggleEditing();

    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const papers = this.plugin.getPapers();
    const todo = papers.filter((p) => p.status === '待读').length;
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${greet}，Jensen · ${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      sub += ` · 科研第 ${window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading} · 今日专注 ${this.plugin.todayPomoMinutes()} 分钟`;
    h.createEl('div', { cls: 'jrs-hero-sub', text: sub });
    return h;
  }

  async renderCardContent(id, body) {
    switch (id) {
      case 'pomo': return this.buildPomoCard(body);
      case 'calendar': return this.buildCalendar(body);
      case 'tasks': return await this.buildTasks(body);
      case 'arxiv': return this.buildArxiv(body);
      case 'libstats': return this.buildLibStats(body);
      case 'focusbars': return this.buildFocusBars(body);
      case 'topics': return this.buildTopics(body);
      case 'survey': return await this.buildSurvey(body);
      case 'launch': return this.buildLaunch(body);
      case 'recent': return this.buildRecent(body);
      default:
        if (id.startsWith('c:')) return await this.buildCustom(body, id);
        return null;
    }
  }

  buildPomoCard(body) {
    const p = this.plugin.pomo;
    const box = body.createEl('div', { cls: 'od-pomo' });
    const ring = box.createEl('div', { cls: 'od-pomo-ring' });
    const C = 2 * Math.PI * 62;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 148 148');
    const mk = (cls) => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '74'); c.setAttribute('cy', '74'); c.setAttribute('r', '62');
      return c;
    };
    const track = mk('od-pomo-track');
    const bar = mk('od-pomo-bar');
    bar.setAttribute('stroke-dasharray', String(C));
    bar.setAttribute('stroke-dashoffset', '0');
    this._pomoBar = bar;
    svg.appendChild(track); svg.appendChild(bar);
    ring.appendChild(svg);
    const mid = ring.createEl('div', { cls: 'od-pomo-time' });
    this._pomoClock = mid.createEl('div', { cls: 'od-pomo-clock' });
    this._pomoPhase = mid.createEl('div', { cls: 'od-pomo-phase' });
    const ctrl = box.createEl('div', { cls: 'od-pomo-controls' });
    this._pomoStart = ctrl.createEl('button', { cls: 'od-btn od-btn--primary' });
    const reset = ctrl.createEl('button', { cls: 'od-btn od-btn--ghost' });
    setIcon(reset.createSpan(), 'rotate-ccw');
    reset.append('重置');
    reset.onclick = () => p.reset();
    this._pomoStart.onclick = () => { if (p.phase === 'idle') p.start(); else p.reset(); };
    this._pomoCount = box.createEl('div', { cls: 'od-pomo-count' });
    this.renderPomo();
    return box;
  }

  renderPomo() {
    if (!this._pomoClock) return;
    const p = this.plugin.pomo;
    this._pomoClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00` : p.clockText();
    this._pomoPhase.textContent = p.phaseText();
    this._pomoStart.textContent = '';
    setIcon(this._pomoStart.createSpan(), p.phase === 'idle' ? 'play' : 'pause');
    this._pomoStart.append(p.phase === 'idle' ? '开始专注' : '停止');
    const C = 2 * Math.PI * 62;
    if (this._pomoBar) {
      this._pomoBar.setAttribute('stroke-dashoffset', String(C * p.progress));
      this._pomoBar.toggleClass('od-pomo-bar--break', p.phase === 'break' || p.phase === 'longbreak');
    }
    const min = this.plugin.todayPomoMinutes();
    this._pomoCount.innerHTML = `今日 <b>${p.completedToday}</b> 个番茄 · 共 <b>${min}</b> 分钟`;
  }

  buildCalendar(body) {
    const nav = body.createEl('div', { cls: 'od-cal-nav' });
    const prev = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(prev, 'chevron-left');
    const title = nav.createEl('div', { cls: 'od-cal-title' });
    const next = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(next, 'chevron-right');
    const mount = body.createEl('div');
    const rerender = () => {
      mount.empty();
      mount.appendChild(this.calGrid());
      mount.appendChild(this.calLegend());
      title.textContent = this.calMoment.format('YYYY年M月');
    };
    prev.onclick = () => { this.calMoment.subtract(1, 'month'); rerender(); };
    next.onclick = () => { this.calMoment.add(1, 'month'); rerender(); };
    rerender();
    return mount;
  }

  calGrid() {
    const grid = document.createElement('div');
    grid.className = 'od-cal';
    '日一二三四五六'.split('').forEach((d) => grid.createEl('div', { cls: 'od-cal-dow', text: d }));
    const m = this.calMoment.clone().startOf('month');
    const todayM = window.moment();
    for (let i = 0; i < m.day(); i += 1) grid.createEl('div', { cls: 'od-cal-day od-cal-day--other' });
    for (let d = 1; d <= m.daysInMonth(); d += 1) {
      const dayM = m.clone().date(d);
      const key = dayM.format('YYYY-MM-DD');
      const btn = grid.createEl('button', { cls: 'od-cal-day', text: String(d) });
      if (dayM.isSame(todayM, 'day')) btn.addClass('od-cal-day--today');
      if (this.plugin.findDailyNote(key)) { btn.addClass('od-cal-day--has-note'); btn.createEl('i', { cls: 'dot' }); }
      if (((this.plugin.settings.pomoLog || {})[key] || {}).minutes > 0) btn.createEl('i', { cls: 'dot dot--pomo' });
      btn.onclick = () => this.plugin.openDailyNote(key);
    }
    return grid;
  }

  calLegend() {
    const lg = document.createElement('div');
    lg.className = 'od-cal-legend';
    const s1 = lg.createEl('span');
    const i1 = s1.createEl('i'); i1.style.background = 'var(--od-accent)';
    s1.append('有日记');
    const s2 = lg.createEl('span');
    const i2 = s2.createEl('i'); i2.style.background = 'var(--od-ok)';
    s2.append('有专注');
    return lg;
  }

  async buildTasks(body) {
    const tasks = await this.plugin.getTodayTasks();
    const list = body.createEl('div', { cls: 'od-tasks jrs-fill' });
    if (!tasks.length) list.createEl('div', { cls: 'od-task-empty', text: '今天还没有待办，添加一条开始科研吧' });
    tasks.forEach((t) => {
      const row = list.createEl('label', { cls: `od-task${t.done ? ' is-done' : ''}` });
      const cb = row.createEl('input', { type: 'checkbox' });
      cb.checked = t.done;
      cb.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.toggleDailyTask(t);
        this.softRefresh('tasks');
      };
      row.createEl('span', { cls: 'od-task-text', text: t.text });
      row.onclick = () => this.plugin.openDailyNote();
    });
    const inputRow = body.createEl('div', { cls: 'jrs-task-add' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '快速添加待办，回车确认…' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '添加' });
    const submit = async () => {
      const v = input.value.trim();
      if (!v) return;
      await this.plugin.appendDailyTask(v);
      this.softRefresh('tasks');
    };
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    return body;
  }

  buildArxiv(body) {
    const cache = this.plugin.settings.arxivCache;
    const head = body.createEl('div', { cls: 'jrs-arxiv-head' });
    head.createEl('span', { cls: 'od-hint', text: `关键词：${this.plugin.settings.arxivQuery}` });
    const rb = head.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(rb.createSpan(), 'refresh-cw');
    rb.append('刷新');
    rb.onclick = async () => { await this.plugin.fetchArxiv(true); this.softRefresh('arxiv'); };
    if (!cache?.items?.length) {
      body.createEl('div', { cls: 'od-task-empty', text: '暂无数据，点「刷新」或到「AI 发现」区段检索' });
      return body;
    }
    const list = body.createEl('div', { cls: 'jrs-arxiv-list jrs-fill' });
    cache.items.slice(0, this.plugin.settings.arxivMax).forEach((it) => {
      const row = list.createEl('div', { cls: 'jrs-arxiv-item' });
      const main = row.createEl('div', { cls: 'jrs-arxiv-main' });
      const title = main.createEl('div', { cls: 'jrs-arxiv-title', text: it.title });
      title.onclick = () => window.open(it.url);
      main.createEl('div', { cls: 'od-hint', text: `${it.date} · ${it.authors}` });
      const add = row.createEl('button', { cls: 'od-icon-btn', title: '加入文献库' });
      setIcon(add, 'plus');
      add.onclick = async () => { await this.plugin.arxivToLibrary(it); new Notice('已加入文献库 📚'); };
    });
    return body;
  }

  buildLibStats(body) {
    const papers = this.plugin.getPapers();
    const by = (s) => papers.filter((p) => p.status === s).length;
    const row = body.createEl('div', { cls: 'od-stat-row' });
    const mk = (num, label, accent) => {
      const d = row.createEl('div', { cls: `od-stat${accent ? ' od-stat--accent' : ''}` });
      d.createEl('div', { cls: 'od-stat-num', text: String(num) });
      d.createEl('div', { cls: 'od-stat-label', text: label });
    };
    mk(papers.length, '总计', true);
    mk(by('待读'), '待读'); mk(by('阅读中'), '阅读中'); mk(by('已完成'), '已完成');
    const hint = body.createEl('div', { cls: 'od-hint od-clickable', text: `本周新增 ${this.plugin.papersAddedThisWeek()} 篇 · 点击查看文献库` });
    hint.onclick = () => this.goto('library');
    return body;
  }

  buildFocusBars(body) {
    const log = this.plugin.settings.pomoLog || {};
    let max = 0; const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = window.moment().subtract(i, 'days');
      const min = (log[d.format('YYYY-MM-DD')] || {}).minutes || 0;
      max = Math.max(max, min); days.push({ d, min });
    }
    const total = days.reduce((a, b) => a + b.min, 0);
    if (!max) { body.createEl('div', { cls: 'od-task-empty', text: '还没有专注记录，点番茄钟开始第一个 25 分钟' }); return body; }
    const bars = body.createEl('div', { cls: 'od-bars' });
    days.forEach(({ d, min }) => {
      const col = bars.createEl('div', { cls: 'od-bar-col' });
      const bar = col.createEl('div', { cls: 'od-bar' });
      bar.style.height = `${Math.max(4, (min / max) * 100)}%`;
      bar.title = `${d.format('M月D日')}：${min} 分钟`;
      col.createEl('div', { cls: 'od-bar-label', text: d.format('M/D') });
    });
    body.createEl('div', { cls: 'od-hint', text: `近 7 天累计专注 ${Math.round(total / 60 * 10) / 10} 小时` });
    return body;
  }

  buildTopics(body) {
    const papers = this.plugin.getPapers();
    const chips = body.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const n = papers.filter((p) => p.topics.includes(t)).length;
      const chip = chips.createEl('span', { cls: 'od-chip' });
      chip.createSpan({ text: t });
      chip.createEl('b', { text: String(n) });
      chip.onclick = () => this.goto('library');
    });
    return chips;
  }

  async buildSurvey(body) {
    const sections = await this.plugin.getSurveyProgress();
    if (!sections.length) { body.createEl('div', { cls: 'od-task-empty', text: '大纲还没有任务项' }); return body; }
    const wrap = body.createEl('div', { cls: 'jrs-fill' });
    sections.slice(0, 8).forEach((sec) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openSurveyNote();
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: sec.name });
      top.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
      item.createEl('div', { cls: 'od-progressbar' })
        .createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
    });
    return wrap;
  }

  buildLaunch(body) {
    const grid = body.createEl('div', { cls: 'od-launch' });
    const items = [
      { icon: 'file-plus', label: '添加文献', fn: () => new AddPaperModal(this.plugin, () => this.render()).open() },
      { icon: 'import', label: '批量导入', fn: () => new ImportFolderModal(this.plugin, () => this.render()).open() },
      { icon: 'sparkles', label: 'AI 发现', fn: () => this.goto('discover') },
      { icon: 'table', label: '文献矩阵', fn: () => this.plugin.generateMatrix() },
      { icon: 'database', label: 'Bases', fn: () => this.plugin.generateBases() },
      { icon: 'sprout', label: 'AI 综述', fn: () => new AiSynthesisModal(this.plugin).open() },
      { icon: 'target', label: '投稿冲刺', fn: () => this.goto('submit') },
      { icon: 'bot', label: '知识问答', fn: () => this.goto('ask') },
      { icon: 'inbox', label: '快速记想法', fn: () => new CaptureModal(this.plugin).open() },
      { icon: 'pen-line', label: '综述大纲', fn: () => this.plugin.ensureSurveyNote(true) },
      { icon: 'library', label: '文献库', fn: () => this.goto('library') },
      { icon: 'search', label: '全局搜索', fn: () => this.app.commands.executeCommandById('global-search:open') },
      { icon: 'calendar-days', label: '今日日记', fn: () => this.plugin.openDailyNote() },
    ];
    items.forEach((it) => {
      const b = grid.createEl('button', { cls: 'od-launch-item' });
      setIcon(b.createSpan(), it.icon);
      b.createSpan({ text: it.label });
      b.onclick = it.fn;
    });
    return grid;
  }

  buildRecent(body) {
    const papers = this.plugin.getPapersSorted('added').slice(0, 6);
    if (!papers.length) { body.createEl('div', { cls: 'od-task-empty', text: '文献库还是空的' }); return body; }
    const wrap = body.createEl('div', { cls: 'jrs-fill' });
    papers.forEach((p) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openReading(p);
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title });
      const st = top.createEl('span', { cls: 'od-status' });
      st.setAttribute('data-status', p.status);
      st.textContent = p.status;
    });
    return wrap;
  }

  async buildCustom(body, id) {
    const def = this.plugin.settings.customCards.find((c) => `c:${c.uid}` === id);
    if (!def) return null;
    const cfg = def.cfg || {};
    if (def.type === 'note') {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(cfg.path || ''));
      if (!(f instanceof TFile)) { body.createEl('div', { cls: 'od-task-empty', text: `笔记不存在：${cfg.path || '未配置'}` }); return body; }
      const content = await this.app.vault.cachedRead(f);
      const host = body.createEl('div', { cls: 'jrs-note-embed jrs-fill' });
      await MarkdownRenderer.render(this.app, content, host, f.path, this);
      return host;
    }
    if (def.type === 'countdown') {
      const target = window.moment(cfg.date, 'YYYY-MM-DD');
      if (!target.isValid()) { body.createEl('div', { cls: 'od-task-empty', text: '未配置日期' }); return body; }
      const days = target.diff(window.moment().startOf('day'), 'days');
      const num = body.createEl('div', { cls: 'jrs-count-num', text: String(Math.abs(days)) });
      num.toggleClass('is-urgent', days >= 0 && days <= 7);
      body.createEl('div', { cls: 'od-hint', text: days >= 0 ? `${cfg.label || '倒计时'}还有 ${days} 天` : `${cfg.label || '节点'}已过 ${-days} 天` });
      return body;
    }
    if (def.type === 'web') {
      const frame = body.createEl('iframe', { cls: 'jrs-web-frame jrs-fill' });
      frame.setAttribute('src', cfg.url || 'about:blank');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
      return frame;
    }
    if (def.type === 'commands') {
      const ids = String(cfg.ids || '').split(/[,，;；\n]/).map((x) => x.trim()).filter(Boolean);
      const labels = String(cfg.labels || '').split(/[,，;；\n]/).map((x) => x.trim());
      const grid = body.createEl('div', { cls: 'od-launch' });
      ids.forEach((cid, i) => {
        const b = grid.createEl('button', { cls: 'od-launch-item' });
        setIcon(b.createSpan(), 'play');
        b.createSpan({ text: labels[i] || cid.split(':').pop() });
        b.onclick = () => this.app.commands.executeCommandById(cid);
      });
      return grid;
    }
    return null;
  }

  /* ========== 区段：AI 发现 ========== */

  renderDiscover(page) {
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: 'arXiv 检索' });
    head.createSpan({ text: '输入关键词，抓取最新论文，一键加入文献库' });
    const form = intro.createEl('div', { cls: 'jrs-discover-form' });
    const input = form.createEl('input', {
      type: 'text',
      placeholder: '如 all:"satellite scheduling" OR all:"earth observation"',
    });
    input.value = this.plugin.settings.arxivQuery;
    const num = form.createEl('input', { type: 'number', attr: { min: '3', max: '20' } });
    num.value = String(this.plugin.settings.arxivMax);
    const btn = form.createEl('button', { cls: 'od-btn od-btn--primary', text: '检索' });
    const host = page.createEl('div', { cls: 'jrs-discover-results' });
    const renderResults = (items) => {
      host.empty();
      if (!items.length) { host.createEl('div', { cls: 'od-task-empty', text: '没有结果，换个关键词试试' }); return; }
      items.forEach((it) => {
        const card = host.createEl('article', { cls: 'jrs-card jrs-paper-row' });
        const main = card.createEl('div', { cls: 'jrs-row-main' });
        const t = main.createEl('div', { cls: 'jrs-row-title', text: it.title });
        t.onclick = () => window.open(it.url);
        main.createEl('div', { cls: 'od-hint', text: `${it.date} · ${it.authors}` });
        if (it.summary) main.createEl('div', { cls: 'jrs-row-summary', text: it.summary.slice(0, 160) + '…' });
        const acts = card.createEl('div', { cls: 'jrs-row-actions' });
        const add = acts.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 入库' });
        add.onclick = async () => {
          add.setDisabled(true);
          await this.plugin.arxivToLibrary(it);
          new Notice('已加入文献库 📚');
          add.textContent = '已入库';
        };
      });
    };
    btn.onclick = async () => {
      btn.setDisabled(true);
      btn.textContent = '检索中…';
      try {
        const q = input.value.trim();
        if (q) { this.plugin.settings.arxivQuery = q; await this.plugin.saveSettings(); }
        const n = Math.min(20, Math.max(3, parseInt(num.value, 10) || 8));
        this.plugin.settings.arxivMax = n;
        const r = await this.plugin.fetchArxiv(true);
        renderResults(r.items.slice(0, n));
      } catch (e) { new Notice(`检索失败：${e.message}`); }
      btn.setDisabled(false);
      btn.textContent = '检索';
    };
    const cache = this.plugin.settings.arxivCache;
    if (cache?.items?.length) renderResults(cache.items.slice(0, this.plugin.settings.arxivMax));
    else host.createEl('div', { cls: 'od-task-empty', text: '输入关键词点「检索」，或点右上「立即发现」' });
  }

  /* ========== 区段：阅读队列 ========== */

  renderQueue(page) {
    const papers = this.plugin.getPapers();
    const groups = [
      { title: '高优先级', hint: '优先啃下硬骨头', items: papers.filter((p) => p.priority === '高' && p.status !== '已归档') },
      { title: '阅读中', hint: '正在进行', items: papers.filter((p) => p.status === '阅读中') },
      { title: '待读', hint: '按优先级排队', items: papers.filter((p) => p.status === '待读').sort((a, b) => (PRIORITIES.indexOf(a.priority || '低') - PRIORITIES.indexOf(b.priority || '低')) || b.added - a.added).slice(0, 15) },
    ];
    groups.forEach((g) => {
      const panel = page.createEl('section', { cls: 'jrs-card' });
      const head = panel.createEl('div', { cls: 'jrs-section-heading' });
      head.createEl('h2', { text: g.title });
      head.createSpan({ text: g.hint });
      if (!g.items.length) { panel.createEl('div', { cls: 'od-task-empty', text: '暂无' }); return; }
      g.items.forEach((p) => panel.appendChild(this.paperRow(p)));
    });
  }

  paperRow(p) {
    const row = document.createElement('article');
    row.className = 'jrs-paper-row';
    const main = row.createEl('div', { cls: 'jrs-row-main' });
    const title = main.createEl('div', { cls: 'jrs-row-title', text: p.title });
    title.onclick = () => this.plugin.openReading(p);
    const meta = main.createEl('div', { cls: 'od-hint' });
    meta.textContent = [p.year, p.venue, p.authorsShort].filter(Boolean).join(' · ') || '—';
    /* 进度条 + 快进按钮 */
    const prog = main.createEl('div', { cls: 'jrs-progress' });
    const bar = prog.createEl('div', { cls: 'od-progressbar' });
    bar.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${p.progress}%`;
    const pct = prog.createEl('button', { cls: 'jrs-progress-pct', text: `${p.progress}%`, title: '点击 +25% 阅读进度' });
    pct.onclick = async () => { await this.plugin.bumpProgress(p, 25); this.render(); };
    const acts = row.createEl('div', { cls: 'jrs-row-actions' });
    const st = acts.createEl('span', { cls: 'od-status' });
    st.setAttribute('data-status', p.status);
    st.textContent = p.status;
    st.onclick = async () => {
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      await this.plugin.setPaperStatus(p, next);
      this.render();
    };
    const read = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '分栏阅读' });
    read.onclick = () => this.plugin.openReading(p);
    return row;
  }

  /* ========== 区段：文献库（嵌入面板） ========== */

  renderLibrarySection(page) {
    if (!this._panel) this._panel = new LibraryPanel(this.plugin, () => this.render());
    this._panel.host = page;
    this._panel.render();
  }

  /* ========== 区段：论文图谱 ========== */

  async renderGraph(page) {
    const stats = this.plugin.graphStats();
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '论文图谱' });
    head.createSpan({ text: `主题 ${stats.topics} 个 · 论文 ${stats.papers} 篇 · 连线 ${stats.edges} 条` });
    const desc = intro.createEl('div', { cls: 'od-hint' });
    desc.textContent = '生成 Obsidian Canvas：主题节点居中、论文节点按方向环绕，连线表示归属关系。可在画布中自由拖拽编辑。';
    const acts = intro.createEl('div', { cls: 'jrs-row-actions' });
    const gen = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '重建并打开图谱' });
    gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    if (exists) {
      const open = acts.createEl('button', { cls: 'od-btn', text: '打开已有图谱' });
      open.onclick = () => this.plugin.openGraphCanvas();
    }
    /* 主题统计卡 */
    const grid = page.createEl('div', { cls: 'jrs-topic-grid' });
    const papers = this.plugin.getPapers();
    this.plugin.settings.topics.forEach((t) => {
      const items = papers.filter((p) => p.topics.includes(t));
      const card = grid.createEl('div', { cls: 'jrs-card jrs-topic-card' });
      card.createEl('div', { cls: 'jrs-topic-name', text: t });
      card.createEl('div', { cls: 'jrs-topic-count', text: `${items.length} 篇` });
      items.slice(0, 3).forEach((p) => card.createEl('div', { cls: 'od-hint', text: '· ' + (p.title.length > 30 ? p.title.slice(0, 30) + '…' : p.title) }));
      if (!items.length) card.createEl('div', { cls: 'od-hint', text: '暂无论文' });
    });
  }

  /* ========== 区段：研究进展 ========== */

  async renderProgress(page) {
    /* 综述大纲 */
    const surveyCard = page.createEl('section', { cls: 'jrs-card' });
    let head = surveyCard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '综述大纲' });
    head.createSpan({ text: this.plugin.surveyExists() ? '按章节跟踪写作进度' : '尚未初始化' });
    if (!this.plugin.surveyExists()) {
      const init = surveyCard.createEl('button', { cls: 'od-btn od-btn--primary', text: '初始化综述大纲' });
      init.onclick = () => this.plugin.ensureSurveyNote(true);
    } else {
      const sections = await this.plugin.getSurveyProgress();
      const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });
      const total = surveyCard.createEl('div', { cls: 'jrs-progress' });
      total.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${all.t ? (all.d / all.t) * 100 : 0}%`;
      total.createEl('span', { cls: 'od-hint', text: `总体 ${all.d}/${all.t}` });
      sections.forEach((sec) => {
        const item = surveyCard.createEl('div', { cls: 'od-progress-item od-clickable' });
        item.onclick = () => this.plugin.openSurveyNote();
        const top = item.createEl('div', { cls: 'od-progress-top' });
        top.createEl('span', { cls: 'od-progress-name', text: sec.name });
        top.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
        item.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
      });
      const acts = surveyCard.createEl('div', { cls: 'jrs-row-actions' });
      [['pen-line', '打开大纲', () => this.plugin.openSurveyNote()],
        ['sprout', 'AI 综述', () => new AiSynthesisModal(this.plugin).open()],
        ['table', '文献矩阵', () => this.plugin.generateMatrix()],
        ['database', 'Bases', () => this.plugin.generateBases()]].forEach(([icon, label, fn]) => {
        const b = acts.createEl('button', { cls: 'od-btn od-btn--sm' });
        setIcon(b.createSpan(), icon);
        b.createSpan({ text: label });
        b.onclick = fn;
      });
    }

    /* 研究问题 */
    const qCard = page.createEl('section', { cls: 'jrs-card' });
    head = qCard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '研究问题' });
    head.createSpan({ text: '把疑问沉淀成问题清单，逐个击破' });
    const qAdd = qCard.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 新问题' });
    const questions = await this.plugin.getQuestions();
    qAdd.onclick = () => new AddQuestionModal(this.plugin, () => this.render()).open();
    const qList = qCard.createEl('div', { cls: 'jrs-fill' });
    if (!questions.length) qList.createEl('div', { cls: 'od-task-empty', text: '还没有研究问题，读文献时冒出的疑问记到这里' });
    questions.forEach((q) => {
      const item = qList.createEl('div', { cls: 'jrs-question-item' });
      const main = item.createEl('div', { cls: 'jrs-row-main' });
      const t = main.createEl('div', { cls: 'jrs-row-title', text: q.question });
      t.onclick = () => this.app.workspace.getLeaf(false).openFile(q.file);
      main.createEl('div', { cls: 'od-hint', text: `${q.status === 'answered' ? '✅ 已解答' : '❓ 待解答'} · ${window.moment(q.added).format('M月D日')}` });
      const st = item.createEl('button', { cls: `od-btn od-btn--sm${q.status === 'answered' ? '' : ' od-btn--primary'}` });
      st.textContent = q.status === 'answered' ? '重新打开' : '标记已解答';
      st.onclick = async () => { await this.plugin.toggleQuestion(q); this.render(); };
    });
  }

  /* ========== 区段：投稿冲刺 ========== */

  renderSubmit(page) {
    /* 我的投稿管线 */
    const pipe = page.createEl('section', { cls: 'jrs-card' });
    let head = pipe.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '我的投稿管线' });
    head.createSpan({ text: '状态流：写作中 → 已投 → 审稿 → 修回 → 接收/改投' });
    const addBtn = pipe.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 新建投稿' });
    addBtn.onclick = () => new AddSubmissionModal(this.plugin, () => this.render()).open();

    const subs = this.plugin.getSubmissions();
    if (!subs.length) {
      pipe.createEl('div', { cls: 'od-task-empty', text: '还没有投稿条目，从综述大纲或新 idea 建一条，盯住它到接收' });
    }
    const stages = [['写作中', '准备投稿'], ['已投', '审稿中'], ['大修', '小修'], ['已接收'], ['已拒稿', '改投']];
    stages.forEach((stage) => {
      const items = subs.filter((s) => stage.includes(s.status));
      if (!items.length) return;
      const g = pipe.createEl('div', { cls: 'jrs-submit-group' });
      g.createEl('div', { cls: 'jrs-submit-stage', text: stage.join(' / ') });
      items.forEach((s) => {
        const row = g.createEl('div', { cls: 'jrs-paper-row jrs-submit-row' });
        const main = row.createEl('div', { cls: 'jrs-row-main' });
        const t = main.createEl('div', { cls: 'jrs-row-title', text: `${s.title} → ${s.target}` });
        t.onclick = () => this.app.workspace.getLeaf(false).openFile(s.file);
        const hint = main.createEl('div', { cls: 'od-hint' });
        let meta = `${s.status} · ${window.moment(s.added).format('M月D日')} 起`;
        if (s.deadline) {
          const d = window.moment(s.deadline, 'YYYY-MM-DD').diff(window.moment().startOf('day'), 'days');
          meta += d >= 0 ? ` · 截稿还剩 ${d} 天` : ` · 截稿已过 ${-d} 天`;
        }
        hint.textContent = meta;
        const acts = row.createEl('div', { cls: 'jrs-row-actions' });
        const st = acts.createEl('span', { cls: 'od-status jrs-sub-status', attr: { 'data-sub': s.status } });
        st.textContent = s.status;
        st.title = '点击流转到下一状态';
        st.onclick = async () => { await this.plugin.cycleSubmission(s); this.render(); };
        const open = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
        open.onclick = () => this.app.workspace.getLeaf(false).openFile(s.file);
      });
    });

    /* 目标期刊速查 */
    const jcard = page.createEl('section', { cls: 'jrs-card' });
    head = jcard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '目标期刊速查' });
    head.createSpan({ text: 'EJOR 等运筹顶刊与航天/卫星核心刊 · 投稿链接与定位' });
    const grid = jcard.createEl('div', { cls: 'jrs-journal-grid' });
    JOURNALS.forEach((j) => {
      const c = grid.createEl('div', { cls: 'jrs-journal' });
      const top = c.createEl('div', { cls: 'jrs-journal-top' });
      const ab = top.createEl('span', { cls: 'jrs-journal-abbr', text: j.abbr });
      ab.setAttribute('title', j.name);
      const tag = top.createEl('span', { cls: 'jrs-journal-tag', text: j.tag });
      tag.setAttribute('data-tag', j.tag.includes('顶刊') ? 'top' : j.tag.includes('EI') ? 'cn' : 'mid');
      c.createEl('div', { cls: 'jrs-journal-name', text: j.name });
      const match = c.createEl('div', { cls: 'jrs-journal-match' });
      match.textContent = `方向匹配：${j.match}`;
      c.createEl('div', { cls: 'od-hint', text: `${j.publisher} · ${j.field}` });
      if (j.note) c.createEl('div', { cls: 'jrs-journal-note', text: j.note });
      if (j.link) {
        const a = c.createEl('a', { cls: 'jrs-journal-link', text: '投稿入口 ↗' });
        a.href = j.link;
        a.target = '_blank';
      }
    });
  }

  /* ========== 区段：知识问答（ima 哲学：你的知识库即 AI 大脑） ========== */

  async renderAsk(page) {
    if (!this._askHistory) this._askHistory = [];

    const card = page.createEl('section', { cls: 'jrs-card jrs-ask' });
    card.createEl('div', { cls: 'jrs-section-heading' }).appendChild(
      (() => {
        const h = document.createElement('div');
        h.createEl('h2', { text: '问你的文献库' });
        return h;
      })(),
    );

    const inputRow = card.createEl('div', { cls: 'jrs-ask-input' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '如：网格热力图如何驱动多星调度决策？EJOR 论文常用的基线算法有哪些？' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary', text: '提问' });
    const busy = card.createEl('div', { cls: 'od-hint' });

    const list = page.createEl('div', { cls: 'jrs-ask-list' });

    const renderAnswer = (item) => {
      const block = list.createEl('div', { cls: 'jrs-ask-item od-anim' });
      const q = block.createEl('div', { cls: 'jrs-ask-q' });
      setIcon(q.createSpan(), 'help-circle');
      q.createSpan({ text: item.q });
      const a = block.createEl('div', { cls: 'jrs-ask-a' });
      MarkdownRenderer.render(this.app, item.a, a, '/', this);
      /* 来源引用行 */
      if (item.sources?.length) {
        const src = block.createEl('div', { cls: 'jrs-ask-sources' });
        src.createSpan({ cls: 'jrs-ask-sources-label', text: '来源' });
        item.sources.forEach((p) => {
          const chip = src.createEl('span', { cls: 'od-chip' });
          chip.textContent = p.title.length > 26 ? p.title.slice(0, 26) + '…' : p.title;
          chip.onclick = () => this.plugin.openPaper(p);
        });
      }
      const acts = block.createEl('div', { cls: 'jrs-row-actions' });
      const save = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '沉淀为研究问题' });
      save.onclick = async () => {
        await this.plugin.createQuestion(item.q, item.sources.map((p) => p.file.basename).join(','));
        const c = await this.plugin.appendAnswerToQuestion(item.q, item.a);
        new Notice('已沉淀到研究问题 ✅');
      };
    };

    const ask = async () => {
      const q = input.value.trim();
      if (!q) return;
      btn.setDisabled(true);
      busy.textContent = '正在检索文献库并生成回答…';
      try {
        const item = await this.plugin.aiAsk(q);
        this._askHistory.unshift(item);
        list.empty();
        this._askHistory.slice(0, 8).forEach(renderAnswer);
        input.value = '';
        busy.textContent = '';
      } catch (e) {
        busy.textContent = `❌ ${e.message}`;
        new Notice(`问答失败：${e.message}`);
      }
      btn.setDisabled(false);
    };
    btn.onclick = ask;
    input.onkeydown = (e) => { if (e.key === 'Enter') ask(); };

    if (!this._askHistory.length) {
      list.createEl('div', { cls: 'od-task-empty', text: this.plugin.settings.ai.apiKey ? '问一个你综述里的问题试试，回答会标注引用来源' : '先在 设置 → AI 助手 配置 API Key（DeepSeek 等），即可向自己的文献库提问' });
    }
  }

  /* ========== 区段：阅读笔记 ========== */

  renderReader(page) {
    const papers = this.plugin.getPapers().filter((p) => p.status === '阅读中' || p.status === '待读');
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '选择一篇论文开始精读' });
    head.createSpan({ text: '点击标题 → 笔记 + PDF 分栏打开；AI 按钮生成摘要 / 导读十问' });
    if (!papers.length) { intro.createEl('div', { cls: 'od-task-empty', text: '文献库为空或都已读完，去「AI 发现」找新论文' }); return; }
    papers.slice(0, 30).forEach((p) => {
      const row = page.createEl('article', { cls: 'jrs-card jrs-paper-row' });
      const main = row.createEl('div', { cls: 'jrs-row-main' });
      const t = main.createEl('div', { cls: 'jrs-row-title', text: p.title });
      t.onclick = () => this.plugin.openReading(p);
      const meta = main.createEl('div', { cls: 'od-hint' });
      meta.textContent = `${p.status}${p.priority ? ' · 优先级 ' + p.priority : ''}${p.year ? ' · ' + p.year : ''} · 进度 ${p.progress}%`;
      const acts = row.createEl('div', { cls: 'jrs-row-actions' });
      const read = acts.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '分栏阅读' });
      read.onclick = () => this.plugin.openReading(p);
      const ai = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: 'AI' });
      setIcon(ai.createSpan(), 'sparkles');
      ai.onclick = () => new AiPaperModal(this.plugin, p, () => this.render()).open();
    });
  }
}

/* ==========================================================================
 * 文献库面板（可嵌入区段，也可挂独立视图）
 * ========================================================================== */

class LibraryPanel {
  constructor(plugin, rerender) {
    this.plugin = plugin;
    this.rerender = rerender || (() => {});
    this.q = ''; this.statusFilter = '全部'; this.prioFilter = '全部';
    this.topicFilter = ''; this.sort = 'added';
  }

  applyIncomingTopic() {
    if (this.plugin.libFilterTopic) {
      this.topicFilter = this.plugin.libFilterTopic;
      this.plugin.libFilterTopic = '';
    }
  }

  render() {
    const root = this.host;
    root.empty();
    this.applyIncomingTopic();

    const bar = root.createEl('div', { cls: 'od-lib-toolbar' });
    const search = bar.createEl('div', { cls: 'od-search' });
    setIcon(search.createSpan(), 'search');
    const input = search.createEl('input', { type: 'text', placeholder: '搜索标题 / 作者 / 来源…' });
    input.value = this.q;
    input.oninput = () => { this.q = input.value; this.renderList(); };
    const sortSel = bar.createEl('select', { cls: 'od-btn' });
    [['added', '最近添加'], ['year', '年份'], ['title', '标题'], ['rating', '评分'], ['priority', '优先级']].forEach(([v, l]) => {
      sortSel.createEl('option', { value: v }).textContent = l;
    });
    sortSel.value = this.sort;
    sortSel.onchange = () => { this.sort = sortSel.value; this.renderList(); };
    const mkTool = (cls, icon, label, fn) => {
      const b = bar.createEl('button', { cls });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
    };
    mkTool('od-btn od-btn--primary', 'plus', '添加', () => new AddPaperModal(this.plugin, () => this.render()).open());
    mkTool('od-btn', 'import', '导入', () => new ImportFolderModal(this.plugin, () => this.render()).open());
    mkTool('od-btn', 'table', '矩阵', () => this.plugin.generateMatrix());
    mkTool('od-btn', 'database', 'Bases', () => this.plugin.generateBases());
    mkTool('od-btn', 'database', 'PDF 入库', () => this.plugin.migrateExternalPdfs().then(() => this.render()));

    const fRow = root.createEl('div', { cls: 'od-filters' });
    ['全部', ...STATUSES].forEach((s) => {
      const c = fRow.createEl('button', { cls: `od-filter${this.statusFilter === s ? ' is-active' : ''}`, text: s });
      c.onclick = () => { this.statusFilter = s; this.render(); };
    });
    const pRow = root.createEl('div', { cls: 'od-filters' });
    ['全部', ...PRIORITIES, '无'].forEach((p) => {
      const c = pRow.createEl('button', { cls: `od-filter${this.prioFilter === p ? ' is-active' : ''}`, text: p === '全部' ? '优先级：全部' : p });
      c.onclick = () => { this.prioFilter = p; this.render(); };
    });
    const tRow = root.createEl('div', { cls: 'od-filters' });
    const all = tRow.createEl('button', { cls: `od-filter${this.topicFilter === '' ? ' is-active' : ''}`, text: '全部方向' });
    all.onclick = () => { this.topicFilter = ''; this.render(); };
    this.plugin.settings.topics.forEach((t) => {
      const c = tRow.createEl('button', { cls: `od-filter${this.topicFilter === t ? ' is-active' : ''}`, text: t });
      c.onclick = () => { this.topicFilter = this.topicFilter === t ? '' : t; this.render(); };
    });

    this._listHost = root.createEl('div');
    this.renderList();
  }

  filtered() {
    const q = this.q.trim().toLowerCase();
    return this.plugin.getPapersSorted(this.sort).filter((p) => {
      if (this.statusFilter !== '全部' && p.status !== this.statusFilter) return false;
      if (this.prioFilter === '无' && p.priority) return false;
      if (this.prioFilter !== '全部' && this.prioFilter !== '无' && p.priority !== this.prioFilter) return false;
      if (this.topicFilter && !p.topics.includes(this.topicFilter)) return false;
      if (q && !`${p.title} ${p.authors} ${p.venue}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  renderList() {
    if (!this._listHost) return;
    this._listHost.empty();
    const papers = this.filtered();
    const grid = this._listHost.createEl('div', { cls: 'od-papers' });
    if (!papers.length) {
      const e = grid.createEl('div', { cls: 'od-empty' });
      setIcon(e.createSpan(), 'book-open');
      e.createSpan({ text: '没有符合条件的文献' });
      return;
    }
    papers.forEach((p, i) => grid.appendChild(this.paperCard(p, i)));
  }

  paperCard(p, i) {
    const el = document.createElement('article');
    el.addClass('od-paper', 'od-anim');
    el.style.animationDelay = `${Math.min(i * 25, 300)}ms`;
    el.createEl('div', { cls: 'od-paper-title', text: p.title });
    const meta = el.createEl('div', { cls: 'od-paper-meta' });
    const parts = [p.year, p.venue, p.authorsShort].filter(Boolean);
    parts.forEach((seg, j) => {
      if (j > 0) meta.createEl('span', { cls: 'od-dot-sep', text: '·' });
      meta.createSpan({ text: seg });
    });
    if (p.topics.length) {
      const chips = el.createEl('div', { cls: 'od-chips' });
      p.topics.slice(0, 4).forEach((t) => chips.createEl('span', { cls: 'od-chip', text: t }));
    }
    const foot = el.createEl('div', { cls: 'od-paper-foot' });
    const st = foot.createEl('span', { cls: 'od-status' });
    st.setAttribute('data-status', p.status);
    st.textContent = p.status;
    st.title = '点击切换状态';
    st.onclick = async (e) => {
      e.stopPropagation();
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      await this.plugin.setPaperStatus(p, next);
      new Notice(`→ ${next}`);
    };
    const pr = foot.createEl('span', { cls: 'od-status jrs-prio' });
    pr.setAttribute('data-prio', p.priority || '');
    pr.textContent = p.priority ? `优 ${p.priority}` : '优 ·';
    pr.onclick = async (e) => {
      e.stopPropagation();
      const order = [...PRIORITIES, ''];
      await this.plugin.setPaperPriority(p, order[(order.indexOf(p.priority || '') + 1) % order.length]);
      this.renderList();
    };
    const stars = foot.createEl('span', { cls: 'od-stars' });
    for (let n = 1; n <= 5; n += 1) {
      const s = stars.createEl('button', { cls: `od-star${n <= p.rating ? ' is-on' : ''}` });
      setIcon(s, 'star');
      s.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.setPaperRating(p, p.rating === n ? 0 : n);
        this.renderList();
      };
    }
    const acts = foot.createEl('div', { cls: 'od-paper-actions' });
    const mkIcon = (icon, title, fn) => {
      const b = acts.createEl('button', { cls: 'od-icon-btn', title });
      setIcon(b, icon);
      b.onclick = (e) => { e.stopPropagation(); fn(); };
    };
    if (p.pdf) mkIcon(isHttp(p.pdf) ? 'external-link' : 'book-open-text', '打开 PDF', () => this.plugin.openPdf(p.pdf));
    mkIcon('columns-2', '分栏阅读', () => this.plugin.openReading(p));
    mkIcon('sparkles', 'AI 助手', () => new AiPaperModal(this.plugin, p, () => this.renderList()).open());
    mkIcon('file-text', '打开笔记', () => this.plugin.openPaper(p));
    el.onclick = () => this.plugin.openPaper(p);
    return el;
  }
}

class LibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._panel = new LibraryPanel(plugin);
    this._deb = null;
  }
  getViewType() { return VIEW_LIBRARY; }
  getDisplayText() { return '文献库'; }
  getIcon() { return 'library'; }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('jrs-view');
    const page = this.contentEl.createEl('div', { cls: 'jrs-page' });
    const title = page.createEl('div', { cls: 'od-section-title jrs-lib-title' });
    title.createSpan({ text: '文献库' });
    this._panel.host = page;
    this._panel.render();
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (f.path.startsWith(this.plugin.settings.libFolder)) this.debounced();
    }));
    this.registerEvent(this.app.vault.on('delete', () => this.debounced()));
    this.registerEvent(this.app.vault.on('rename', () => this.debounced()));
  }
  debounced() {
    if (this._deb) window.clearTimeout(this._deb);
    this._deb = window.setTimeout(() => this._panel.render(), 250);
  }
}

/* ==========================================================================
 * 弹窗
 * ========================================================================== */

class AddPaperModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
    this.data = { title: '', authors: '', year: '', venue: '', status: '待读', priority: '', topics: [], pdf: '' };
  }
  onOpen() {
    this.titleEl.setText('添加文献');
    const { contentEl } = this;
    contentEl.empty();
    const mkText = (label, key, ph) => {
      new Setting(contentEl).setName(label).addText((t) => {
        t.inputEl.placeholder = ph || '';
        t.onChange(() => { this.data[key] = t.getValue(); });
      });
    };
    mkText('标题 *', 'title', '如：基于网格剖分的敏捷卫星区域目标观测调度方法');
    mkText('作者', 'authors', '如：伍国华, 祝江汉');
    mkText('年份', 'year', '2024');
    mkText('期刊 / 会议', 'venue', 'EJOR / AST / 宇航学报…（可选目标刊）');
    new Setting(contentEl).setName('PDF 链接或库内路径（可选）').addText((t) => {
      t.inputEl.placeholder = 'https://arxiv.org/pdf/… 或 科研工作台/PDF/x.pdf';
      t.onChange(() => { this.data.pdf = t.getValue(); });
    });
    new Setting(contentEl).setName('状态').addDropdown((d) => {
      STATUSES.forEach((s) => d.addOption(s, s));
      d.setValue('待读');
      d.onChange(() => { this.data.status = d.getValue(); });
    });
    new Setting(contentEl).setName('优先级').addDropdown((d) => {
      ['', '高', '中', '低'].forEach((s) => d.addOption(s, s || '无'));
      d.onChange(() => { this.data.priority = d.getValue(); });
    });
    const topicSetting = new Setting(contentEl).setName('研究方向（可多选）');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const c = chipWrap.createEl('span', { cls: 'od-chip od-chip--select', text: t });
      c.onclick = () => {
        if (this.data.topics.includes(t)) { this.data.topics.remove(t); c.removeClass('is-selected'); }
        else { this.data.topics.push(t); c.addClass('is-selected'); }
      };
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建文献笔记').setCta().onClick(async () => {
        if (!this.data.title.trim()) { new Notice('标题不能为空'); return; }
        await this.plugin.createPaperNote(this.data);
        new Notice(`已添加：${this.data.title.slice(0, 24)}…`);
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class ImportFolderModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('批量导入 PDF 文献');
    const { contentEl } = this;
    contentEl.empty();
    let folder = 'D:/Desktop/ycs/卫星网格化智能规划综述/文献';
    let recursive = true; let copyIn = true;
    new Setting(contentEl).setName('PDF 所在文件夹').addText((t) => {
      t.inputEl.style.width = '340px';
      t.inputEl.setValue(folder);
      t.onChange(() => { folder = t.getValue(); });
    });
    new Setting(contentEl).setName('包含子文件夹').addToggle((tg) => tg.setValue(true).onChange((v) => { recursive = v; }));
    new Setting(contentEl).setName('PDF 复制入库（推荐）').setDesc(`复制到 ${this.plugin.settings.pdfFolder}/，在 Obsidian 内直接阅读批注`).addToggle((tg) => tg.setValue(true).onChange((v) => { copyIn = v; }));
    const resultEl = contentEl.createEl('div', { cls: 'jrs-import-result' });
    new Setting(contentEl).addButton((b) => b.setButtonText('开始导入').setCta().onClick(async () => {
      b.setDisabled(true);
      resultEl.empty();
      const progress = resultEl.createEl('div', { cls: 'od-hint' });
      try {
        const res = await this.plugin.importPdfFolder(folder, recursive, copyIn, (msg) => { progress.textContent = msg; });
        new Notice(`导入完成：新增 ${res.created}，跳过 ${res.skipped}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `✅ 新增 ${res.created} · 跳过 ${res.skipped} · 失败 ${res.failed}` });
        if (this.onDone) window.setTimeout(this.onDone, 400);
      } catch (err) {
        new Notice(`导入失败：${err.message}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `❌ ${err.message}` });
      }
      b.setDisabled(false);
    }));
  }
}

class CardManagerModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  nameOf(id) {
    const s = this.plugin.settings;
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return s.cardTitles[id] || b.name;
    const c = s.customCards.find((x) => `c:${x.uid}` === id);
    return c ? `${c.title}（${CUSTOM_TYPES[c.type]?.name || c.type}）` : id;
  }
  display() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', { cls: 'od-hint', text: '排序与尺寸：总览 →「排版」模式拖拽。此处管理显隐与自定义卡片。' });
    const list = contentEl.createEl('div', { cls: 'jrs-cm-list' });
    const ids = [...BUILTIN_CARDS.map((c) => c.id), ...this.plugin.settings.customCards.map((c) => `c:${c.uid}`)];
    ids.forEach((id) => {
      const s = this.plugin.settings;
      const row = list.createEl('div', { cls: 'jrs-cm-row' });
      row.createSpan({ cls: 'jrs-cm-name', text: this.nameOf(id) });
      const hidden = s.hiddenCards.includes(id);
      const tgl = row.createEl('button', { cls: `od-btn od-btn--sm${hidden ? '' : ' od-btn--primary'}` });
      tgl.textContent = hidden ? '已隐藏' : '显示中';
      tgl.onclick = async () => {
        if (hidden) s.hiddenCards.remove(id);
        else if (!s.hiddenCards.includes(id)) s.hiddenCards.push(id);
        await this.plugin.saveSettings();
        this.display();
      };
      if (id.startsWith('c:')) {
        const del = row.createEl('button', { cls: 'od-btn od-btn--sm', text: '删除' });
        del.onclick = async () => {
          s.customCards = s.customCards.filter((x) => `c:${x.uid}` !== id);
          s.hiddenCards = s.hiddenCards.filter((x) => x !== id);
          delete s.layout[id];
          await this.plugin.saveSettings();
          this.display();
        };
      }
    });
    contentEl.createEl('h4', { text: '添加自定义卡片' });
    let type = 'note';
    const cfgBox = contentEl.createEl('div', { cls: 'jrs-cm-cfg' });
    const buildForm = () => {
      cfgBox.empty();
      const values = { title: '', ...(CUSTOM_TYPES[type].cfg || {}) };
      const fields = { title: '卡片标题' };
      if (type === 'note') fields.path = '笔记路径（库内）';
      if (type === 'countdown') { fields.label = '节点名称'; fields.date = '日期（YYYY-MM-DD）'; }
      if (type === 'web') fields.url = '网址';
      if (type === 'commands') { fields.ids = '命令 ID（逗号分隔）'; fields.labels = '显示名（逗号分隔，可空）'; }
      Object.entries(fields).forEach(([k, label]) => {
        new Setting(cfgBox).setName(label).addText((t) => {
          t.setValue(String(values[k] || ''));
          t.onChange(() => { values[k] = t.getValue(); });
        });
      });
      cfgBox._values = values;
    };
    new Setting(contentEl).setName('类型').addDropdown((d) => {
      Object.entries(CUSTOM_TYPES).forEach(([k, v]) => d.addOption(k, v.name));
      d.onChange(() => { type = d.getValue(); buildForm(); });
    });
    buildForm();
    new Setting(contentEl).addButton((b) => b.setButtonText('添加卡片').setCta().onClick(async () => {
      const v = cfgBox._values || {};
      const uid = Date.now();
      const s = this.plugin.settings;
      s.customCards.push({ uid, type, title: v.title || CUSTOM_TYPES[type].name, cfg: { ...CUSTOM_TYPES[type].cfg, ...v } });
      s.layout[`c:${uid}`] = { x: -1, y: -1, w: 2, h: 2 };
      await this.plugin.saveSettings();
      new Notice('卡片已添加');
      this.display();
    }));
  }
  onOpen() { this.display(); }
  onClose() { if (this.onDone) this.onDone(); }
}

class CardConfigModal extends Modal {
  constructor(plugin, def, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.def = def; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`卡片设置 · ${this.plugin.settings.cardTitles[this.def.id] || this.def.name}`);
    const { contentEl } = this;
    contentEl.empty();
    const s = this.plugin.settings;
    const cfg = { ...(s.cardCfg[this.def.id] || {}) };
    new Setting(contentEl).setName('卡片标题').addText((t) => {
      t.setValue(s.cardTitles[this.def.id] || this.def.name);
      t.onChange(() => { cfg.__title = t.getValue(); });
    });
    if (this.def.id === 'arxiv') {
      new Setting(contentEl).setName('显示条数').addText((t) => {
        t.inputEl.type = 'number';
        t.setValue(String(cfg.max || s.arxivMax));
        t.onChange(() => { const n = parseInt(t.getValue(), 10); if (n > 0 && n <= 20) cfg.max = n; });
      });
    }
    if (this.def.custom) {
      const c = this.def.custom;
      const fields = {};
      if (c.type === 'note') fields.path = '笔记路径（库内）';
      if (c.type === 'countdown') { fields.label = '节点名称'; fields.date = '日期（YYYY-MM-DD）'; }
      if (c.type === 'web') fields.url = '网址';
      if (c.type === 'commands') { fields.ids = '命令 ID（逗号分隔）'; fields.labels = '显示名（逗号分隔）'; }
      Object.entries(fields).forEach(([k, label]) => {
        new Setting(contentEl).setName(label).addText((t) => {
          t.setValue(String(c.cfg?.[k] || ''));
          t.onChange(() => { c.cfg[k] = t.getValue(); });
        });
      });
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('保存').setCta().onClick(async () => {
        if (typeof cfg.__title === 'string' && cfg.__title.trim()) s.cardTitles[this.def.id] = cfg.__title.trim();
        delete cfg.__title;
        s.cardCfg[this.def.id] = cfg;
        await this.plugin.saveSettings();
        this.close();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
  onClose() { if (this.onDone) this.onDone(); }
}

class AiPaperModal extends Modal {
  constructor(plugin, paper, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.paper = paper; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`AI 助手 · ${this.paper.title.slice(0, 30)}…`);
    const { contentEl } = this;
    contentEl.empty();
    if (!this.plugin.settings.ai.apiKey) {
      contentEl.createEl('p', { cls: 'od-hint', text: '尚未配置 API Key：设置 → AI 助手' });
    }
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    const mk = (name, desc, fn) => {
      new Setting(contentEl).setName(name).setDesc(desc).addButton((b) => {
        b.setButtonText('运行').setCta();
        b.onClick(async () => {
          b.setDisabled(true);
          busy.textContent = `${name}生成中…`;
          try { await fn(); busy.textContent = `✅ ${name}完成`; }
          catch (e) { busy.textContent = `❌ ${e.message}`; new Notice(`${name}失败：${e.message}`); }
          b.setDisabled(false);
        });
      });
    };
    mk('生成结构化摘要', '一句话总结/问题设定/求解算法/可借鉴点', () => this.plugin.aiSummarize(this.paper));
    mk('导读十问', '10 个带参考答案的理解性问题', () => this.plugin.aiGuide(this.paper));
    mk('补全元数据', 'AI 推断 作者/年份/来源/方向/优先级 写回', async () => {
      const m = await this.plugin.aiMetadata(this.paper);
      new Notice(`已补全：${JSON.stringify(m).slice(0, 60)}…`);
    });
  }
}

class AiSynthesisModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    this.titleEl.setText('AI 跨论文综述');
    const { contentEl } = this;
    contentEl.empty();
    if (!this.plugin.settings.ai.apiKey) contentEl.createEl('p', { cls: 'od-hint', text: '提示：未配置 API Key' });
    let topic = this.plugin.settings.topics[0] || '';
    let n = 8; let goal = '';
    new Setting(contentEl).setName('研究方向 / 主题').addDropdown((d) => {
      this.plugin.settings.topics.forEach((t) => d.addOption(t, t));
      if (topic) d.setValue(topic);
      d.onChange(() => { topic = d.getValue(); });
    });
    new Setting(contentEl).setName('纳入文献数').addText((t) => {
      t.inputEl.type = 'number'; t.setValue('8');
      t.onChange(() => { const v = parseInt(t.getValue(), 10); if (v > 1 && v <= 20) n = v; });
    });
    new Setting(contentEl).setName('研究目标（可选）').addText((t) => { t.onChange(() => { goal = t.getValue(); }); });
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        busy.textContent = `✅ 已生成：${f.path}`;
        this.app.workspace.getLeaf(false).openFile(f);
      } catch (e) { busy.textContent = `❌ ${e.message}`; new Notice(`综述失败：${e.message}`); }
      b.setDisabled(false);
    }));
  }
}

class CaptureModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    this.titleEl.setText('快速记想法（进收件箱）');
    const { contentEl } = this;
    contentEl.empty();
    let text = '';
    new Setting(contentEl).setName('想法 / 线索 / 待查文献').addTextArea((t) => {
      t.inputEl.rows = 4;
      t.inputEl.style.width = '340px';
      t.inputEl.placeholder = '如：查一下 GeoSOT 剖分在敏捷卫星上的最新应用';
      t.onChange(() => { text = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('存入收件箱').setCta().onClick(async () => {
        if (!text.trim()) { new Notice('内容为空'); return; }
        await this.plugin.captureThought(text.trim());
        new Notice('已存入今日收件箱 📥');
        this.close();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class AddSubmissionModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('新建投稿');
    const { contentEl } = this;
    contentEl.empty();
    let title = ''; let target = JOURNALS[0].abbr; let deadline = ''; let note = '';
    new Setting(contentEl).setName('论文 / 工作标题 *').addText((t) => {
      t.inputEl.placeholder = '如：网格热力驱动的多星协同调度方法';
      t.onChange(() => { title = t.getValue(); });
    });
    const jSetting = new Setting(contentEl).setName('目标期刊').setDesc('下拉选择，或手动输入其他期刊');
    const sel = jSetting.controlEl.createEl('select', { cls: 'dropdown' });
    JOURNALS.forEach((j) => {
      const o = sel.createEl('option', { value: j.abbr });
      o.textContent = `${j.abbr} — ${j.tag} · ${j.field}`;
    });
    let custom = '';
    const customInput = jSetting.controlEl.createEl('input', { type: 'text', placeholder: '其他期刊缩写（可选）' });
    customInput.className = 'jrs-inline-input';
    customInput.oninput = () => { custom = customInput.value.trim(); };
    sel.onchange = () => { target = sel.value; };
    new Setting(contentEl).setName('目标截稿日（可选）').addText((t) => {
      t.inputEl.placeholder = 'YYYY-MM-DD';
      t.onChange(() => { deadline = t.getValue().trim(); });
    });
    new Setting(contentEl).setName('备注（可选）').addTextArea((t) => {
      t.inputEl.rows = 2;
      t.inputEl.style.width = '320px';
      t.onChange(() => { note = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建').setCta().onClick(async () => {
        if (!title.trim()) { new Notice('标题不能为空'); return; }
        await this.plugin.createSubmission(title.trim(), custom || target, deadline, note.trim());
        new Notice(`投稿已建档：${(custom || target)} 🎯`);
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class AddQuestionModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('新建研究问题');
    const { contentEl } = this;
    contentEl.empty();
    let q = ''; let related = '';
    new Setting(contentEl).setName('问题描述 *').addTextArea((t) => {
      t.inputEl.rows = 3;
      t.inputEl.style.width = '320px';
      t.onChange(() => { q = t.getValue(); });
    });
    new Setting(contentEl).setName('相关论文（可选）').setDesc('文献笔记名，逗号分隔').addText((t) => {
      t.onChange(() => { related = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建').setCta().onClick(async () => {
        if (!q.trim()) { new Notice('问题描述不能为空'); return; }
        await this.plugin.createQuestion(q.trim(), related);
        new Notice('研究问题已记录 ❓');
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

/* ==========================================================================
 * 设置页
 * ========================================================================== */

class JrsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl('h3', { text: '🧭 应用外壳' });
    new Setting(containerEl).setName('左侧栏').setDesc('区段导航栏的显示方式')
      .addDropdown((d) => {
        d.addOption('full', '展开（图标+文字）');
        d.addOption('icon', '仅图标');
        d.addOption('hidden', '隐藏');
        d.setValue(s.sidebarMode);
        d.onChange(async (v) => { s.sidebarMode = v; await this.plugin.saveSettings(); });
      });

    containerEl.createEl('h3', { text: '🎨 外观工作室' });
    new Setting(containerEl).setName('强调色（预设）').addDropdown((d) => {
      Object.entries(ACCENTS).forEach(([k, v]) => d.addOption(k, v.name));
      d.setValue(s.accent);
      d.onChange(async (v) => { s.accent = v; s.accentCustom = ''; await this.plugin.saveSettings(); this.plugin.applyAppearance(); this.display(); });
    });
    new Setting(containerEl).setName('强调色（自定义 HEX）').addText((t) => {
      t.setValue(s.accentCustom);
      t.onChange(async () => {
        const v = t.getValue().trim();
        if (v === '' || /^#[0-9a-fA-F]{6}$/.test(v)) { s.accentCustom = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }
      });
    });
    new Setting(containerEl).setName('毛玻璃卡片').addToggle((t) => t.setValue(s.glass).onChange(async (v) => { s.glass = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    const slider = (name, key, min, max, step, desc) => {
      const st = new Setting(containerEl).setName(name).setDesc(desc || '');
      st.addSlider((sl) => sl.setLimits(min, max, step).setValue(s[key]).setDynamicTooltip()
        .onChange(async (v) => { s[key] = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
      st.addText((t) => {
        t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseFloat(v);
          if (!Number.isNaN(n) && n >= min && n <= max) { s[key] = n; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }
        });
      });
      st.controlEl.addClass('jrs-slider-row');
    };
    slider('毛玻璃模糊量', 'blurPx', 0, 40, 1, '0 = 关闭模糊');
    slider('卡片不透明度', 'cardAlpha', 30, 100, 1, '照片背景下建议 65-90');
    slider('卡片圆角', 'radiusPx', 0, 28, 1);
    slider('卡片间距', 'gapPx', 6, 32, 1);
    slider('背景暗化', 'bgDim', 0, 80, 1);
    slider('看板列数', 'columns', 4, 10, 1, '改后建议重新排版');
    new Setting(containerEl).setName('背景模式').addDropdown((d) => {
      d.addOption('none', '无（跟随主题）'); d.addOption('color', '纯色'); d.addOption('image', '图片');
      d.setValue(s.bgMode);
      d.onChange(async (v) => { s.bgMode = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('纯色背景').addColorPicker((c) => c.setValue(s.bgColor).onChange(async (v) => { s.bgColor = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    new Setting(containerEl).setName('背景图片（库内路径）').addText((t) => {
      t.setValue(s.bgImage);
      t.onChange(async () => { s.bgImage = t.getValue().trim(); await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });

    containerEl.createEl('h3', { text: '📁 路径' });
    const pathSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => { t.setValue(s[key]); t.onChange(async () => { s[key] = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    pathSetting('文献笔记目录', 'libFolder');
    pathSetting('PDF 存放目录', 'pdfFolder');
    pathSetting('研究问题目录', 'questionsFolder');
    pathSetting('投稿目录', 'submissionsFolder', '投稿管线笔记存放位置');
    pathSetting('收件箱目录', 'inboxFolder', '快速捕获的想法存放位置');
    pathSetting('图谱 Canvas', 'graphCanvas');
    pathSetting('日记目录', 'dailyFolder', '留空 = 库根目录');
    pathSetting('综述大纲笔记', 'surveyNote');
    pathSetting('Bases 目录', 'basesFolder');

    containerEl.createEl('h3', { text: '🍅 番茄钟' });
    const numSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => {
        t.inputEl.type = 'number'; t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n > 0 && n <= 180) { s[key] = n; await this.plugin.saveSettings(); }
        });
      });
    numSetting('专注时长（分钟）', 'pomoWork', '默认 25');
    numSetting('小憩时长（分钟）', 'pomoBreak', '默认 5');
    numSetting('长休时长（分钟）', 'pomoLongBreak', '默认 15');
    numSetting('每几个番茄进入长休', 'pomoLongEvery', '默认 4');

    containerEl.createEl('h3', { text: '📡 arXiv' });
    new Setting(containerEl).setName('检索关键词').addText((t) => {
      t.setValue(s.arxivQuery);
      t.onChange(async () => { s.arxivQuery = t.getValue(); s.arxivCache = null; await this.plugin.saveSettings(); });
    });
    numSetting('默认显示条数', 'arxivMax');

    containerEl.createEl('h3', { text: '🤖 AI 助手（OpenAI 兼容）' });
    new Setting(containerEl).setName('API Base URL').addText((t) => { t.setValue(s.ai.baseUrl); t.onChange(async () => { s.ai.baseUrl = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('API Key').addText((t) => { t.inputEl.type = 'password'; t.setValue(s.ai.apiKey); t.onChange(async () => { s.ai.apiKey = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('模型').addText((t) => { t.setValue(s.ai.model); t.onChange(async () => { s.ai.model = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '🧲 MinerU 解析（可选）' });
    new Setting(containerEl).setName('MinerU 命令').addText((t) => { t.setValue(s.mineruCmd); t.onChange(async () => { s.mineruCmd = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '🔬 科研' });
    new Setting(containerEl).setName('科研起始日').setDesc('YYYY-MM-DD').addText((t) => { t.setValue(s.researchStart); t.onChange(async () => { s.researchStart = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    const topicSetting = new Setting(containerEl).setName('研究方向标签');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    const renderChips = () => {
      chipWrap.empty();
      s.topics.forEach((t) => {
        const c = chipWrap.createEl('span', { cls: 'od-chip' });
        c.createSpan({ text: t });
        const x = c.createEl('span', { text: '×', cls: 'jrs-chip-x' });
        x.onclick = async () => { s.topics.remove(t); await this.plugin.saveSettings(); renderChips(); };
      });
    };
    renderChips();
    topicSetting.addText((t) => {
      t.setPlaceholder('新方向名称');
      t.inputEl.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          const v = t.getValue().trim();
          if (v && !s.topics.includes(v)) { s.topics.push(v); await this.plugin.saveSettings(); t.setValue(''); renderChips(); }
        }
      };
    });

    containerEl.createEl('h3', { text: '🗄 数据' });
    new Setting(containerEl).setName('导出插件设置').addButton((b) => b.setButtonText('复制 JSON').onClick(() => {
      navigator.clipboard?.writeText(JSON.stringify(s, null, 2));
      new Notice('设置已复制到剪贴板');
    }));
    new Setting(containerEl).setName('重置排版布局').addButton((b) => b.setButtonText('重置').onClick(async () => {
      s.layout = {};
      await this.plugin.saveSettings();
      new Notice('已重置');
    }));
  }
}

/* ==========================================================================
 * 主插件
 * ========================================================================== */

module.exports = class JensenResearchStationPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.pomo = new PomoEngine(this);
    this.libFilterTopic = '';

    this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.addRibbonIcon('telescope', 'Jensen 科研工作站', () => this.activateDashboard());
    this.addSettingTab(new JrsSettingTab(this.app, this));

    const cmds = [
      ['open-dashboard', '打开工作站', () => this.activateDashboard()],
      ['open-library', '打开文献库（独立视图）', () => this.activateLibrary()],
      ['sec-discover', '区段：AI 发现', () => this.gotoSection('discover')],
      ['sec-queue', '区段：阅读队列', () => this.gotoSection('queue')],
      ['sec-graph', '区段：论文图谱', () => this.gotoSection('graph')],
      ['sec-progress', '区段：研究进展', () => this.gotoSection('progress')],
      ['sec-reader', '区段：阅读笔记', () => this.gotoSection('reader')],
      ['sec-submit', '区段：投稿冲刺', () => this.gotoSection('submit')],
      ['sec-ask', '区段：知识问答', () => this.gotoSection('ask')],
      ['new-submission', '新建投稿', () => new AddSubmissionModal(this).open()],
      ['capture', '快速记想法（收件箱）', () => new CaptureModal(this).open()],
      ['add-paper', '添加文献', () => new AddPaperModal(this).open()],
      ['import-pdf', '批量导入 PDF 文件夹', () => new ImportFolderModal(this).open()],
      ['start-pomo', '开始专注（番茄钟）', () => { if (this.pomo.phase === 'idle') this.pomo.start(); }],
      ['gen-matrix', '生成文献矩阵', () => this.generateMatrix()],
      ['gen-bases', '生成 Bases 数据库', () => this.generateBases()],
      ['gen-graph', '重建论文图谱', () => this.generateGraphCanvas(true)],
      ['init-survey', '初始化综述大纲', () => this.ensureSurveyNote(true)],
      ['pdf-to-vault', '外部 PDF 一键入库', () => this.migrateExternalPdfs()],
      ['card-manager', '卡片管理', () => new CardManagerModal(this).open()],
      ['refresh-arxiv', '刷新 arXiv 资讯', async () => { await this.fetchArxiv(true); new Notice('arXiv 已刷新'); }],
      ['ai-synthesis', 'AI 跨论文综述', () => new AiSynthesisModal(this).open()],
    ];
    cmds.forEach(([id, name, cb]) => this.addCommand({ id, name, callback: cb }));
    this.addCommand({
      id: 'ai-active',
      name: 'AI 助手（当前文献笔记）',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && f.path.startsWith(this.settings.libFolder);
        if (checking) return ok;
        if (ok) {
          const paper = this.getPapers().find((p) => p.path === f.path) || { file: f, title: f.basename };
          new AiPaperModal(this, paper).open();
        }
        return true;
      },
    });
    this.addCommand({
      id: 'mineru-extract-active',
      name: 'MinerU 解析当前文献的 PDF',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && f.path.startsWith(this.settings.libFolder);
        if (checking) return ok;
        if (ok) this.mineruExtract({ file: f }).catch((e) => new Notice(`MinerU 失败：${e.message}`));
        return true;
      },
    });

    this.app.workspace.onLayoutReady(() => {
      this.applyAppearance();
      this.ensureArxivFresh();
    });
  }

  onunload() {
    this.pomo.destroy();
    this.app.workspace.detachLeavesOfType(VIEW_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_LIBRARY);
    document.body.removeClass('od-glass', 'jrs-bg-on');
  }

  async gotoSection(id) {
    await this.activateDashboard();
    const leaf = this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)[0];
    if (leaf?.view instanceof DashboardView) await leaf.view.goto(id);
  }

  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, structuredClone(DEFAULT_SETTINGS), stored);
    this.settings.ai = Object.assign({}, structuredClone(DEFAULT_SETTINGS.ai), stored?.ai || {});
    if (!Array.isArray(this.settings.topics)) this.settings.topics = [...DEFAULT_TOPICS];
    if (!Array.isArray(this.settings.hiddenCards)) this.settings.hiddenCards = [];
    if (!Array.isArray(this.settings.customCards)) this.settings.customCards = [];
    if (!this.settings.layout || typeof this.settings.layout !== 'object') this.settings.layout = {};
    if (!this.settings.cardTitles) this.settings.cardTitles = {};
    if (!this.settings.cardCfg) this.settings.cardCfg = {};
    if (!this.settings.pomoLog) this.settings.pomoLog = {};
    if (!this.settings.sidebarMode) this.settings.sidebarMode = 'full';
    this.settings.hiddenCards = this.settings.hiddenCards.filter((x) => x !== 'omnibox-tip');
  }

  async saveSettings() { await this.saveData(this.settings); }

  applyAppearance() {
    const s = this.settings;
    const hex = (/^#[0-9a-fA-F]{6}$/.test(s.accentCustom || '') && s.accentCustom) || (ACCENTS[s.accent] || ACCENTS.blue).hex;
    document.body.style.setProperty('--od-accent', hex);
    document.body.style.setProperty('--od-accent-soft', hexToRgba(hex, 0.14));
    document.body.style.setProperty('--od-blur', `${s.blurPx}px`);
    document.body.style.setProperty('--od-card-alpha', `${s.cardAlpha}%`);
    document.body.style.setProperty('--od-radius-l', `${s.radiusPx}px`);
    document.body.style.setProperty('--od-radius-m', `${Math.max(6, s.radiusPx - 4)}px`);
    document.body.style.setProperty('--od-gap', `${s.gapPx}px`);
    document.body.style.setProperty('--od-bg-dim', String(Math.min(0.9, s.bgDim / 100)));
    document.body.toggleClass('od-glass', !!s.glass);
    if (s.bgMode === 'color') {
      document.body.style.setProperty('--jrs-bg', s.bgColor || '#e8edf7');
      document.body.style.setProperty('--jrs-bg-image', 'none');
      document.body.addClass('jrs-bg-on');
    } else if (s.bgMode === 'image') {
      const f = normalizePath(s.bgImage || '') ? this.app.vault.getAbstractFileByPath(normalizePath(s.bgImage)) : null;
      let url = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      if (f instanceof TFile) url = `url("${this.app.vault.getResourcePath(f)}")`;
      document.body.style.setProperty('--jrs-bg-image', url);
      document.body.style.setProperty('--jrs-bg', 'transparent');
      document.body.addClass('jrs-bg-on');
    } else {
      document.body.style.setProperty('--jrs-bg-image', 'none');
      document.body.removeClass('jrs-bg-on');
    }
  }

  async activateDashboard() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_DASHBOARD);
    if (existing.length) { workspace.revealLeaf(existing[0]); return; }
    await workspace.getLeaf(true).setViewState({ type: VIEW_DASHBOARD, active: true });
  }

  async activateLibrary(topic) {
    if (topic) this.libFilterTopic = topic;
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_LIBRARY);
    const leaf = existing.length ? existing[0] : workspace.getLeaf(true);
    if (!existing.length) await leaf.setViewState({ type: VIEW_LIBRARY, active: true });
    else {
      workspace.revealLeaf(leaf);
      if (this.libFilterTopic && leaf.view instanceof LibraryView) {
        leaf.view._panel.topicFilter = this.libFilterTopic;
        this.libFilterTopic = '';
        leaf.view._panel.render();
      }
    }
  }

  /* ---------- 日记 ---------- */

  dailyPath(key) {
    const k = key || todayKey();
    const folder = this.settings.dailyFolder ? `${this.settings.dailyFolder}/` : '';
    return `${folder}${k}.md`;
  }
  findDailyNote(key) {
    const f = this.app.vault.getAbstractFileByPath(this.dailyPath(key));
    return f instanceof TFile ? f : null;
  }
  async openDailyNote(key) {
    let f = this.findDailyNote(key);
    if (!f) {
      const k = key || todayKey();
      f = await this.app.vault.create(this.dailyPath(key), `# ${k}\n\n## 今日待办\n\n## 专注记录\n`);
    }
    await this.app.workspace.getLeaf(false).openFile(f);
  }
  appendPomoToDaily(minutes) {
    try {
      const f = this.findDailyNote();
      if (f) this.app.vault.append(f, `\n- 🍅 专注 ${minutes} 分钟（${window.moment().format('HH:mm')}）`);
    } catch (e) { /* 不影响计时 */ }
  }
  todayPomoMinutes() { return (this.settings.pomoLog[todayKey()] || {}).minutes || 0; }

  async getTodayTasks() {
    const f = this.findDailyNote();
    if (!f) return [];
    const content = await this.app.vault.cachedRead(f);
    const tasks = [];
    content.split('\n').forEach((line, i) => {
      const m = line.match(/^(\s*)- \[( |x|X)\] (.+)$/);
      if (m) tasks.push({ line: i, done: m[2].toLowerCase() === 'x', text: m[3].trim() });
    });
    return tasks;
  }
  async toggleDailyTask(task) {
    const f = this.findDailyNote();
    if (!f) return;
    await this.app.vault.process(f, (content) => {
      const lines = content.split('\n');
      const t = lines[task.line];
      if (t == null) return content;
      lines[task.line] = task.done ? t.replace(/^(\s*)- \[x\]/i, '$1- [ ]') : t.replace(/^(\s*)- \[ \]/, '$1- [x]');
      return lines.join('\n');
    });
  }
  async appendDailyTask(text) {
    let f = this.findDailyNote();
    if (!f) {
      await this.openDailyNote();
      f = this.findDailyNote();
      if (!f) return;
    }
    await this.app.vault.process(f, (content) => {
      const lines = content.split('\n');
      const re = /^(\s*)- \[( |x|X)\] /;
      let last = -1;
      for (let i = 0; i < lines.length; i += 1) if (re.test(lines[i])) last = i;
      const line = `- [ ] ${text}`;
      if (last >= 0) lines.splice(last + 1, 0, line);
      else {
        const hi = lines.findIndex((l) => /^## 今日待办/.test(l));
        if (hi >= 0) lines.splice(hi + 1, 0, '', line);
        else lines.push('', '## 今日待办', '', line);
      }
      return lines.join('\n');
    });
  }

  /* ---------- 文献 ---------- */

  getPapers() {
    const folder = this.settings.libFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/') || f.path === folder);
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const topics = Array.isArray(fm.topics) ? fm.topics : (typeof fm.topics === 'string' && fm.topics ? [fm.topics] : []);
      const authors = Array.isArray(fm.authors) ? fm.authors.join(', ') : (fm.authors || '');
      const arr = authors.split(/[,，;；]/).filter(Boolean);
      const progressRaw = fm.reading_progress ?? fm.progress ?? 0;
      return {
        file: f, path: f.path, added: f.stat.ctime,
        title: fm.title || f.basename,
        authors, authorsShort: arr.length ? arr[0] + (arr.length > 1 ? ' 等' : '') : '',
        year: fm.year ? String(fm.year) : '',
        venue: fm.venue || '',
        status: STATUSES.includes(fm.status) ? fm.status : '待读',
        priority: PRIORITIES.includes(fm.priority) ? fm.priority : '',
        topics: topics.filter(Boolean),
        rating: typeof fm.rating === 'number' ? fm.rating : 0,
        progress: Math.max(0, Math.min(100, Number(progressRaw) || 0)),
        pdf: fm.pdf || '',
        summary: typeof fm.summary === 'string' ? fm.summary : '',
        project: typeof fm.project === 'string' ? fm.project : '',
      };
    });
  }

  getPapersSorted(sort) {
    const papers = this.getPapers();
    if (sort === 'year') return papers.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));
    if (sort === 'title') return papers.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    if (sort === 'rating') return papers.sort((a, b) => b.rating - a.rating);
    if (sort === 'priority') {
      const rank = { 高: 0, 中: 1, 低: 2, '': 3 };
      return papers.sort((a, b) => rank[a.priority] - rank[b.priority] || b.rating - a.rating);
    }
    return papers.sort((a, b) => b.added - a.added);
  }

  papersAddedThisWeek() {
    const weekAgo = Date.now() - 7 * 86400 * 1000;
    return this.getPapers().filter((p) => p.added >= weekAgo).length;
  }

  /** 进度推进：>0 自动转阅读中，=100 自动转已完成 */
  async bumpProgress(p, delta) {
    const next = Math.max(0, Math.min(100, p.progress + delta));
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      fm.reading_progress = next;
      if (next >= 100) fm.status = '已完成';
      else if (next > 0 && (fm.status === '待读' || !fm.status)) fm.status = '阅读中';
    });
  }

  async ensureFolder(path) {
    if (!path) return;
    const parts = normalizePath(path).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur);
    }
  }

  async createPaperNote(data, open = true) {
    const folder = this.settings.libFolder;
    await this.ensureFolder(folder);
    const name = sanitizeFilename(data.title) || `文献 ${todayKey()}`;
    let path = `${folder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${name} (${todayKey()}).md`;
    const pdfVal = toPosix(data.pdf || '');
    const fm = [
      '---',
      `title: "${String(data.title).replace(/"/g, "'")}"`,
      data.authors ? `authors: "${String(data.authors).replace(/"/g, "'")}"` : 'authors: ""',
      data.year ? `year: ${data.year}` : 'year: ',
      data.venue ? `venue: "${String(data.venue).replace(/"/g, "'")}"` : 'venue: ""',
      `status: ${data.status || '待读'}`,
      data.priority ? `priority: ${data.priority}` : 'priority: ',
      data.topics && data.topics.length ? `topics: [${data.topics.map((t) => `"${t}"`).join(', ')}]` : 'topics: []',
      'rating: 0',
      'reading_progress: 0',
      pdfVal ? `pdf: "${pdfVal.replace(/"/g, "'")}"` : 'pdf: ""',
      `added: ${todayKey()}`,
      '---',
      '',
    ].join('\n');
    const pdfLink = pdfVal && !isHttp(pdfVal) && !isExternalPath(pdfVal) ? `\n📎 原文：[[${pdfVal.split('/').pop()}]]\n` : '';
    const body = [
      `# ${data.title}`, '', pdfLink.trim(),
      '## 一句话总结', '', '## 问题设定（卫星/目标/约束）', '',
      '## 网格 / 方法如何使用', '', '## 求解算法', '',
      '## 可借鉴点', '', '## 疑问与待办', '- [ ] ', '',
    ].join('\n');
    const file = await this.app.vault.create(path, fm + body);
    if (open) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async setPaperStatus(p, status) {
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      fm.status = status;
      if (status === '已完成') fm.reading_progress = 100;
    });
  }
  async setPaperRating(p, rating) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.rating = rating; }); }
  async setPaperPriority(p, priority) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.priority = priority || ''; }); }
  openPaper(p) { this.app.workspace.getLeaf(false).openFile(p.file); }

  async openReading(p) {
    await this.app.workspace.getLeaf(false).openFile(p.file);
    const pdf = p.pdf;
    if (!pdf || isHttp(pdf)) { if (isHttp(pdf)) window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) {
      const right = this.app.workspace.getRightLeaf(false);
      await right.openFile(f, { active: false });
    } else new Notice('PDF 不在库内：可用「PDF 入库」迁移后分栏阅读');
  }

  openPdf(pdf) {
    if (!pdf) return;
    if (isHttp(pdf)) { window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) { this.app.workspace.getLeaf(false).openFile(f); return; }
    if (isExternalPath(pdf)) {
      try {
        const electron = window.require && window.require('electron');
        if (electron?.shell?.openPath) { electron.shell.openPath(pdf); return; }
      } catch (e) { /* fallthrough */ }
      try { if (this.app.openWithDefaultApp) { this.app.openWithDefaultApp(pdf); return; } } catch (e) { /* fallthrough */ }
      navigator.clipboard?.writeText(pdf);
      new Notice('已复制 PDF 路径');
      return;
    }
    new Notice(`找不到 PDF：${pdf}`);
  }

  /* ---------- 批量导入 ---------- */

  async importPdfFolder(folderPath, recursive, copyIntoVault, onProgress) {
    if (!window.require) throw new Error('仅桌面端支持');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    if (!fs.existsSync(folderPath)) throw new Error(`文件夹不存在：${folderPath}`);
    const pdfs = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) { if (recursive) walk(full); }
        else if (/\.pdf$/i.test(e.name)) pdfs.push(full);
      }
    };
    walk(folderPath);
    if (!pdfs.length) throw new Error('没有找到 PDF');
    if (copyIntoVault) await this.ensureFolder(this.settings.pdfFolder);
    const existing = new Set(this.getPapers().map((p) => p.title.toLowerCase()));
    const res = { created: 0, skipped: 0, failed: 0 };
    for (let i = 0; i < pdfs.length; i += 1) {
      const full = pdfs[i];
      const base = pathMod.basename(full);
      const { title, year } = guessFromFilename(base);
      onProgress(`(${i + 1}/${pdfs.length}) ${title.slice(0, 40)}…`);
      if (existing.has(title.toLowerCase())) { res.skipped += 1; continue; }
      try {
        let pdfField = toPosix(full);
        if (copyIntoVault) {
          const rel = `${this.settings.pdfFolder}/${base}`;
          if (!(this.app.vault.getAbstractFileByPath(rel) instanceof TFile)) {
            const buf = fs.readFileSync(full);
            const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            await this.app.vault.adapter.writeBinary(normalizePath(rel), ab);
          }
          pdfField = rel;
        }
        await this.createPaperNote({ title, year, authors: '', venue: '', status: '待读', topics: [], pdf: pdfField }, false);
        existing.add(title.toLowerCase());
        res.created += 1;
      } catch (e) { console.error('[JRS] 导入失败', full, e); res.failed += 1; }
    }
    return res;
  }

  async migrateExternalPdfs() {
    if (!window.require) { new Notice('仅桌面端支持'); return; }
    const fs = window.require('fs');
    const papers = this.getPapers().filter((p) => p.pdf && isExternalPath(p.pdf));
    if (!papers.length) { new Notice('没有外部路径的 PDF'); return; }
    await this.ensureFolder(this.settings.pdfFolder);
    let ok = 0; let fail = 0;
    new Notice(`开始迁移 ${papers.length} 个 PDF…`);
    for (const p of papers) {
      try {
        const base = toPosix(p.pdf).split('/').pop();
        const rel = `${this.settings.pdfFolder}/${base}`;
        if (!(this.app.vault.getAbstractFileByPath(rel) instanceof TFile)) {
          const buf = fs.readFileSync(p.pdf);
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          await this.app.vault.adapter.writeBinary(normalizePath(rel), ab);
        }
        await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.pdf = rel; });
        const content = await this.app.vault.cachedRead(p.file);
        if (!content.includes(`[[${base}]]`)) {
          await this.app.vault.modify(p.file, content.replace(/^# .+\n/, (m) => `${m}\n📎 原文：[[${base}]]\n`));
        }
        ok += 1;
      } catch (e) { fail += 1; console.error('[JRS] PDF 迁移失败', p.pdf, e); }
    }
    new Notice(`迁移完成：成功 ${ok}，失败 ${fail}`);
  }

  /* ---------- arXiv ---------- */

  async fetchArxiv(force = false) {
    const cache = this.settings.arxivCache;
    if (!force && cache?.ts && Date.now() - cache.ts < 12 * 3600 * 1000 && cache.items?.length) {
      return { ...cache, justFetched: false };
    }
    try {
      const q = this.settings.arxivQuery.trim().split(/\s+/).map(encodeURIComponent).join('+');
      const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${Math.max(this.settings.arxivMax, 10)}`;
      const resp = await requestUrl({ url, method: 'GET', throw: false });
      if (resp.status !== 200) throw new Error(`arXiv 返回 ${resp.status}`);
      const doc = new DOMParser().parseFromString(resp.text, 'text/xml');
      const items = [...doc.querySelectorAll('entry')].map((en) => {
        const pick = (sel) => en.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const alt = [...en.querySelectorAll('link')].find((l) => l.getAttribute('type') === 'text/html')?.getAttribute('href')
          || [...en.querySelectorAll('link')].pop()?.getAttribute('href') || '';
        return {
          title: pick('title'),
          date: pick('published').slice(0, 10),
          authors: [...en.querySelectorAll('author > name')].slice(0, 3).map((a) => a.textContent.trim()).join(', '),
          url: alt,
          summary: pick('summary').slice(0, 300),
        };
      }).filter((x) => x.title);
      this.settings.arxivCache = { ts: Date.now(), items };
      await this.saveSettings();
      return { ...this.settings.arxivCache, justFetched: true };
    } catch (e) {
      console.error('[JRS] arXiv 获取失败', e);
      return { ts: cache?.ts || 0, items: cache?.items || [], justFetched: false };
    }
  }

  async ensureArxivFresh() {
    const before = this.settings.arxivCache?.ts || 0;
    const result = await this.fetchArxiv(false);
    if ((result?.ts || 0) > before && result.items?.length) {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)[0];
      if (leaf?.view instanceof DashboardView && leaf.view.section === 'home') leaf.view.softRefresh('arxiv');
    }
    return result;
  }

  async arxivToLibrary(it) {
    const year = it.date ? it.date.slice(0, 4) : '';
    const topics = this.settings.topics.filter((t) => `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title, authors: it.authors, year, venue: 'arXiv',
      status: '待读', topics: topics.slice(0, 3),
      pdf: it.url ? it.url.replace('/abs/', '/pdf/') : '',
    }, false);
  }

  /* ---------- AI ---------- */

  async aiChat(system, user, maxTokens = 900) {
    const ai = this.settings.ai;
    if (!ai.apiKey) throw new Error('请先在 设置 → AI 助手 填写 API Key');
    const resp = await requestUrl({
      url: `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3, max_tokens: maxTokens,
      }),
      throw: false,
    });
    if (resp.status !== 200) throw new Error(`API ${resp.status}：${(resp.text || '').slice(0, 120)}`);
    const out = resp.json?.choices?.[0]?.message?.content || '';
    if (!out) throw new Error('模型返回为空');
    return out;
  }

  async readPaperBody(paper) {
    const content = await this.app.vault.cachedRead(paper.file);
    return content.split('---').slice(2).join('---').slice(0, 4000);
  }

  async aiSummarize(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是严谨的科研助理。根据文献笔记生成四个部分的简明中文要点。只输出 markdown 正文。',
      `文献笔记：\n${source}\n\n请输出（使用这些确切标题）：\n## 一句话总结\n## 问题设定（卫星/目标/约束）\n## 求解算法\n## 可借鉴点`,
    );
    const content = await this.app.vault.cachedRead(paper.file);
    let c = content;
    ['一句话总结', '问题设定（卫星/目标/约束）', '求解算法', '可借鉴点'].forEach((h) => {
      const m = out.match(new RegExp(`## ${h.replace(/[()]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
      if (m && m[1].trim()) c = replaceSection(c, h, m[1].trim());
    });
    await this.app.vault.modify(paper.file, c);
    new Notice('AI 摘要已写入 ✨');
    await this.app.workspace.getLeaf(false).openFile(paper.file);
  }

  async aiGuide(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是导师，为研究生生成论文导读问题。只输出 markdown 正文。',
      `文献：\n${source}\n\n生成 10 个帮助深入理解该论文的问题，每题附 2-3 句参考答案。格式：\n## 导读十问\n1. **问题**\n   - 参考：…`,
      1400,
    );
    const content = await this.app.vault.cachedRead(paper.file);
    const m = out.match(/## 导读十问[\s\S]*/);
    await this.app.vault.modify(paper.file, replaceSection(content, '导读十问', (m ? m[0] : out).replace(/^## 导读十问\s*\n/, '')));
    new Notice('导读十问已生成 ❓');
    await this.app.workspace.getLeaf(false).openFile(paper.file);
  }

  async aiMetadata(paper) {
    const content = await this.app.vault.cachedRead(paper.file);
    const body = content.split('---').slice(2).join('---').slice(0, 2000);
    const out = await this.aiChat(
      '从文献信息推断元数据，只输出 JSON。',
      `标题与内容：\n${paper.title}\n${body}\n\n输出 JSON：{"authors":"第一作者等","year":"2024","venue":"期刊/会议","priority":"高|中|低","topics":["从候选中选：${this.settings.topics.join('/')}"],"summary":"一句话中文总结"}`,
      500,
    );
    let m;
    try { m = JSON.parse(out.replace(/```json|```/g, '').trim()); } catch (e) { throw new Error('模型输出无法解析为 JSON'); }
    await this.app.fileManager.processFrontMatter(paper.file, (fm) => {
      if (m.authors && (!fm.authors || fm.authors === '""')) fm.authors = String(m.authors).slice(0, 120);
      if (m.year && !fm.year) fm.year = String(m.year).slice(0, 4);
      if (m.venue && (!fm.venue || fm.venue === '""')) fm.venue = String(m.venue).slice(0, 80);
      if (m.priority && PRIORITIES.includes(m.priority)) fm.priority = m.priority;
      if (Array.isArray(m.topics)) {
        const valid = m.topics.filter((t) => this.settings.topics.includes(t)).slice(0, 4);
        if (valid.length) fm.topics = valid;
      }
      if (m.summary) fm.summary = String(m.summary).slice(0, 200);
    });
    if (m.summary) {
      const c = await this.app.vault.cachedRead(paper.file);
      await this.app.vault.modify(paper.file, replaceSection(c, '一句话总结', m.summary));
    }
    return m;
  }

  async aiSynthesis(topic, n, goal) {
    const papers = this.getPapers()
      .filter((p) => topic === '' || p.topics.includes(topic))
      .sort((a, b) => (b.topics.includes(topic) ? 1 : 0) - (a.topics.includes(topic) ? 1 : 0) || b.rating - a.rating)
      .slice(0, n);
    if (papers.length < 2) throw new Error(`「${topic}」方向文献不足 2 篇`);
    const digest = papers.map((p, i) => `[${i + 1}] ${p.title}（${p.year || '年份未知'}${p.venue ? ', ' + p.venue : ''}）${p.summary || p.topics.join('/')}`).join('\n');
    const out = await this.aiChat(
      '你是撰写文献综述的科研助理。基于给定文献输出结构化中文综述（markdown），结论标注来源编号。',
      `主题：${topic}\n研究目标：${goal || '围绕主题展开'}\n文献列表：\n${digest}\n\n输出结构：\n## 当前结论\n## 共同认识\n## 分歧与对比\n## 方法比较（表格）\n## 研究空白\n## 下一步建议`,
      2000,
    );
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/') || '';
    const path = `${dir ? dir + '/' : ''}AI 综述 - ${topic} ${todayKey()}.md`;
    const content = [
      `# AI 综述 · ${topic}`, '',
      `> 生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 纳入 ${papers.length} 篇 · 模型 ${this.settings.ai.model}`,
      `> 文献：${papers.map((p, i) => `[[${p.file.basename}|${i + 1}]]`).join(' ')}`, '', out, '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) { await this.app.vault.modify(old, content); return old; }
    return await this.app.vault.create(path, content);
  }

  /* ---------- MinerU ---------- */

  async mineruExtract(paper) {
    if (!window.require) throw new Error('仅桌面端支持');
    const { exec } = window.require('child_process');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    const content = await this.app.vault.cachedRead(paper.file);
    const fmPdf = (content.match(/^pdf: "(.*)"$/m) || [])[1] || '';
    if (!fmPdf) throw new Error('该笔记没有 pdf 字段');
    if (isHttp(fmPdf)) throw new Error('在线 PDF 请先下载入库');
    const basePath = this.app.vault.adapter?.basePath;
    let absPdf = fmPdf;
    if (!isExternalPath(fmPdf)) {
      if (!basePath) throw new Error('无法定位库路径');
      absPdf = pathMod.join(basePath, normalizePath(fmPdf));
    }
    if (!fs.existsSync(absPdf)) throw new Error(`PDF 不存在：${absPdf}`);
    const outDir = pathMod.join(basePath, '.jrs-tmp', `mineru-${Date.now()}`);
    new Notice('MinerU 解析中，可能需要几分钟…');
    await new Promise((resolve, reject) => {
      exec(`"${this.settings.mineruCmd}" -p "${absPdf}" -o "${outDir}"`, {
        timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${String(stderr).slice(0, 200)}`));
        else resolve(stdout);
      });
    });
    const findMd = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) { const r = findMd(full); if (r) return r; }
        else if (/\.md$/i.test(e.name)) return full;
      }
      return null;
    };
    const md = findMd(outDir);
    if (!md) throw new Error('未找到 MinerU 输出');
    let text = fs.readFileSync(md, 'utf-8');
    if (text.length > 60000) text = `${text.slice(0, 60000)}\n\n…（过长已截断）`;
    await this.app.vault.modify(paper.file, replaceSection(content, '原文提取（MinerU）', text));
    new Notice('MinerU 解析已写入 ✅');
  }

  /* ---------- 研究问题 ---------- */

  async getQuestions() {
    const folder = this.settings.questionsFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/'));
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      return {
        file: f, added: f.stat.ctime,
        question: fm.question || f.basename,
        status: fm.status === 'answered' ? 'answered' : 'open',
      };
    }).sort((a, b) => b.added - a.added);
  }

  async createQuestion(q, related = '') {
    await this.ensureFolder(this.settings.questionsFolder);
    const name = sanitizeFilename(q);
    let path = `${this.settings.questionsFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${this.settings.questionsFolder}/${name} ${todayKey()}.md`;
    const rel = related.split(/[,，;；]/).map((x) => x.trim()).filter(Boolean)
      .map((x) => `[[${x}]]`).join(' ');
    const content = [
      '---',
      `question: "${q.replace(/"/g, "'")}"`,
      'status: open',
      `created: ${todayKey()}`,
      '---',
      '',
      `# ${q}`,
      '',
      rel ? `相关文献：${rel}` : '',
      '',
      '## 背景',
      '',
      '## 尝试 / 思路',
      '',
      '## 结论',
      '',
    ].filter((x) => x !== undefined).join('\n');
    return await this.app.vault.create(path, content);
  }

  async toggleQuestion(q) {
    await this.app.fileManager.processFrontMatter(q.file, (fm) => {
      fm.status = fm.status === 'answered' ? 'open' : 'answered';
    });
  }

  /* ---------- 知识问答（ima 式 grounding + 引用） ---------- */

  async aiAsk(question) {
    if (!this.settings.ai.apiKey) throw new Error('请先在 设置 → AI 助手 配置 API Key');
    const papers = this.getPapers();
    if (!papers.length) throw new Error('文献库为空');
    /* 简易分词：英文词 + 中文 bigram，去停用词 */
    const stop = new Set(['如何', '哪些', '什么', '作用', '方法', '问题', '研究', '一个', '可以', '以及', '常用', '进行', '之间', '对于']);
    const latin = (question.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []);
    const cjkRaw = question.match(/[\u4e00-\u9fff]{2,}/g) || [];
    const terms = new Set();
    latin.forEach((w) => terms.add(w));
    cjkRaw.forEach((seg) => {
      for (let i = 0; i + 2 <= seg.length; i += 1) {
        const g = seg.slice(i, i + 2);
        if (!stop.has(g)) terms.add(g);
      }
    });
    const scored = papers.map((p) => {
      let s = 0;
      const title = p.title.toLowerCase();
      const sum = (p.summary || '').toLowerCase();
      const topics = p.topics.join(' ').toLowerCase();
      terms.forEach((t) => {
        if (title.includes(t)) s += 3;
        if (topics.includes(t)) s += 2;
        if (sum.includes(t)) s += 1;
      });
      s += p.rating * 0.3 + (p.priority === '高' ? 1 : p.priority === '中' ? 0.5 : 0) + (p.status === '已完成' ? 0.5 : 0);
      return { p, s };
    }).filter((x) => x.s > 1).sort((a, b) => b.s - a.s).slice(0, 6);
    const picked = scored.length ? scored.map((x) => x.p) : papers.slice(0, 4);
    const ctx = picked.map((p, i) => `[${i + 1}] ${p.title}（${p.year || ''}${p.venue ? ' · ' + p.venue : ''}）方向: ${p.topics.join('/') || '未标注'} 摘要: ${p.summary || p.authorsShort || '（详见笔记，摘要未生成）'}`).join('\n');
    const out = await this.aiChat(
      '你是严谨的科研助理。只依据给定文献回答，关键结论后用 [n] 标注来源编号；文献不足以回答时明确说明。用中文，输出 markdown 要点。',
      `问题：${question}\n\n文献：\n${ctx}\n\n输出：直接给答案（可分点），关键处标注 [n]。`,
      1200,
    );
    return { q: question, a: out, sources: picked };
  }

  async appendAnswerToQuestion(q, a) {
    const name = sanitizeFilename(q);
    const f = this.app.vault.getAbstractFileByPath(`${this.settings.questionsFolder}/${name}.md`)
      || this.app.vault.getAbstractFileByPath(`${this.settings.questionsFolder}/${name} ${todayKey()}.md`);
    if (!(f instanceof TFile)) return null;
    await this.app.vault.append(f, `\n## AI 解答（${window.moment().format('M月D日 HH:mm')}）\n\n${a}\n`);
    return f;
  }

  /* ---------- 快速捕获（ima 收藏哲学） ---------- */

  async captureThought(text) {
    await this.ensureFolder(this.settings.inboxFolder);
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\n\n`);
    await this.app.vault.append(f, `\n- ${window.moment().format('HH:mm')} ${text}`);
    return f;
  }

  async getInboxToday() {
    const f = this.app.vault.getAbstractFileByPath(`${this.settings.inboxFolder}/${todayKey()}.md`);
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    return content.split('\n').filter((l) => /^- \d{2}:\d{2} /.test(l.trim())).map((l) => l.trim().replace(/^- \d{2}:\d{2} /, ''));
  }

  /* ---------- 投稿管线 ---------- */

  getSubmissions() {
    const folder = this.settings.submissionsFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/'));
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      return {
        file: f, added: f.stat.ctime,
        title: fm.title || f.basename,
        target: fm.target || '',
        status: SUB_STATUSES.includes(fm.status) ? fm.status : '写作中',
        deadline: fm.deadline || '',
        note: fm.note || '',
      };
    }).sort((a, b) => b.added - a.added);
  }

  async createSubmission(title, target, deadline = '', note = '') {
    await this.ensureFolder(this.settings.submissionsFolder);
    const name = sanitizeFilename(`${title} - ${target}`);
    let path = `${this.settings.submissionsFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${this.settings.submissionsFolder}/${name} ${todayKey()}.md`;
    const j = JOURNALS.find((x) => x.abbr === target);
    const content = [
      '---',
      `title: "${title.replace(/"/g, "'")}"`,
      `target: ${target}`,
      'status: 写作中',
      deadline ? `deadline: ${deadline}` : 'deadline: ',
      `created: ${todayKey()}`,
      '---',
      '',
      `# ${title}`,
      '',
      `🎯 目标期刊：**${target}**${j ? `（${j.name}，${j.tag}）` : ''}`,
      '',
      j ? `> 匹配点：${j.match}。${j.note}。${j.link ? `投稿入口：${j.link}` : ''}` : '',
      '',
      '## 核心贡献（3 条以内）',
      '- ',
      '',
      '## 写作计划',
      '- [ ] 模型与符号表',
      '- [ ] 算法框架图',
      '- [ ] 计算实验与对比基线',
      '- [ ] 引言与文献综述（联动文献矩阵）',
      '- [ ] 全文润色与格式（期刊模板）',
      '',
      '## 审稿意见与回应',
      '',
      note ? `## 备注\n${note}` : '',
    ].filter((x) => x !== undefined).join('\n');
    const f = await this.app.vault.create(path, content);
    return f;
  }

  async cycleSubmission(s) {
    await this.app.fileManager.processFrontMatter(s.file, (fm) => {
      fm.status = SUB_STATUSES[(SUB_STATUSES.indexOf(fm.status) + 1) % SUB_STATUSES.length];
    });
  }

  /* ---------- 论文图谱（Canvas 生成） ---------- */

  graphStats() {
    const papers = this.getPapers();
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const edges = papers.reduce((a, p) => a + p.topics.filter((t) => topics.includes(t)).length, 0);
    return { topics: topics.length, papers: papers.length, edges };
  }

  async generateGraphCanvas(open) {
    const papers = this.getPapers();
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const nodes = []; const edges = [];
    /* 主题节点：横向一排居中 */
    const T_W = 260; const T_H = 60; const T_GAP = 60;
    const rowW = topics.length * (T_W + T_GAP) - T_GAP;
    topics.forEach((t, i) => {
      nodes.push({
        id: `topic-${i}`, type: 'text', text: `## ${t}`,
        x: -rowW / 2 + i * (T_W + T_GAP), y: -520, width: T_W, height: T_H, color: '3',
      });
    });
    /* 论文节点：按主题列向下堆叠 */
    const P_W = 280; const P_H = 80; const P_GAP = 26;
    topics.forEach((t, ti) => {
      const items = papers.filter((p) => p.topics.includes(t));
      items.forEach((p, pi) => {
        const nid = `paper-${ti}-${pi}`;
        nodes.push({
          id: nid, type: 'text',
          text: `[[${p.file.basename}|${p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}]]\n${p.status}${p.year ? ' · ' + p.year : ''}`,
          x: -rowW / 2 + ti * (T_W + T_GAP) - 10, y: -420 + pi * (P_H + P_GAP),
          width: P_W, height: P_H,
          color: p.status === '已完成' ? '6' : p.status === '阅读中' ? '5' : '0',
        });
        edges.push({ id: `e-${nid}`, fromNode: `topic-${ti}`, fromSide: 'bottom', toNode: nid, toSide: 'top', color: '1' });
      });
    });
    const canvas = { nodes, edges, fmtMd: true };
    const path = this.settings.graphCanvas;
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) await this.app.vault.modify(old, JSON.stringify(canvas, null, 1));
    else { await this.ensureFolder(path.split('/').slice(0, -1).join('/')); await this.app.vault.create(path, JSON.stringify(canvas, null, 1)); }
    new Notice(`图谱已生成：${topics.length} 主题 · ${papers.length} 论文`);
    if (open) await this.openGraphCanvas();
  }

  async openGraphCanvas() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.graphCanvas);
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }

  /* ---------- Bases ---------- */

  async generateBases() {
    const dir = this.settings.basesFolder;
    await this.ensureFolder(dir);
    const mk = async (name, yaml) => {
      const p = `${dir}/${name}.base`;
      const old = this.app.vault.getAbstractFileByPath(p);
      if (old instanceof TFile) await this.app.vault.modify(old, yaml);
      else await this.app.vault.create(p, yaml);
    };
    await mk('文献库', baseFile([`file.inFolder("${this.settings.libFolder}")`], [
      { name: '收件箱（待读）', filters: [`status == "待读"`], order: ['priority', 'file.name', 'authors', 'year'] },
      { name: '阅读中', filters: [`status == "阅读中"`], order: ['file.name', 'reading_progress'] },
      { name: '已完成', filters: [`status == "已完成"`], order: ['rating', 'file.name', 'year'] },
      { name: '全部文献', order: ['file.name', 'authors', 'year', 'status', 'priority', 'rating', 'topics'] },
    ]));
    await mk('阅读队列', baseFile([`file.inFolder("${this.settings.libFolder}")`], [
      { name: '高优先级', filters: [`priority == "高"`, `status != "已归档"`], order: ['status', 'file.name'] },
      { name: '进行中', filters: [`status == "阅读中"`], order: ['file.name'] },
      { name: '近期添加', order: ['added', 'file.name'] },
    ]));
    new Notice(`Bases 已生成 → ${dir}/`);
    const f = this.app.vault.getAbstractFileByPath(`${dir}/文献库.base`);
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }

  /* ---------- 综述 ---------- */

  surveyExists() { return !!this.app.vault.getAbstractFileByPath(this.settings.surveyNote); }

  async ensureSurveyNote(open) {
    if (this.surveyExists()) { if (open) await this.openSurveyNote(); return; }
    const outline = [
      '# 网格热力驱动的卫星任务规划 · 综述大纲', '',
      '> 用 `- [ ]` 勾选进度，研究进展区段会按 `##` 章节统计完成度。', '',
      '## 1. 引言', '- [ ] 研究背景与意义', '- [ ] 综述范围与文献检索策略', '- [ ] 全文组织结构', '',
      '## 2. 网格切分体系', '- [ ] 全球剖分模型（GeoSOT / H3 / 等经纬度网格）', '- [ ] 时空网格表征与编码', '- [ ] 网格尺度选择与自适应剖分', '',
      '## 3. 网格方法如何辅助规划', '- [ ] 仅用于任务生成：传统范式未变（点目标 → 元任务 → 组合优化）', '- [ ] 网格表征区域目标与覆盖需求', '- [ ] 网格热力驱动的范式演进（热力图 → 规划输入 → 反馈闭环）', '',
      '## 4. 求解算法', '- [ ] 精确算法（分支定界 / 列生成 / MILP）', '- [ ] 元启发式与进化算法（遗传 / 差分进化 / 模因算法）', '- [ ] 深度强化学习方法', '- [ ] 大模型驱动与智能体方法', '',
      '## 5. 问题设定分类', '- [ ] 成像卫星（常规 / 敏捷）', '- [ ] 电磁探测卫星', '- [ ] 巨星座与天临空协同', '',
      '## 6. 实验基准与数据集', '- [ ] 常用测试集与评价指标', '',
      '## 7. 挑战与展望', '- [ ] 开放问题', '- [ ] 未来研究方向', '',
    ].join('\n');
    await this.ensureFolder(this.settings.surveyNote.split('/').slice(0, -1).join('/'));
    const f = await this.app.vault.create(this.settings.surveyNote, outline);
    new Notice('综述大纲已初始化 ✅');
    if (open) await this.app.workspace.getLeaf(false).openFile(f);
  }

  async openSurveyNote() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }

  async getSurveyProgress() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    const sections = []; let cur = null;
    for (const line of content.split('\n')) {
      const h = line.match(/^## (.+)/);
      if (h) { cur = { name: h[1].trim(), done: 0, total: 0 }; sections.push(cur); continue; }
      const t = line.match(/^(\s*)- \[( |x|X)\] /);
      if (t && cur) { cur.total += 1; if (t[2].toLowerCase() === 'x') cur.done += 1; }
    }
    return sections.filter((s) => s.total > 0);
  }

  /* ---------- 文献矩阵 ---------- */

  async generateMatrix() {
    const papers = this.getPapersSorted('year');
    if (!papers.length) { new Notice('文献库为空'); return; }
    const rows = [
      '| 文献 | 年份 | 来源 | 方向 | 状态 | 优先级 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = p.title.replace(/\|/g, '\\|');
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      rows.push(`| ${link} | ${p.year || '—'} | ${p.venue || '—'} | ${p.topics.join('、') || '—'} | ${p.status} | ${p.priority || '—'} | ${'★'.repeat(p.rating) || '—'} |  |  |  |`);
    }
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/');
    const matrixPath = `${dir ? dir + '/' : ''}文献矩阵.md`;
    const content = [
      '# 文献矩阵', '',
      `> 自动生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 共 ${papers.length} 篇。后三列留给精读填写。`, '',
      rows.join('\n'), '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(matrixPath);
    if (old instanceof TFile) { await this.app.vault.modify(old, content); await this.app.workspace.getLeaf(false).openFile(old); }
    else { await this.app.workspace.getLeaf(false).openFile(await this.app.vault.create(matrixPath, content)); }
    new Notice(`文献矩阵已生成（${papers.length} 篇）`);
  }
};
