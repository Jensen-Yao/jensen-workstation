/* ==========================================================================
 * Jensen 科研工作站 (Jensen Research Workstation) v0.2.0
 * 融合 Hearth（卡片仪表盘美学）与 Research OS（文献工作流）之长，
 * 为科研场景定制：文献库 / arXiv 资讯 / 番茄钟 / 日历 / 综述进度 / 全局搜索 /
 * 自定义卡片 / 背景与毛玻璃 / AI 摘要 / MinerU 解析 / PDF 入库。
 * 借鉴（均为 MIT 协议，见 README 致谢）：
 *   - Hearth: 卡片化主页、玻璃材质思路
 *   - Research OS: 文献状态流、研究方向组织思路
 * 遵循 Obsidian 插件开发规范（CSS 变量、无内联样式、事件/定时器注册、
 * 尊重主题与减弱动态偏好、卸载清理）。
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

/** 内置卡片（可拖拽排序 / 显隐 / 三档宽度） */
const BUILTIN_CARDS = [
  { id: 'pomo', name: '番茄钟' },
  { id: 'calendar', name: '日历' },
  { id: 'tasks', name: '今日待办' },
  { id: 'omnibox-tip', name: '搜索提示' },
  { id: 'arxiv', name: 'arXiv 资讯' },
  { id: 'libstats', name: '文献统计' },
  { id: 'focusbars', name: '专注趋势' },
  { id: 'topics', name: '研究方向' },
  { id: 'survey', name: '综述进度' },
  { id: 'launch', name: '快速启动' },
  { id: 'recent', name: '最近文献' },
];

