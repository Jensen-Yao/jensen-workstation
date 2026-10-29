/* ==========================================================================
 * Jensen 科研工作站 v0.3.0
 *
 * v0.3 重构要点（认真学完两个参照插件的源码之后）：
 *  - 拖拽引擎：借鉴 Hearth src/grid.ts —— 卡片带 x/y/w/h 网格坐标，
 *    绝对定位看板 + 指针拖动/角部缩放 + 网格吸附 + 「排版模式」开关
 *  - 卡片可编辑：每张卡有 ⚙ 配置弹窗（标题/专属参数），排版模式下可拖可缩放
 *  - Hero 页头：大标题「Jensen 科研工作站」+ 顶部留白 + 全局搜索
 *  - 外观工作室：模糊量/卡片不透明度/圆角/间距/背景暗化/列数/自定义强调色
 *    全部可调（对应 Research OS 的自适应皮肤 + Hearth 的卡片外观调节）
 *  - Research OS 功能对齐：Bases 数据库生成（文献库/阅读队列）、
 *    priority/relevance 元数据、AI 元数据补全、AI 导读十问、AI 跨论文综述、
 *    分栏阅读（笔记+PDF 并排）
 *  - 致谢：Hearth (MIT) / Research OS (MIT)，见 README
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

/** 看板网格：列数可在设置调整（4-10），行高固定基准 */
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

/** 内置卡片：默认尺寸（网格单位）与可选配置字段 */
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
  dailyFolder: '',
  surveyNote: '科研工作台/综述大纲.md',
  pomoWork: 25,
  pomoBreak: 5,
  pomoLongBreak: 15,
  pomoLongEvery: 4,
  researchStart: '',
  topics: [...DEFAULT_TOPICS],
  /* 布局（v0.3）：{ [cardId]: {x,y,w,h} }，网格单位 */
  layout: {},
  hiddenCards: [],
  customCards: [],
  cardTitles: {},
  cardCfg: {},
  pomoLog: {},
  /* 外观工作室 */
  accent: 'blue',
  accentCustom: '',
  glass: true,
  blurPx: 18,
  cardAlpha: 70,
  radiusPx: 16,
  gapPx: 14,
  bgDim: 30,
  columns: DEFAULT_COLS,
  bgMode: 'image',
  bgColor: '#e8edf7',
  bgImage: '',
  /* arXiv */
  arxivQuery: 'all:"satellite scheduling" OR all:"earth observation scheduling"',
  arxivMax: 8,
  arxivCache: null,
  /* AI */
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

/** 生成 .base 文件内容（借鉴 Research OS 的 Bases 数据库，YAML 结构一致） */
function baseFile(name, filters, views) {
  return [
    `filters:`,
    `  and:`,
    ...filters.map((f) => `    - ${f}`),
    `properties:`,
    `  file.name:`,
    `    displayName: 名称`,
    `  authors:`,
    `    displayName: 作者`,
    `  year:`,
    `    displayName: 年份`,
    `  status:`,
    `    displayName: 状态`,
    `  priority:`,
    `    displayName: 优先级`,
    `  rating:`,
    `    displayName: 评分`,
    `  topics:`,
    `    displayName: 研究方向`,
    `views:`,
    ...views.flatMap((v) => [
      `  - type: table`,
      `    name: ${v.name}`,
      ...(v.filters ? [`    filters:`, `      and:`, ...v.filters.map((f) => `        - ${f}`)] : []),
      `    order:`,
      ...v.order.map((o) => `      - ${o}`),
    ]),
  ].join('\n') + '\n';
}

/* ==========================================================================
 * 番茄钟引擎（v0.2 保持）
 * ========================================================================== */

class PomoEngine {
  constructor(plugin) {
    this.plugin = plugin;
    this.phase = 'idle';
    this.total = 0;
    this.left = 0;
    this.completedToday = this.countToday();
    this.listeners = new Set();
    this._timer = null;
  }
  onTick(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  countToday() {
    const t = (this.plugin.settings.pomoLog || {})[todayKey()] || {};
    return t.count || 0;
  }
  start() {
    const s = this.plugin.settings;
    if (this.phase !== 'idle') return;
    this.phase = 'work';
    this.total = s.pomoWork * 60;
    this.left = this.total;
    this.emit();
    this._run();
  }
  _run() {
    this._clear();
    this._timer = window.setInterval(() => {
      this.left -= 1;
      if (this.left <= 0) this._complete();
      else this.emit();
    }, 1000);
    this.plugin.registerInterval(this._timer);
  }
  _clear() { if (this._timer) { window.clearInterval(this._timer); this._timer = null; } }
  _complete() {
    this._clear();
    const s = this.plugin.settings;
    if (this.phase === 'work') {
      const log = s.pomoLog || (s.pomoLog = {});
      const key = todayKey();
      const t = log[key] || (log[key] = { count: 0, minutes: 0 });
      t.count += 1;
      t.minutes = (t.minutes || 0) + s.pomoWork;
      this.completedToday = t.count;
      this.plugin.saveSettings();
      this.plugin.appendPomoToDaily(s.pomoWork);
      const long = t.count % Math.max(1, s.pomoLongEvery) === 0;
      new Notice(`🍅 专注完成！${long ? '休息长一点吧' : `休息 ${s.pomoBreak} 分钟`}`);
      this.phase = long ? 'longbreak' : 'break';
      this.total = (long ? s.pomoLongBreak : s.pomoBreak) * 60;
      this.left = this.total;
      this._run();
    } else {
      new Notice('☕ 休息结束，继续冲刺！');
      this.phase = 'idle';
      this.left = 0;
      this.total = 0;
    }
    this.emit();
  }
  reset() { this._clear(); this.phase = 'idle'; this.left = 0; this.total = 0; this.emit(); }
  get progress() { return this.total ? 1 - this.left / this.total : 0; }
  clockText() {
    const m = Math.floor(this.left / 60);
    const s = this.left % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  phaseText() {
    return { idle: '准备专注', work: '专注中', break: '小憩', longbreak: '长休' }[this.phase] || '';
  }
  destroy() { this._clear(); }
}

/* ==========================================================================
 * 仪表盘视图（自由看板 + 拖拽/缩放 + 排版模式）
 * ========================================================================== */

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.calMoment = window.moment();
    this.editing = false;
    this._unsub = plugin.pomo.onTick(() => this.renderPomo());
    this._metrics = { cols: DEFAULT_COLS, colW: 0, rowH: ROW_H, gap: 14, boardW: 0 };
    this._shells = new Map();
    this._ro = null;
  }

  getViewType() { return VIEW_DASHBOARD; }
  getDisplayText() { return 'Jensen 科研工作站'; }
  getIcon() { return 'telescope'; }

  async onOpen() { await this.render(); }
  onClose() {
    if (this._unsub) this._unsub();
    if (this._ro) this._ro.disconnect();
  }