const CUSTOM_TYPES = {
  note: { name: '笔记嵌入', cfg: { title: '嵌入笔记', path: '' } },
  countdown: { name: '倒计时 / DDL', cfg: { title: '重要节点', label: '投稿截止', date: '' } },
  web: { name: '网页', cfg: { title: '网页', url: 'https://arxiv.org/list/cs.AI/recent' } },
  commands: { name: '命令组', cfg: { title: '常用命令', ids: '', labels: '' } },
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
  accent: 'blue',
  glass: true,
  researchStart: '',
  topics: [...DEFAULT_TOPICS],
  hiddenCards: [],
  cardOrder: BUILTIN_CARDS.map((c) => c.id),
  cardSizes: {},
  customCards: [],
  pomoLog: {},
  /* arXiv */
  arxivQuery: 'all:"satellite scheduling" OR all:"earth observation scheduling"',
  arxivMax: 8,
  arxivCache: null, // { ts, items: [...] }
  /* 背景 */
  bgMode: 'image', // none | color | image
  bgColor: '#e8edf7',
  bgImage: '', // 库内路径
  /* AI（OpenAI 兼容） */
  ai: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
  /* MinerU */
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
  let base = fn.replace(/\.pdf$/i, '');
  const yearMatch = base.match(/(19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';
  const title = base.replace(/[_]+/g, ' ').replace(/\(\d{4}\)/g, '').replace(/\s{2,}/g, ' ').trim();
  return { title: title || base, year };
}

function isExternalPath(p) { return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p); }
function isHttp(p) { return /^https?:\/\//i.test(p); }
function toPosix(p) { return String(p).replace(/\\/g, '/'); }

/** 替换笔记中某 `## 标题` 段落内容（不存在则追加） */
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

/* ==========================================================================
 * 番茄钟引擎
 * ========================================================================== */

class PomoEngine {
  constructor(plugin) {
    this.plugin = plugin;
    this.phase = 'idle'; // idle | work | break | longbreak
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

  reset() {
    this._clear();
    this.phase = 'idle';
    this.left = 0;
    this.total = 0;
    this.emit();
  }

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
 * 仪表盘视图
 * ========================================================================== */

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.calMoment = window.moment();
    this._dragId = null;
    this._unsub = plugin.pomo.onTick(() => this.renderPomo());
  }

  getViewType() { return VIEW_DASHBOARD; }
  getDisplayText() { return 'Jensen 科研工作站'; }
  getIcon() { return 'telescope'; }

  async onOpen() { await this.render(); }
  onClose() { if (this._unsub) this._unsub(); }

  allCardIds() {
    const order = this.plugin.settings.cardOrder.slice();
    const known = [...BUILTIN_CARDS.map((c) => c.id), ...this.plugin.settings.customCards.map((c) => `c:${c.uid}`)];
    known.forEach((id) => { if (!order.includes(id)) order.push(id); });
    return order.filter((id) => !this.plugin.settings.hiddenCards.includes(id));
  }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('orbitdesk-view', 'jrs-view');

    root.appendChild(this.renderHeader());

    const grid = document.createElement('div');
    grid.className = 'od-grid';
    this._grid = grid;

    let idx = 0;
    for (const id of this.allCardIds()) {
      try {
        const el = await this.renderCard(id);
        if (!el) continue;
        el.dataset.cardId = id;
        el.addClass('od-card', 'od-anim');
        const size = this.plugin.settings.cardSizes[id] || 1;
        el.dataset.size = String(size);
        el.style.animationDelay = `${Math.min(idx * 30, 300)}ms`;
        idx += 1;
        grid.appendChild(el);
      } catch (e) {
        console.error(`[JRS] 卡片「${id}」渲染失败`, e);
      }
    }
    root.appendChild(grid);
    this.enableDrag(grid);
    this.plugin.ensureArxivFresh().then(() => { /* 数据到达后由缓存卡片自行展示 */ });
  }

  async renderCard(id) {
    switch (id) {
      case 'pomo': return this.buildPomoCard();
      case 'calendar': return this.renderCalendar();
      case 'tasks': return await this.renderTasks();
      case 'omnibox-tip': return this.renderOmniboxTip();
      case 'arxiv': return await this.renderArxiv();
      case 'libstats': return this.renderLibStats();
      case 'focusbars': return this.renderFocusBars();
      case 'topics': return this.renderTopics();
      case 'survey':
        return this.plugin.surveyExists() ? await this.renderSurvey() : null;
      case 'launch': return this.renderLaunch();
      case 'recent': return this.renderRecent();
      default:
        if (id.startsWith('c:')) return await this.renderCustomCard(id);
        return null;
    }
  }

  card(title, icon, id) {
    const el = document.createElement('section');
    const head = el.createEl('div', { cls: 'od-card-head' });
    const t = head.createEl('div', { cls: 'od-card-title' });
    setIcon(t, icon);
    t.createSpan({ text: title });

    /* 卡片控制：宽度档位（悬停显示） */
    const ctrl = head.createEl('div', { cls: 'od-card-ctrl' });
    if (id) {
      const sizeBtn = ctrl.createEl('button', { cls: 'od-icon-btn od-card-size-btn', title: '切换宽度' });
      setIcon(sizeBtn, 'columns-2');
      sizeBtn.onclick = (e) => {
        e.stopPropagation();
        const cur = Number(this.plugin.settings.cardSizes[id] || 1);
        this.plugin.settings.cardSizes[id] = (cur % 3) + 1;
        this.plugin.saveSettings();
        this.render();
      };
    }
    return { el, head };
  }

  /* ---------- 页头（问候 + 全局搜索 + 动作） ---------- */

  renderHeader() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('od-header', 'jrs-header', 'od-anim');

    const left = h.createEl('div', { cls: 'jrs-header-left' });
    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    left.createEl('div', { cls: 'od-header-greet', text: `${greet}，Jensen` });

    const papers = this.plugin.getPapers();
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const todo = papers.filter((p) => p.status === '待读').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      const days = window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1;
      sub += ` · 科研第 ${days} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading}`;
    const subEl = left.createEl('div', { cls: 'od-header-sub' });
    subEl.createSpan({ text: sub.split('·')[0].trim() + ' · ' });
    const acc = subEl.createSpan({ cls: 'od-accent' });
    acc.textContent = sub.split('·').slice(1).join('·').trim();

    /* 全局搜索 omnibox（借鉴 Hearth 搜索中心思路） */
    const omni = h.createEl('div', { cls: 'jrs-omnibox' });
    const box = omni.createEl('div', { cls: 'od-search jrs-omnibox-box' });
    setIcon(box.createSpan(), 'search');
    const input = box.createEl('input', { type: 'text', placeholder: '搜索笔记 / 文献 / 命令…' });
    const panel = omni.createEl('div', { cls: 'jrs-omnibox-panel' });
    let active = -1;
    let items = [];

    const run = (sel) => { const it = items[sel]; if (it) { it.run(); input.value = ''; panel.empty(); panel.removeClass('is-open'); input.blur(); } };

    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      panel.empty();
      items = [];
      active = -1;
      if (!q) { panel.removeClass('is-open'); return; }
      const addGroup = (name) => {
        const g = panel.createEl('div', { cls: 'jrs-omni-group', text: name });
        return panel.createEl('div');
      };
      const files = this.app.vault.getMarkdownFiles()
        .filter((f) => f.basename.toLowerCase().includes(q) || f.parent?.path.toLowerCase().includes(q))
        .slice(0, 5);
      let listEl = null;
      if (files.length) {
        addGroup('笔记');
        listEl = panel.createEl('div');
        files.forEach((f) => {
          const item = listEl.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'file-text');
          const txt = item.createSpan({ cls: 'jrs-omni-text' });
          txt.textContent = f.basename;
          item.createSpan({ cls: 'jrs-omni-sub', text: f.parent?.path || '' });
          const runFn = () => this.app.workspace.getLeaf('tab').openFile(f);
          item.onclick = () => run(items.length);
          items.push({ run: runFn, el: item });
        });
      }
      const papersHit = this.plugin.getPapers().filter((p) => p.title.toLowerCase().includes(q)).slice(0, 4);
      if (papersHit.length) {
        addGroup('文献');
        listEl = panel.createEl('div');
        papersHit.forEach((p) => {
          const item = listEl.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'book-open');
          const txt = item.createSpan({ cls: 'jrs-omni-text' });
          txt.textContent = p.title.length > 42 ? p.title.slice(0, 42) + '…' : p.title;
          item.createSpan({ cls: 'jrs-omni-sub', text: p.status });
          const runFn = () => this.plugin.openPaper(p);
          item.onclick = () => run(items.length);
          items.push({ run: runFn, el: item });
        });
      }
      const cmds = Object.entries(this.app.commands.commands)
        .filter(([cid, c]) => cid.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q))
        .slice(0, 6);
      if (cmds.length) {
        addGroup('命令');
        listEl = panel.createEl('div');
        cmds.forEach(([cid, c]) => {
          const item = listEl.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'terminal');
          const txt = item.createSpan({ cls: 'jrs-omni-text' });
          txt.textContent = c.name || cid;
          item.createSpan({ cls: 'jrs-omni-sub', text: cid.split(':')[0] });
          const runFn = () => this.app.commands.executeCommandById(cid);
          item.onclick = () => run(items.length);
          items.push({ run: runFn, el: item });
        });
      }
      if (!items.length) {
        panel.createEl('div', { cls: 'jrs-omni-empty', text: `没有匹配「${input.value.trim()}」的结果` });
      }
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
    input.onblur = () => { window.setTimeout(() => panel.removeClass('is-open'), 150); };

    const actions = h.createEl('div', { cls: 'od-header-actions' });
    const mkBtn = (cls, icon, label, fn) => {
      const b = actions.createEl('button', { cls });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
      return b;
    };
    mkBtn('od-btn od-btn--primary', 'library', '文献库', () => this.plugin.activateLibrary());
    mkBtn('od-btn', 'file-plus', '添加文献', () => new AddPaperModal(this.plugin, () => this.render()).open());
    mkBtn('od-btn', 'import', '批量导入', () => new ImportFolderModal(this.plugin, () => this.render()).open());
    mkBtn('od-btn od-btn--ghost', 'layout-grid', '卡片', () => new CardManagerModal(this.plugin, () => this.render()).open());
    return h;
  }

  renderOmniboxTip() {
    const { el } = this.card('搜索技巧', 'search', null);
    const tip = el.createEl('div', { cls: 'od-hint' });
    tip.innerHTML = '顶部搜索框一次搜 <b>笔记 · 文献 · 命令</b>（↑↓ 选择，回车打开）。此卡可在「卡片管理」中隐藏。';
    return el;
  }

  /* ---------- 拖拽排序（借鉴 Hearth 自由布局的轻量实现） ---------- */

  enableDrag(grid) {
    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest?.('.od-card');
      if (!card) return;
      this._dragId = card.dataset.cardId;
      card.addClass('od-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    grid.addEventListener('dragend', (e) => {
      const card = e.target.closest?.('.od-card');
      card?.removeClass('od-card--dragging');
      this._dragId = null;
    });
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = grid.querySelector('.od-card--dragging');
      if (!dragging) return;
      const after = this.getDragAfterElement(grid, e.clientX, e.clientY);
      if (after == null) grid.appendChild(dragging);
      else if (after !== dragging) grid.insertBefore(dragging, after);
    });
    grid.addEventListener('drop', async (e) => {
      e.preventDefault();
      const order = [...grid.children].map((c) => c.dataset.cardId).filter(Boolean);
      this.plugin.settings.cardOrder = order;
      await this.plugin.saveSettings();
      new Notice('卡片顺序已保存');
      this.render();
    });
  }

  getDragAfterElement(container, x, y) {
    const cards = [...container.querySelectorAll('.od-card:not(.od-card--dragging)')];
    let closest = null;
    let closestDist = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closestDist = dist; closest = c; }
    }
    if (!closest) return null;
    const r = closest.getBoundingClientRect();
    const after = (y > r.top + r.height / 2) || (Math.abs(y - (r.top + r.height / 2)) < 12 && x > r.left + r.width / 2);
    return after ? closest.nextElementSibling : closest;
  }

  /* ---------- 番茄钟卡 ---------- */

  buildPomoCard() {
    const { el } = this.card('番茄钟', 'timer', 'pomo');
    const box = el.createEl('div', { cls: 'od-pomo' });
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
    this._pomoReset = ctrl.createEl('button', { cls: 'od-btn od-btn--ghost' });
    setIcon(this._pomoReset.createSpan(), 'rotate-ccw');
    this._pomoReset.append('重置');
    this._pomoReset.onclick = () => this.plugin.pomo.reset();
    this._pomoStart.onclick = () => {
      if (this.plugin.pomo.phase === 'idle') this.plugin.pomo.start();
      else this.plugin.pomo.reset();
    };
    this._pomoCount = box.createEl('div', { cls: 'od-pomo-count' });
    this.renderPomo();
    return el;
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

  /* ---------- 日历卡 ---------- */

  renderCalendar() {
    const { el } = this.card('日历', 'calendar-days', 'calendar');
    const nav = el.createEl('div', { cls: 'od-cal-nav' });
    const prev = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(prev, 'chevron-left');
    const title = nav.createEl('div', { cls: 'od-cal-title' });
    const next = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(next, 'chevron-right');
    const mount = el.createEl('div');
    const rerender = () => {
      mount.empty();
      mount.appendChild(this.calGrid());
      mount.appendChild(this.calLegend());
      title.textContent = this.calMoment.format('YYYY年M月');
    };
    prev.onclick = () => { this.calMoment.subtract(1, 'month'); rerender(); };
    next.onclick = () => { this.calMoment.add(1, 'month'); rerender(); };
    rerender();
    return el;
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
      const hasNote = !!this.plugin.findDailyNote(key);
      const pomoMin = (this.plugin.settings.pomoLog || {})[key]?.minutes || 0;
      if (dayM.isSame(todayM, 'day')) btn.addClass('od-cal-day--today');
      if (hasNote) { btn.addClass('od-cal-day--has-note'); btn.createEl('i', { cls: 'dot' }); }
      if (pomoMin > 0) btn.createEl('i', { cls: 'dot dot--pomo' });
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

  /* ---------- 今日待办卡 ---------- */

  async renderTasks() {
    const { el } = this.card('今日待办', 'list-checks', 'tasks');
    const tasks = await this.plugin.getTodayTasks();
    const list = el.createEl('div', { cls: 'od-tasks' });
    if (!tasks.length) {
      list.createEl('div', { cls: 'od-task-empty', text: '今天还没有待办，添加一条开始科研吧' });
    }
    tasks.forEach((t) => {
      const row = list.createEl('label', { cls: `od-task${t.done ? ' is-done' : ''}` });
      const cb = row.createEl('input', { type: 'checkbox' });
      cb.checked = t.done;
      cb.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.toggleDailyTask(t);
        this.render();
      };
      const txt = row.createEl('span', { cls: 'od-task-text' });
      txt.textContent = t.text;
      row.onclick = () => this.plugin.openDailyNote();
    });
    const inputRow = el.createEl('div', { cls: 'jrs-task-add' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '快速添加待办，回车确认…' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '添加' });
    const submit = async () => {
      const v = input.value.trim();
      if (!v) return;
      await this.plugin.appendDailyTask(v);
      input.value = '';
      this.render();
    };
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    return el;
  }

  /* ---------- arXiv 资讯卡 ---------- */

  async renderArxiv() {
    const { el } = this.card('arXiv 资讯', 'newspaper', 'arxiv');
    const cache = this.plugin.settings.arxivCache;
    const refresh = el.createEl('div', { cls: 'jrs-arxiv-head' });
    const q = refresh.createEl('span', { cls: 'od-hint' });
    q.textContent = `关键词：${this.plugin.settings.arxivQuery}`;
    const rb = refresh.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(rb.createSpan(), 'refresh-cw');
    rb.append('刷新');
    rb.onclick = async () => {
      await this.plugin.fetchArxiv(true);
      this.render();
    };

    if (!cache || !cache.items || !cache.items.length) {
      el.createEl('div', { cls: 'od-task-empty', text: '暂无 arXiv 数据，点击「刷新」获取最新论文' });
      return el;
    }
    const list = el.createEl('div', { cls: 'jrs-arxiv-list' });
    cache.items.slice(0, this.plugin.settings.arxivMax).forEach((it) => {
      const row = list.createEl('div', { cls: 'jrs-arxiv-item' });
      const main = row.createEl('div', { cls: 'jrs-arxiv-main' });
      const title = main.createEl('div', { cls: 'jrs-arxiv-title' });
      title.textContent = it.title;
      title.onclick = () => window.open(it.url);
      const meta = main.createEl('div', { cls: 'od-hint' });
      meta.textContent = `${it.date} · ${it.authors}`;
      const add = row.createEl('button', { cls: 'od-icon-btn', title: '加入文献库' });
      setIcon(add, 'plus');
      add.onclick = async () => {
        await this.plugin.arxivToLibrary(it);
        new Notice('已加入文献库 📚');
        this.render();
      };
    });
    return el;
  }

  /* ---------- 文献统计卡 ---------- */

  renderLibStats() {
    const { el } = this.card('文献统计', 'book-open', 'libstats');
    const papers = this.plugin.getPapers();
    const by = (s) => papers.filter((p) => p.status === s).length;
    const row = el.createEl('div', { cls: 'od-stat-row' });
    const mk = (num, label, accent) => {
      const d = row.createEl('div', { cls: `od-stat${accent ? ' od-stat--accent' : ''}` });
      d.createEl('div', { cls: 'od-stat-num', text: String(num) });
      d.createEl('div', { cls: 'od-stat-label', text: label });
    };
    mk(papers.length, '总计', true);
    mk(by('待读'), '待读');
    mk(by('阅读中'), '阅读中');
    mk(by('已完成'), '已完成');
    const hint = el.createEl('div', { cls: 'od-hint od-clickable' });
    const week = this.plugin.papersAddedThisWeek();
    hint.textContent = `本周新增 ${week} 篇 · 点击查看文献库`;
    hint.onclick = () => this.plugin.activateLibrary();
    return el;
  }

  /* ---------- 专注趋势卡 ---------- */

  renderFocusBars() {
    const { el } = this.card('专注趋势（近 7 天）', 'flame', 'focusbars');
    const log = this.plugin.settings.pomoLog || {};
    let max = 0;
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = window.moment().subtract(i, 'days');
      const key = d.format('YYYY-MM-DD');
      const min = log[key]?.minutes || 0;
      max = Math.max(max, min);
      days.push({ d, min });
    }
    const total = days.reduce((a, b) => a + b.min, 0);
    if (!max) {
      el.createEl('div', { cls: 'od-task-empty', text: '还没有专注记录，点番茄钟卡开始第一个 25 分钟' });
      return el;
    }
    const bars = el.createEl('div', { cls: 'od-bars' });
    days.forEach(({ d, min }) => {
      const col = bars.createEl('div', { cls: 'od-bar-col' });
      const bar = col.createEl('div', { cls: 'od-bar' });
      bar.style.height = `${Math.max(4, (min / max) * 100)}%`;
      bar.title = `${d.format('M月D日')}：${min} 分钟`;
      col.createEl('div', { cls: 'od-bar-label', text: d.format('M/D') });
    });
    el.createEl('div', { cls: 'od-hint', text: `近 7 天累计专注 ${Math.round(total / 60 * 10) / 10} 小时（${total} 分钟）` });
    return el;
  }

  /* ---------- 研究方向卡 ---------- */

  renderTopics() {
    const { el } = this.card('研究方向', 'compass', 'topics');
    const papers = this.plugin.getPapers();
    const chips = el.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const n = papers.filter((p) => p.topics.includes(t)).length;
      const chip = chips.createEl('span', { cls: 'od-chip' });
      chip.createSpan({ text: t });
      chip.createEl('b', { text: String(n) });
      chip.onclick = () => this.plugin.activateLibrary(t);
    });
    el.createEl('div', { cls: 'od-hint', text: '点击方向 → 文献库筛选；方向可在设置中增删' });
    return el;
  }

  /* ---------- 综述进度卡 ---------- */

  async renderSurvey() {
    const { el } = this.card('综述进度', 'pen-line', 'survey');
    const sections = await this.plugin.getSurveyProgress();
    if (!sections.length) {
      el.createEl('div', { cls: 'od-task-empty', text: '大纲还没有任务项，打开笔记添加 - [ ] 试试' });
      return el;
    }
    const wrap = el.createEl('div');
    sections.slice(0, 7).forEach((sec) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openSurveyNote();
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: sec.name });
      top.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
      const pb = item.createEl('div', { cls: 'od-progressbar' });
      pb.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
    });
    const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });
    el.createEl('div', { cls: 'od-hint', text: `总体进度 ${all.d}/${all.t} · 点击章节打开大纲` });
    return el;
  }

  /* ---------- 快速启动卡 ---------- */

  renderLaunch() {
    const { el } = this.card('快速启动', 'rocket', 'launch');
    const grid = el.createEl('div', { cls: 'od-launch' });
    const items = [
      { icon: 'file-plus', label: '添加文献', fn: () => new AddPaperModal(this.plugin, () => this.render()).open() },
      { icon: 'import', label: '批量导入 PDF', fn: () => new ImportFolderModal(this.plugin, () => this.render()).open() },
      { icon: 'table', label: '生成文献矩阵', fn: () => this.plugin.generateMatrix() },
      { icon: 'pen-line', label: '初始化综述大纲', fn: () => this.plugin.ensureSurveyNote(true) },
      { icon: 'book-open', label: '打开文献库', fn: () => this.plugin.activateLibrary() },
      { icon: 'database', label: '外部 PDF 入库', fn: () => this.plugin.migrateExternalPdfs() },
      { icon: 'search', label: '全局搜索', fn: () => this.app.commands.executeCommandById('global-search:open') },
      { icon: 'calendar-days', label: '今日日记', fn: () => this.plugin.openDailyNote() },
      { icon: 'timer', label: '开始专注 25′', fn: () => { if (this.plugin.pomo.phase === 'idle') this.plugin.pomo.start(); } },
    ];
    items.forEach((it) => {
      const b = grid.createEl('button', { cls: 'od-launch-item' });
      setIcon(b.createSpan(), it.icon);
      b.createSpan({ text: it.label });
      b.onclick = it.fn;
    });
    return el;
  }

  /* ---------- 最近文献卡 ---------- */

  renderRecent() {
    const { el } = this.card('最近文献', 'library', 'recent');
    const papers = this.plugin.getPapersSorted('added').slice(0, 5);
    if (!papers.length) {
      el.createEl('div', { cls: 'od-task-empty', text: '文献库还是空的，用「批量导入」把 PDF 目录导进来吧' });
      return el;
    }
    const wrap = el.createEl('div');
    papers.forEach((p) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openPaper(p);
      const top = item.createEl('div', { cls: 'od-progress-top' });
      const name = top.createEl('span', { cls: 'od-progress-name' });
      name.textContent = p.title;
      const st = top.createEl('span', { cls: 'od-status' });
      st.setAttribute('data-status', p.status);
      st.textContent = p.status;
      const meta = item.createEl('div', { cls: 'od-hint' });
      meta.textContent = [p.year, p.venue].filter(Boolean).join(' · ') || '—';
    });
    return el;
  }

  /* ---------- 自定义卡片 ---------- */

  async renderCustomCard(id) {
    const def = this.plugin.settings.customCards.find((c) => `c:${c.uid}` === id);
    if (!def) return null;
    const cfg = def.cfg || {};
    if (def.type === 'note') {
      const { el } = this.card(def.title || '笔记', 'sticky-note', id);
      const f = this.app.vault.getAbstractFileByPath(normalizePath(cfg.path || ''));
      if (!(f instanceof TFile)) {
        el.createEl('div', { cls: 'od-task-empty', text: `笔记不存在：${cfg.path || '（未配置）'}` });
        return el;
      }
      const content = await this.app.vault.cachedRead(f);
      const host = el.createEl('div', { cls: 'jrs-note-embed' });
      await MarkdownRenderer.render(this.app, content, host, f.path, this);
      return el;
    }
    if (def.type === 'countdown') {
      const { el } = this.card(def.title || '倒计时', 'alarm-clock', id);
      const target = window.moment(cfg.date, 'YYYY-MM-DD');
      if (!target.isValid()) {
        el.createEl('div', { cls: 'od-task-empty', text: '未配置日期（在卡片管理中设置 YYYY-MM-DD）' });
        return el;
      }
      const days = target.diff(window.moment().startOf('day'), 'days');
      const num = el.createEl('div', { cls: 'jrs-count-num' });
      num.textContent = String(Math.abs(days));
      const lab = el.createEl('div', { cls: 'od-hint' });
      lab.textContent = days >= 0 ? `${cfg.label || '倒计时'}还有 ${days} 天（${target.format('M月D日')}）` : `${cfg.label || '节点'}已过 ${-days} 天`;
      num.toggleClass('is-urgent', days >= 0 && days <= 7);
      return el;
    }
    if (def.type === 'web') {
      const { el } = this.card(def.title || '网页', 'globe', id);
      const frame = el.createEl('iframe', { cls: 'jrs-web-frame' });
      frame.setAttribute('src', cfg.url || 'about:blank');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
      return el;
    }
    if (def.type === 'commands') {
      const { el } = this.card(def.title || '命令组', 'terminal', id);
      const ids = String(cfg.ids || '').split(/[,，;；\n]/).map((x) => x.trim()).filter(Boolean);
      const labels = String(cfg.labels || '').split(/[,，;；\n]/).map((x) => x.trim());
      const grid = el.createEl('div', { cls: 'od-launch' });
      ids.forEach((cid, i) => {
        const b = grid.createEl('button', { cls: 'od-launch-item' });
        setIcon(b.createSpan(), 'play');
        b.createSpan({ text: labels[i] || cid.split(':').pop() });
        b.onclick = () => this.app.commands.executeCommandById(cid);
      });
      if (!ids.length) el.createEl('div', { cls: 'od-task-empty', text: '未配置命令 ID' });
      return el;
    }
    return null;
  }
}

/* ==========================================================================
 * 文献库视图
 * ========================================================================== */

class LibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.q = '';
    this.statusFilter = '全部';
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

    const title = root.createEl('div', { cls: 'od-section-title' });
    title.textContent = '文献库';
    const papers = this.plugin.getPapersSorted(this.sort);
    title.createEl('span', { cls: 'od-count-badge', text: `${papers.length} 篇` });

    const bar = root.createEl('div', { cls: 'od-lib-toolbar' });
    const search = bar.createEl('div', { cls: 'od-search' });
    setIcon(search.createSpan(), 'search');
    const input = search.createEl('input', { type: 'text', placeholder: '搜索标题 / 作者 / 来源…' });
    input.value = this.q;
    input.oninput = () => { this.q = input.value; this.renderList(); };

    const sortSel = bar.createEl('select', { cls: 'od-btn' });
    [['added', '最近添加'], ['year', '年份'], ['title', '标题'], ['rating', '评分']].forEach(([v, l]) => {
      const o = sortSel.createEl('option', { value: v });
      o.textContent = l;
    });
    sortSel.value = this.sort;
    sortSel.onchange = () => { this.sort = sortSel.value; this.renderList(); };

    const bAdd = bar.createEl('button', { cls: 'od-btn od-btn--primary', text: '＋ 添加文献' });
    bAdd.onclick = () => new AddPaperModal(this.plugin, () => this.render()).open();
    const bImp = bar.createEl('button', { cls: 'od-btn', text: '批量导入' });
    bImp.onclick = () => new ImportFolderModal(this.plugin, () => this.render()).open();
    const bMat = bar.createEl('button', { cls: 'od-btn', text: '文献矩阵' });
    bMat.onclick = () => this.plugin.generateMatrix();
    const bMig = bar.createEl('button', { cls: 'od-btn', text: '外部 PDF 入库' });
    bMig.onclick = () => this.plugin.migrateExternalPdfs().then(() => this.render());

    const fRow = root.createEl('div', { cls: 'od-filters' });
    ['全部', ...STATUSES].forEach((s) => {
      const c = fRow.createEl('button', { cls: `od-filter${this.statusFilter === s ? ' is-active' : ''}`, text: s });
      c.onclick = () => { this.statusFilter = s; this.render(); };
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
      if (this.topicFilter && !p.topics.includes(this.topicFilter)) return false;
      if (q) {
        const hay = `${p.title} ${p.authors} ${p.venue}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
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
      const hasFilter = this.q || this.topicFilter || this.statusFilter !== '全部';
      e.createSpan({ text: hasFilter ? '没有符合条件的文献，换个筛选试试' : '文献库为空，点击右上角「添加文献」或「批量导入」开始' });
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
    if (p.pdf) {
      const b = acts.createEl('button', { cls: 'od-icon-btn', title: isHttp(p.pdf) ? '打开在线 PDF' : '打开 PDF' });
      setIcon(b, isHttp(p.pdf) || isExternalPath(p.pdf) ? 'external-link' : 'book');
      b.onclick = (e) => { e.stopPropagation(); this.plugin.openPdf(p.pdf); };
    }
    const bAi = acts.createEl('button', { cls: 'od-icon-btn', title: 'AI 补全摘要（需在设置配置 API）' });
    setIcon(bAi, 'sparkles');
    bAi.onclick = async (e) => {
      e.stopPropagation();
      new Notice('AI 摘要生成中…');
      try { await this.plugin.aiSummarize(p); } catch (err) { new Notice(`AI 摘要失败：${err.message}`); }
    };
    const bNote = acts.createEl('button', { cls: 'od-icon-btn', title: '打开笔记' });
    setIcon(bNote, 'file-text');
    bNote.onclick = (e) => { e.stopPropagation(); this.plugin.openPaper(p); };

    el.onclick = () => this.plugin.openPaper(p);
    return el;
  }
}

/* ==========================================================================
 * 弹窗：添加文献
 * ========================================================================== */

class AddPaperModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.data = { title: '', authors: '', year: '', venue: '', status: '待读', topics: [], pdf: '' };
  }

  onOpen() {
    this.titleEl.setText('添加文献');
    const { contentEl } = this;
    contentEl.empty();
    const mkText = (label, key, placeholder) => {
      new Setting(contentEl).setName(label).addText((t) => {
        t.inputEl.placeholder = placeholder || '';
        t.onChange(() => { this.data[key] = t.getValue(); });
      });
    };
    mkText('标题 *', 'title', '如：基于网格剖分的敏捷卫星区域目标观测调度方法');
    mkText('作者', 'authors', '如：伍国华, 祝江汉');
    mkText('年份', 'year', '2024');
    mkText('期刊 / 会议', 'venue', '如：宇航学报');
    new Setting(contentEl).setName('PDF 链接或库内路径（可选）').setDesc('在线 PDF 填 https://…；库内 PDF 填相对路径；本地外部文件填绝对路径').addText((t) => {
      t.inputEl.placeholder = 'https://arxiv.org/pdf/… 或 科研工作台/PDF/x.pdf';
      t.onChange(() => { this.data.pdf = t.getValue(); });
    });
    new Setting(contentEl).setName('状态').addDropdown((d) => {
      STATUSES.forEach((s) => d.addOption(s, s));
      d.setValue('待读');
      d.onChange(() => { this.data.status = d.getValue(); });
    });
    const topicSetting = new Setting(contentEl).setName('研究方向（可多选）');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const c = chipWrap.createEl('span', { cls: 'od-chip', text: t });
      c.addClass('od-chip--select');
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

/* ==========================================================================
 * 弹窗：批量导入 PDF
 * ========================================================================== */

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
    let copyIn = this.plugin.settings.pdfCopy !== false;
    new Setting(contentEl).setName('PDF 所在文件夹').setDesc('扫描该文件夹（可含子文件夹）内的 PDF 并创建文献卡片').addText((t) => {
      t.inputEl.style.width = '340px';
      t.inputEl.setValue(folder);
      t.onChange(() => { folder = t.getValue(); });
    });
    new Setting(contentEl).setName('包含子文件夹').addToggle((tg) => tg.setValue(true).onChange((v) => { recursive = v; }));
    new Setting(contentEl).setName('PDF 复制入库（推荐）').setDesc(`复制到 ${this.plugin.settings.pdfFolder}/，可在 Obsidian 内直接阅读与高亮批注；关闭则仅记录外部路径`)
      .addToggle((tg) => tg.setValue(copyIn).onChange((v) => { copyIn = v; }));
    const resultEl = contentEl.createEl('div');
    resultEl.addClass('jrs-import-result');
    new Setting(contentEl).addButton((b) => b.setButtonText('开始导入').setCta().onClick(async () => {
      b.setDisabled(true);
      resultEl.empty();
      const progress = resultEl.createEl('div', { cls: 'od-hint' });
      try {
        const res = await this.plugin.importPdfFolder(folder, recursive, copyIn, (msg) => { progress.textContent = msg; });
        new Notice(`导入完成：新增 ${res.created} 篇，跳过 ${res.skipped} 篇`);
        resultEl.createEl('div', { cls: 'od-hint', text: `✅ 新增 ${res.created} 篇 · 跳过已存在 ${res.skipped} 篇 · 失败 ${res.failed} 篇` });
        if (this.onDone) window.setTimeout(this.onDone, 400);
      } catch (err) {
        new Notice(`导入失败：${err.message}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `❌ ${err.message}` });
      }
      b.setDisabled(false);
    }));
  }
}