  /* ---------- 布局数据 ---------- */

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
    const ids = [
      ...BUILTIN_CARDS.map((c) => c.id),
      ...s.customCards.map((c) => `c:${c.uid}`),
    ];
    return ids
      .filter((id) => !s.hiddenCards.includes(id) && (id !== 'survey' || this.plugin.surveyExists()))
      .map((id) => this.cardDef(id))
      .filter(Boolean);
  }

  layoutOf(id) {
    const s = this.plugin.settings;
    if (!s.layout[id]) s.layout[id] = { ...this.cardDef(id).size, x: -1, y: -1 };
    return s.layout[id];
  }

  /** 货架式排布（借鉴 Hearth ensureLayout）：给没有坐标的卡找位置 */
  packLayout() {
    const s = this.plugin.settings;
    const cols = s.columns;
    const colBottom = new Array(cols).fill(0);
    const ordered = this.visibleCards();
    let changed = false;
    for (const def of ordered) {
      const l = this.layoutOf(def.id);
      if (l.x >= 0 && l.y >= 0) {
        const w = Math.min(Math.max(l.w, 1), cols);
        for (let c = l.x; c < Math.min(l.x + w, cols); c += 1) {
          colBottom[c] = Math.max(colBottom[c], l.y + l.h);
        }
        continue;
      }
      const w = Math.min(Math.max(l.w, 1), cols);
      const h = Math.max(l.h, 1);
      /* 找最低点最小的可放列段 */
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
    const cols = s.columns;
    const gap = s.gapPx;
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

  /* ---------- 渲染 ---------- */

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('orbitdesk-view', 'jrs-view');

    this.packLayout();
    root.appendChild(this.renderHero());

    this._board = document.createElement('div');
    this._board.className = 'jrs-board';
    if (this.editing) this._board.addClass('is-editing');
    root.appendChild(this._board);

    this._shells.clear();
    for (const def of this.visibleCards()) {
      try {
        const shell = await this.buildShell(def);
        this._board.appendChild(shell);
        this._shells.set(def.id, shell);
      } catch (e) {
        console.error(`[JRS] 卡片「${def.id}」渲染失败`, e);
      }
    }
    this.computeMetrics();
    this.applyPositions();
    this.setupBoardObserver();
    this.bindBoardDrag();

    this.plugin.ensureArxivFresh().then((r) => {
      if (r?.justFetched) this.softRefresh('arxiv');
    });
  }

  /** 只重建某一张卡（避免整页刷新打断输入） */
  async softRefresh(id) {
    const shell = this._shells.get(id);
    if (!shell) return;
    const def = this.cardDef(id);
    if (!def) return;
    const fresh = await this.buildShell(def, shell);
    if (fresh !== shell) shell.replaceWith(fresh);
    this._shells.set(id, fresh);
    this.applyPositions();
  }

  applyPositions() {
    for (const [id, shell] of this._shells) {
      this.positionShell(shell, this.layoutOf(id));
    }
  }

  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => {
      this.computeMetrics();
      this.applyPositions();
    });
    this._ro.observe(this._board);
    this.registerEvent(this.app.workspace.on('resize', () => {
      this.computeMetrics();
      this.applyPositions();
    }));
  }

  /* ---------- 卡片外壳（标题栏 + 内容 + 拖拽/缩放柄） ---------- */

  async buildShell(def, reuseShell) {
    const s = this.plugin.settings;
    const shell = reuseShell || document.createElement('section');
    shell.empty();
    shell.className = 'jrs-card-shell od-card od-anim';
    shell.dataset.cardId = def.id;

    /* 标题栏（排版模式下 = 拖拽柄） */
    const head = shell.createEl('div', { cls: 'od-card-head jrs-card-handle' });
    const t = head.createEl('div', { cls: 'od-card-title' });
    setIcon(t, def.icon);
    t.createSpan({ text: s.cardTitles[def.id] || def.name });

    const ctrl = head.createEl('div', { cls: 'od-card-ctrl' });
    const cfgBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '卡片设置' });
    setIcon(cfgBtn, 'settings-2');
    cfgBtn.onclick = (e) => {
      e.stopPropagation();
      new CardConfigModal(this.plugin, def, () => this.render()).open();
    };
    const hideBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '隐藏卡片' });
    setIcon(hideBtn, 'eye-off');
    hideBtn.onclick = async (e) => {
      e.stopPropagation();
      s.hiddenCards.push(def.id);
      await this.plugin.saveSettings();
      this.render();
    };

    const body = shell.createEl('div', { cls: 'jrs-card-body' });
    const content = await this.renderCardContent(def.id, body);
    if (content && content !== body) body.appendChild(content);

    /* 缩放柄（排版模式可见） */
    const rz = shell.createEl('div', { cls: 'jrs-resize' });
    this.bindCardDrag(shell, def.id);
    return shell;
  }

  /* ---------- 拖拽 / 缩放（排版模式内生效） ---------- */

  bindCardDrag(shell, id) {
    shell.addEventListener('pointerdown', (e) => {
      if (!this.editing) return;
      if (e.button !== 0) return;
      const onResize = e.target instanceof Element && !!e.target.closest('.jrs-resize');
      const l = this.layoutOf(id);
      const { colW, rowH, gap, cols } = this._metrics;
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { x: l.x, y: l.y, w: l.w, h: l.h };
      shell.setPointerCapture(e.pointerId);
      shell.addClass('jrs-card--lift');

      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (onResize) {
          /* 缩放：按列宽/行高换算，最小 1×1 */
          l.w = Math.min(cols, Math.max(1, Math.round(orig.w + dx / (colW + gap))));
          l.h = Math.max(1, Math.round(orig.h + dy / (rowH + gap)));
        } else {
          /* 拖动：吸附到网格 */
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
    /* 排版模式下双击打开卡片设置 */
    shell.addEventListener('dblclick', () => {
      if (this.editing) new CardConfigModal(this.plugin, this.cardDef(id), () => this.render()).open();
    });
  }

  /** 看板级拖动：跨卡换位（按落点网格坐标直接搬运，允许重叠） */
  bindBoardDrag() {
    /* v0.3 用自由坐标 + 吸附，无需 HTML5 DnD；保留占位便于扩展 */
  }

  toggleEditing() {
    this.editing = !this.editing;
    this.render();
    new Notice(this.editing ? '排版模式：拖动卡片移动，右下角缩放，双击设置' : '已退出排版模式');
  }

  /* ---------- Hero 页头 ---------- */

  renderHero() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('jrs-hero', 'od-anim');

    const titleRow = h.createEl('div', { cls: 'jrs-hero-title-row' });
    const brand = titleRow.createEl('div', { cls: 'jrs-hero-brand' });
    const logo = brand.createEl('span', { cls: 'jrs-hero-logo' });
    setIcon(logo, 'telescope');
    const nameEl = brand.createEl('h1', { cls: 'jrs-hero-name', text: 'Jensen 科研工作站' });
    nameEl.setAttribute('title', 'Jensen Research Workstation');

    const editBtn = titleRow.createEl('button', {
      cls: `od-btn jrs-edit-toggle${this.editing ? ' is-on' : ''}`,
    });
    setIcon(editBtn.createSpan(), this.editing ? 'check' : 'layout-grid');
    editBtn.createSpan({ text: this.editing ? '完成排版' : '排版' });
    editBtn.title = '进入排版模式：拖动 / 缩放 / 配置卡片';
    editBtn.onclick = () => this.toggleEditing();

    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const papers = this.plugin.getPapers();
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const todo = papers.filter((p) => p.status === '待读').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${greet}，Jensen · ${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      const days = window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1;
      sub += ` · 科研第 ${days} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading} · 今日专注 ${this.plugin.todayPomoMinutes()} 分钟`;
    const subEl = h.createEl('div', { cls: 'jrs-hero-sub' });
    subEl.textContent = sub;

    /* 搜索 + 动作行 */
    const bar = h.createEl('div', { cls: 'jrs-hero-bar' });
    const omni = bar.createEl('div', { cls: 'jrs-omnibox' });
    this.buildOmnibox(omni);

    const actions = bar.createEl('div', { cls: 'od-header-actions' });
    const mkBtn = (cls, icon, label, fn, title) => {
      const b = actions.createEl('button', { cls });
      if (title) b.title = title;
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
      return b;
    };
    mkBtn('od-btn od-btn--primary', 'library', '文献库', () => this.plugin.activateLibrary());
    mkBtn('od-btn', 'file-plus', '添加', () => new AddPaperModal(this.plugin, () => this.render()).open(), '添加文献');
    mkBtn('od-btn', 'import', '导入', () => new ImportFolderModal(this.plugin, () => this.render()).open(), '批量导入 PDF');
    mkBtn('od-btn', 'layout-panel-left', '卡片', () => new CardManagerModal(this.plugin, () => this.render()).open(), '添加/管理卡片');
    return h;
  }

  buildOmnibox(host) {
    const box = host.createEl('div', { cls: 'od-search jrs-omnibox-box' });
    setIcon(box.createSpan(), 'search');
    const input = box.createEl('input', { type: 'text', placeholder: '搜索笔记 / 文献 / 命令…' });
    const kbd = box.createEl('span', { cls: 'jrs-omni-kbd', text: '↵' });
    const panel = host.createEl('div', { cls: 'jrs-omnibox-panel' });
    let active = -1;
    let items = [];
    const run = (sel) => {
      const it = items[sel];
      if (it) {
        it.run();
        input.value = '';
        panel.empty();
        panel.removeClass('is-open');
        input.blur();
      }
    };
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      panel.empty();
      items = [];
      active = -1;
      if (!q) { panel.removeClass('is-open'); return; }
      const group = (label) => {
        panel.createEl('div', { cls: 'jrs-omni-group', text: label });
        return panel.createEl('div');
      };
      const files = this.app.vault.getMarkdownFiles()
        .filter((f) => f.basename.toLowerCase().includes(q) || (f.parent?.path || '').toLowerCase().includes(q))
        .slice(0, 5);
      if (files.length) {
        const list = group('笔记');
        files.forEach((f) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'file-text');
          item.createSpan({ cls: 'jrs-omni-text', text: f.basename });
          item.createSpan({ cls: 'jrs-omni-sub', text: f.parent?.path || '' });
          const idx = items.length;
          item.onclick = () => run(idx);
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
          const idx = items.length;
          item.onclick = () => run(idx);
          items.push({ run: () => this.plugin.openPaper(p), el: item });
        });
      }
      const cmds = Object.entries(this.app.commands.commands)
        .filter(([cid, c]) => cid.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q))
        .slice(0, 6);
      if (cmds.length) {
        const list = group('命令');
        cmds.forEach(([cid, c]) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'terminal');
          item.createSpan({ cls: 'jrs-omni-text', text: c.name || cid });
          item.createSpan({ cls: 'jrs-omni-sub', text: cid.split(':')[0] });
          const idx = items.length;
          item.onclick = () => run(idx);
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

  /* ---------- 各卡片内容 ---------- */

  async renderCardContent(id, body) {
    switch (id) {
      case 'pomo': return this.buildPomoCard(body);
      case 'calendar': return this.buildCalendar(body);
      case 'tasks': return await this.buildTasks(body);
      case 'arxiv': return await this.buildArxiv(body);
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

  /* 番茄钟 */
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
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00`
      : p.clockText();
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

  /* 日历 */
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
    const startDow = m.day();
    const daysInMonth = m.daysInMonth();
    const todayM = window.moment();
    for (let i = 0; i < startDow; i += 1) grid.createEl('div', { cls: 'od-cal-day od-cal-day--other' });
    for (let d = 1; d <= daysInMonth; d += 1) {
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

  /* 今日待办 */
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

  /* arXiv */
  async buildArxiv(body) {
    const cfg = this.plugin.settings.cardCfg.arxiv || {};
    const cache = this.plugin.settings.arxivCache;
    const head = body.createEl('div', { cls: 'jrs-arxiv-head' });
    const q = head.createEl('span', { cls: 'od-hint' });
    q.textContent = `关键词：${this.plugin.settings.arxivQuery}`;
    const rb = head.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(rb.createSpan(), 'refresh-cw');
    rb.append('刷新');
    rb.onclick = async () => {
      await this.plugin.fetchArxiv(true);
      this.softRefresh('arxiv');
    };
    if (!cache?.items?.length) {
      body.createEl('div', { cls: 'od-task-empty', text: '暂无 arXiv 数据，点击「刷新」获取最新论文' });
      return body;
    }
    const list = body.createEl('div', { cls: 'jrs-arxiv-list jrs-fill' });
    const max = cfg.max || this.plugin.settings.arxivMax;
    cache.items.slice(0, max).forEach((it) => {
      const row = list.createEl('div', { cls: 'jrs-arxiv-item' });
      const main = row.createEl('div', { cls: 'jrs-arxiv-main' });
      const title = main.createEl('div', { cls: 'jrs-arxiv-title', text: it.title });
      title.onclick = () => window.open(it.url);
      main.createEl('div', { cls: 'od-hint', text: `${it.date} · ${it.authors}` });
      const add = row.createEl('button', { cls: 'od-icon-btn', title: '加入文献库' });
      setIcon(add, 'plus');
      add.onclick = async () => {
        await this.plugin.arxivToLibrary(it);
        new Notice('已加入文献库 📚');
      };
    });
    return body;
  }

  /* 文献统计 */
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
    mk(by('待读'), '待读');
    mk(by('阅读中'), '阅读中');
    mk(by('已完成'), '已完成');
    const hint = body.createEl('div', { cls: 'od-hint od-clickable' });
    hint.textContent = `本周新增 ${this.plugin.papersAddedThisWeek()} 篇 · 点击查看文献库`;
    hint.onclick = () => this.plugin.activateLibrary();
    return body;
  }

  /* 专注趋势 */
  buildFocusBars(body) {
    const log = this.plugin.settings.pomoLog || {};
    let max = 0;
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = window.moment().subtract(i, 'days');
      const min = (log[d.format('YYYY-MM-DD')] || {}).minutes || 0;
      max = Math.max(max, min);
      days.push({ d, min });
    }
    const total = days.reduce((a, b) => a + b.min, 0);
    if (!max) {
      body.createEl('div', { cls: 'od-task-empty', text: '还没有专注记录，点番茄钟开始第一个 25 分钟' });
      return body;
    }
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

  /* 研究方向 */
  buildTopics(body) {
    const papers = this.plugin.getPapers();
    const chips = body.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const n = papers.filter((p) => p.topics.includes(t)).length;
      const chip = chips.createEl('span', { cls: 'od-chip' });
      chip.createSpan({ text: t });
      chip.createEl('b', { text: String(n) });
      chip.onclick = () => this.plugin.activateLibrary(t);
    });
    return chips;
  }

  /* 综述进度 */
  async buildSurvey(body) {
    const sections = await this.plugin.getSurveyProgress();
    if (!sections.length) {
      body.createEl('div', { cls: 'od-task-empty', text: '大纲还没有任务项，打开笔记添加 - [ ] 试试' });
      return body;
    }
    const wrap = body.createEl('div', clsWrap());
    function clsWrap() { return { cls: 'jrs-fill' }; }
    sections.slice(0, 8).forEach((sec) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openSurveyNote();
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: sec.name });
      top.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
      const pb = item.createEl('div', { cls: 'od-progressbar' });
      pb.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
    });
    const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });
    body.createEl('div', { cls: 'od-hint', text: `总体进度 ${all.d}/${all.t} · 点击打开大纲` });
    return wrap;
  }

  /* 快速启动 */
  buildLaunch(body) {
    const grid = body.createEl('div', { cls: 'od-launch' });
    const items = [
      { icon: 'file-plus', label: '添加文献', fn: () => new AddPaperModal(this.plugin, () => this.render()).open() },
      { icon: 'import', label: '批量导入', fn: () => new ImportFolderModal(this.plugin, () => this.render()).open() },
      { icon: 'table', label: '文献矩阵', fn: () => this.plugin.generateMatrix() },
      { icon: 'database', label: 'Bases 数据库', fn: () => this.plugin.generateBases() },
      { icon: 'sparkles', label: 'AI 综述', fn: () => new AiSynthesisModal(this.plugin).open() },
      { icon: 'pen-line', label: '综述大纲', fn: () => this.plugin.ensureSurveyNote(true) },
      { icon: 'book-open', label: '文献库', fn: () => this.plugin.activateLibrary() },
      { icon: 'database', label: 'PDF 入库', fn: () => this.plugin.migrateExternalPdfs() },
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

  /* 最近文献 */
  buildRecent(body) {
    const papers = this.plugin.getPapersSorted('added').slice(0, 6);
    if (!papers.length) {
      body.createEl('div', { cls: 'od-task-empty', text: '文献库还是空的，用「导入」把 PDF 目录导进来吧' });
      return body;
    }
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

  /* 自定义卡片 */
  async buildCustom(body, id) {
    const def = this.plugin.settings.customCards.find((c) => `c:${c.uid}` === id);
    if (!def) return null;
    const cfg = def.cfg || {};
    if (def.type === 'note') {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(cfg.path || ''));
      if (!(f instanceof TFile)) {
        body.createEl('div', { cls: 'od-task-empty', text: `笔记不存在：${cfg.path || '（未配置）'}` });
        return body;
      }
      const content = await this.app.vault.cachedRead(f);
      const host = body.createEl('div', { cls: 'jrs-note-embed jrs-fill' });
      await MarkdownRenderer.render(this.app, content, host, f.path, this);
      return host;
    }
    if (def.type === 'countdown') {
      const target = window.moment(cfg.date, 'YYYY-MM-DD');
      if (!target.isValid()) {
        body.createEl('div', { cls: 'od-task-empty', text: '未配置日期（卡片设置中填 YYYY-MM-DD）' });
        return body;
      }
      const days = target.diff(window.moment().startOf('day'), 'days');
      const num = body.createEl('div', { cls: 'jrs-count-num', text: String(Math.abs(days)) });
      num.toggleClass('is-urgent', days >= 0 && days <= 7);
      body.createEl('div', { cls: 'od-hint', text: days >= 0 ? `${cfg.label || '倒计时'}还有 ${days} 天（${target.format('M月D日')}）` : `${cfg.label || '节点'}已过 ${-days} 天` });
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
      if (!ids.length) body.createEl('div', { cls: 'od-task-empty', text: '未配置命令 ID' });
      return grid;
    }
    return null;
  }
}

/* ==========================================================================
 * 文献库视图（v0.3：priority / 相关性 / AI 菜单 / 分栏阅读）
 * ========================================================================== */

class LibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.q = '';
    this.statusFilter = '全部';
    this.prioFilter = '全部';
    this.topicFilter = '';
    this.sort = 'added';
    this._deb = null;
  }

  getViewType() { return VIEW_LIBRARY; }
  getDisplayText() { return '文献库'; }
  getIcon() { return 'library'; }

  async onOpen() {
    if (this.plugin.libFilterTopic) {
      this.topicFilter = this.plugin.libFilterTopic;
      this.plugin.libFilterTopic = '';
    }
    await this.render();
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (f.path.startsWith(this.plugin.settings.libFolder)) this.debouncedRender();
    }));
    this.registerEvent(this.app.vault.on('delete', () => this.debouncedRender()));
    this.registerEvent(this.app.vault.on('rename', () => this.debouncedRender()));
  }

  debouncedRender() {
    if (this._deb) window.clearTimeout(this._deb);
    this._deb = window.setTimeout(() => this.render(), 250);
  }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('orbitdesk-view', 'jrs-view');

    const title = root.createEl('div', { cls: 'od-section-title jrs-lib-title' });
    title.createSpan({ text: '文献库' });
    const papers = this.plugin.getPapersSorted(this.sort);
    title.createEl('span', { cls: 'od-count-badge', text: `${papers.length} 篇` });

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
    mkTool('od-btn', 'import', '批量导入', () => new ImportFolderModal(this.plugin, () => this.render()).open());
    mkTool('od-btn', 'table', '文献矩阵', () => this.plugin.generateMatrix());
    mkTool('od-btn', 'database', 'Bases', () => this.plugin.generateBases());
    mkTool('od-btn', 'database', 'PDF 入库', () => this.plugin.migrateExternalPdfs().then(() => this.render()));
    mkTool('od-btn', 'sparkles', 'AI 综述', () => new AiSynthesisModal(this.plugin).open());

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
      const hasFilter = this.q || this.topicFilter || this.statusFilter !== '全部' || this.prioFilter !== '全部';
      e.createSpan({ text: hasFilter ? '没有符合条件的文献，换个筛选试试' : '文献库为空，点击上方「添加」或「批量导入」开始' });
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
      new Notice(`「${p.title.slice(0, 20)}…」→ ${next}`);
    };

    const pr = foot.createEl('span', { cls: 'od-status jrs-prio' });
    pr.setAttribute('data-prio', p.priority || '');
    pr.textContent = p.priority ? `优 ${p.priority}` : '优 ·';
    pr.title = '点击切换优先级（高→中→低→无）';
    pr.onclick = async (e) => {
      e.stopPropagation();
      const order = [...PRIORITIES, ''];
      const cur = order.indexOf(p.priority || '');
      await this.plugin.setPaperPriority(p, order[(cur + 1) % order.length]);
      this.renderList();
    };

    const stars = foot.createEl('span', { cls: 'od-stars' });
    for (let n = 1; n <= 5; n += 1) {
      const s = stars.createEl('button', { cls: `od-star${n <= p.rating ? ' is-on' : ''}`, title: `${n} 星` });
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
    mkIcon('columns-2', '分栏阅读（笔记 + PDF）', () => this.plugin.openReading(p));
    mkIcon('sparkles', 'AI 助手（摘要 / 十问 / 补全元数据）', () => new AiPaperModal(this.plugin, p, () => this.renderList()).open());
    mkIcon('file-text', '打开笔记', () => this.plugin.openPaper(p));

    el.onclick = () => this.plugin.openPaper(p);
    return el;
  }
}

/* ==========================================================================
 * 弹窗：添加文献 / 批量导入 / 卡片管理 / 卡片配置 / AI
 * ========================================================================== */

class AddPaperModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
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
    mkText('期刊 / 会议', 'venue', '如：宇航学报');
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
    this.plugin = plugin;
    this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('批量导入 PDF 文献');
    const { contentEl } = this;
    contentEl.empty();
    let folder = 'D:/Desktop/ycs/卫星网格化智能规划综述/文献';
    let recursive = true;
    let copyIn = true;
    new Setting(contentEl).setName('PDF 所在文件夹').addText((t) => {
      t.inputEl.style.width = '340px';
      t.inputEl.setValue(folder);
      t.onChange(() => { folder = t.getValue(); });
    });
    new Setting(contentEl).setName('包含子文件夹').addToggle((tg) => tg.setValue(true).onChange((v) => { recursive = v; }));
    new Setting(contentEl).setName('PDF 复制入库（推荐）').setDesc(`复制到 ${this.plugin.settings.pdfFolder}/，在 Obsidian 内直接阅读、高亮批注`).addToggle((tg) => tg.setValue(true).onChange((v) => { copyIn = v; }));
    const resultEl = contentEl.createEl('div', { cls: 'jrs-import-result' });
    new Setting(contentEl).addButton((b) => b.setButtonText('开始导入').setCta().onClick(async () => {
      b.setDisabled(true);
      resultEl.empty();
      const progress = resultEl.createEl('div', { cls: 'od-hint' });
      try {
        const res = await this.plugin.importPdfFolder(folder, recursive, copyIn, (msg) => { progress.textContent = msg; });
        new Notice(`导入完成：新增 ${res.created} 篇，跳过 ${res.skipped} 篇`);
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

/** 卡片总管理：显隐 / 添加自定义 / 删除（顺序与尺寸由排版模式拖拽完成） */
class CardManagerModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
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
    contentEl.createEl('p', {
      cls: 'od-hint',
      text: '排序与尺寸：回仪表盘点「排版」后直接拖动卡片 / 拖右下角缩放。此处管理显隐与自定义卡片。',
    });
    const list = contentEl.createEl('div', { cls: 'jrs-cm-list' });
    const ids = [
      ...BUILTIN_CARDS.map((c) => c.id),
      ...this.plugin.settings.customCards.map((c) => `c:${c.uid}`),
    ];
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
      s.layout[`c:${uid}`] = { x: -1, y: -1, ...CUSTOM_TYPES[type].size || { w: 2, h: 2 } };
      if (s.hiddenCards.includes(`c:${uid}`)) s.hiddenCards = s.hiddenCards.filter((x) => x !== `c:${uid}`);
      await this.plugin.saveSettings();
      new Notice('卡片已添加（排版模式下拖到喜欢的位置）');
      this.display();
    }));
  }
  onOpen() { this.display(); }
  onClose() { if (this.onDone) this.onDone(); }
}

/** 单卡配置：标题 + 类型专属参数 */
class CardConfigModal extends Modal {
  constructor(plugin, def, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.def = def;
    this.onDone = onDone;
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
      new Setting(contentEl).setName('arXiv 关键词（全局）').addText((t) => {
        t.setValue(s.arxivQuery);
        t.onChange(() => { cfg.__query = t.getValue(); });
      });
    }
    if (this.def.id === 'topics') {
      new Setting(contentEl).setName('提示语').setDesc('卡片底部说明文字').addText((t) => {
        t.setValue(cfg.hint || '点击方向 → 文献库筛选');
        t.onChange(() => { cfg.hint = t.getValue(); });
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
        if (cfg.__query !== undefined && cfg.__query.trim()) { s.arxivQuery = cfg.__query.trim(); s.arxivCache = null; }
        delete cfg.__title; delete cfg.__query;
        s.cardCfg[this.def.id] = cfg;
        await this.plugin.saveSettings();
        this.close();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
  onClose() { if (this.onDone) this.onDone(); }
}

/** 单篇文献 AI 助手：摘要 / 导读十问 / 补全元数据 */
class AiPaperModal extends Modal {
  constructor(plugin, paper, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.paper = paper;
    this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`AI 助手 · ${this.paper.title.slice(0, 30)}…`);
    const { contentEl } = this;
    contentEl.empty();
    const ai = this.plugin.settings.ai;
    if (!ai.apiKey) {
      contentEl.createEl('p', { cls: 'od-hint', text: '尚未配置 API Key：设置 → AI 助手 → API Key（支持 DeepSeek / GLM / OpenAI 等兼容接口）' });
    }
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    const mk = (icon, name, desc, fn) => {
      new Setting(contentEl).setName(name).setDesc(desc).addButton((b) => {
        b.setButtonText('运行').setCta();
        b.onClick(async () => {
          b.setDisabled(true);
          busy.textContent = `${name}生成中…`;
          try { await fn(); busy.textContent = `✅ ${name}完成`; }
          catch (e) { busy.textContent = `❌ ${e.message}`; new Notice(`${name}失败：${e.message}`); }
          b.setDisabled(false);
          if (this.onDone) this.onDone();
        });
      });
    };
    mk('✨', '生成结构化摘要', '按「一句话总结/问题设定/求解算法/可借鉴点」补全笔记', () => this.plugin.aiSummarize(this.paper));
    mk('❓', '导读十问', '生成 10 个带参考答案的理解性问题（Research OS 式导读）', () => this.plugin.aiGuide(this.paper));
    mk('🏷', '补全元数据', 'AI 从标题/正文推断 作者·年份·来源·研究方向·优先级 并写回 frontmatter', async () => {
      const m = await this.plugin.aiMetadata(this.paper);
      new Notice(`已补全：${JSON.stringify(m).slice(0, 80)}…`);
    });
  }
}

/** AI 跨论文综述（Research OS 式 synthesis） */
class AiSynthesisModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    this.titleEl.setText('AI 跨论文综述');
    const { contentEl } = this;
    contentEl.empty();
    const ai = this.plugin.settings.ai;
    if (!ai.apiKey) contentEl.createEl('p', { cls: 'od-hint', text: '提示：未配置 API Key，请先到 设置 → AI 助手 填写。' });
    let topic = this.plugin.settings.topics[0] || '';
    let n = 8;
    let goal = '';
    new Setting(contentEl).setName('研究方向 / 主题').addDropdown((d) => {
      this.plugin.settings.topics.forEach((t) => d.addOption(t, t));
      if (topic) d.setValue(topic);
      d.onChange(() => { topic = d.getValue(); });
    });
    new Setting(contentEl).setName('纳入文献数（按相关度优先）').addText((t) => {
      t.inputEl.type = 'number';
      t.setValue('8');
      t.onChange(() => { const v = parseInt(t.getValue(), 10); if (v > 1 && v <= 20) n = v; });
    });
    new Setting(contentEl).setName('研究目标（可选）').setDesc('如：梳理网格热力如何驱动调度决策').addText((t) => {
      t.onChange(() => { goal = t.getValue(); });
    });
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…（可能需要一两分钟）';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        busy.textContent = `✅ 已生成：${f.path}`;
        this.app.workspace.getLeaf(false).openFile(f);
      } catch (e) {
        busy.textContent = `❌ ${e.message}`;
        new Notice(`综述失败：${e.message}`);
      }
      b.setDisabled(false);
    }));
  }
}

/* ==========================================================================
 * 设置页（v0.3：外观工作室 + 全量配置）
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

    /* ---- 外观工作室 ---- */
    containerEl.createEl('h3', { text: '🎨 外观工作室' });
    new Setting(containerEl).setName('强调色（预设）').addDropdown((d) => {
      Object.entries(ACCENTS).forEach(([k, v]) => d.addOption(k, v.name));
      d.setValue(s.accent);
      d.onChange(async (v) => { s.accent = v; s.accentCustom = ''; await this.plugin.saveSettings(); this.plugin.applyAppearance(); this.display(); });
    });
    new Setting(containerEl).setName('强调色（自定义 HEX）').setDesc('填写后优先生效，如 #2dd4bf')
      .addText((t) => {
        t.setValue(s.accentCustom);
        t.onChange(async () => {
          const v = t.getValue().trim();
          if (v === '' || /^#[0-9a-fA-F]{6}$/.test(v)) {
            s.accentCustom = v;
            await this.plugin.saveSettings();
            this.plugin.applyAppearance();
          }
        });
      });
    new Setting(containerEl).setName('毛玻璃卡片').addToggle((t) => t.setValue(s.glass).onChange(async (v) => { s.glass = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    const slider = (name, key, min, max, step, unit, desc) => {
      const st = new Setting(containerEl).setName(name).setDesc(desc || '');
      st.addSlider((sl) => {
        sl.setLimits(min, max, step).setValue(s[key]).setDynamicTooltip()
          .onChange(async (v) => { s[key] = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
      });
      st.addText((t) => {
        t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseFloat(v);
          if (!Number.isNaN(n) && n >= min && n <= max) { s[key] = n; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }
        });
      });
      st.controlEl.addClass('jrs-slider-row');
    };
    slider('毛玻璃模糊量', 'blurPx', 0, 40, 1, 'px', '0 = 关闭模糊（性能最好）');
    slider('卡片不透明度', 'cardAlpha', 30, 100, 1, '%', '照片背景下建议 65-85');
    slider('卡片圆角', 'radiusPx', 0, 28, 1, 'px');
    slider('卡片间距', 'gapPx', 6, 32, 1, 'px', '同时是排版吸附网格的间距');
    slider('背景暗化', 'bgDim', 0, 80, 1, '%', '压暗照片背景，提升文字可读性');
    slider('看板列数', 'columns', 4, 10, 1, '列', '排版模式的网格列数（改后需重新排版）');

    new Setting(containerEl).setName('背景模式').addDropdown((d) => {
      d.addOption('none', '无（跟随主题）');
      d.addOption('color', '纯色');
      d.addOption('image', '图片');
      d.setValue(s.bgMode);
      d.onChange(async (v) => { s.bgMode = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('纯色背景').addColorPicker((c) => c.setValue(s.bgColor).onChange(async (v) => { s.bgColor = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    new Setting(containerEl).setName('背景图片（库内路径）').setDesc('如 科研工作台/背景/7.jpg')
      .addText((t) => { t.setValue(s.bgImage); t.onChange(async () => { s.bgImage = t.getValue().trim(); await this.plugin.saveSettings(); this.plugin.applyAppearance(); }); });

    /* ---- 路径 ---- */
    containerEl.createEl('h3', { text: '📁 路径' });
    const pathSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => { t.setValue(s[key]); t.onChange(async () => { s[key] = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    pathSetting('文献笔记目录', 'libFolder');
    pathSetting('PDF 存放目录', 'pdfFolder', '「复制入库」的 PDF 位置');
    pathSetting('日记目录', 'dailyFolder', '留空 = 库根目录');
    pathSetting('综述大纲笔记', 'surveyNote');
    pathSetting('Bases 目录', 'basesFolder', '生成的 .base 数据库存放位置');

    /* ---- 番茄钟 ---- */
    containerEl.createEl('h3', { text: '🍅 番茄钟' });
    const numSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => {
        t.inputEl.type = 'number';
        t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n > 0 && n <= 180) { s[key] = n; await this.plugin.saveSettings(); }
        });
      });
    numSetting('专注时长（分钟）', 'pomoWork', '默认 25');
    numSetting('小憩时长（分钟）', 'pomoBreak', '默认 5');
    numSetting('长休时长（分钟）', 'pomoLongBreak', '默认 15');
    numSetting('每几个番茄进入长休', 'pomoLongEvery', '默认 4');

    /* ---- arXiv ---- */
    containerEl.createEl('h3', { text: '📡 arXiv 资讯' });
    new Setting(containerEl).setName('检索关键词').setDesc('arXiv 检索式，如 all:"satellite scheduling" OR all:"earth observation"')
      .addText((t) => {
        t.setValue(s.arxivQuery);
        t.onChange(async () => { s.arxivQuery = t.getValue(); s.arxivCache = null; await this.plugin.saveSettings(); });
      });
    numSetting('默认显示条数', 'arxivMax', '卡片内可在 ⚙ 单独覆盖');

    /* ---- AI ---- */
    containerEl.createEl('h3', { text: '🤖 AI 助手（OpenAI 兼容）' });
    new Setting(containerEl).setName('API Base URL').addText((t) => { t.setValue(s.ai.baseUrl); t.onChange(async () => { s.ai.baseUrl = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('API Key').addText((t) => { t.inputEl.type = 'password'; t.setValue(s.ai.apiKey); t.onChange(async () => { s.ai.apiKey = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('模型').addText((t) => { t.setValue(s.ai.model); t.onChange(async () => { s.ai.model = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    /* ---- MinerU ---- */
    containerEl.createEl('h3', { text: '🧲 MinerU 解析（可选）' });
    new Setting(containerEl).setName('MinerU 命令').setDesc('pip install -U "mineru[core]" 后保持默认 mineru 即可')
      .addText((t) => { t.setValue(s.mineruCmd); t.onChange(async () => { s.mineruCmd = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    /* ---- 科研 ---- */
    containerEl.createEl('h3', { text: '🔬 科研' });
    new Setting(containerEl).setName('科研起始日').setDesc('YYYY-MM-DD，用于「科研第 N 天」')
      .addText((t) => { t.setValue(s.researchStart); t.onChange(async () => { s.researchStart = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    const topicSetting = new Setting(containerEl).setName('研究方向标签').setDesc('点击 × 删除；输入新名称回车添加');
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

    /* ---- 数据 ---- */
    containerEl.createEl('h3', { text: '🗄 数据' });
    new Setting(containerEl).setName('导出插件设置').setDesc('把全部设置（含布局）导出为 JSON 备份')
      .addButton((b) => b.setButtonText('导出').onClick(() => {
        const blob = JSON.stringify(s, null, 2);
        navigator.clipboard?.writeText(blob);
        new Notice('设置 JSON 已复制到剪贴板');
      }));
    new Setting(containerEl).setName('重置排版布局').setDesc('卡片恢复默认位置与尺寸（不删数据）')
      .addButton((b) => b.setButtonText('重置').onClick(async () => {
        s.layout = {};
        await this.plugin.saveSettings();
        new Notice('布局已重置，重新打开仪表盘生效');
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

    this.addCommand({ id: 'open-dashboard', name: '打开仪表盘', callback: () => this.activateDashboard() });
    this.addCommand({ id: 'open-library', name: '打开文献库', callback: () => this.activateLibrary() });
    this.addCommand({ id: 'add-paper', name: '添加文献', callback: () => new AddPaperModal(this).open() });
    this.addCommand({ id: 'import-pdf', name: '批量导入 PDF 文件夹', callback: () => new ImportFolderModal(this).open() });
    this.addCommand({ id: 'start-pomo', name: '开始专注（番茄钟）', callback: () => { if (this.pomo.phase === 'idle') this.pomo.start(); } });
    this.addCommand({ id: 'gen-matrix', name: '生成文献矩阵', callback: () => this.generateMatrix() });
    this.addCommand({ id: 'gen-bases', name: '生成 Bases 数据库（文献库/阅读队列）', callback: () => this.generateBases() });
    this.addCommand({ id: 'init-survey', name: '初始化综述大纲', callback: () => this.ensureSurveyNote(true) });
    this.addCommand({ id: 'pdf-to-vault', name: '外部 PDF 一键入库', callback: () => this.migrateExternalPdfs() });
    this.addCommand({ id: 'card-manager', name: '卡片管理', callback: () => new CardManagerModal(this).open() });
    this.addCommand({ id: 'refresh-arxiv', name: '刷新 arXiv 资讯', callback: async () => { await this.fetchArxiv(true); new Notice('arXiv 已刷新'); } });
    this.addCommand({ id: 'ai-synthesis', name: 'AI 跨论文综述', callback: () => new AiSynthesisModal(this).open() });
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
    if (!this.settings.basesFolder) this.settings.basesFolder = '科研工作台/Bases';
    /* v0.2 → v0.3 迁移：丢弃旧 omnibox-tip 卡，忽略旧 grid 顺序（新布局货架自动排） */
    this.settings.hiddenCards = this.settings.hiddenCards.filter((x) => x !== 'omnibox-tip');
    await this.saveSettings();
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
      const imgPath = normalizePath(s.bgImage || '');
      const f = imgPath ? this.app.vault.getAbstractFileByPath(imgPath) : null;
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

  /* ---------- 视图 ---------- */

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
      if (this.libFilterTopic) {
        if (leaf.view instanceof LibraryView) {
          leaf.view.topicFilter = this.libFilterTopic;
          this.libFilterTopic = '';
          leaf.view.render();
        }
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
      return {
        file: f,
        path: f.path,
        added: f.stat.ctime,
        title: fm.title || f.basename,
        authors,
        authorsShort: arr.length ? arr[0] + (arr.length > 1 ? ' 等' : '') : '',
        year: fm.year ? String(fm.year) : '',
        venue: fm.venue || '',
        status: STATUSES.includes(fm.status) ? fm.status : '待读',
        priority: PRIORITIES.includes(fm.priority) ? fm.priority : '',
        topics: topics.filter(Boolean),
        rating: typeof fm.rating === 'number' ? fm.rating : 0,
        pdf: fm.pdf || '',
        summary: typeof fm.summary === 'string' ? fm.summary : '',
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
      pdfVal ? `pdf: "${pdfVal.replace(/"/g, "'")}"` : 'pdf: ""',
      `added: ${todayKey()}`,
      '---',
      '',
    ].join('\n');
    const pdfLink = pdfVal && !isHttp(pdfVal) && !isExternalPath(pdfVal) ? `\n📎 原文：[[${pdfVal.split('/').pop()}]]\n` : '';
    const body = [
      `# ${data.title}`,
      '',
      pdfLink.trim(),
      '## 一句话总结',
      '',
      '## 问题设定（卫星/目标/约束）',
      '',
      '## 网格 / 方法如何使用',
      '',
      '## 求解算法',
      '',
      '## 可借鉴点',
      '',
      '## 疑问与待办',
      '- [ ] ',
      '',
    ].join('\n');
    const file = await this.app.vault.create(path, fm + body);
    if (open) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async setPaperStatus(p, status) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.status = status; }); }
  async setPaperRating(p, rating) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.rating = rating; }); }
  async setPaperPriority(p, priority) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.priority = priority || ''; }); }

  openPaper(p) { this.app.workspace.getLeaf(false).openFile(p.file); }

  /** 分栏阅读：左笔记右 PDF（Research OS 阅读工作区） */
  async openReading(p) {
    await this.app.workspace.getLeaf(false).openFile(p.file);
    const pdf = p.pdf;
    if (!pdf || isHttp(pdf)) { if (isHttp(pdf)) window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) {
      const right = this.app.workspace.getRightLeaf(false);
      await right.openFile(f, { active: false });
    } else {
      new Notice('PDF 不在库内：可用「PDF 入库」迁移后分栏阅读');
    }
  }

  openPdf(pdf) {
    if (!pdf) return;
    if (isHttp(pdf)) { window.open(pdf); return; }
    const rel = toPosix(pdf);
    const f = this.app.vault.getAbstractFileByPath(normalizePath(rel));
    if (f instanceof TFile) { this.app.workspace.getLeaf(false).openFile(f); return; }
    if (isExternalPath(pdf)) {
      try {
        const electron = window.require && window.require('electron');
        if (electron?.shell?.openPath) { electron.shell.openPath(pdf); return; }
      } catch (e) { /* fallthrough */ }
      try {
        if (this.app.openWithDefaultApp) { this.app.openWithDefaultApp(pdf); return; }
      } catch (e) { /* fallthrough */ }
      navigator.clipboard?.writeText(pdf);
      new Notice('已复制 PDF 路径');
      return;
    }
    new Notice(`找不到 PDF：${pdf}`);
  }

  /* ---------- 批量导入 ---------- */

  async importPdfFolder(folderPath, recursive, copyIntoVault, onProgress) {
    if (!window.require) throw new Error('仅桌面端支持扫描本地文件夹');
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
    if (!pdfs.length) throw new Error('该文件夹内没有找到 PDF');
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
      } catch (e) {
        console.error('[JRS] 导入失败', full, e);
        res.failed += 1;
      }
    }
    return res;
  }

  async migrateExternalPdfs() {
    if (!window.require) { new Notice('仅桌面端支持'); return; }
    const fs = window.require('fs');
    const papers = this.getPapers().filter((p) => p.pdf && isExternalPath(p.pdf));
    if (!papers.length) { new Notice('没有外部路径的 PDF（可能都已入库）'); return; }
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

  async ensureArxivFresh() { return this.fetchArxiv(false); }

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
        temperature: 0.3,
        max_tokens: maxTokens,
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
      '从文献信息推断元数据，只输出 JSON，不要其他文字。',
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
      .filter((p) => p.topics.includes(topic) || (topic === '' && true))
      .sort((a, b) => (b.topics.includes(topic) ? 1 : 0) - (a.topics.includes(topic) ? 1 : 0) || b.rating - a.rating)
      .slice(0, n);
    if (papers.length < 2) throw new Error(`「${topic}」方向文献不足 2 篇，先入库或换方向`);
    const digest = papers.map((p, i) => `[${i + 1}] ${p.title}（${p.year || '年份未知'}${p.venue ? ', ' + p.venue : ''}）摘要：${p.summary || (p.topics.join('/')) || '见笔记'}`).join('\n');
    const out = await this.aiChat(
      '你是撰写文献综述的科研助理。基于给定文献列表输出结构化中文综述（markdown），结论需标注来源编号（如 [1][3]）。',
      `主题：${topic}\n研究目标：${goal || '（未指定，请围绕主题展开）'}\n文献列表：\n${digest}\n\n输出结构：\n## 当前结论\n## 共同认识\n## 分歧与对比\n## 方法比较（表格）\n## 研究空白\n## 下一步建议`,
      2000,
    );
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/') || '';
    const path = `${dir ? dir + '/' : ''}AI 综述 - ${topic} ${todayKey()}.md`;
    const content = [
      `# AI 综述 · ${topic}`,
      '',
      `> 生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 纳入 ${papers.length} 篇 · 模型 ${this.settings.ai.model}`,
      `> 文献：${papers.map((p, i) => `[[${p.file.basename}|${i + 1}]]`).join(' ')}`,
      '',
      out,
      '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) return await this.app.vault.modify(old, content) || old;
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
    let absPdf = fmPdf;
    const basePath = this.app.vault.adapter?.basePath;
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

  /* ---------- Bases（Research OS 式数据库） ---------- */

  async generateBases() {
    const dir = this.settings.basesFolder;
    await this.ensureFolder(dir);
    const folder = this.settings.libFolder.split('/').pop();
    const mk = async (name, yaml) => {
      const p = `${dir}/${name}.base`;
      const old = this.app.vault.getAbstractFileByPath(p);
      if (old instanceof TFile) await this.app.vault.modify(old, yaml);
      else await this.app.vault.create(p, yaml);
      return p;
    };
    await mk('文献库', baseFile('文献库', [`file.inFolder("${this.settings.libFolder}")`], [
      { name: '收件箱（待读）', filters: [`status == "待读"`], order: ['priority', 'file.name', 'authors', 'year'] },
      { name: '阅读中', filters: [`status == "阅读中"`], order: ['file.name', 'reading_progress'] },
      { name: '已完成', filters: [`status == "已完成"`], order: ['rating', 'file.name', 'year'] },
      { name: '全部文献', order: ['file.name', 'authors', 'year', 'status', 'priority', 'rating', 'topics'] },
    ]));
    await mk('阅读队列', baseFile('阅读队列', [`file.inFolder("${this.settings.libFolder}")`], [
      { name: '高优先级', filters: [`priority == "高"`, `status != "已归档"`], order: ['status', 'file.name'] },
      { name: '进行中', filters: [`status == "阅读中"`], order: ['file.name'] },
      { name: '近期添加', order: ['added', 'file.name'] },
    ]));
    new Notice(`Bases 数据库已生成 → ${dir}/（文献库 · 阅读队列）`);
    const f = this.app.vault.getAbstractFileByPath(`${dir}/文献库.base`);
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }

  /* ---------- 综述 ---------- */

  surveyExists() { return !!this.app.vault.getAbstractFileByPath(this.settings.surveyNote); }

  async ensureSurveyNote(open) {
    if (this.surveyExists()) { if (open) await this.openSurveyNote(); return; }
    const outline = [
      '# 网格热力驱动的卫星任务规划 · 综述大纲',
      '',
      '> 用 `- [ ]` 勾选进度，仪表盘会按 `##` 章节统计完成度。',
      '',
      '## 1. 引言',
      '- [ ] 研究背景与意义',
      '- [ ] 综述范围与文献检索策略',
      '- [ ] 全文组织结构',
      '',
      '## 2. 网格切分体系',
      '- [ ] 全球剖分模型（GeoSOT / H3 / 等经纬度网格）',
      '- [ ] 时空网格表征与编码',
      '- [ ] 网格尺度选择与自适应剖分',
      '',
      '## 3. 网格方法如何辅助规划',
      '- [ ] 仅用于任务生成：传统范式未变（点目标 → 元任务 → 组合优化）',
      '- [ ] 网格表征区域目标与覆盖需求',
      '- [ ] 网格热力驱动的范式演进（热力图 → 规划输入 → 反馈闭环）',
      '',
      '## 4. 求解算法',
      '- [ ] 精确算法（分支定界 / 列生成 / MILP）',
      '- [ ] 元启发式与进化算法（遗传 / 差分进化 / 模因算法）',
      '- [ ] 深度强化学习方法',
      '- [ ] 大模型驱动与智能体方法',
      '',
      '## 5. 问题设定分类',
      '- [ ] 成像卫星（常规 / 敏捷）',
      '- [ ] 电磁探测卫星',
      '- [ ] 巨星座与天临空协同',
      '',
      '## 6. 实验基准与数据集',
      '- [ ] 常用测试集与评价指标',
      '',
      '## 7. 挑战与展望',
      '- [ ] 开放问题',
      '- [ ] 未来研究方向',
      '',
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
    const sections = [];
    let cur = null;
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
      '# 文献矩阵',
      '',
      `> 自动生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 共 ${papers.length} 篇。后三列留给精读填写。`,
      '',
      rows.join('\n'),
      '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(matrixPath);
    if (old instanceof TFile) {
      await this.app.vault.modify(old, content);
      await this.app.workspace.getLeaf(false).openFile(old);
    } else {
      await this.app.workspace.getLeaf(false).openFile(await this.app.vault.create(matrixPath, content));
    }
    new Notice(`文献矩阵已生成（${papers.length} 篇）`);
  }
};