/* ==========================================================================
 * 弹窗：卡片管理
 * ========================================================================== */

class CardManagerModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.onDone = onDone;
  }

  cardName(id) {
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return b.name;
    const c = this.plugin.settings.customCards.find((x) => `c:${x.uid}` === id);
    return c ? `${c.title}（自定义·${CUSTOM_TYPES[c.type]?.name || c.type}）` : id;
  }

  allIds() {
    const order = this.plugin.settings.cardOrder.slice();
    const known = [...BUILTIN_CARDS.map((c) => c.id), ...this.plugin.settings.customCards.map((c) => `c:${c.uid}`)];
    known.forEach((id) => { if (!order.includes(id)) order.push(id); });
    return order;
  }

  async refresh() {
    await this.plugin.saveSettings();
    this.display();
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    const list = contentEl.createEl('div');
    list.addClass('jrs-cm-list');
    const ids = this.allIds();
    ids.forEach((id, i) => {
      const s = this.plugin.settings;
      const row = list.createEl('div', { cls: 'jrs-cm-row' });
      const name = row.createEl('span', { cls: 'jrs-cm-name', text: this.cardName(id) });
      const hidden = s.hiddenCards.includes(id);
      const tgl = row.createEl('button', { cls: `od-btn od-btn--sm${hidden ? '' : ' od-btn--primary'}` });
      tgl.textContent = hidden ? '已隐藏' : '显示中';
      tgl.onclick = async () => {
        if (hidden) s.hiddenCards.remove(id);
        else if (!s.hiddenCards.includes(id)) s.hiddenCards.push(id);
        await this.refresh();
      };
      const up = row.createEl('button', { cls: 'od-btn od-btn--sm', text: '↑' });
      up.disabled = i === 0;
      up.onclick = async () => { ids.splice(i, 1); ids.splice(i - 1, 0, id); s.cardOrder = ids; await this.refresh(); };
      const down = row.createEl('button', { cls: 'od-btn od-btn--sm', text: '↓' });
      down.disabled = i === ids.length - 1;
      down.onclick = async () => { ids.splice(i, 1); ids.splice(i + 1, 0, id); s.cardOrder = ids; await this.refresh(); };
      if (id.startsWith('c:')) {
        const del = row.createEl('button', { cls: 'od-btn od-btn--sm', text: '删除' });
        del.onclick = async () => {
          s.customCards = s.customCards.filter((x) => `c:${x.uid}` !== id);
          s.cardOrder = ids.filter((x) => x !== id);
          await this.refresh();
        };
      }
    });

    contentEl.createEl('h4', { text: '添加自定义卡片' });
    let type = 'note';
    const typeSel = new Setting(contentEl).setName('类型').addDropdown((d) => {
      Object.entries(CUSTOM_TYPES).forEach(([k, v]) => d.addOption(k, v.name));
      d.onChange(() => { type = d.getValue(); });
    });
    const cfgBox = contentEl.createEl('div');
    cfgBox.addClass('jrs-cm-cfg');
    const buildForm = () => {
      cfgBox.empty();
      const def = CUSTOM_TYPES[type].cfg;
      const fields = { title: '卡片标题' };
      if (type === 'note') fields.path = '笔记路径（库内）';
      if (type === 'countdown') { fields.label = '节点名称'; fields.date = '日期（YYYY-MM-DD）'; }
      if (type === 'web') fields.url = '网址';
      if (type === 'commands') { fields.ids = '命令 ID（逗号分隔）'; fields.labels = '显示名（逗号分隔，可空）'; }
      const values = { ...def };
      Object.entries(fields).forEach(([k, label]) => {
        new Setting(cfgBox).setName(label).addText((t) => {
          t.setValue(String(values[k] || ''));
          t.onChange(() => { values[k] = t.getValue(); });
        });
      });
      cfgBox._values = values;
    };
    buildForm();
    typeSel.components?.forEach?.(() => {});
    /* 类型切换时重建表单 */
    const selEl = typeSel.settingEl.querySelector('select');
    selEl?.addEventListener('change', buildForm);

    new Setting(contentEl).addButton((b) => b.setButtonText('添加卡片').setCta().onClick(async () => {
      const values = cfgBox._values || {};
      const uid = Date.now();
      this.plugin.settings.customCards.push({
        uid, type,
        title: values.title || CUSTOM_TYPES[type].name,
        cfg: { ...CUSTOM_TYPES[type].cfg, ...values },
      });
      this.plugin.settings.cardOrder.push(`c:${uid}`);
      new Notice('卡片已添加（可在上方调整顺序与显隐）');
      await this.refresh();
    }));
  }

  onClose() { if (this.onDone) this.onDone(); }
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

    containerEl.createEl('h3', { text: '路径' });
    new Setting(containerEl).setName('文献笔记目录').addText((t) => { t.setValue(s.libFolder); t.onChange(async (v) => { s.libFolder = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('PDF 存放目录').setDesc('「复制入库」的 PDF 存放位置').addText((t) => { t.setValue(s.pdfFolder); t.onChange(async (v) => { s.pdfFolder = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('日记目录').setDesc('留空 = 库根目录').addText((t) => { t.setValue(s.dailyFolder); t.onChange(async (v) => { s.dailyFolder = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('综述大纲笔记').addText((t) => { t.setValue(s.surveyNote); t.onChange(async (v) => { s.surveyNote = v.trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '番茄钟' });
    const numSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc)
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

    containerEl.createEl('h3', { text: '外观' });
    new Setting(containerEl).setName('强调色').addDropdown((d) => {
      Object.entries(ACCENTS).forEach(([k, v]) => d.addOption(k, v.name));
      d.setValue(s.accent);
      d.onChange(async (v) => { s.accent = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('毛玻璃卡片').addToggle((t) => t.setValue(s.glass).onChange(async (v) => { s.glass = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));

    containerEl.createEl('h3', { text: '背景' });
    new Setting(containerEl).setName('背景模式').addDropdown((d) => {
      d.addOption('none', '无（跟随主题）');
      d.addOption('color', '纯色');
      d.addOption('image', '图片');
      d.setValue(s.bgMode);
      d.onChange(async (v) => { s.bgMode = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('纯色背景颜色').addColorPicker((c) => c.setValue(s.bgColor).onChange(async (v) => { s.bgColor = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    new Setting(containerEl).setName('背景图片（库内路径）').setDesc('建议放入库内，如 科研工作台/背景/7.jpg；留空则用默认渐变')
      .addText((t) => { t.setValue(s.bgImage); t.onChange(async (v) => { s.bgImage = v.trim(); await this.plugin.saveSettings(); this.plugin.applyAppearance(); }); });

    containerEl.createEl('h3', { text: 'arXiv 资讯' });
    new Setting(containerEl).setName('检索关键词').setDesc('arXiv 全文检索式，如 satellite scheduling OR earth observation').addText((t) => {
      t.setValue(s.arxivQuery);
      t.onChange(async (v) => { s.arxivQuery = v; s.arxivCache = null; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName('显示条数').addText((t) => {
      t.inputEl.type = 'number';
      t.setValue(String(s.arxivMax));
      t.onChange(async (v) => { const n = parseInt(v, 10); if (n > 0 && n <= 20) { s.arxivMax = n; await this.plugin.saveSettings(); } });
    });

    containerEl.createEl('h3', { text: 'AI 摘要（OpenAI 兼容）' });
    new Setting(containerEl).setName('API Base URL').addText((t) => { t.setValue(s.ai.baseUrl); t.onChange(async (v) => { s.ai.baseUrl = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('API Key').addText((t) => { t.inputEl.type = 'password'; t.setValue(s.ai.apiKey); t.onChange(async (v) => { s.ai.apiKey = v.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('模型').addText((t) => { t.setValue(s.ai.model); t.onChange(async (v) => { s.ai.model = v.trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: 'MinerU 解析（可选）' });
    new Setting(containerEl).setName('MinerU 命令').setDesc('本机已安装的 MinerU CLI 命令（pip install -U "mineru[core]"），用于 PDF→Markdown 高质量解析').addText((t) => { t.setValue(s.mineruCmd); t.onChange(async (v) => { s.mineruCmd = v.trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '科研' });
    new Setting(containerEl).setName('科研起始日').setDesc('YYYY-MM-DD，用于「科研第 N 天」').addText((t) => { t.setValue(s.researchStart); t.onChange(async (v) => { s.researchStart = v.trim(); await this.plugin.saveSettings(); }); });

    const topicSetting = new Setting(containerEl).setName('研究方向标签').setDesc('点击 × 删除；输入新名称回车添加');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    const renderChips = () => {
      chipWrap.empty();
      s.topics.forEach((t) => {
        const c = chipWrap.createEl('span', { cls: 'od-chip' });
        c.createSpan({ text: t });
        const x = c.createEl('span', { text: '×' });
        x.addClass('jrs-chip-x');
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
    this.addCommand({ id: 'init-survey', name: '初始化综述大纲', callback: () => this.ensureSurveyNote(true) });
    this.addCommand({ id: 'pdf-to-vault', name: '外部 PDF 一键入库（复制进库并改为内部阅读）', callback: () => this.migrateExternalPdfs() });
    this.addCommand({ id: 'card-manager', name: '卡片管理', callback: () => new CardManagerModal(this).open() });
    this.addCommand({ id: 'refresh-arxiv', name: '刷新 arXiv 资讯', callback: async () => { await this.fetchArxiv(true); new Notice('arXiv 已刷新'); this.activateDashboard(); } });
    this.addCommand({
      id: 'ai-summarize-active',
      name: 'AI 摘要当前文献笔记',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && f.path.startsWith(this.settings.libFolder);
        if (checking) return ok;
        if (ok) this.aiSummarize({ file: f, title: f.basename }).catch((e) => new Notice(`AI 摘要失败：${e.message}`));
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
    /* 嵌套对象逐字段兜底 */
    this.settings.ai = Object.assign({}, structuredClone(DEFAULT_SETTINGS.ai), stored?.ai || {});
    if (!Array.isArray(this.settings.topics)) this.settings.topics = [...DEFAULT_TOPICS];
    if (!Array.isArray(this.settings.hiddenCards)) this.settings.hiddenCards = [];
    if (!Array.isArray(this.settings.cardOrder) || !this.settings.cardOrder.length) {
      this.settings.cardOrder = BUILTIN_CARDS.map((c) => c.id);
    }
    if (!this.settings.cardSizes || typeof this.settings.cardSizes !== 'object') this.settings.cardSizes = {};
    if (!Array.isArray(this.settings.customCards)) this.settings.customCards = [];
    if (!this.settings.pomoLog) this.settings.pomoLog = {};
    if (typeof this.settings.pdfCopy === 'undefined') this.settings.pdfCopy = true;
  }

  async saveSettings() { await this.saveData(this.settings); }

  applyAppearance() {
    const acc = ACCENTS[this.settings.accent] || ACCENTS.blue;
    document.body.style.setProperty('--od-accent', acc.hex);
    document.body.style.setProperty('--od-accent-soft', hexToRgba(acc.hex, 0.14));
    document.body.toggleClass('od-glass', !!this.settings.glass);

    /* 背景（作用域：本插件视图） */
    const viewBg = (mode) => {
      document.body.removeClass('jrs-bg-on');
      if (mode !== 'none') document.body.addClass('jrs-bg-on');
    };
    if (this.settings.bgMode === 'color') {
      document.body.style.setProperty('--jrs-bg', this.settings.bgColor || '#e8edf7');
      document.body.style.setProperty('--jrs-bg-image', 'none');
      viewBg('color');
    } else if (this.settings.bgMode === 'image') {
      let url = '';
      const imgPath = normalizePath(this.settings.bgImage || '');
      const f = imgPath ? this.app.vault.getAbstractFileByPath(imgPath) : null;
      if (f instanceof TFile) url = this.app.vault.getResourcePath(f);
      else url = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      if (url && !url.startsWith('linear')) url = `url("${url}")`;
      document.body.style.setProperty('--jrs-bg-image', url);
      document.body.style.setProperty('--jrs-bg', 'transparent');
      viewBg('image');
    } else {
      document.body.style.setProperty('--jrs-bg-image', 'none');
      viewBg('none');
    }
  }

  /* ---------- 视图 ---------- */

  async activateDashboard() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_DASHBOARD);
    if (existing.length) { workspace.revealLeaf(existing[0]); return; }
    const leaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_DASHBOARD, active: true });
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
        const view = leaf.view;
        if (view instanceof LibraryView) {
          view.topicFilter = this.libFilterTopic;
          this.libFilterTopic = '';
          view.render();
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
      const tpl = `# ${k}\n\n## 今日待办\n\n## 专注记录\n`;
      f = await this.app.vault.create(this.dailyPath(key), tpl);
    }
    await this.app.workspace.getLeaf(false).openFile(f);
  }

  appendPomoToDaily(minutes) {
    try {
      const f = this.findDailyNote();
      const line = `- 🍅 专注 ${minutes} 分钟（${window.moment().format('HH:mm')}）`;
      if (f) this.app.vault.append(f, `\n${line}`);
    } catch (e) { /* 日记写入失败不影响计时 */ }
  }

  todayPomoMinutes() { return (this.settings.pomoLog[todayKey()] || {}).minutes || 0; }

  async getTodayTasks() {
    const f = this.findDailyNote();
    if (!f) return [];
    const content = await this.app.vault.cachedRead(f);
    const lines = content.split('\n');
    const tasks = [];
    const re = /^(\s*)- \[( |x|X)\] (.+)$/;
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(re);
      if (m) tasks.push({ line: i, done: m[2].toLowerCase() === 'x', text: m[3].trim() });
    }
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
      const authorsArr = authors.split(/[,，;；]/).filter(Boolean);
      return {
        file: f,
        path: f.path,
        added: f.stat.ctime,
        title: fm.title || f.basename,
        authors,
        authorsShort: authorsArr.length ? authorsArr[0] + (authorsArr.length > 1 ? ' 等' : '') : '',
        year: fm.year ? String(fm.year) : '',
        venue: fm.venue || '',
        status: STATUSES.includes(fm.status) ? fm.status : '待读',
        topics: topics.filter(Boolean),
        rating: typeof fm.rating === 'number' ? fm.rating : 0,
        pdf: fm.pdf || '',
      };
    });
  }

  getPapersSorted(sort) {
    const papers = this.getPapers();
    if (sort === 'year') return papers.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));
    if (sort === 'title') return papers.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    if (sort === 'rating') return papers.sort((a, b) => b.rating - a.rating);
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
      data.topics && data.topics.length ? `topics: [${data.topics.map((t) => `"${t}"`).join(', ')}]` : 'topics: []',
      'rating: 0',
      pdfVal ? `pdf: "${pdfVal.replace(/"/g, "'")}"` : 'pdf: ""',
      `added: ${todayKey()}`,
      '---',
      '',
    ].join('\n');

    const pdfLink = pdfVal && !isHttp(pdfVal) && !isExternalPath(pdfVal)
      ? `\n📎 原文：[[${pdfVal.split('/').pop()}]]\n`
      : '';
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
    ].filter((x) => x !== undefined).join('\n');

    const file = await this.app.vault.create(path, fm + body);
    if (open) await this.app.workspace.getLeaf(false).openFile(file);
    return file;
  }

  async setPaperStatus(p, status) {
    await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.status = status; });
  }

  async setPaperRating(p, rating) {
    await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.rating = rating; });
  }

  openPaper(p) { this.app.workspace.getLeaf(false).openFile(p.file); }

  openPdf(pdf) {
    if (!pdf) return;
    if (isHttp(pdf)) { window.open(pdf); return; }
    const rel = toPosix(pdf);
    const f = this.app.vault.getAbstractFileByPath(normalizePath(rel));
    if (f instanceof TFile) {
      /* 库内 PDF：Obsidian 原生查看器（支持高亮批注/反向链接） */
      this.app.workspace.getLeaf(false).openFile(f);
      return;
    }
    if (isExternalPath(pdf)) {
      try {
        const electron = window.require && window.require('electron');
        if (electron?.shell?.openPath) { electron.shell.openPath(pdf); return; }
      } catch (e) { /* fallthrough */ }
      try {
        if (this.app.openWithDefaultApp) { this.app.openWithDefaultApp(pdf); return; }
      } catch (e) { /* fallthrough */ }
      navigator.clipboard?.writeText(pdf);
      new Notice('已复制 PDF 路径（当前环境无法直接打开外部文件）');
      return;
    }
    new Notice(`找不到 PDF：${pdf}`);
  }

  /* ---------- 批量导入（可复制入库，借鉴 MinerU 场景的“PDF 即资料”理念） ---------- */

  async importPdfFolder(folderPath, recursive, copyIntoVault, onProgress) {
    if (!window.require) throw new Error('仅桌面端支持扫描本地文件夹');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    if (!fs.existsSync(folderPath)) throw new Error(`文件夹不存在：${folderPath}`);

    const pdfs = [];
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
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

  /** 外部 PDF 一键迁移入库（改为 Obsidian 内部阅读） */
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
        let content = await this.app.vault.cachedRead(p.file);
        if (!content.includes(`[[${base}]]`)) {
          content = content.replace(/^# .+\n/, (m) => `${m}\n📎 原文：[[${base}]]\n`);
          await this.app.vault.modify(p.file, content);
        }
        ok += 1;
      } catch (e) { fail += 1; console.error('[JRS] PDF 迁移失败', p.pdf, e); }
    }
    new Notice(`迁移完成：成功 ${ok}，失败 ${fail}`);
  }

  /* ---------- arXiv ---------- */

  async fetchArxiv(force = false) {
    const cache = this.settings.arxivCache;
    const fresh = cache && cache.ts && Date.now() - cache.ts < 12 * 3600 * 1000;
    if (!force && fresh && cache.items?.length) return cache;
    try {
      /* arXiv API 要求空格编码为 +（%20 会 400） */
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
      return this.settings.arxivCache;
    } catch (e) {
      console.error('[JRS] arXiv 获取失败', e);
      return { ts: cache?.ts || 0, items: cache?.items || [] };
    }
  }

  async ensureArxivFresh() {
    const before = this.settings.arxivCache?.ts || 0;
    const result = await this.fetchArxiv(false);
    /* 首次拉取成功后刷新一次仪表盘，让 arXiv 卡自动出现 */
    if ((result?.ts || 0) > before && result.items?.length) {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)[0];
      if (leaf?.view instanceof DashboardView) leaf.view.render();
    }
    return result;
  }

  async arxivToLibrary(it) {
    const year = it.date ? it.date.slice(0, 4) : '';
    const topics = this.settings.topics.filter((t) =>
      `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title,
      authors: it.authors,
      year,
      venue: 'arXiv',
      status: '待读',
      topics: topics.slice(0, 3),
      pdf: it.url ? it.url.replace('/abs/', '/pdf/') : '',
    }, false);
  }

  /* ---------- AI 摘要（借鉴 Research OS 的 AI 补全思路） ---------- */

  async aiSummarize(paper) {
    const ai = this.settings.ai;
    if (!ai.apiKey) throw new Error('请先在「设置 → AI 摘要」填写 API Key');
    const content = await this.app.vault.cachedRead(paper.file);
    const source = content.split('---').slice(2).join('---').slice(0, 3500);
    const sys = '你是严谨的科研助理。根据提供的文献笔记内容，生成四个部分的简明中文要点（每部分 1-4 句，可含短列表）。只输出 markdown 正文，不要代码块包裹。';
    const user = `文献笔记：\n${source}\n\n请输出（使用这些确切标题）：\n## 一句话总结\n## 问题设定（卫星/目标/约束）\n## 求解算法\n## 可借鉴点`;
    const resp = await requestUrl({
      url: `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.3,
        max_tokens: 900,
      }),
      throw: false,
    });
    if (resp.status !== 200) throw new Error(`API ${resp.status}：${(resp.text || '').slice(0, 120)}`);
    const out = resp.json?.choices?.[0]?.message?.content || '';
    if (!out) throw new Error('模型返回为空');
    let c = content;
    ['一句话总结', '问题设定（卫星/目标/约束）', '求解算法', '可借鉴点'].forEach((h) => {
      const m = out.match(new RegExp(`## ${h.replace(/[()]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
      if (m && m[1].trim()) c = replaceSection(c, h, m[1].trim());
    });
    await this.app.vault.modify(paper.file, c);
    new Notice('AI 摘要已写入笔记 ✨');
    await this.app.workspace.getLeaf(false).openFile(paper.file);
  }

  /* ---------- MinerU 解析（吸收 MinerU 的 PDF→Markdown 价值） ---------- */

  async mineruExtract(paper) {
    if (!window.require) throw new Error('仅桌面端支持');
    const { exec } = window.require('child_process');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    const content = await this.app.vault.cachedRead(paper.file);
    let fmPdf = (content.match(/^pdf: "(.*)"$/m) || [])[1] || '';
    if (!fmPdf) throw new Error('该笔记没有 pdf 字段');
    let absPdf = fmPdf;
    if (!isExternalPath(fmPdf) && !isHttp(fmPdf)) {
      const basePath = this.app.vault.adapter?.basePath;
      if (!basePath) throw new Error('无法定位库路径（仅桌面端文件库支持）');
      absPdf = pathMod.join(basePath, normalizePath(fmPdf));
    }
    if (isHttp(fmPdf)) throw new Error('在线 PDF 请先下载入库');
    if (!fs.existsSync(absPdf)) throw new Error(`PDF 不存在：${absPdf}`);

    const basePath = this.app.vault.adapter.basePath;
    const outDir = pathMod.join(basePath, '.jrs-tmp', `mineru-${Date.now()}`);
    new Notice('MinerU 解析中，可能需要几分钟…');
    const cmd = `"${this.settings.mineruCmd}" -p "${absPdf}" -o "${outDir}"`;
    await new Promise((resolve, reject) => {
      exec(cmd, { timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${String(stderr).slice(0, 200)}`));
        else resolve(stdout);
      });
    });
    const findMd = (dir) => {
      let found = null;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) { const r = findMd(full); if (r) { found = r; break; } }
        else if (/\.md$/i.test(e.name)) { found = full; break; }
      }
      return found;
    };
    const md = findMd(outDir);
    if (!md) throw new Error('未找到 MinerU 输出的 Markdown');
    let text = fs.readFileSync(md, 'utf-8');
    if (text.length > 60000) text = `${text.slice(0, 60000)}\n\n…（过长已截断，完整内容见 .jrs-tmp）`;
    const updated = replaceSection(content, '原文提取（MinerU）', text);
    await this.app.vault.modify(paper.file, updated);
    new Notice('MinerU 解析结果已写入「原文提取」小节 ✅');
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
    if (!papers.length) { new Notice('文献库为空，先添加/导入文献'); return; }
    const rows = [
      '| 文献 | 年份 | 来源 | 研究方向 | 状态 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = p.title.replace(/\|/g, '\\|');
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      rows.push(`| ${link} | ${p.year || '—'} | ${p.venue || '—'} | ${p.topics.join('、') || '—'} | ${p.status} | ${'★'.repeat(p.rating) || '—'} |  |  |  |`);
    }
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/');
    const matrixPath = dir ? `${dir}/文献矩阵.md` : '文献矩阵.md';
    const content = [
      '# 文献矩阵',
      '',
      `> 自动生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 共 ${papers.length} 篇。「问题设定 / 网格作用 / 求解算法」留给精读后填写。`,
      '',
      rows.join('\n'),
      '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(matrixPath);
    if (old instanceof TFile) {
      await this.app.vault.modify(old, content);
      await this.app.workspace.getLeaf(false).openFile(old);
    } else {
      const file = await this.app.vault.create(matrixPath, content);
      await this.app.workspace.getLeaf(false).openFile(file);
    }
    new Notice(`文献矩阵已生成（${papers.length} 篇）`);
  }
};
