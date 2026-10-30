/* ==========================================================================
 * Jensen 科研工作站 v0.22.0 —— 分页面工作区、方向标签与 PDF 阅读
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

/* BEGIN GENERATED CORE */
const ResearchCore = (() => {
// Pure domain logic. tools/build.mjs embeds this module in the distributable main.js.
const STATUS_VALUES = ['待读', '阅读中', '已完成', '已归档'];
const QUERY_FIELDS = {
  status: 'status', 状态: 'status', topic: 'topics', 方向: 'topics',
  priority: 'priority', 优先级: 'priority', year: 'year', 年份: 'year',
  rating: 'rating', 评分: 'rating', project: 'project', 项目: 'project',
  author: 'authors', 作者: 'authors', venue: 'venue', 来源: 'venue',
  has: 'has', 有: 'has', title: 'title', 标题: 'title',
};

function normalizeReadingState(status, progress, changedField = '') {
  let value = Math.max(0, Math.min(100, Number(progress) || 0));
  let state = STATUS_VALUES.includes(status) ? status : '待读';
  if (changedField === 'status') {
    if (state === '待读') value = 0;
    if (state === '阅读中' && value === 100) value = 0;
    if (state === '已完成') value = 100;
  } else if (state !== '已归档') {
    if (value === 100 || state === '已完成' && changedField !== 'progress') {
      state = '已完成'; value = 100;
    } else if (value > 0 || changedField === 'progress' && state === '已完成') {
      state = '阅读中';
    }
  }
  return { status: state, progress: value };
}

function parsePaperQuery(query) {
  const tokens = String(query || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return tokens.map((raw) => {
    const negative = raw.startsWith('-') && raw.length > 1;
    const token = negative ? raw.slice(1) : raw;
    const colon = token.search(/[:：]/);
    const field = colon > 0 ? QUERY_FIELDS[token.slice(0, colon).toLowerCase()] : null;
    let value = field ? token.slice(colon + 1) : token;
    value = value.replace(/^["']|["']$/g, '').toLocaleLowerCase();
    return { field: field || 'text', value, negative };
  }).filter((token) => token.value);
}

function numericMatch(actual, expression) {
  const range = expression.match(/^(\d+)\.\.(\d+)$/);
  if (range) return Number(actual) >= Number(range[1]) && Number(actual) <= Number(range[2]);
  const comparison = expression.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
  if (!comparison || actual === '' || actual == null) return false;
  const left = Number(actual); const right = Number(comparison[2]);
  if (!Number.isFinite(left)) return false;
  switch (comparison[1]) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '<': return left < right;
    default: return left === right;
  }
}

function matchPaperQuery(paper, query) {
  const tokens = Array.isArray(query) ? query : parsePaperQuery(query);
  const contains = (actual, value) => String(actual || '').toLocaleLowerCase().includes(value);
  return tokens.every(({ field, value, negative }) => {
    let found;
    if (field === 'year' || field === 'rating') found = numericMatch(paper[field], value);
    else if (field === 'has') {
      found = value === 'pdf' ? !!paper.pdf : value === 'summary' ? !!paper.summary : value === 'project' ? !!paper.project : false;
    } else if (field === 'text') {
      found = contains([paper.title, paper.authors, paper.venue, ...(paper.topics || []), paper.summary, paper.project].join(' '), value);
    } else if (field === 'topics') found = (paper.topics || []).some((topic) => contains(topic, value));
    else if (field === 'status' || field === 'priority') found = String(paper[field] || '').toLocaleLowerCase() === value;
    else found = contains(paper[field], value);
    return negative ? !found : found;
  });
}

function packBoardLayout(cards, columns, compact = false) {
  const cols = Math.max(2, Math.min(12, Math.floor(Number(columns) || 6)));
  const placed = [];
  const result = {};
  const overlaps = (r) => placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
  for (const card of cards) {
    const l = card.layout || {};
    const w = Math.min(cols, Math.max(1, Math.round(Number(l.w) || 2)));
    const h = Math.min(24, Math.max(1, Math.round(Number(l.h) || 2)));
    let rect = { x: Math.floor(Number(l.x)), y: Math.floor(Number(l.y)), w, h };
    if (compact || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.x < 0 || rect.y < 0 || rect.x + w > cols || rect.y > 500 || overlaps(rect)) {
      const bottom = placed.reduce((max, p) => Math.max(max, p.y + p.h), 0);
      search: for (let y = 0; y <= bottom; y++) {
        for (let x = 0; x <= cols - w; x++) {
          const candidate = { x, y, w, h };
          if (!overlaps(candidate)) { rect = candidate; break search; }
        }
      }
    }
    result[card.id] = rect;
    placed.push(rect);
  }
  return result;
}

function csvCell(value) {
  let text = String(value == null ? '' : value);
  // Treat spreadsheet formulas as text, including values prefixed by whitespace.
  if (/^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function papersToCsv(papers) {
  const columns = ['标题', '作者', '年份', '期刊/会议', '状态', '优先级', '评分', '阅读进度', '研究方向', '项目', 'DOI', 'PDF', '笔记路径'];
  const rows = papers.map((p) => [p.title, p.authors, p.year, p.venue, p.status, p.priority, p.rating, p.progress, (p.topics || []).join('; '), p.project, p.doi, p.pdf, p.path]);
  return '\uFEFF' + [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function bibEscape(value) {
  const replacements = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
  return String(value || '').replace(/[\\{}&%$#_~^]/g, (char) => replacements[char]).replace(/[\r\n]+/g, ' ');
}

function papersToBibtex(papers) {
  const used = new Set();
  return papers.map((p, i) => {
    const base = String(p.authors || 'paper').split(/[,，;；]/)[0].replace(/[^A-Za-z]/g, '').slice(0, 20) || 'paper';
    const stem = base + (p.year || 'nd');
    let key = stem; let suffix = 1;
    while (used.has(key)) key = stem + '_' + suffix++;
    used.add(key);
    const fields = [['title', p.title], ['author', String(p.authors || '').split(/[,，;；]/).map((s) => s.trim()).filter(Boolean).join(' and ')],
      ['year', p.year], ['journal', p.venue], ['doi', p.doi], ['url', p.url || (/^https?:\/\//i.test(p.pdf || '') ? p.pdf : '')],
      ['keywords', (p.topics || []).join(', ')]];
    return `@article{${key},\n` + fields.filter(([, value]) => value).map(([name, value]) => `  ${name} = {${bibEscape(value)}}`).join(',\n') + '\n}';
  }).join('\n\n') + '\n';
}

function normalizeReadingPosition(record, totalPages) {
  const input = record && typeof record === 'object' ? record : {};
  const pages = Math.max(1, Math.floor(Number(totalPages ?? input.pages) || 1));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(input.page) || 1)));
  const numericScale = Number(input.scale);
  const scale = ['auto', 'page-width', 'page-fit'].includes(input.scale) ? input.scale
    : Number.isFinite(numericScale) && numericScale >= .25 && numericScale <= 5 ? String(numericScale) : 'page-width';
  return { page, pages, scale, updated: Number(input.updated) || 0 };
}

function pdfSelectionKey(selection) {
  return selection?.pdf && selection.text ? `${selection.pdf}\u0000${selection.page}\u0000${selection.anchor ?? ''}\u0000${selection.text}` : '';
}

function annotationBlock(entry, timestamp = '') {
  const quote = String(entry.text || '').split('\n').map((line) => '> ' + line).join('\n');
  const date = timestamp || String(entry.created || '').replace('T', ' ').slice(0, 16);
  return `<!-- jrs-annotation:${entry.id}:start -->\n### [[${entry.pdf}#page=${entry.page}|第 ${entry.page} 页]]${date ? ' · ' + date : ''}\n\n${quote}\n\n${String(entry.note || '').trim() || '（未添加评论）'}\n\n^${entry.id}\n<!-- jrs-annotation:${entry.id}:end -->`;
}

function replaceAnnotationBlock(content, id, replacement) {
  const start = content.indexOf(`<!-- jrs-annotation:${id}:start -->`);
  const endMarker = `<!-- jrs-annotation:${id}:end -->`;
  const end = start < 0 ? -1 : content.indexOf(endMarker, start);
  if (start < 0 || end < 0) return replacement ? content.trimEnd() + '\n\n' + replacement + '\n' : content;
  return content.slice(0, start) + replacement + content.slice(end + endMarker.length);
}

function filterAnnotations(entries, query = '', color = '', order = 'page') {
  const needle = String(query).trim().toLowerCase();
  return entries.filter((entry) => (!color || entry.color === color) && (!needle || `${entry.text}\n${entry.note || ''}\n第${entry.page}页`.toLowerCase().includes(needle)))
    .slice().sort((a, b) => order === 'recent' ? String(b.updated || b.created).localeCompare(String(a.updated || a.created)) : a.page - b.page || String(a.created).localeCompare(String(b.created)));
}

return { normalizeReadingState, parsePaperQuery, matchPaperQuery, packBoardLayout, papersToCsv, papersToBibtex,
  normalizeReadingPosition, pdfSelectionKey, annotationBlock, replaceAnnotationBlock, filterAnnotations };
})();
/* END GENERATED CORE */

// Shared controls keep actions, keyboard behavior and error feedback consistent.
function uiButton(parent, label, icon, action, cls = 'od-btn') {
  const button = parent.createEl('button', { cls, attr: { type: 'button' } });
  if (icon) setIcon(button.createSpan(), icon);
  if (label) button.createSpan({ text: label });
  button.onclick = async (event) => {
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    try { await action(event); }
    catch (error) { console.error('[JRS] 操作失败', error); new Notice(`操作失败：${error.message}`); }
    finally { button.disabled = false; }
  };
  return button;
}

function uiEmpty(parent, title, description, label, action, icon = 'book-open') {
  const empty = parent.createEl('div', { cls: 'jrs-empty-state' });
  setIcon(empty.createEl('div', { cls: 'jrs-empty-icon' }), icon);
  empty.createEl('h3', { text: title });
  empty.createEl('p', { text: description });
  if (label && action) uiButton(empty, label, 'arrow-up-right', action, 'od-btn od-btn--primary');
  return empty;
}

function escapeSvgText(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function buildThemeToggle(parent, plugin) {
  const night = plugin.settings.workspaceTheme === 'night';
  const button = uiButton(parent, night ? '浅色模式' : '深色模式', night ? 'sun' : 'moon', async () => {
    plugin.settings.workspaceTheme = plugin.settings.workspaceTheme === 'night' ? 'day' : 'night';
    await plugin.saveSettings(); plugin.applyAppearance();
    document.querySelectorAll('[data-jrs-theme-toggle]').forEach((control) => {
      setIcon(control.firstElementChild, plugin.settings.workspaceTheme === 'night' ? 'sun' : 'moon');
      control.lastElementChild.textContent = plugin.settings.workspaceTheme === 'night' ? '浅色模式' : '深色模式';
    });
  }, 'od-btn od-btn--sm jrs-theme-toggle');
  button.dataset.jrsThemeToggle = 'true'; button.setAttribute('aria-label', '切换浅色或深色背景'); return button;
}

/* ---------- 常量 ---------- */

const VIEW_DASHBOARD = 'jrs-dashboard';
const VIEW_LIBRARY = 'jrs-library';
const VIEW_SIDE = 'jrs-sidepanel';
const VIEW_LIFE = 'jrs-life';
const VIEW_WEB = 'jrs-research-web';

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
  emerald: { name: '极光绿', hex: '#2bd9a2' },
};

const DEFAULT_TOPICS = [
  '卫星任务规划', '时空网格', '网格热力图', '区域目标覆盖',
  '成像卫星', '敏捷卫星', '电磁探测卫星', '巨星座', '天临空协同',
  '元启发式算法', '进化算法', '深度强化学习', '大模型驱动', '在轨自主', '任务生成',
];

/** 区段定义（对标 OS 的 sidebar nav + topbar titles） */
const SECTIONS = [
  { id: 'home', icon: 'layout-dashboard', label: '总览', title: '总览', sub: '今天的科研节奏，一屏掌握' },
  { id: 'discover', icon: 'sparkles', label: 'AI 发现', title: 'AI 论文发现', sub: '定制研究方向，发现预印本与正式发表的论文' },
  { id: 'queue', icon: 'list-checks', label: '阅读队列', title: '阅读队列', sub: '明确下一篇，保持阅读节奏' },
  { id: 'library', icon: 'library', label: '文献库', title: '文献库', sub: '收集、搜索、分类与管理阅读状态' },
  { id: 'graph', icon: 'git-fork', label: '论文图谱', title: '论文图谱', sub: '探索论文与研究方向之间的联系' },
  { id: 'progress', icon: 'sprout', label: '研究进展', title: '研究进展', sub: '把读过的论文转化为判断与下一步' },
  { id: 'reader', icon: 'book-open', label: '阅读笔记', title: '阅读笔记', sub: '续读原文，回顾批注，整理你的研究思考' },
  { id: 'submit', icon: 'target', label: '投稿冲刺', title: '投稿冲刺', sub: '目标期刊速查 · 投稿管线 · 截稿倒计时' },
  { id: 'ask', icon: 'bot', label: '知识问答', title: '知识问答', sub: '基于你的文献库回答，来源可溯源（ima 式）' },
];

/** 目标期刊库（EJOR 等运筹学顶刊 + 航天/卫星领域核心刊） */
const JOURNALS = [
  { abbr: 'EJOR', name: 'European Journal of Operational Research', field: '运筹学', tag: '顶刊', publisher: 'Elsevier', match: '调度/优化方法+充分实验', link: 'https://www.editorialmanager.com/ejor/', note: '偏方法严谨与计算实验，规划类综述与方法类论文均常见', cas: '1区', jcr: 'Q1', tier: 'A' },
  { abbr: 'OR', name: 'Operations Research', field: '运筹学', tag: '顶刊', publisher: 'INFORMS', match: '理论深度/算法贡献', link: 'https://pubsonline.informs.org/journal/opre', note: 'INFORMS 旗舰，理论要求高', cas: '2区', jcr: 'Q1', tier: 'A' },
  { abbr: 'INFORMS JoC', name: 'INFORMS Journal on Computing', field: '运筹/计算', tag: '顶刊', publisher: 'INFORMS', match: '元启发式/进化算法/学习+优化', link: 'https://pubsonline.informs.org/journal/ijoc', note: '算法与计算实验导向，适合智能调度算法', cas: '2区', jcr: 'Q1', ccf: 'B', tier: 'A' },
  { abbr: 'C&OR', name: 'Computers & Operations Research', field: '运筹/计算', tag: '主流', publisher: 'Elsevier', match: '调度算法/组合优化应用', link: 'https://www.editorialmanager.com/caor/', note: '应用型算法文友好', cas: '2区', jcr: 'Q1', tier: 'B' },
  { abbr: 'Omega', name: 'Omega - The International Journal of Management Science', field: '运筹/管理', tag: '顶刊', publisher: 'Elsevier', match: '决策支持/应用驱动', link: 'https://www.editorialmanager.com/omega/', note: '强调应用价值与管理洞察', cas: '1区', jcr: 'Q1', tier: 'B' },
  { abbr: 'Networks', name: 'Networks', field: '图论/网络', tag: '主流', publisher: 'Wiley', match: '网络流/图模型', link: 'https://onlinelibrary.wiley.com/journal/10970037', note: '网络结构建模对口', cas: '3区', jcr: 'Q2' },
  { abbr: 'AST', name: 'Aerospace Science and Technology', field: '航空航天', tag: '顶刊', publisher: 'Elsevier', match: '卫星任务规划/星座调度', link: 'https://www.editorialmanager.com/aescte/', note: '航天技术与系统，卫星规划高频期刊', cas: '1区', jcr: 'Q1', tier: 'T3' },
  { abbr: 'AA', name: 'Acta Astronautica', field: '航天', tag: '顶刊', publisher: 'Elsevier', match: '任务规划/在轨系统', link: 'https://www.editorialmanager.com/actaastro/', note: 'IAA 期刊，航天任务与系统工程', cas: '2区', jcr: 'Q1', tier: 'T1' },
  { abbr: 'ASR', name: 'Advances in Space Research', field: '航天', tag: '主流', publisher: 'Elsevier', match: '对地观测/星座应用', link: 'https://www.editorialmanager.com/asesre/', note: 'COSPAR 期刊，观测任务方向', cas: '3区', jcr: 'Q2', tier: 'T3' },
  { abbr: 'IEEE TAES', name: 'IEEE Trans. Aerospace and Electronic Systems', field: '航空电子', tag: '顶刊', publisher: 'IEEE', match: '调度系统/探测系统', link: 'https://ieee.atyponrex.com/journal/taes', note: '电子系统+任务规划结合', cas: '2区', jcr: 'Q1', tier: 'T1' },
  { abbr: 'IEEE TSMC', name: 'IEEE Trans. Systems, Man, and Cybernetics: Systems', field: '系统工程', tag: '顶刊', publisher: 'IEEE', match: '智能调度系统', link: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=6221021', note: '系统智能方法', cas: '1区', jcr: 'Q1', tier: 'B' },
  { abbr: 'JAIS', name: 'Journal of Aerospace Information Systems', field: '航天信息', tag: '主流', publisher: 'AIAA', match: '规划信息系统', link: 'https://arc.aiaa.org/journal/jais', note: 'AIAA 信息系系统方向', cas: '3区', jcr: 'Q2', tier: 'T3' },
  { abbr: '宇航学报', name: '宇航学报', field: '航天（中文）', tag: 'EI/中文核心', publisher: '中国宇航学会', match: '卫星任务规划主阵地', link: '', note: '国内卫星规划领域核心发表阵地', cas: 'EI', jcr: '', tier: 'T1' },
  { abbr: '航空学报', name: '航空学报', field: '航空（中文）', tag: 'EI/中文核心', publisher: '中国航空学会', match: '飞行器/任务系统', link: '', note: '国内航空领域旗舰', cas: 'EI', jcr: '', tier: 'T1' },
  { abbr: '系统工程与电子技术', name: '系统工程与电子技术', field: '系统工程（中文）', tag: 'EI/中文核心', publisher: '中国航天科工', match: '调度/优化应用', link: '', note: '系统工程应用，周期较快', cas: 'EI', jcr: '', tier: 'T2' },
  { abbr: 'TEVC', name: 'IEEE Transactions on Evolutionary Computation', field: '进化计算', tag: '顶刊', publisher: 'IEEE', match: '进化算法/调度应用', link: 'https://ieee.atyponrex.com/journal/tevc', note: '进化算法方向首选，CCF-B · 科协B', cas: '1区', jcr: 'Q1', ccf: 'B', tier: 'B' },
  { abbr: 'J.Sched', name: 'Journal of Scheduling', field: '调度', tag: '主流', publisher: 'Wiley', match: '调度理论/卫星调度应用', link: 'https://onlinelibrary.wiley.com/journal/10999143', note: '调度专题刊，科协B · 运筹与管理', cas: '3区', jcr: 'Q2', tier: 'B' },
];

const SUB_STATUSES = ['写作中', '准备投稿', '已投', '审稿中', '大修', '小修', '已接收', '已拒稿', '改投'];

/* 内置期刊分级数据：CCF第七版(2026) 680条 · 科协运筹与管理56条 · 科协航空航天62条 · 预警2025 —— 数据整理自公开目录 */
const JOURNAL_BUILTIN = {"ccf":[["Journal of the ACM","JACM","A","journal","交叉/综合/新兴"],["Proceedings of the IEEE","Proc. IEEE","A","journal","交叉/综合/新兴"],["Science China-Information Sciences","SCIS","A","journal","交叉/综合/新兴"],["Bioinformatics","Bioinformatics","A","journal","交叉/综合/新兴"],["Briefings in Bioinformatics","","B","journal","交叉/综合/新兴"],["Cognition","Cognition","B","journal","交叉/综合/新兴"],["IEEE Transactions on Automation Science and Engineering","TASAE","B","journal","交叉/综合/新兴"],["IEEE Transactions on Geoscience and Remote Sensing","TGARS","B","journal","交叉/综合/新兴"],["IEEE Transactions on Intelligent Transportation Systems","TITS","B","journal","交叉/综合/新兴"],["IEEE Transactions on Medical Imaging","TMI","B","journal","交叉/综合/新兴"],["IEEE Transactions on Robotics","TR","B","journal","交叉/综合/新兴"],["IEEE-ACM Transactions on Computational Biology and Bioinformatics","TCBB","B","journal","交叉/综合/新兴"],["Journal of Computer Science and Technology","JCST","B","journal","交叉/综合/新兴"],["Journal of the American Medical Informatics Association","JAMIA","B","journal","交叉/综合/新兴"],["PLOS Computational Biology","","B","journal","交叉/综合/新兴"],["Computer Journal","","B","journal","交叉/综合/新兴"],["World Wide Web-Internet and Web Information Systems","WWW","B","journal","交叉/综合/新兴"],["Frontiers of Computer Science","FCS","B","journal","交叉/综合/新兴"],["Blockchain: Research and Applications","BCRA","B","journal","交叉/综合/新兴"],["BMC Bioinformatics","","C","journal","交叉/综合/新兴"],["Cybernetics and Systems","","C","journal","交叉/综合/新兴"],["IEEE Geoscience and Remote Sensing Letters","","C","journal","交叉/综合/新兴"],["IEEE Journal of Biomedical and Health Informatics","JBHI","C","journal","交叉/综合/新兴"],["IEEE Transactions on Big Data","TBD","C","journal","交叉/综合/新兴"],["IET Intelligent Transport Systems","","C","journal","交叉/综合/新兴"],["Journal of Biomedical Informatics","JBI","C","journal","交叉/综合/新兴"],["Medical Image Analysis","","C","journal","交叉/综合/新兴"],["IEEE Transactions on Industrial Informatics","TII","C","journal","交叉/综合/新兴"],["ACM Transactions on Cyber-Physical Systems","TCPS","C","journal","交叉/综合/新兴"],["ACM Transactions on Computing Education","TOCE","C","journal","交叉/综合/新兴"],["Frontiers of Information Technology & Electronic Engineering","FITEE","C","journal","交叉/综合/新兴"],["IEEE Transactions on Computational Social Systems","TCSS","C","journal","交叉/综合/新兴"],["IEEE Transactions on Reliability","","C","journal","交叉/综合/新兴"],["ACM Transactions on Computing for Healthcare","HEALTH","C","journal","交叉/综合/新兴"],["ACM Distributed Ledger Technologies: Research and  Practice","ACM DLT","C","journal","交叉/综合/新兴"],["International World Wide Web Conference","WWW","A","conf","交叉/综合/新兴"],["IEEE Real-Time Systems Symposium","RTSS","A","conf","交叉/综合/新兴"],["Annual Meeting of the Cognitive Science Society","CogSci","B","conf","交叉/综合/新兴"],["IEEE International Conference on Bioinformatics and Biomedicine","BIBM","B","conf","交叉/综合/新兴"],["International Conference on Embedded Software","EMSOFT","B","conf","交叉/综合/新兴"],["International conference on Intelligent Systems for Molecular Biology","ISMB","B","conf","交叉/综合/新兴"],["Annual International Conference on Research inComputational Molecular Biology","RECOMB","B","conf","交叉/综合/新兴"],["International Conference on Medical Image Computing and Computer-Assisted Intervention","MICCAI","B","conf","交叉/综合/新兴"],["Conference on Web and Internet Economics","WINE","B","conf","交叉/综合/新兴"],["American Medical Informatics Association Annual Symposium","AMIA","C","conf","交叉/综合/新兴"],["Asia Pacific Bioinformatics Conference","APBC","C","conf","交叉/综合/新兴"],["IEEE International Conference on Big Data","IEEE BigData","C","conf","交叉/综合/新兴"],["IEEE International Conference on Cloud Computing","IEEE CLOUD","C","conf","交叉/综合/新兴"],["IEEE International Conference on Systems, Man, and Cybernetics","SMC","C","conf","交叉/综合/新兴"],["International Conference on Spatial Information Theory","COSIT","C","conf","交叉/综合/新兴"],["International Symposium on Bioinformatics Research and Applications","ISBRA","C","conf","交叉/综合/新兴"],["International Symposium on Algorithmic Game Theory","SAGT","C","conf","交叉/综合/新兴"],["ACM Special Interest Group on Spatial Information","SIGSPATIAL","C","conf","交叉/综合/新兴"],["International Conference on Intelligent Computing","ICIC","C","conf","交叉/综合/新兴"],["International Conference on Service Science","ICSS","C","conf","交叉/综合/新兴"],["Advances in Financial Technologies","AFT","C","conf","交叉/综合/新兴"],["International Joint Conference on Theoretical Computer  Science - Frontier of Algorithmic Wisdom","IJTCS-FAW","C","conf","交叉/综合/新兴"],["Artificial Intelligence","AI","A","journal","人工智能"],["IEEE Transactions on Pattern Analysis and Machine Intelligence","TPAMI","A","journal","人工智能"],["International Journal of Computer Vision","IJCV","A","journal","人工智能"],["Journal of Machine Learning Research","JMLR","A","journal","人工智能"],["ACM Transactions on Applied Perception","TAP","B","journal","人工智能"],["Autonomous Agents and Multi-Agent Systems","AAMAS","B","journal","人工智能"],["Computational Linguistics","","B","journal","人工智能"],["Computer Vision and Image Understanding","CVIU","B","journal","人工智能"],["Data & Knowledge Engineering","DKE","B","journal","人工智能"],["Evolutionary Computation","","B","journal","人工智能"],["IEEE Transactions on Affective Computing","TAC","B","journal","人工智能"],["IEEE-ACM Transactions on Audio Speech and Language Processing","TASLP","B","journal","人工智能"],["IEEE Transactions on Cybernetics","","B","journal","人工智能"],["IEEE Transactions on Evolutionary Computation","TEC","B","journal","人工智能"],["IEEE Transactions on Fuzzy Systems","TFS","B","journal","人工智能"],["IEEE Transactions on Neural Networks and learning systems","TNNLS","B","journal","人工智能"],["International Journal of Approximate Reasoning","IJAR","B","journal","人工智能"],["Journal of Artificial Intelligence Research","JAIR","B","journal","人工智能"],["Journal of Automated Reasoning","","B","journal","人工智能"],["Journal of Speech Language and Hearing Research","JSLHR","B","journal","人工智能"],["Machine Learning","","B","journal","人工智能"],["Neural Computation","","B","journal","人工智能"],["Neural Networks","","B","journal","人工智能"],["Pattern Recognition","PR","B","journal","人工智能"],["Transactions of the Association for Computational Linguistics","TACL","B","journal","人工智能"],["ACM Transactions on Asian and Low-Resource Language Information Processing","TALLIP","C","journal","人工智能"],["Applied Intelligence","","C","journal","人工智能"],["Artificial Intelligence in Medicine","AIM","C","journal","人工智能"],["Artificial Life","","C","journal","人工智能"],["Computational Intelligence","","C","journal","人工智能"],["Computer Speech and Language","","C","journal","人工智能"],["Connection Science","","C","journal","人工智能"],["Decision Support Systems","DSS","C","journal","人工智能"],["Engineering Applications of Artificial Intelligence","EAAI","C","journal","人工智能"],["Expert Systems","","C","journal","人工智能"],["Expert Systems with Applications","ESWA","C","journal","人工智能"],["Fuzzy Sets and Systems","","C","journal","人工智能"],["IEEE Transactions on Games","TG","C","journal","人工智能"],["IET Computer Vision","IET-CVI","C","journal","人工智能"],["IET Signal Processing","","C","journal","人工智能"],["Image and Vision Computing","IVC","C","journal","人工智能"],["Intelligent Data Analysis","IDA","C","journal","人工智能"],["International Journal of Computational Intelligence and Applications","IJCIA","C","journal","人工智能"],["International Journal of Intelligent Systems","IJIS","C","journal","人工智能"],["International Journal of Neural Systems","IJNS","C","journal","人工智能"],["International Journal of Pattern Recognition and Artificial Intelligence","IJPRAI","C","journal","人工智能"],["International Journal of Uncertainty Fuzziness and Knowledge-Based Systems","IJUFKS","C","journal","人工智能"],["International Journal on Document Analysis and Recognition","IJDAR","C","journal","人工智能"],["Journal of Experimental & Theoretical Artificial Intelligence","JETAI","C","journal","人工智能"],["Knowledge-Based Systems","KBS","C","journal","人工智能"],["Machine Translation","","C","journal","人工智能"],["Machine Vision and Applications","","C","journal","人工智能"],["Natural Computing","","C","journal","人工智能"],["Natural Language Engineering","NLE","C","journal","人工智能"],["Neural Computing & Applications","NCA","C","journal","人工智能"],["Neural Processing Letters","NPL","C","journal","人工智能"],["Neurocomputing","","C","journal","人工智能"],["Pattern Analysis and Applications","PAA","C","journal","人工智能"],["Pattern Recognition Letters","PRL","C","journal","人工智能"],["Soft Computing","","C","journal","人工智能"],["Web Intelligence","WI","C","journal","人工智能"],["ACM Transactions on Interactive Intelligent Systems","TIIS","C","journal","人工智能"],["ACM Transactions on Evolutionary Learning and  Optimization","TELO","C","journal","人工智能"],["ACM Journal on Autonomous Transportation Systems","JATS","C","journal","人工智能"],["AAAI Conference on Artificial Intelligence","AAAI","A","conf","人工智能"],["Conference on Neural Information Processing Systems","NeurIPS","A","conf","人工智能"],["Annual Meeting of the Association for Computational Linguistics","ACL","A","conf","人工智能"],["IEEE/CVF Computer Vision and Pattern Recognition Conference","CVPR","A","conf","人工智能"],["International Conference on Computer Vision","ICCV","A","conf","人工智能"],["International Conference on Machine Learning","ICML","A","conf","人工智能"],["International Conference on Learning Representations","ICLR","A","conf","人工智能"],["Annual Conference on Computational Learning Theory","COLT","B","conf","人工智能"],["Conference on Empirical Methods in Natural Language Processing","EMNLP","B","conf","人工智能"],["European Conference on Artificial Intelligence","ECAI","B","conf","人工智能"],["European Conference on Computer Vision","ECCV","B","conf","人工智能"],["IEEE International Conference on Robotics and Automation","ICRA","B","conf","人工智能"],["International Conference on Automated Planning and Scheduling","ICAPS","B","conf","人工智能"],["International Conference on Case-Based Reasoning","ICCBR","B","conf","人工智能"],["International Conference on Computational Linguistics","COLING","B","conf","人工智能"],["International Conference on Principles of Knowledge Representation and Reasoning","KR","B","conf","人工智能"],["Conference on Uncertainty in Artificial Intelligence","UAI","B","conf","人工智能"],["International Joint Conference on Autonomous Agents and Multi-agent Systems","AAMAS","B","conf","人工智能"],["Parallel Problem Solving from Nature","PPSN","B","conf","人工智能"],["North  American Chapter of the Associationfor Computational Linguistics","NAACL","B","conf","人工智能"],["International Joint Conference on Artificial Intelligence","IJCAI","B","conf","人工智能"],["International Conference on Artificial Intelligence and Statistics","AISTATS","C","conf","人工智能"],["Asian Conference on Computer Vision","ACCV","C","conf","人工智能"],["Asian Conference on Machine Learning","ACML","C","conf","人工智能"],["British Machine Vision Conference","BMVC","C","conf","人工智能"],["CCF International Conference on Natural Language Processing and Chinese Computing","NLPCC","C","conf","人工智能"],["Conference on Computational Natural Language Learning","CoNLL","C","conf","人工智能"],["Genetic and Evolutionary Computation Conference","GECCO","C","conf","人工智能"],["IEEE International Conference on Tools with Artificial Intelligence","ICTAI","C","conf","人工智能"],["IEEE\\RSJ International Conference on Intelligent Robots and Systems","IROS","C","conf","人工智能"],["International Conference on Algorithmic Learning Theory","ALT","C","conf","人工智能"],["International Conference on Artificial Neural Networks","ICANN","C","conf","人工智能"],["IEEE International Conference on AutomaticFace and Gesture Recognition","FG","C","conf","人工智能"],["International Conference on Document Analysis and Recognition","ICDAR","C","conf","人工智能"],["International Conference on Inductive Logic Programming","ILP","C","conf","人工智能"],["International conference on Knowledge Science,Engineering and Management","KSEM","C","conf","人工智能"],["International Conference on Neural Information Processing","ICONIP","C","conf","人工智能"],["International Conference on Pattern Recognition","ICPR","C","conf","人工智能"],["International Joint Conference onBiometrics","IJCB","C","conf","人工智能"],["International Joint Conference on Neural Networks","IJCNN","C","conf","人工智能"],["Pacific Rim International Conference on Artificial Intelligence","PRICAI","C","conf","人工智能"],["Congress on Evolutionary Computation","IEEE CEC","C","conf","人工智能"],["International Conference on Distributed Artificial  Intelligence","DAI","C","conf","人工智能"],["ACM Transactions on Computer-Human Interaction","TOCHI","A","journal","人机交互与普适计算"],["International Journal of Human-Computer Studies","IJHCS","A","journal","人机交互与普适计算"],["Computer Supported Cooperative Work-The Journal of Collaborative Computing and Work Practices","CSCW","B","journal","人机交互与普适计算"],["Human-Computer Interaction","HCI","B","journal","人机交互与普适计算"],["IEEE Transactions on Human-Machine Systems","","B","journal","人机交互与普适计算"],["Interacting with Computers","IWC","B","journal","人机交互与普适计算"],["International Journal of Human-Computer Interaction","IJHCI","B","journal","人机交互与普适计算"],["User Modeling and User-Adapted Interaction","UMUAI","B","journal","人机交互与普适计算"],["IEEE Transactions on Systems Man Cybernetics-Systems","TSMC","B","journal","人机交互与普适计算"],["CCF Transactions on Pervasive Computing and Interaction","CCF TPCI","B","journal","人机交互与普适计算"],["Behaviour & Information Technology","BIT","C","journal","人机交互与普适计算"],["Personal and Ubiquitous Computing","PUC","C","journal","人机交互与普适计算"],["Pervasive and Mobile Computing","PMC","C","journal","人机交互与普适计算"],["Proceedings of the ACM on Human-Computer Interaction","PACMHCI","C","journal","人机交互与普适计算"],["ACM Transactions on Human-Robot Interaction","THRI","C","journal","人机交互与普适计算"],["ACM Conference on Computer Supported Cooperative Work and Social Computing","CSCW","A","conf","人机交互与普适计算"],["ACM Conference on Human Factors in Computing Systems","CHI","A","conf","人机交互与普适计算"],["ACM international Joint Conference on Pervasive and Ubiquitous Computing","UbiComp","A","conf","人机交互与普适计算"],["ACM Symposium on User Interface Software and Technology","UIST","A","conf","人机交互与普适计算"],["ACM International Conference on Supporting Group Work","GROUP","B","conf","人机交互与普适计算"],["ACM International Conference on Intelligent User Interfaces","IUI","B","conf","人机交互与普适计算"],["ACM International Conference on Interactive Tabletops and Surfaces","ITS","B","conf","人机交互与普适计算"],["European Conference on Computer Supported Cooperative Work","ECSCW","B","conf","人机交互与普适计算"],["IEEE International Conference on Pervasive Computing and Communications","PERCOM","B","conf","人机交互与普适计算"],["ACM International Conference on Mobile Human-Computer Interaction","MobileHCI","B","conf","人机交互与普适计算"],["The International AAAI Conference on Web and Social Media","ICWSM","B","conf","人机交互与普适计算"],["ACM SIGCHI Conference on Designing Interactive Systems","DIS","C","conf","人机交互与普适计算"],["ACM International Conference on Multimodal Interaction","ICMI","C","conf","人机交互与普适计算"],["International ACM SIGACCESS Conference on Computers and Accessibility","ASSETS","C","conf","人机交互与普适计算"],["Graphics Interface","GI","C","conf","人机交互与普适计算"],["IEEE International Conference on Ubiquitous Intelligence and Computing","UIC","C","conf","人机交互与普适计算"],["IEEE World Haptics Conference","","C","conf","人机交互与普适计算"],["International Conference on Human-Computer Interaction of International Federation for Information Processing","INTERACT","C","conf","人机交互与普适计算"],["ACM Interaction Design and Children","IDC","C","conf","人机交互与普适计算"],["International Conference on Collaborative Computing: Networking, Applications and Worksharing","CollaborateCom","C","conf","人机交互与普适计算"],["International Conference on Computer Supported Cooperative Work in Design","CSCWD","C","conf","人机交互与普适计算"],["International Conference on Cooperative Information Systems","CoopIS","C","conf","人机交互与普适计算"],["International Conference on Mobile and Ubiquitous Systems: Computing,Networking and Services","MobiQuitous","C","conf","人机交互与普适计算"],["International Working Conference on Advanced Visual Interfaces","AVI","C","conf","人机交互与普适计算"],["Conference on Green, Pervasive and Cloud Computing","GPC","C","conf","人机交互与普适计算"],["CCF International Conference on Extended Reality","ICXR","C","conf","人机交互与普适计算"],["ACM Transactions on Database Systems","TODS","A","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Information Systems","TOIS","A","journal","数据库/数据挖掘/内容检索"],["IEEE Transactions on Knowledge and Data Engineering","TKDE","A","journal","数据库/数据挖掘/内容检索"],["VLDB Journal","VLDBJ","A","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Knowledge Discovery from Data","TKDD","B","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on the Web","TWEB","B","journal","数据库/数据挖掘/内容检索"],["Advanced Engineering Informatics","AEI","B","journal","数据库/数据挖掘/内容检索"],["Data & Knowledge Engineering","DKE","B","journal","数据库/数据挖掘/内容检索"],["Data Mining and Knowledge Discovery","DMKD","B","journal","数据库/数据挖掘/内容检索"],["European Journal of Information Systems","EJIS","B","journal","数据库/数据挖掘/内容检索"],["GeoInformatica","","B","journal","数据库/数据挖掘/内容检索"],["Information Processing & Management","IPM","B","journal","数据库/数据挖掘/内容检索"],["Information Sciences","","B","journal","数据库/数据挖掘/内容检索"],["Information Systems","IS","B","journal","数据库/数据挖掘/内容检索"],["Journal of the Association for Information Science and Technology","JASIST","B","journal","数据库/数据挖掘/内容检索"],["Journal of Web Semantics","JWS","B","journal","数据库/数据挖掘/内容检索"],["Knowledge and Information Systems","KAIS","B","journal","数据库/数据挖掘/内容检索"],["Data Science and Engineering","DSE","B","journal","数据库/数据挖掘/内容检索"],["Distributed and Parallel Databases","DPD","C","journal","数据库/数据挖掘/内容检索"],["Information & Management","I&M","C","journal","数据库/数据挖掘/内容检索"],["Information Processing Letters","IPL","C","journal","数据库/数据挖掘/内容检索"],["Information Retrieval Journal","IR","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Cooperative Information Systems","IJCIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Geographical Information Science","IJGIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Intelligent Systems","IJIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Knowledge Management","IJKM","C","journal","数据库/数据挖掘/内容检索"],["International Journal on Semantic Web and Information Systems","IJSWIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Computer Information Systems","JCIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Database Management","JDM","C","journal","数据库/数据挖掘/内容检索"],["Journal of Global Information Technology Management","JGITM","C","journal","数据库/数据挖掘/内容检索"],["Journal of Intelligent Information Systems","JIIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Strategic Information Systems","JSIS","C","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Intelligent Systems and Technology","TIST","C","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Recommender Systems","TORS","C","journal","数据库/数据挖掘/内容检索"],["ACM SIGMOD Conference","SIGMOD","A","conf","数据库/数据挖掘/内容检索"],["ACM SIGKDD Conference on Knowledge Discovery and Data Mining","SIGKDD","A","conf","数据库/数据挖掘/内容检索"],["IEEE International Conference on Data Engineering","ICDE","A","conf","数据库/数据挖掘/内容检索"],["International ACM SIGIR Conference on Research and Development in Information Retrieval","SIGIR","A","conf","数据库/数据挖掘/内容检索"],["International Conference on Very Large Data Bases","VLDB","A","conf","数据库/数据挖掘/内容检索"],["ACM International Conference on Information and Knowledge Management","CIKM","B","conf","数据库/数据挖掘/内容检索"],["ACM International Conference on Web Search and Data Mining","WSDM","B","conf","数据库/数据挖掘/内容检索"],["ACM SIGMOD-SIGACT-SIGAI Symposium on Principles of Database Systems","PODS","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Database Systems for Advanced Applications","DASFAA","B","conf","数据库/数据挖掘/内容检索"],["European Conference on Machine Learning and Principles and Practice of Knowledge Discovery in Databases","ECML-PKDD","B","conf","数据库/数据挖掘/内容检索"],["IEEE International Semantic Web Conference","ISWC","B","conf","数据库/数据挖掘/内容检索"],["IEEE International Conference on Data Mining","ICDM","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Database Theory","ICDT","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Extending DatabaseTechnology","EDBT","B","conf","数据库/数据挖掘/内容检索"],["Conference on Innovative DataSystems Research","CIDR","B","conf","数据库/数据挖掘/内容检索"],["SIAM International Conference on Data Mining","SDM","B","conf","数据库/数据挖掘/内容检索"],["ACM Conference on Recommender Systems","RecSys","B","conf","数据库/数据挖掘/内容检索"],["Web Information Systems Engineering Conference","WISE","B","conf","数据库/数据挖掘/内容检索"],["Asia Pacific Web Conference","APWeb","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Database and Expert System Applications","DEXA","C","conf","数据库/数据挖掘/内容检索"],["European Conference on Information Retrieval","ECIR","C","conf","数据库/数据挖掘/内容检索"],["Extended Semantic Web Conference","ESWC","C","conf","数据库/数据挖掘/内容检索"],["International Workshop on Web andDatabases","WebDB","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Conceptual Modeling","ER","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Mobile Data Management","MDM","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Scientific andStatistical Database Management","SSDBM","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Web Age Information Management","WAIM","C","conf","数据库/数据挖掘/内容检索"],["International Symposium on Spatial and Temporal Databases","SSTD","C","conf","数据库/数据挖掘/内容检索"],["Pacific-Asia Conference on Knowledge Discovery and Data Mining","PAKDD","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Advanced Data Mining and  Applications","ADMA","C","conf","数据库/数据挖掘/内容检索"],["Web Information Systems and Applications","WISA","C","conf","数据库/数据挖掘/内容检索"],["IEEE Transactions on Dependable and Secure Computing","TDSC","A","journal","网络与信息安全"],["IEEE Transactions on Information Forensics and Security","TIFS","A","journal","网络与信息安全"],["Journal of Cryptology","","A","journal","网络与信息安全"],["ACM Transactions on Privacy and Security","TOPS","B","journal","网络与信息安全"],["Computers & Security","","B","journal","网络与信息安全"],["Designs Codes and Cryptography","","B","journal","网络与信息安全"],["Journal of Computer Security","JCS","B","journal","网络与信息安全"],["Cybersecurity","Cybersecurity","B","journal","网络与信息安全"],["Computer Law & Security Review","CLSR","C","journal","网络与信息安全"],["EURASIP Journal on Information Security","","C","journal","网络与信息安全"],["IET Information Security","","C","journal","网络与信息安全"],["Information and Computer Security","IMCS","C","journal","网络与信息安全"],["International Journal of Information and Computer Security","IJICS","C","journal","网络与信息安全"],["International Journal of Information Security and Privacy","IJISP","C","journal","网络与信息安全"],["Journal of Information Security and Applications","JISA","C","journal","网络与信息安全"],["Security and Communication Networks","SCN","C","journal","网络与信息安全"],["High-Confidence Computing","HCC","C","journal","网络与信息安全"],["ACM Conference on Computer and Communications Security","CCS","A","conf","网络与信息安全"],["International Conference on the Theory and Applications of Cryptographic Techniques","EUROCRYPT","A","conf","网络与信息安全"],["IEEE Symposium on Security and Privacy","S&P","A","conf","网络与信息安全"],["International Cryptology Conference","CRYPTO","A","conf","网络与信息安全"],["USENIX Security Symposium","USENIX Security","A","conf","网络与信息安全"],["Network and Distributed System Security Symposium","NDSS","A","conf","网络与信息安全"],["Annual Computer Security Applications Conference","ACSAC","B","conf","网络与信息安全"],["Annual International Conference on the Theory and Application of Cryptology and Information Security","ASIACRYPT","B","conf","网络与信息安全"],["European Symposium on Research in Computer Security","ESORICS","B","conf","网络与信息安全"],["Fast Software Encryption","FSE","B","conf","网络与信息安全"],["IEEE Computer Security Foundations Workshop","CSFW","B","conf","网络与信息安全"],["IEEE International Symposium on Reliable Distributed Systems","SRDS","B","conf","网络与信息安全"],["International Conference on Cryptographic Hardware and Embedded Systems","CHES","B","conf","网络与信息安全"],["International Conference on Dependable Systems and Networks","DSN","B","conf","网络与信息安全"],["International Symposium on Recent Advances in Intrusion Detection","RAID","B","conf","网络与信息安全"],["International Workshop on Practice and Theory in Public Key Cryptography","PKC","B","conf","网络与信息安全"],["Theory of Cryptography Conference","TCC","B","conf","网络与信息安全"],["ACM Conference on Security and Privacy in Wireless and Mobile Networks","WiSec","C","conf","网络与信息安全"],["ACM Symposium on Access Control Models and Technologies","SACMAT","C","conf","网络与信息安全"],["ACM Workshop on Digital Rights Management","DRM","C","conf","网络与信息安全"],["ACM Workshop on Information Hiding and Multimedia Security","IH&MMSec","C","conf","网络与信息安全"],["International Conference on Applied Cryptography and Network Security","ACNS","C","conf","网络与信息安全"],["ACM Asia Conference on Computer and Communications Security","AsiaCCS","C","conf","网络与信息安全"],["AustralasiaConferenceonInformation SecurityandPrivacy","ACISP","C","conf","网络与信息安全"],["The Cryptographer's Track at RSA Conference","CT-RSA","C","conf","网络与信息安全"],["Conference on Detection of Intrusions and Malware & VulnerabilityAssessment","DIMVA","C","conf","网络与信息安全"],["Digital Forensic Research Workshop","DFRWS","C","conf","网络与信息安全"],["Financial Cryptography and Data Security","FC","C","conf","网络与信息安全"],["IEEE International Conference on Trust,Security and Privacy in Computing and Communications","TrustCom","C","conf","网络与信息安全"],["IFIP International Information Security Conference","SEC","C","conf","网络与信息安全"],["IFIP Working Group 11.9 International Conference on Digital Forensics","IFIP WG 11.9","C","conf","网络与信息安全"],["Information Security Conference","ISC","C","conf","网络与信息安全"],["International Conference on Digital Forensics & Cyber Crime","ICDF2C","C","conf","网络与信息安全"],["International Conference on Information and Communications Security","ICICS","C","conf","网络与信息安全"],["International Conference on Security and Privacy in Communication Networks","SecureComm","C","conf","网络与信息安全"],["New Security Paradigms Workshop","NSPW","C","conf","网络与信息安全"],["Passive and Active Measurement Conference","PAM","C","conf","网络与信息安全"],["Privacy Enhancing Technologies Symposium","PETS","C","conf","网络与信息安全"],["Selected Areas in Cryptography","SAC","C","conf","网络与信息安全"],["Symposium On Usable Privacy and Security","SOUPS","C","conf","网络与信息安全"],["IEEE European Symposium on Security and Privacy","EuroS&P","C","conf","网络与信息安全"],["International Conference on Information Security and Cryptology","Inscrypt","C","conf","网络与信息安全"],["Conference on Data and Application Security and Privacy","CODASPY","C","conf","网络与信息安全"],["International Conference on Blockchain, Artificial  Intelligence, and Trustworthy Systems","BlockSys","C","conf","网络与信息安全"],["International Conference on Cyber Security and Cloud  Computing","CSCloud","C","conf","网络与信息安全"],["ACM Transactions on Computer Systems","TOCS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Storage","TOS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems","TCAD","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Computers","TC","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Parallel and Distributed Systems","TPDS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Architecture and Code Optimization","TACO","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Autonomous and Adaptive Systems","TAAS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Design Automation of Electronic Systems","TODAES","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Embedded Computing Systems","TECS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Reconfigurable Technology and Systems","TRETS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Very Large Scale Integration (VLSI) Systems","TVLSI","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Parallel and Distributed Computing","JPDC","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Systems Architecture","JSA","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Parallel Computing","","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Performance Evaluation","","B","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Cloud Computing","TCC","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Journal on Emerging Technologies in Computing Systems","JETC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Concurrency and Computation-Practice & Experience","","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Distributed Computing","DC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Future Generation Computer Systems-The International Journal of eScience","FGCS","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Integration-the VLSI Journal","Integration","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Electronic Testing-Theory and Applications","JETTA","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Grid computing","JGC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Real-Time Systems","RTS","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Supercomputing","TJSC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Circuits and Systems I-Regular Papers","TCASI","C","journal","计算机体系结构/并行与分布计算/存储系统"],["CCF Transactions on High Performance Computing","CCF-THPC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Sustainable Computing","TSUSC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM SIGPLAN Symposium on Principles & Practice of Parallel Programming","PPoPP","A","conf","计算机体系结构/并行与分布计算/存储系统"],["USENIX Conference on File and Storage Technologies","FAST","A","conf","计算机体系结构/并行与分布计算/存储系统"],["Design Automation Conference","DAC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on High Performance Computer Architecture","HPCA","A","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE/ACM International Symposium on Microarchitecture","MICRO","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference for High Performance Computing, Networking, Storage, and Analysis","SC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Architectural Support for Programming Languages and Operating Systems","ASPLOS","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Computer Architecture","ISCA","A","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM SIGOPS Annual Technical Conference","ACM SIGOPS ATC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["European Conference on Computer Systems","EuroSys","A","conf","计算机体系结构/并行与分布计算/存储系统"],["The International ACM Symposium on High-Performance  Parallel and Distributed Computing","HPDC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Cloud Computing","SOCC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Parallelism in Algorithms and Architectures","SPAA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Principles of Distributed Computing","PODC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/SIGDA International Symposium on Field-Programmable Gate Arrays","FPGA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["The International Symposium on Code Generation and Optimization","CGO","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Design, Automation & Test in Europe","DATE","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Hot Chips: A Symposium on High Performance Chips","HOT CHIPS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Cluster Computing","CLUSTER","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Computer Design","ICCD","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Computer-Aided Design","ICCAD","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Distributed Computing Systems","ICDCS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Hardware/Software Co-design and System Synthesis","CODES+ISSS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on High Performance and Embedded Architectures and Compilers","HiPEAC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Measurement and Modeling of Computer Systems","SIGMETRICS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel Architectures and Compilation Techniques","PACT","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel Processing","ICPP","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Supercomputing","ICS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Virtual Execution Environments","VEE","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Parallel & Distributed Processing Symposium","IPDPS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Computer Performance, Modeling, Measurements and Evaluation","Performance","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Test Conference","ITC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Large Installation system Administration Conference","LISA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Mass Storage Systems and Technologies","MSST","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Real-Time and Embedded Technology and ApplicationsSymposium","RTAS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["European Conference on Parallel and Distributed Computing","Euro-Par","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on Circuits and Systems","ISCAS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM International Conference on Computing Frontiers","CF","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM International Systems and Storage Conference","SYSTOR","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/IEEE International Symposium on Networks-on-Chip","NOCS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Application-Specific Systems, Architectures, and Processors","ASAP","C","conf","计算机体系结构/并行与分布计算/存储系统"],["Asia and South Pacific Design Automation Conference","ASP-DAC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE European Test Symposium","ETS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Field-Programmable Logic and Applications","FPL","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Symposium on Field-Programmable Custom Computing Machines","FCCM","C","conf","计算机体系结构/并行与分布计算/存储系统"],["Great Lakes Symposium on VLSI","GLSVLSI","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Asian Test Symposium","ATS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on High Performance Computing and Communications","HPCC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on High Performance Computing, Data and Analytics","HiPC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Modeling, Analysis, andSimulation of Computer and Telecommunication Systems","MASCOTS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on Parallel and Distributed Processing with Applications","ISPA","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE/ACM International Symposium on Cluster, Cloud and Grid Computing","CCGRID","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IFIP International Conference on Network and Parallel Computing","NPC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Algorithms and Architectures for Parallel Processing","ICA3PP","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Compilers, Architectures, and Synthesis for Embedded Systems","CASES","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Field-Programmable Technology","FPT","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel and Distributed Systems","ICPADS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Low Power Electronics and Design","ISLPED","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Physical Design","ISPD","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Symposium on High-Performance Interconnects","HOTI","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE VLSI Test Symposium","VTS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Test Conference in Asia","ITC-Asia","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/IEEE Symposium on Edge Computing","SEC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Networking, Architecture and  Storages","NAS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["HotStorage","HotStorage","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Advanced Parallel Processing  Technology","APPT","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on JointCloud Computing","JCC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Graphics","TOG","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Image Processing","TIP","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Visualization and Computer Graphics","TVCG","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Multimedia","TMM","A","journal","计算机图形学与多媒体"],["ACM Transactions on Multimedia Computing Communications and Applications","TOMM","B","journal","计算机图形学与多媒体"],["Computer Aided Geometric Design","CAGD","B","journal","计算机图形学与多媒体"],["Computer Graphics Forum","CGF","B","journal","计算机图形学与多媒体"],["Computer-Aided Design","CAD","B","journal","计算机图形学与多媒体"],["IEEE Transactions on Circuits and Systems for Video Technology","TCSVT","B","journal","计算机图形学与多媒体"],["Journal of the Acoustical Society of America","JASA","B","journal","计算机图形学与多媒体"],["SIAM Journal on Imaging Sciences","SIIMS","B","journal","计算机图形学与多媒体"],["Speech Communication","SPECOM","B","journal","计算机图形学与多媒体"],["Computational Visual Media","CVMJ","B","journal","计算机图形学与多媒体"],["Computational Geometry-Theory and Applications","CGTA","C","journal","计算机图形学与多媒体"],["Computer Animation and Virtual Worlds","CAVW","C","journal","计算机图形学与多媒体"],["Computers & Graphics-UK","C&G","C","journal","计算机图形学与多媒体"],["Discrete & Computational Geometry","DCG","C","journal","计算机图形学与多媒体"],["IEEE Signal Processing Letters","SPL","C","journal","计算机图形学与多媒体"],["IET Image Processing","IET-IPR","C","journal","计算机图形学与多媒体"],["Journal of Visual Communication and Image Representation","JVCIR","C","journal","计算机图形学与多媒体"],["Multimedia Systems","MS","C","journal","计算机图形学与多媒体"],["Multimedia Tools and Applications","MTA","C","journal","计算机图形学与多媒体"],["Signal Processing","SIGPRO","C","journal","计算机图形学与多媒体"],["Signal Processing-Image Communication","IMAGE","C","journal","计算机图形学与多媒体"],["Visual Computer","TVC","C","journal","计算机图形学与多媒体"],["Visual Informatics","VI","C","journal","计算机图形学与多媒体"],["Virtual Reality & Intelligent Hardware","VRIH","C","journal","计算机图形学与多媒体"],["Graphical Models","GMOD","C","journal","计算机图形学与多媒体"],["ACM International Conference on Multimedia","ACM MM","A","conf","计算机图形学与多媒体"],["ACM Special Interest Group on Computer Graphics","SIGGRAPH","A","conf","计算机图形学与多媒体"],["IEEE Virtual Reality","VR","A","conf","计算机图形学与多媒体"],["IEEE Visualization Conference","IEEE VIS","A","conf","计算机图形学与多媒体"],["ACM SIGMM International Conference on Multimedia Retrieval","ICMR","B","conf","计算机图形学与多媒体"],["ACM SIGGRAPH Symposium onInteractive 3D Graphics and Games","I3D","B","conf","计算机图形学与多媒体"],["ACM SIGGRAPH/Eurographics Symposium on Computer Animation","SCA","B","conf","计算机图形学与多媒体"],["Data Compression Conference","DCC","B","conf","计算机图形学与多媒体"],["Annual Conference of the European Association for Computer Graphics","Eurographics","B","conf","计算机图形学与多媒体"],["Eurographics Conference on Visualization","EuroVis","B","conf","计算机图形学与多媒体"],["Eurographics Symposium on Geometry Processing","SGP","B","conf","计算机图形学与多媒体"],["Eurographics Symposium on Rendering","EGSR","B","conf","计算机图形学与多媒体"],["IEEE International Conference on Acoustics,Speech and Signal Processing","ICASSP","B","conf","计算机图形学与多媒体"],["IEEE International Conference on Multimedia& Expo","ICME","B","conf","计算机图形学与多媒体"],["International Symposium on Mixed and Augmented Reality","ISMAR","B","conf","计算机图形学与多媒体"],["Pacific Conference on Computer Graphics and Applications","PG","B","conf","计算机图形学与多媒体"],["Symposium on Solid and Physical Modeling","SPM","B","conf","计算机图形学与多媒体"],["Conference of the International Speech Communication Association","INTERSPEECH","B","conf","计算机图形学与多媒体"],["ACM Symposium on Virtual Reality Software and Technology","VRST","C","conf","计算机图形学与多媒体"],["International Conference on Computer Animation and Social Agents","CASA","C","conf","计算机图形学与多媒体"],["Computer Graphics International","CGI","C","conf","计算机图形学与多媒体"],["Geometric Modeling and Processing","GMP","C","conf","计算机图形学与多媒体"],["IEEE Pacific Visualization Symposium","PacificVis","C","conf","计算机图形学与多媒体"],["International Conference on 3D Vision","3DV","C","conf","计算机图形学与多媒体"],["International Conference on Computer-Aided Design and Computer Graphics","CAD/Graphics","C","conf","计算机图形学与多媒体"],["IEEE International Conference on Image Processing","ICIP","C","conf","计算机图形学与多媒体"],["International Conference on Multimedia Modeling","MMM","C","conf","计算机图形学与多媒体"],["ACM Multimedia Asia","MMAsia","C","conf","计算机图形学与多媒体"],["Shape Modeling International","SMI","C","conf","计算机图形学与多媒体"],["Computational Visual Media","CVM","C","conf","计算机图形学与多媒体"],["Chinese Conference on Pattern Recognition and Computer Vision","PRCV","C","conf","计算机图形学与多媒体"],["International Conference on Image and Graphics","ICIG","C","conf","计算机图形学与多媒体"],["National Conference on Man-Machine  Speech Communication","NCMMSC","C","conf","计算机图形学与多媒体"],["Automatic Speech Recognition and Understanding Workshop","ASRU","C","conf","计算机图形学与多媒体"],["Spoken Language Technology","SLT","C","conf","计算机图形学与多媒体"],["IEEE Transactions on Information Theory","TIT","A","journal","计算机科学理论"],["Information and Computation","IANDC","A","journal","计算机科学理论"],["SIAM Journal on Computing","SICOMP","A","journal","计算机科学理论"],["ACM Transactions on Algorithms","TALG","B","journal","计算机科学理论"],["ACM Transactions on Computational Logic","TOCL","B","journal","计算机科学理论"],["ACM Transactions on Mathematical Software","TOMS","B","journal","计算机科学理论"],["Algorithmica","Algorithmica","B","journal","计算机科学理论"],["Computational complexity","CC","B","journal","计算机科学理论"],["Formal Aspects of Computing","FAC","B","journal","计算机科学理论"],["Formal Methods in System Design","FMSD","B","journal","计算机科学理论"],["INFORMS Journal on Computing","INFORMS","B","journal","计算机科学理论"],["Journal of Computer and System Sciences","JCSS","B","journal","计算机科学理论"],["Journal of Global Optimization","JGO","B","journal","计算机科学理论"],["Journal of Symbolic Computation","JSC","B","journal","计算机科学理论"],["Mathematical Structures in Computer Science","MSCS","B","journal","计算机科学理论"],["Theoretical Computer Science","TCS","B","journal","计算机科学理论"],["Acta Informatica","ACTA","C","journal","计算机科学理论"],["Annals of Pure and Applied Logic","APAL","C","journal","计算机科学理论"],["Discrete Applied Mathematics","DAM","C","journal","计算机科学理论"],["Fundamenta Informaticae","FUIN","C","journal","计算机科学理论"],["Information Processing Letters","IPL","C","journal","计算机科学理论"],["Journal of Complexity","JCOMPLEXITY","C","journal","计算机科学理论"],["Journal of Logic and Computation","LOGCOM","C","journal","计算机科学理论"],["Journal of Symbolic Logic","JSL","C","journal","计算机科学理论"],["Logical Methods in Computer Science","LMCS","C","journal","计算机科学理论"],["SIAM Journal on Discrete Mathematics","SIDMA","C","journal","计算机科学理论"],["Theory of Computing Systems","","C","journal","计算机科学理论"],["ACM Transactions in Quantum Computing","TQC","C","journal","计算机科学理论"],["ACM Symposium on Theory of Computing","STOC","A","conf","计算机科学理论"],["ACM-SIAM Symposium on Discrete Algorithms","SODA","A","conf","计算机科学理论"],["International Conference on Computer Aided Verification","CAV","A","conf","计算机科学理论"],["IEEE Annual Symposium on Foundations of Computer Science","FOCS","A","conf","计算机科学理论"],["ACM/IEEE Symposium on Logic in Computer Science","LICS","A","conf","计算机科学理论"],["International Symposium on Computational Geometry","SoCG","B","conf","计算机科学理论"],["European Symposium on Algorithms","ESA","B","conf","计算机科学理论"],["Conference on Computational Complexity","CCC","B","conf","计算机科学理论"],["International Colloquium on Automata, Languages and Programming","ICALP","B","conf","计算机科学理论"],["International Conference on Automated Deduction/International Joint Conference on Automated Reasoning","","B","conf","计算机科学理论"],["International Conference on Concurrency Theory","CONCUR","B","conf","计算机科学理论"],["International Conference on Hybrid Systems: Computation and Control","HSCC","B","conf","计算机科学理论"],["International Conference on Theory and Applications of Satisfiability Testing","SAT","B","conf","计算机科学理论"],["International Computing and Combinatorics Conference","COCOON","B","conf","计算机科学理论"],["Formal Method in Computer-Aided Design","FMCAD","B","conf","计算机科学理论"],["Computer Science Logic","CSL","C","conf","计算机科学理论"],["Foundations of Software Technology and Theoretical Computer Science","FSTTCS","C","conf","计算机科学理论"],["IEEE International Conference on Data Science and Advanced Analytics","DSAA","C","conf","计算机科学理论"],["International Colloquium on Theoretical Aspects of Computing","ICTAC","C","conf","计算机科学理论"],["International Conference on Integer Programming and Combinatorial Optimization","IPCO","C","conf","计算机科学理论"],["International Conference on Formal Structures for Computation and Deduction","FSCD","C","conf","计算机科学理论"],["International Symposium on Algorithms and Computation","ISAAC","C","conf","计算机科学理论"],["International Conference on Mathematical Foundations of Computer Science","MFCS","C","conf","计算机科学理论"],["Symposium on Theoretical Aspects of Computer Science","STACS","C","conf","计算机科学理论"],["International Symposium on Dependable Software Engineering: Theories, Tools, and Applications","SETTA","C","conf","计算机科学理论"],["IEEE Journal on Selected Areas in Communications","JSAC","A","journal","计算机网络"],["IEEE Transactions on Mobile Computing","TMC","A","journal","计算机网络"],["IEEE-ACM Transactions on Networking","TON","A","journal","计算机网络"],["ACM Transactions on Internet Technology","TOIT","B","journal","计算机网络"],["ACM Transactions on Multimedia Computing Communications and Applications","TOMM","B","journal","计算机网络"],["ACM Transactions on Sensor Networks","TOSN","B","journal","计算机网络"],["Computer Networks","CN","B","journal","计算机网络"],["IEEE Transactions on Communications","TCOM","B","journal","计算机网络"],["IEEE Transactions on Wireless Communications","TWC","B","journal","计算机网络"],["Ad hoc Networks","","C","journal","计算机网络"],["Computer Communications","CC","C","journal","计算机网络"],["IEEE Transactions on Network and Service Management","TNSM","C","journal","计算机网络"],["IET Communications","","C","journal","计算机网络"],["Journal of Network and Computer Applications","JNCA","C","journal","计算机网络"],["Mobile Networks & Applications","MONET","C","journal","计算机网络"],["Networks","","C","journal","计算机网络"],["Peer-to-Peer Networking and Applications","PPNA","C","journal","计算机网络"],["Wireless Communications & Mobile Computing","WCMC","C","journal","计算机网络"],["Wireless Networks","","C","journal","计算机网络"],["IEEE Internet of Things Journal","IOT","C","journal","计算机网络"],["ACM Transactions on Internet of Things","TIOT","C","journal","计算机网络"],["ACM International Conference on Applications, Technologies, Architectures, and Protocols for Computer Communication","SIGCOMM","A","conf","计算机网络"],["ACM International Conference on Mobile Computing and Networking","MobiCom","A","conf","计算机网络"],["IEEE International Conference on Computer Communications","INFOCOM","A","conf","计算机网络"],["Symposium on Network System Design and Implementation","NSDI","A","conf","计算机网络"],["ACM Conference on Embedded Networked Sensor Systems","SenSys","B","conf","计算机网络"],["ACM International Conference on emerging Networking EXperiments and Technologies","CoNEXT","B","conf","计算机网络"],["IEEE International Conference on Sensing, Communication, and Networking","SECON","B","conf","计算机网络"],["International Conference on Information Processing in Sensor Networks","IPSN","B","conf","计算机网络"],["ACM International Conference on Mobile Systems, Applications, and Services","MobiSys","B","conf","计算机网络"],["IEEE International Conference on Network Protocols","ICNP","B","conf","计算机网络"],["International Symposium on Theory, Algorithmic Foundations, and Protocol Design for Mobile Networks and Mobile Computing","MobiHoc","B","conf","计算机网络"],["International Workshop on Network and Operating System Support for Digital Audio and Video","NOSSDAV","B","conf","计算机网络"],["IEEE/ACM International Workshop on Quality of Service","IWQoS","B","conf","计算机网络"],["ACM Internet Measurement Conference","IMC","B","conf","计算机网络"],["刊物全称","刊物名称","C","conf","计算机网络"],["ACM/IEEE Symposium on Architectures for Networking and Communication Systems","ANCS","C","conf","计算机网络"],["Asia-Pacific Network Operations and Management Symposium","APNOMS","C","conf","计算机网络"],["International Conference on Formal Techniques for Distributed Objects, Components, and Systems","FORTE","C","conf","计算机网络"],["IEEE Conference on Local Computer Networks","LCN","C","conf","计算机网络"],["IEEE Global Communications Conference","GLOBECOM","C","conf","计算机网络"],["IEEE International Conference on Communications","ICC","C","conf","计算机网络"],["IEEE International Conference on Computer Communications and Networks","ICCCN","C","conf","计算机网络"],["IEEE International Conference on Mobile Ad-hoc and Sensor Systems","MASS","C","conf","计算机网络"],["IEEE International Conference on P2P Computing","P2P","C","conf","计算机网络"],["IEEE International Performance Computing and Communications Conference","IPCCC","C","conf","计算机网络"],["IEEE International Symposium on a World of Wireless Mobile and Multimedia Networks","WoWMoM","C","conf","计算机网络"],["IEEE Symposium on Computers and Communications","ISCC","C","conf","计算机网络"],["IEEE Wireless Communications and Networking Conference","WCNC","C","conf","计算机网络"],["IFIP International Conferences on Networking","Networking","C","conf","计算机网络"],["IFIP/IEEE International Symposium on Integrated NetworkManagement","IM","C","conf","计算机网络"],["International Conference on Mobility, Sensing and Networking","MSN","C","conf","计算机网络"],["International Conference on Modeling, Analysis and Simulation of Wireless and Mobile Systems","MSWiM","C","conf","计算机网络"],["International Conference on Wireless Algorithms, Systems, and Applications","WASA","C","conf","计算机网络"],["ACM The Workshop on Hot Topics in Networks","HotNets","C","conf","计算机网络"],["ACM Transactions on Programming Languages and Systems","TOPLAS","A","journal","软件工程/系统软件/程序设计语言"],["ACM Transactions on Software Engineering and Methodology","TOSEM","A","journal","软件工程/系统软件/程序设计语言"],["IEEE Transactions on Software Engineering","TSE","A","journal","软件工程/系统软件/程序设计语言"],["IEEE Transactions on Services Computing","TSC","A","journal","软件工程/系统软件/程序设计语言"],["Automated Software Engineering","ASE","B","journal","软件工程/系统软件/程序设计语言"],["Empirical Software Engineering","ESE","B","journal","软件工程/系统软件/程序设计语言"],["IET Software","IETS","B","journal","软件工程/系统软件/程序设计语言"],["Information and Software Technology","IST","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Functional Programming","JFP","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Software-Evolution and Process","","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Systems and Software","JSS","B","journal","软件工程/系统软件/程序设计语言"],["Requirements Engineering","RE","B","journal","软件工程/系统软件/程序设计语言"],["Science of Computer Programming","SCP","B","journal","软件工程/系统软件/程序设计语言"],["Software and Systems Modeling","SoSyM","B","journal","软件工程/系统软件/程序设计语言"],["Software Testing Verification & Reliability","STVR","B","journal","软件工程/系统软件/程序设计语言"],["Software-Practice & Experience","SPE","B","journal","软件工程/系统软件/程序设计语言"],["Computer Languages, Systems and Structures","CL","C","journal","软件工程/系统软件/程序设计语言"],["International Journal of Software Engineering and Knowledge Engineering","IJSEKE","C","journal","软件工程/系统软件/程序设计语言"],["International Journal on Software Tools for Technology Transfer","STTT","C","journal","软件工程/系统软件/程序设计语言"],["Journal of Logical and Algebraic Methods in Programming","JLAMP","C","journal","软件工程/系统软件/程序设计语言"],["Journal of Web Engineering","JWE","C","journal","软件工程/系统软件/程序设计语言"],["Service Oriented Computing and Applications","SOCA","C","journal","软件工程/系统软件/程序设计语言"],["Software Quality Journal","SQJ","C","journal","软件工程/系统软件/程序设计语言"],["Theory and Practice of Logic Programming","TPLP","C","journal","软件工程/系统软件/程序设计语言"],["Proceedings of the ACM on Programming Languages-PACMPL","PACMPL","C","journal","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN Conference on Programming Language Design and Implementation","PLDI","A","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages","POPL","A","conf","软件工程/系统软件/程序设计语言"],["ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering","FSE/ESEC","A","conf","软件工程/系统软件/程序设计语言"],["ACM Symposium on Operating Systems Principles","SOSP","A","conf","软件工程/系统软件/程序设计语言"],["Conference on Object-Oriented Programming Systems, Languages,and Applications","OOPSLA","A","conf","软件工程/系统软件/程序设计语言"],["International Conference on Automated Software Engineering","ASE","A","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Engineering","ICSE","A","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Software Testing and Analysis","ISSTA","A","conf","软件工程/系统软件/程序设计语言"],["USENIX Symposium on Operating Systems Design and Implementations","OSDI","A","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Formal Methods","FM","A","conf","软件工程/系统软件/程序设计语言"],["European Conference on Object-Oriented Programming","ECOOP","B","conf","软件工程/系统软件/程序设计语言"],["European Joint Conferences on Theory and Practice of Software","ETAPS","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Program Comprehension","ICPC","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Requirements Engineering Conference","RE","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Advanced Information Systems Engineering","CAiSE","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN International Conference on Function Programming","ICFP","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN/SIGBED International Conference on Languages, Compilers andTools for Embedded Systems","LCTES","B","conf","软件工程/系统软件/程序设计语言"],["ACM/IEEE International Conference on Model Driven Engineering Languages and Systems","MoDELS","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Principles and Practice of Constraint Programming","CP","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Service Oriented Computing","ICSOC","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Software Analysis, Evolution,and Reengineering","SANER","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Maintenance and Evolution","ICSME","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Verification,Model Checking, and Abstract Interpretation","VMCAI","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Web Services","ICWS","B","conf","软件工程/系统软件/程序设计语言"],["International Middleware Conference","Middleware","B","conf","软件工程/系统软件/程序设计语言"],["International Static Analysis Symposium","SAS","B","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Empirical Software Engineering and Measurement","ESEM","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Symposium on Software Reliability Engineering","ISSRE","B","conf","软件工程/系统软件/程序设计语言"],["USENIX Workshop on Hot Topics in Operating Systems","HotOS","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Compiler Construction","CC","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN Workshop on Partial Evaluation and Program Manipulation","PEPM","C","conf","软件工程/系统软件/程序设计语言"],["ACMSIGPLAN-SIGSOFT Workshop on Program Analysis for Software Tools and Engineering","PASTE","C","conf","软件工程/系统软件/程序设计语言"],["Asian Symposium on Programming Languages and Systems","APLAS","C","conf","软件工程/系统软件/程序设计语言"],["Asia-Pacific Software Engineering Conference","APSEC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Evaluation and Assessment in Software Engineering","EASE","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Engineering of Complex Computer Systems","ICECCS","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Software Testing, Verification and Validation","ICST","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Symposium on Performance Analysis of Systems and Software","ISPASS","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Working Conference on Source Code Analysis and Manipulation","SCAM","C","conf","软件工程/系统软件/程序设计语言"],["International Computer Software and Applications Conference","COMPSAC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Formal Engineering Methods","ICFEM","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Services Computing","SCC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software and System Process","ICSSP","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Engineering and Knowledge Engineering","SEKE","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Quality, Reliability and Security","QRS","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Reuse","ICSR","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Web Engineering","ICWE","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Model Checking of Software","SPIN","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Automated Technology for Verification and Analysis","ATVA","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Logic-based Program Synthesis and Transformation","LOPSTR","C","conf","软件工程/系统软件/程序设计语言"],["Theoretical Aspects of Software Engineering Conference","TASE","C","conf","软件工程/系统软件/程序设计语言"],["Mining Software Repositories","MSR","C","conf","软件工程/系统软件/程序设计语言"],["Requirements Engineering: Foundation for Software Quality","REFSQ","C","conf","软件工程/系统软件/程序设计语言"],["Working IEEE/IFIP Conference on Software Architecture","WICSA","C","conf","软件工程/系统软件/程序设计语言"],["Asia-Pacific Symposium on Internetware","Internetware","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Runtime Verification","RV","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Formal Methods and Models for  Co-Design","MEMOCODE","C","conf","软件工程/系统软件/程序设计语言"]],"warn":[["Wireless Personal Communications","论文工厂"],["Natural Resources Forum","论文工厂"],["Computers & Electrical Engineering","论文工厂"],["NUMERICAL HEAT TRANSFER PART A-APPLICATIONS","论文工厂"],["SCALABLE COMPUTING-PRACTICE AND EXPERIENCE","论文工厂"]],"ops":{"European Journal of Operational Research":"A","INFORMS Journal on Computing":"A","Management Science":"A","Mathematical Programming":"A","Mathematics of Operations Research":"A","Operations Research":"A","Annals of Operations Research":"B","Computers & Industrial Engineering":"B","Computers & Operations Research":"B","Decision Analysis":"B","Decision Sciences":"B","Fuzzy Optimization and Decision Making":"B","Group Decision and Negotiation":"B","IEEE Transactions on Cybernetics":"B","IEEE Transactions on Evolutionary Computation":"B","INFORMS Journal on Applied Analytics":"B","INFORMS Journal on Optimization":"B","International Journal of Forecasting":"B","Journal of Heuristics":"B","Journal of Management Science and Engineering":"B","Journal of Optimization Theory and Applications":"B","Journal of Scheduling":"B","Journal of the Operational Research Society":"B","Judgment and Decision Making":"B","Naval Research Logistics":"B","Omega":"B","Operations Research Letters":"B","OR Spectrum":"B","SIAM Journal on Computing":"B","SIAM Journal on Optimization":"B","Asia-Pacific Journal of Operational Research":"C","Computational Optimization and Applications":"C","Decision":"C","Evolutionary Computation":"C","Flexible Services and Manufacturing Journal":"C","Grey Systems:Theory and Application":"C","International Journal of General Systems":"C","International Transactions in Operational Research":"C","Journal of Forecasting":"C","Journal of Global Optimization":"C","Journal of Grey System":"C","Journal of Management Analytics":"C","Journal of Systems Engineering and Electronics":"C","Journal of Systems Science and Complexity":"C","Mathematical Methods of Operations Research":"C","Stochastic Systems":"C","System Dynamics Review":"C","Systems Research and Behavioral Science":"C","Central European Journal of Operations Research":"D","Computational Management Science":"D","INFOR":"D","Journal of Data, Information and Management":"D","Journal of Multi-Criteria Decision Analysis":"D","Journal of Systems Science and Information":"D","Journal of the Operations Research Society of China":"D","Optimization":"D"},"aero":{"Acta Astronautica":"T1","AIAA Journal":"T1","Chinese Journal of Aeronautics":"T1","IEEE Transactions on Aerospace and Electronic Systems":"T1","Journal of Astronomical Telescopes Instruments and Systems":"T1","Journal of Guidance, Control, and Dynamics":"T1","Journal of Propulsion and Power":"T1","Progress in Aerospace Sciences":"T1","Space Science Reviews":"T1","航空学报":"T1","宇航学报":"T1","Aircraft Engineering and Aerospace Technology":"T2","Canadian Journal of Remote Sensing":"T2","IEEE Aerospace and Electronic Systems Magazine":"T2","International Journal of Aerospace Engineering":"T2","Journal of Aerospace Engineering":"T2","Journal of Aircraft":"T2","Journal of American Helicopter Society":"T2","Journal of Navigation":"T2","Journal of Spacecraft and Rockets":"T2","Journal of Systems Engineering and Electronics":"T2","Journal of the Astronautical Sciences":"T2","Microgravity Science and Technology":"T2","Navigation-Journal of the Institute of Navigation":"T2","NPJ Microgravity":"T2","Propulsion and Power Research":"T2","北京航空航天大学学报":"T2","航空材料学报":"T2","航空动力学报":"T2","南京航空航天大学学报":"T2","推进技术":"T2","系统工程与电子技术":"T2","中国空间科学技术":"T2","Advances in Aerodynamics":"T3","Advances in Space Research":"T3","Aerospace Science and Technology":"T3","Cosmic Research":"T3","International Journal of Aeronautical and Space Sciences":"T3","International Journal of Micro Air Vehicles":"T3","International Journal of Turbo & Jet-Engines":"T3","Journal of Aerospace Information Systems":"T3","The Aeronautical Journal":"T3","The International Journal of Aeroacoustics":"T3","Unmanned Systems":"T3","电光与控制":"T3","固体火箭技术":"T3","航空兵器":"T3","航空制造技术":"T3","航天控制":"T3","航天器工程":"T3","空间科学学报":"T3","空气动力学学报":"T3","上海航天":"T3","实验流体力学":"T3","系统仿真学报":"T3","宇航材料工艺":"T3","振动测试与诊断":"T3","中国惯性技术学报":"T3","植物科学领域高质量期刊分级目录":"T3","Annual Review of Phytopathology":"T3","Annual Review of Plant Biology":"T3","Ecological Monographs":"T3"}};


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
  libFolder: '科研工作台/文献', sourceFolder: '',
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
  libraryViewMode: 'list', savedLibraryViews: [], lastReadingPath: '', openAssistantOnDashboard: true, workspaceTheme: 'night', wellnessLog: {}, pdfAnnotations: {}, pdfReadingPositions: {}, deckFilter: 'active', deckMode: '3d', discoveryTags: [], journalDensity: 'compact', boardCollapsed: false, annotationsFolder: '科研工作台/批注',
  commonLinks: [{ name: 'DeepSeek', url: 'https://chat.deepseek.com/' }, { name: 'ChatGPT', url: 'https://chatgpt.com/' }, { name: 'Google Scholar', url: 'https://scholar.google.com/' }, { name: 'arXiv', url: 'https://arxiv.org/' }],
  wellnessReminders: { enabled: true, waterMinutes: 60, breakMinutes: 50, startHour: 8, endHour: 22 },
  layout: {},
  hiddenCards: [], customCards: [], cardTitles: {}, cardCfg: {},
  pomoLog: {},
  sidebarMode: 'full', /* full | icon | hidden */
  accent: 'emerald', accentCustom: '', glass: true,
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
      new Notice(`专注完成！${long ? '休息长一点吧' : `休息 ${s.pomoBreak} 分钟`}`);
      this.phase = long ? 'longbreak' : 'break';
      this.total = (long ? s.pomoLongBreak : s.pomoBreak) * 60;
      this.left = this.total; this._run();
    } else {
      new Notice('休息结束，继续冲刺！');
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
 * 右侧工具栏：迷你番茄钟 + 期刊速查 + 快速记想法（与主界面共享引擎）
 * ========================================================================== */

/* BEGIN GENERATED ASSISTANT */
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

/* END GENERATED ASSISTANT */

/* BEGIN GENERATED WEB */
class ResearchBrowserPanel {
  constructor(owner, root, url) { this.owner = owner; this.root = root; this.plugin = owner.plugin; this.url = url; this.build(); }
  navigate(address) {
    const url = new URL(address); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP(S) 网页');
    this.url = url.href;
    if (this.web && this.web.getAttribute('src') !== this.url) this.web.setAttribute('src', this.url);
    this.address.textContent = url.hostname;
    this.syncNavigation();
  }
  refreshLinks() {
    if (!this.links) return;
    this.links.empty(); this.links.createEl('option', { value: '', text: '选择常用网站' });
    this.plugin.settings.commonLinks.forEach((link) => this.links.createEl('option', { value: link.url, text: link.name }));
    this.syncNavigation();
  }
  syncNavigation() {
    if (!this.links) return;
    const origin = new URL(this.url).origin;
    const known = this.plugin.settings.commonLinks.find((link) => new URL(link.url).origin === origin);
    this.links.value = known?.url || '';
    this.back.disabled = !this._ready || !this.web?.canGoBack();
    this.forward.disabled = !this._ready || !this.web?.canGoForward();
    this.reload.disabled = !this._ready;
  }
  build() {
    const root = this.root; root.empty(); root.addClass('jrs-research-browser');
    const header = root.createEl('div', { cls: 'jrs-browser-title' });
    header.createEl('strong', { text: '研究网页' });
    uiButton(header, '研究助手', 'panel-right', () => this.owner.showCompanionMode('assistant'), 'jrs-text-button');
    const bar = root.createEl('div', { cls: 'jrs-browser-toolbar' });
    this.back = uiButton(bar, '', 'arrow-left', () => { if (this.web?.canGoBack()) this.web.goBack(); }, 'od-icon-btn'); this.back.setAttribute('aria-label', '网页后退');
    this.forward = uiButton(bar, '', 'arrow-right', () => { if (this.web?.canGoForward()) this.web.goForward(); }, 'od-icon-btn'); this.forward.setAttribute('aria-label', '网页前进');
    this.reload = uiButton(bar, '', 'rotate-cw', () => this.web?.reload(), 'od-icon-btn'); this.reload.setAttribute('aria-label', '重新加载网页');
    this.links = bar.createEl('select', { cls: 'jrs-select', attr: { 'aria-label': '在侧栏切换常用网站' } });
    this.links.onchange = () => { if (this.links.value) this.plugin.openResearchWeb(this.links.value); };
    this.refreshLinks();
    uiButton(bar, '', 'external-link', () => openResearchLink(this.url), 'od-icon-btn').setAttribute('aria-label', '改用系统浏览器打开');
    this.address = root.createEl('div', { cls: 'jrs-browser-address', text: new URL(this.url).hostname });
    this.status = root.createEl('div', { cls: 'jrs-browser-status', text: '正在加载网站…' });
    this.web = document.createElement('webview');
    if (typeof this.web.loadURL !== 'function') {
      this.web = null; this.status.textContent = '当前平台不支持内嵌网页，可在浏览器中继续使用。';
      uiButton(root, '在浏览器中打开', 'external-link', () => openResearchLink(this.url), 'od-btn'); return;
    }
    this.web.className = 'jrs-browser-webview';
    this.web.setAttribute('partition', 'persist:jensen-research');
    this.web.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,nodeIntegration=no');
    this.web.setAttribute('allowpopups', '');
    this.web.setAttribute('src', this.url);
    this.owner.registerDomEvent(this.web, 'dom-ready', () => { this._ready = true; this.syncNavigation(); });
    this.owner.registerDomEvent(this.web, 'did-start-loading', () => { this._failed = false; this.status.textContent = '正在加载网站…'; this.status.hidden = false; });
    this.owner.registerDomEvent(this.web, 'did-stop-loading', () => { this.status.hidden = !this._failed; this.syncNavigation(); });
    const navigate = (event) => {
      if (event.isMainFrame === false) return;
      if (!/^https?:/i.test(event.url)) return;
      this.url = event.url; this.address.textContent = new URL(event.url).hostname; this.syncNavigation();
    };
    this.owner.registerDomEvent(this.web, 'did-navigate', navigate);
    this.owner.registerDomEvent(this.web, 'did-navigate-in-page', navigate);
    this.owner.registerDomEvent(this.web, 'did-fail-load', (event) => { if (event.errorCode === -3 || event.isMainFrame === false) return; this._failed = true; this.status.hidden = false; this.status.textContent = `网站加载失败：${event.errorDescription}。可重试或使用右上角浏览器按钮。`; });
    root.appendChild(this.web);
  }
}
/* END GENERATED WEB */

/* BEGIN GENERATED PDF */
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
/* END GENERATED PDF */

/* BEGIN GENERATED LIFE */
class SidebarLife {
  constructor(view, host) {
    this.view = view; this.plugin = view.plugin; this.host = host;
    this.month = view._lifeMonth || window.moment().startOf('month');
    this._unsubscribe = this.plugin.pomo.onTick(() => this.renderClock());
    this.render();
  }
  destroy() { this._unsubscribe?.(); }
  render() {
    const host = this.host; host.empty(); host.addClass('jrs-life-sidebar');
    const heading = host.createEl('div', { cls: 'jrs-life-heading' });
    heading.createSpan({ text: '日历与生活' });
    const reminder = uiButton(heading, '', 'bell', () => new WellnessSettingsModal(this.plugin).open(), 'od-icon-btn'); reminder.setAttribute('aria-label', '喝水与休息提醒设置');
    const calendar = host.createEl('div', { cls: 'jrs-mini-calendar' });
    const bar = calendar.createEl('div', { cls: 'jrs-mini-calendar-bar' });
    uiButton(bar, '', 'chevron-left', () => this.moveMonth(-1), 'jrs-mini-cal-arrow').setAttribute('aria-label', '上个月');
    uiButton(bar, this.month.format('YYYY年 M月'), '', () => { this.month = window.moment().startOf('month'); this.view._lifeMonth = this.month; this.render(); }, 'jrs-mini-cal-month');
    uiButton(bar, '', 'chevron-right', () => this.moveMonth(1), 'jrs-mini-cal-arrow').setAttribute('aria-label', '下个月');
    const days = calendar.createEl('div', { cls: 'jrs-mini-calendar-days' });
    '一二三四五六日'.split('').forEach((day) => days.createSpan({ cls: 'jrs-mini-cal-week', text: day }));
    const first = (this.month.day() + 6) % 7;
    for (let i = 0; i < first; i++) days.createSpan();
    for (let day = 1; day <= this.month.daysInMonth(); day++) {
      const key = this.month.clone().date(day).format('YYYY-MM-DD');
      const log = this.plugin.wellnessDay(key);
      const button = uiButton(days, String(day), '', () => new LifeDayModal(this.plugin, key, () => this.render()).open(), `jrs-mini-cal-day${key === todayKey() ? ' is-today' : ''}${log.workouts ? ' is-trained' : ''}`);
      button.title = `${key} · 喝水 ${log.water} 次 · 休息 ${log.breaks} 次${log.workouts ? ' · 已健身' : ''}`;
      button.setAttribute('aria-label', button.title);
      if (this.plugin.findDailyNote(key)) button.classList.add('has-note');
    }
    const log = this.plugin.wellnessDay();
    const habits = host.createEl('div', { cls: 'jrs-habit-buttons' });
    [['water', 'glass-water', '喝水', log.water], ['breaks', 'coffee', '休息', log.breaks], ['workouts', 'dumbbell', '健身', log.workouts ? '已打卡' : '打卡']].forEach(([kind, icon, label, count]) => {
      const button = uiButton(habits, '', icon, async () => { await this.plugin.recordWellness(kind, todayKey(), kind === 'workouts' && log.workouts ? -1 : 1); this.render(); }, `jrs-habit-button${kind === 'workouts' && log.workouts ? ' is-done' : ''}`);
      button.createSpan({ text: label }); button.createEl('strong', { text: String(count) });
      button.title = kind === 'workouts' ? log.workouts ? '取消今日健身打卡' : '记录今日健身' : `记录一次${label}`;
    });
    const focus = host.createEl('div', { cls: 'jrs-life-focus' });
    setIcon(focus.createSpan(), 'timer'); this.clock = focus.createEl('strong');
    this.start = uiButton(focus, '', '', () => { this.plugin.pomo.phase === 'idle' ? this.plugin.pomo.start() : this.plugin.pomo.reset(); }, 'jrs-text-button');
    this.renderClock();
  }
  moveMonth(delta) { this.month = this.month.clone().add(delta, 'month'); this.view._lifeMonth = this.month; this.render(); }
  renderClock() {
    if (!this.clock) return;
    const pomo = this.plugin.pomo;
    this.clock.textContent = pomo.phase === 'idle' ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00` : pomo.clockText();
    this.start.textContent = pomo.phase === 'idle' ? '开始专注' : '停止';
  }
}

class LifeDayModal extends Modal {
  constructor(plugin, key, onDone) { super(plugin.app); this.plugin = plugin; this.key = key; this.onDone = onDone; }
  onOpen() {
    this.titleEl.setText(`${this.key} · 生活记录`); this.contentEl.empty();
    const log = this.plugin.wellnessDay(this.key);
    [['water', '喝水记录', log.water], ['breaks', '休息记录', log.breaks], ['workouts', '健身打卡', log.workouts]].forEach(([kind, label, count]) => {
      const setting = new Setting(this.contentEl).setName(label).setDesc(`${count} 次`);
      setting.addButton((button) => button.setButtonText('−').setDisabled(!count).onClick(async () => { await this.plugin.recordWellness(kind, this.key, -1); this.onOpen(); this.onDone?.(); }));
      setting.addButton((button) => button.setButtonText('+ 记录').setDisabled(kind === 'workouts' && count >= 1).onClick(async () => { await this.plugin.recordWellness(kind, this.key, 1); this.onOpen(); this.onDone?.(); }));
    });
    uiButton(this.contentEl, '打开这一天的日记', 'calendar-days', () => this.plugin.openDailyNote(this.key), 'od-btn od-btn--primary');
  }
}

class WellnessSettingsModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }
  onOpen() {
    this.titleEl.setText('喝水与休息提醒');
    const options = this.plugin.settings.wellnessReminders;
    new Setting(this.contentEl).setName('启用温和提醒').setDesc('仅在 Obsidian 可见且处于提醒时段时显示。').addToggle((toggle) => toggle.setValue(options.enabled).onChange(async (value) => { options.enabled = value; this.plugin._wellnessStarted = Date.now(); await this.plugin.saveSettings(); }));
    [['waterMinutes', '喝水提醒间隔', 60], ['breakMinutes', '休息提醒间隔', 50]].forEach(([key, label, fallback]) => {
      new Setting(this.contentEl).setName(label).setDesc('分钟，5–240').addText((text) => {
        text.setValue(String(options[key])); text.inputEl.type = 'number'; text.inputEl.min = '5'; text.inputEl.max = '240';
        text.onChange(async (value) => { const number = Number(value); if (Number.isFinite(number) && number >= 5 && number <= 240) { options[key] = number; await this.plugin.saveSettings(); } });
      });
    });
    [['startHour', '每日开始时间'], ['endHour', '每日结束时间']].forEach(([key, label]) => new Setting(this.contentEl).setName(label).addDropdown((dropdown) => {
      for (let hour = 0; hour < 24; hour++) dropdown.addOption(String(hour), `${String(hour).padStart(2, '0')}:00`);
      dropdown.setValue(String(options[key])).onChange(async (value) => { options[key] = Number(value); await this.plugin.saveSettings(); });
    }));
  }
}

class LifePanelView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_LIFE; }
  getDisplayText() { return '日历与生活'; }
  getIcon() { return 'calendar-heart'; }
  async onOpen() {
    this.render(); this.registerInterval(window.setInterval(() => { if (this._date !== todayKey()) this.render(); }, 60000));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (file.path !== this.plugin.dailyPath()) return;
      window.clearTimeout(this._taskRefresh); this._taskRefresh = window.setTimeout(() => this.render(), 160);
    }));
  }
  onClose() { this._life?.destroy(); window.clearTimeout(this._taskRefresh); }
  render() {
    this._life?.destroy(); this._date = todayKey();
    const root = this.contentEl; root.empty(); root.addClass('jrs-view', 'jrs-life-view');
    const header = root.createEl('header', { cls: 'jrs-life-panel-header' });
    header.createEl('div', { cls: 'jrs-eyebrow', text: 'DAILY COMPANION' });
    header.createEl('h2', { text: '日历与生活' });
    header.createEl('p', { text: `${window.moment().format('M月D日')} 星期${'日一二三四五六'[window.moment().day()]}` });
    buildThemeToggle(header, this.plugin);
    const body = root.createEl('div', { cls: 'jrs-life-panel-body' });
    this._life = new SidebarLife(this, body.createEl('section'));
    const notes = body.createEl('section', { cls: 'jrs-life-daily-actions' });
    notes.createEl('h3', { text: '今天的小计划' });
    uiButton(notes, '打开今日日记', 'calendar-days', () => this.plugin.openDailyNote(), 'od-btn');
    uiButton(notes, '生成今日小结', 'notebook-pen', () => this.plugin.generateDailyDigest(), 'od-btn');
    uiButton(notes, '喝水与休息提醒', 'bell', () => new WellnessSettingsModal(this.plugin).open(), 'od-btn');
    const hint = notes.createEl('p', { cls: 'od-hint' });
    hint.textContent = this.plugin.settings.wellnessReminders.enabled ? `提醒已开启 · 喝水 ${this.plugin.settings.wellnessReminders.waterMinutes} 分钟 / 休息 ${this.plugin.settings.wellnessReminders.breakMinutes} 分钟` : '提醒已关闭，可随时开启';
    const tasks = notes.createEl('div', { cls: 'jrs-life-tasks' });
    this.plugin.getTodayTasks().then((items) => {
      if (!tasks.isConnected) return;
      if (!items.length) { tasks.createEl('p', { cls: 'od-hint', text: '日记里的待办会出现在这里。' }); return; }
      items.slice(0, 8).forEach((task) => {
        const label = tasks.createEl('label', { cls: 'jrs-survey-task' });
        const check = label.createEl('input', { type: 'checkbox' }); check.checked = task.done; label.createSpan({ text: task.text });
        check.onchange = async () => { check.disabled = true; try { await this.plugin.toggleDailyTask(task); } finally { check.disabled = false; } };
      });
    });
  }
}

const WellnessMethods = {
  wellnessDay(key = todayKey()) { return Object.assign({ water: 0, breaks: 0, workouts: 0 }, this.settings.wellnessLog[key]); },
  async recordWellness(kind, key = todayKey(), delta = 1) {
    if (!['water', 'breaks', 'workouts'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('无效的生活记录');
    const log = this.wellnessDay(key); const old = log[kind];
    log[kind] = Math.max(0, Math.min(kind === 'workouts' ? 1 : 999, old + delta));
    log[`${kind}At`] = Date.now(); this.settings.wellnessLog[key] = log;
    await this.saveSettings();
    this.app.workspace.getLeavesOfType(VIEW_LIFE).forEach((leaf) => leaf.view._life?.render());
    return log;
  },
  startWellnessReminders() {
    this._wellnessStarted = Date.now(); this._wellnessNotified = {}; this._wellnessSnooze = {};
    this.registerInterval(window.setInterval(() => this.checkWellnessReminders(), 30000));
  },
  checkWellnessReminders() {
    const options = this.settings.wellnessReminders;
    if (!options.enabled || document.visibilityState !== 'visible') return;
    const hour = window.moment().hour();
    const inHours = options.startHour === options.endHour || (options.startHour < options.endHour ? hour >= options.startHour && hour < options.endHour : hour >= options.startHour || hour < options.endHour);
    if (!inHours) return;
    const now = Date.now(); const log = this.wellnessDay();
    for (const [kind, minutes, label] of [['water', options.waterMinutes, '喝点水，让思路缓一缓。'], ['breaks', options.breakMinutes, '暂时离开屏幕，活动一下。']]) {
      const previous = Math.max(this._wellnessStarted, log[`${kind}At`] || 0, this._wellnessNotified[kind] || 0);
      if (now - previous < Math.max(5, Number(minutes) || 60) * 60000 || now < (this._wellnessSnooze[kind] || 0)) continue;
      this._wellnessNotified[kind] = now;
      const content = document.createElement('div'); content.createEl('p', { text: label });
      let notice;
      uiButton(content, kind === 'water' ? '记录喝水' : '记录休息', kind === 'water' ? 'glass-water' : 'coffee', async () => { await this.recordWellness(kind); notice.hide(); }, 'od-btn');
      uiButton(content, '10 分钟后', 'clock', () => { this._wellnessSnooze[kind] = now + 10 * 60000; this._wellnessNotified[kind] = now - Math.max(5, Number(minutes) || 60) * 60000; notice.hide(); }, 'od-btn');
      notice = new Notice(content, 30000);
    }
  },
};
/* END GENERATED LIFE */

/* BEGIN GENERATED DECK */
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
/* END GENERATED DECK */

/* BEGIN GENERATED SECTIONS */
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
/* END GENERATED SECTIONS */

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
  getIcon() { return 'book-open'; }

  async onOpen() {
    this.registerEvent(this.app.workspace.on('resize', () => {
      if (this.section === 'home' && this._board?.isConnected) { this.computeMetrics(); this.applyPositions(); }
    }));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (!file.path.startsWith(this.plugin.settings.libFolder + '/') && file.path !== this.plugin.settings.surveyNote) return;
      window.clearTimeout(this._refreshTimer);
      this._refreshTimer = window.setTimeout(() => {
        if (this.section === 'library') this._panel?.renderList();
        else if (!this.editing && !this.contentEl.contains(document.activeElement)) this.render();
      }, 180);
    }));
    await this.render();
  }
  onClose() {
    if (this._unsub) this._unsub();
    if (this._ro) this._ro.disconnect();
    this._readingDeck?.destroy(); this._sidebarLife?.destroy();
    window.clearTimeout(this._refreshTimer);
  }

  async goto(section) {
    if (!SECTIONS.some((item) => item.id === section)) return;
    this.section = section; await this.render();
  }

  async render() {
    this._readingDeck?.destroy(); this._sidebarLife?.destroy();
    if (this._ro) this._ro.disconnect();
    const root = this.contentEl;
    root.empty(); root.addClass('jrs-view'); root.dataset.section = this.section;
    const shell = root.createEl('div', { cls: 'jrs-shell' });
    if (this.plugin.settings.sidebarMode !== 'hidden') shell.appendChild(this.buildSidebar());
    const main = shell.createEl('div', { cls: 'jrs-main' });
    const mobile = main.createEl('div', { cls: `jrs-mobile-nav${this.plugin.settings.sidebarMode === 'hidden' ? ' is-required' : ''}` });
    setIcon(mobile.createSpan(), 'book-open');
    const select = mobile.createEl('select', { attr: { 'aria-label': '切换工作站页面' } });
    SECTIONS.forEach((section) => select.createEl('option', { value: section.id, text: section.label }));
    select.value = this.section; select.onchange = () => this.goto(select.value);
    if (this.section !== 'home') main.appendChild(this.buildTopbar(this.section === 'library'));
    this._page = main.createEl('div', { cls: `jrs-page jrs-page-${this.section}` });
    const page = this._page;
    await this.renderSection(page);
    if (this._page === page) await new SectionWorkspace(this).enhance(page);
  }

  /* ---------- 左侧栏（对标 OS sidebar） ---------- */

  buildSidebar() {
    const mode = this.plugin.settings.sidebarMode;
    const aside = document.createElement('aside');
    aside.className = `jrs-sidebar${mode === 'icon' ? ' is-icon' : ''}`;
    const brand = aside.createEl('div', { cls: 'jrs-brand' });
    setIcon(brand.createEl('span', { cls: 'jrs-brand-mark' }), 'book-open');
    if (mode !== 'icon') {
      const copy = brand.createEl('div', { cls: 'jrs-brand-copy' });
      copy.createEl('div', { cls: 'jrs-brand-name', text: 'Jensen' });
      copy.createEl('div', { cls: 'jrs-brand-sub', text: '科研工作站' });
    }
    const papers = this.plugin.getPapers();
    if (mode !== 'icon') {
      const workspace = aside.createEl('div', { cls: 'jrs-workspace-badge' });
      setIcon(workspace.createSpan(), 'folder-open');
      workspace.createSpan({ text: this.app.vault.getName() });
      workspace.createSpan({ cls: 'jrs-workspace-dot', attr: { title: '本地知识库' } });
    }
    const nav = aside.createEl('nav', { cls: 'jrs-nav', attr: { 'aria-label': '工作站导航' } });
    const groups = [
      ['工作空间', ['home', 'queue', 'library', 'reader']],
      ['研究与发现', ['discover', 'graph', 'progress', 'ask']],
      ['发表', ['submit']],
    ];
    const counts = { library: papers.length, queue: papers.filter((p) => p.status === '阅读中').length };
    groups.forEach(([name, ids]) => {
      const group = nav.createEl('div', { cls: 'jrs-nav-group' });
      if (mode !== 'icon') group.createEl('div', { cls: 'jrs-nav-group-label', text: name });
      ids.forEach((id) => {
        const sec = SECTIONS.find((section) => section.id === id);
        const button = uiButton(group, mode !== 'icon' ? sec.label : '', sec.icon, () => this.goto(id), `jrs-nav-item${this.section === id ? ' is-active' : ''}`);
        button.title = sec.label; button.setAttribute('aria-label', sec.label);
        if (this.section === id) button.setAttribute('aria-current', 'page');
        if (mode !== 'icon' && counts[id] != null) button.createSpan({ cls: 'jrs-nav-count', text: String(counts[id]) });
      });
    });

    const bottom = aside.createEl('div', { cls: 'jrs-sidebar-bottom' });
    if (mode !== 'icon') {
      uiButton(bottom, '工作站设置', 'settings-2', () => {
        this.app.setting.open(); this.app.setting.openTabById(this.plugin.manifest.id);
      }, 'jrs-nav-item');
    }
    const collapse = uiButton(bottom, mode !== 'icon' ? '收起侧栏' : '', mode === 'icon' ? 'panel-left-open' : 'panel-left-close', async () => {
      this.plugin.settings.sidebarMode = mode === 'icon' ? 'full' : 'icon';
      await this.plugin.saveSettings(); await this.render();
    }, 'jrs-nav-item jrs-sidebar-toggle');
    collapse.setAttribute('aria-label', '切换侧栏宽度');
    return aside;
  }

  /* ---------- Topbar（对标 OS：标题 + 副标题 + 搜索 + 主按钮） ---------- */

  buildTopbar(omitSearch = false) {
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];
    const bar = document.createElement('header');
    bar.className = 'jrs-topbar';

    const title = bar.createEl('div', { cls: 'jrs-page-title' });
    title.createEl('h1', { text: sec.title });
    title.createEl('p', { text: sec.sub });

    const tools = bar.createEl('div', { cls: 'jrs-tools' });
    buildThemeToggle(tools, this.plugin);
    if (!omitSearch) {
      const omni = tools.createEl('div', { cls: 'jrs-omnibox' });
      this.buildOmnibox(omni);
    }

    const primary = tools.createEl('button', { cls: 'od-btn od-btn--primary' });
    let pIcon = 'plus'; let pLabel = '添加文献';
    if (this.section === 'discover') { pIcon = 'refresh-cw'; pLabel = '立即发现'; }
    if (this.section === 'progress') { pIcon = 'sprout'; pLabel = 'AI 综述'; }
    if (this.section === 'graph') { pIcon = 'git-fork'; pLabel = '重建图谱'; }
    if (this.section === 'queue') { pIcon = 'list-plus'; pLabel = '添加文献'; }
    if (this.section === 'reader') { pIcon = 'book-open'; pLabel = '继续上次阅读'; }
    if (this.section === 'submit') { pIcon = 'plus'; pLabel = '新建投稿'; }
    if (this.section === 'ask') { pIcon = 'inbox'; pLabel = '快速记想法'; }
    setIcon(primary.createSpan(), pIcon);
    primary.createSpan({ text: pLabel });
    primary.onclick = async () => {
      if (this.section === 'discover') { this._page.querySelector('.jrs-discover-form button')?.click(); return; }
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
    const target = this.plugin.getPapers().find((p) => p.path === this.plugin.settings.lastReadingPath) || reading[0] || this.plugin.getPapersSorted('added')[0];
    if (!target) { new Notice('文献库为空'); return; }
    this.plugin.openReading(target);
  }

  buildOmnibox(host) {
    const box = host.createEl('div', { cls: 'od-search jrs-omnibox-box' });
    setIcon(box.createSpan(), 'search');
    const input = box.createEl('input', { type: 'text', placeholder: '搜索文献、笔记和命令…', attr: { 'aria-label': '搜索文献、笔记和命令' } });
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
      case 'discover': return new SectionWorkspace(this).renderDiscover(page);
      case 'queue': return new SectionWorkspace(this).renderReading(page);
      case 'library': return this.renderLibrarySection(page);
      case 'graph': return new SectionWorkspace(this).renderGraph(page);
      case 'progress': return await this.renderProgress(page);
      case 'reader': return new SectionWorkspace(this).renderReading(page, true);
      case 'submit': return this.renderSubmit(page);
      case 'ask': return this.renderAsk(page);
      default: return this.renderHome(page);
    }
  }

  /* ========== 区段：总览（Hero + 自由看板，v0.3 保留） ========== */

  async renderHome(page) {
    this.packLayout();
    page.appendChild(this.buildHero());
    await this.buildHomeOverview(page);
    if (this._page !== page) return;
    const heading = page.createEl('div', { cls: 'jrs-board-heading' });
    const copy = heading.createEl('div');
    copy.createEl('h2', { text: '我的研究桌面' });
    copy.createEl('p', { text: this.editing ? '拖动吸附网格，松开后自动避让' : '专注、计划与研究线索，按你的节奏排列' });
    const actions = heading.createEl('div', { cls: 'jrs-row-actions' });
    uiButton(actions, '卡片管理', 'sliders-horizontal', () => new CardManagerModal(this.plugin, () => this.render()).open(), 'od-btn od-btn--sm');
    uiButton(actions, '自动整理', 'align-start-vertical', async () => {
      this._previousBoardLayout = structuredClone(this.plugin.settings.layout);
      for (const def of this.visibleCards()) { const layout = this.layoutOf(def.id); layout.x = -1; layout.y = -1; }
      this.packLayout(); await this.plugin.saveSettings(); await this.render();
    }, 'od-btn od-btn--sm');
    if (this._previousBoardLayout) uiButton(actions, '撤销整理', 'undo-2', async () => {
      this.plugin.settings.layout = this._previousBoardLayout; this._previousBoardLayout = null;
      await this.plugin.saveSettings(); await this.render();
    }, 'od-btn od-btn--sm');
    uiButton(actions, this.editing ? '完成排版' : '编辑布局', this.editing ? 'check' : 'layout-dashboard', () => this.toggleEditing(), `od-btn od-btn--sm${this.editing ? ' od-btn--primary' : ''}`);
    this._board = page.createEl('div', { cls: `jrs-board${this.editing ? ' is-editing' : ''}` });
    this._shells.clear();
    for (const def of this.visibleCards()) {
      try {
        const shell = await this.buildShell(def);
        if (this._page !== page) return;
        this._board.appendChild(shell); this._shells.set(def.id, shell);
      } catch (error) { console.error(`[JRS] 卡片「${def.id}」渲染失败`, error); }
    }
    this.computeMetrics(); this.applyPositions(); this.setupBoardObserver();
    if (this.visibleCards().some((card) => card.id === 'arxiv')) this.plugin.ensureArxivFresh().then((result) => { if (result?.justFetched) this.softRefresh('arxiv'); });
  }

  async buildHomeOverview(page) {
    const papers = this.plugin.getPapers();
    const reading = papers.filter((paper) => paper.status === '阅读中');
    const pending = papers.filter((paper) => paper.status === '待读');
    const completed = papers.filter((paper) => paper.status === '已完成');
    const stats = page.createEl('div', { cls: 'jrs-prism-stats' });
    [[papers.length, '文献总量', 'LIBRARY / 知识积累', '全部'], [pending.length, '待读文献', 'INBOX / 待探索', '待读'],
      [reading.length, '正在精读', 'READING / 深入理解', '阅读中'], [completed.length, '已完成阅读', 'ARCHIVE / 研究积累', '已完成']].forEach(([value, label, eyebrow, status]) => {
      const metric = uiButton(stats, '', '', async () => {
        this.plugin.libFilterState = { statusFilter: status, q: '', prioFilter: '全部', topicFilter: '', projectFilter: '' };
        await this.goto('library');
      }, 'jrs-prism-stat');
      metric.createEl('div', { cls: 'jrs-prism-caption', text: eyebrow });
      metric.createEl('div', { cls: 'jrs-prism-label', text: label });
      const amount = metric.createEl('div', { cls: 'jrs-prism-value' }); amount.createEl('strong', { text: String(value) }); amount.createSpan({ text: '篇文献' });
      metric.createEl('div', { cls: 'jrs-prism-foot', text: status === '全部' ? `${this.plugin.papersAddedThisWeek()} 篇本周收集` : `${papers.length ? Math.round(value / papers.length * 100) : 0}% 文献占比` });
    });
    const cockpit = page.createEl('div', { cls: 'jrs-reading-cockpit' });
    const queue = cockpit.createEl('section', { cls: 'jrs-cockpit-queue' });
    const heading = queue.createEl('div', { cls: 'jrs-assistant-section-title' }); heading.createSpan({ text: '阅读队列' });
    uiButton(heading, '全部', 'arrow-up-right', () => this.goto('queue'), 'jrs-text-button');
    [[reading, '进行中'], [pending, '接下来']].forEach(([items, label]) => {
      const group = queue.createEl('div', { cls: 'jrs-cockpit-queue-group' });
      group.createEl('div', { cls: 'jrs-cockpit-queue-caption', text: `${label} · ${items.length}` });
      if (!items.length) group.createEl('p', { cls: 'od-hint', text: label === '进行中' ? '还没有进行中的阅读' : '阅读队列已清空' });
      items.slice(0, 4).forEach((paper) => {
        const button = uiButton(group, '', '', () => {
          this._readingDeck.selectPath(paper.path);
        }, 'jrs-cockpit-queue-item');
        button.dataset.path = paper.path;
        button.createEl('span', { text: paper.title });
        button.createEl('small', { text: `${paper.progress}%${paper.priority ? ' · ' + paper.priority + '优先' : ''}` });
      });
    });
    const deckHost = cockpit.createEl('section');
    const ordered = [...reading.sort((a, b) => b.progress - a.progress), ...this.plugin.getPapersSorted('priority').filter((paper) => paper.status === '待读'), ...completed, ...papers.filter((paper) => paper.status === '已归档')];
    this._readingDeck = new ReadingDeck(this, deckHost, ordered);
    cockpit.addEventListener('jrs-paper-select', (event) => {
      queue.querySelectorAll('.jrs-cockpit-queue-item').forEach((button) => button.classList.toggle('is-active', button.dataset.path === event.detail));
    });
    this._readingDeck.select(this._readingDeck.index);
  }

  cardDef(id) {
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return { id, name: b.name, icon: b.icon, size: { ...b.size }, custom: null };
    const c = this.plugin.settings.customCards.find((x) => `c:${x.uid}` === id);
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

  packLayout(priorityId) {
    const cards = this.visibleCards().map((def) => ({ id: def.id, layout: this.layoutOf(def.id) }));
    if (priorityId) cards.sort((a, b) => Number(b.id === priorityId) - Number(a.id === priorityId));
    const packed = ResearchCore.packBoardLayout(cards, this.plugin.settings.columns);
    const changed = cards.some((card) => JSON.stringify(card.layout) !== JSON.stringify(packed[card.id]));
    Object.assign(this.plugin.settings.layout, packed);
    if (changed) this.plugin.saveSettings().catch((error) => new Notice(`布局保存失败：${error.message}`));
  }

  computeMetrics() {
    const settings = this.plugin.settings;
    const boardW = this._board?.clientWidth || 900;
    const gap = Math.max(4, Math.min(32, Number(settings.gapPx) || 14));
    const preferred = Math.max(2, Math.min(12, Number(settings.columns) || DEFAULT_COLS));
    const fit = Math.max(2, Math.floor((boardW + gap) / (128 + gap)));
    const cols = Math.min(preferred, fit);
    const colW = Math.max(1, (boardW - (cols - 1) * gap) / cols);
    this._metrics = { cols, colW, rowH: ROW_H, gap, boardW };
    this._displayLayout = ResearchCore.packBoardLayout(this.visibleCards().map((def) => ({ id: def.id, layout: this.layoutOf(def.id) })), cols, cols !== preferred);
  }

  positionShell(shell, layout) {
    if (!layout) return;
    const { colW, rowH, gap } = this._metrics;
    shell.style.left = `${layout.x * (colW + gap)}px`;
    shell.style.top = `${layout.y * (rowH + gap)}px`;
    shell.style.width = `${layout.w * colW + (layout.w - 1) * gap}px`;
    shell.style.height = `${layout.h * rowH + (layout.h - 1) * gap}px`;
  }

  applyPositions() {
    for (const [id, shell] of this._shells) this.positionShell(shell, this._displayLayout?.[id]);
    const bottom = Object.values(this._displayLayout || {}).reduce((max, layout) => Math.max(max, layout.y + layout.h), 0);
    if (this._board) this._board.style.height = `${Math.max(1, bottom) * (ROW_H + this._metrics.gap) - this._metrics.gap}px`;
  }

  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => { this.computeMetrics(); this.applyPositions(); });
    this._ro.observe(this._board);
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
    shell.addEventListener('pointerdown', (event) => {
      if (!this.editing || event.button !== 0 || event.target.closest('button, input, a, select')) return;
      const resizing = !!event.target.closest('.jrs-resize');
      if (!resizing && !event.target.closest('.jrs-card-handle')) return;
      event.preventDefault();
      const { colW, rowH, gap, cols } = this._metrics;
      const original = { ...this._displayLayout[id] };
      const moving = { ...original };
      const startX = event.clientX; const startY = event.clientY;
      shell.setPointerCapture(event.pointerId); shell.addClass('jrs-card--lift');
      const move = (next) => {
        const dx = next.clientX - startX; const dy = next.clientY - startY;
        if (resizing) {
          moving.w = Math.min(cols - moving.x, Math.max(Math.min(2, cols), Math.round(original.w + dx / (colW + gap))));
          moving.h = Math.max(1, Math.min(24, Math.round(original.h + dy / (rowH + gap))));
        } else {
          moving.x = Math.min(Math.max(0, Math.round(original.x + dx / (colW + gap))), cols - moving.w);
          moving.y = Math.max(0, Math.min(500, Math.round(original.y + dy / (rowH + gap))));
        }
        const cards = [{ id, layout: moving }, ...this.visibleCards().filter((def) => def.id !== id).map((def) => ({ id: def.id, layout: this._displayLayout[def.id] }))];
        this._displayLayout = ResearchCore.packBoardLayout(cards, cols); this.applyPositions();
      };
      const finish = async (end) => {
        shell.removeEventListener('pointermove', move); shell.removeEventListener('pointerup', finish); shell.removeEventListener('pointercancel', finish);
        shell.removeClass('jrs-card--lift');
        if (end.type !== 'pointercancel') {
          Object.assign(this.plugin.settings.layout, this._displayLayout);
          await this.plugin.saveSettings();
        }
        this.computeMetrics(); this.applyPositions();
      };
      shell.addEventListener('pointermove', move); shell.addEventListener('pointerup', finish); shell.addEventListener('pointercancel', finish);
    });
    shell.addEventListener('dblclick', (event) => {
      if (this.editing && event.target.closest('.jrs-card-handle') && !event.target.closest('button')) new CardConfigModal(this.plugin, this.cardDef(id), () => this.render()).open();
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
    const header = document.createElement('header'); header.className = 'jrs-home-header';
    const copy = header.createEl('div', { cls: 'jrs-home-welcome' });
    copy.createEl('div', { cls: 'jrs-eyebrow', text: 'RESEARCH WORKSPACE' });
    const hour = window.moment().hour();
    const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    copy.createEl('h1', { text: '阅读驾驶舱' });
    copy.createEl('p', { text: `${greeting}，Jensen · ${window.moment().format('M月D日')} 星期${'日一二三四五六'[window.moment().day()]} · 阅读、理解、沉淀。` });
    uiButton(copy, `来源：${this.plugin.settings.sourceFolder || this.app.vault.getName() + ' / 库根目录'}`, 'folder-open', () => this.goto('library'), 'jrs-text-button jrs-home-source');
    const actions = header.createEl('div', { cls: 'jrs-home-tools' });
    const omni = actions.createEl('div', { cls: 'jrs-omnibox' }); this.buildOmnibox(omni);
    buildThemeToggle(actions, this.plugin);
    uiButton(actions, '记想法', 'pen-line', () => new CaptureModal(this.plugin).open(), 'od-btn');
    uiButton(actions, '添加文献', 'plus', () => new AddPaperModal(this.plugin, () => this.render()).open(), 'od-btn od-btn--primary');
    return header;
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
    const input = inputRow.createEl('input', { type: 'text', placeholder: '添加待办…' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '添加' });
    const submit = async () => {
      const v = input.value.trim();
      if (!v) { new Notice('请输入待办内容'); input.focus(); return; }
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
      add.onclick = async () => { await this.plugin.arxivToLibrary(it); new Notice('已加入文献库'); };
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
      { icon: 'calendar-check', label: '今日小结', fn: () => this.plugin.generateDailyDigest() },
      { icon: 'panel-right', label: '侧栏工具', fn: () => this.plugin.activateSidePanel() },
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
      top.createEl('span', { cls: 'od-progress-name', text: p.title });
      const st = top.createEl('span', { cls: 'od-status' });
      st.setAttribute('data-status', p.status);
      st.textContent = p.status;
    });
    return wrap;
  }

  async buildCustom(body, id) {
    const def = this.plugin.settings.customCards.find((x) => `c:${x.uid}` === id);
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

  /* ========== 区段：文献库（嵌入面板） ========== */

  renderLibrarySection(page) {
    if (!this._panel) this._panel = new LibraryPanel(this.plugin, () => this.render());
    this._panel.host = page;
    this._panel.render();
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
      if (all.d === 0) {
        const cta = surveyCard.createEl('div', { cls: 'jrs-zero-cta' });
        cta.createSpan({ text: '从完成一项写作任务开始。展开章节，即可直接勾选任务。' });
        uiButton(cta, '打开大纲', 'pen-line', () => this.plugin.openSurveyNote(), 'od-btn od-btn--sm');
      }
      const total = surveyCard.createEl('div', { cls: 'jrs-progress' });
      total.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${all.t ? (all.d / all.t) * 100 : 0}%`;
      total.createEl('span', { cls: 'od-hint', text: `总体 ${all.d}/${all.t}` });
      sections.forEach((sec) => {
        const item = surveyCard.createEl('div', { cls: 'od-progress-item' });
        const top = item.createEl('div', { cls: 'od-progress-top' });
        const nameEl = top.createEl('span', { cls: 'od-progress-name od-clickable', text: sec.name });
        nameEl.onclick = () => this.plugin.openSurveyNote();
        const right = top.createEl('span', { cls: 'od-progress-tools' });
        right.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
        const draft = right.createEl('button', { cls: 'od-icon-btn', title: 'AI 起草本章（基于文献库，带来源）' });
        setIcon(draft, 'sparkles');
        draft.onclick = async () => {
          draft.disabled = true;
          new Notice(`正在为「${sec.name}」起草初稿…`);
          try {
            await this.plugin.aiDraftSection(sec.name);
            new Notice(`「${sec.name}」初稿已写入大纲`);
            this.render();
          } catch (e) {
            new Notice(`起草失败：${e.message}`);
            draft.disabled = false;
          }
        };
        const bar = item.createEl('div', { cls: 'od-progressbar' });
        bar.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
        if (sec.tasks?.length) {
          const details = item.createEl('details', { cls: 'jrs-survey-tasks' });
          details.createEl('summary', { text: `展开 ${sec.tasks.length} 项写作任务` });
          sec.tasks.forEach((task) => {
            const label = details.createEl('label', { cls: 'jrs-survey-task' });
            const check = label.createEl('input', { type: 'checkbox', attr: { 'aria-label': task.text } }); check.checked = task.done;
            label.createSpan({ text: task.text });
            check.onchange = async () => {
              check.disabled = true;
              try {
                const delta = check.checked ? 1 : -1;
                await this.plugin.toggleSurveyTask(task);
                task.done = check.checked; task.raw = task.raw.replace(/\[( |x|X)\]/, check.checked ? '[x]' : '[ ]');
                sec.done += delta; all.d += delta;
                right.querySelector('.od-progress-frac').textContent = `${sec.done}/${sec.total}`;
                bar.firstElementChild.style.width = `${sec.total ? sec.done / sec.total * 100 : 0}%`;
                total.querySelector('.od-hint').textContent = `总体 ${all.d}/${all.t}`;
                total.querySelector('.od-progressbar-fill').style.width = `${all.t ? all.d / all.t * 100 : 0}%`;
                const metric = page.querySelector('.jrs-section-metric');
                if (metric) { metric.querySelector('strong').textContent = `${all.t ? Math.round(all.d / all.t * 100) : 0}%`; metric.querySelector('small').textContent = `${all.d} / ${all.t} 项任务`; }
              } catch (error) { new Notice(error.message); check.checked = task.done; }
              finally { check.disabled = false; }
            };
          });
        }
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
      t.onclick = () => this.plugin.smartOpenFile(q.file);
      main.createEl('div', { cls: 'od-hint', text: `${q.status === 'answered' ? '已解答' : ' 待解答'} · ${window.moment(q.added).format('M月D日')}` });
      const st = item.createEl('button', { cls: `od-btn od-btn--sm${q.status === 'answered' ? '' : ' od-btn--primary'}` });
      st.textContent = q.status === 'answered' ? '重新打开' : '标记已解答';
      st.onclick = async () => { await this.plugin.toggleQuestion(q); this.render(); };
    });
  }

  /* ========== 区段：投稿冲刺 ========== */

  async renderSubmit(page) {
    /* ── 期刊速查器（任意期刊 → CCF/科协/中科院2025/新锐2026/预警）── */
    const qc = page.createEl('section', { cls: 'jrs-card' });
    const qh = qc.createEl('div', { cls: 'jrs-section-heading' });
    qh.createEl('h2', { text: '期刊速查器' });
    const cacheNow = this.plugin._jcache;
    qh.createSpan({ text: cacheNow ? `已加载全量库（中科院2025 ${Object.keys(cacheNow.cas || {}).length} 刊 · 新锐2026 ${Object.keys(cacheNow.xr || {}).length} 刊）` : '内置 CCF2026·科协目录；下载全量库后可查任意期刊的 2025 中科院分区与新锐分区' });
    const dlBtn = qh.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(dlBtn.createSpan(), 'download');
    dlBtn.createSpan({ text: cacheNow ? '更新全量库' : '下载全量库（约 10MB）' });
    dlBtn.onclick = async () => {
      dlBtn.disabled = true;
      new Notice('正在下载并解析中科院2025 + 新锐2026…');
      try {
        const r = await this.plugin.downloadJournalDB();
        new Notice(`期刊库就绪：中科院 ${r.cas} 刊 · 新锐 ${r.xr} 刊`);
        this.render();
      } catch (e) { new Notice(`下载失败：${e.message}`); dlBtn.disabled = false; }
    };
    const qRow = qc.createEl('div', { cls: 'jrs-discover-form' });
    const qInput = qRow.createEl('input', { type: 'text', placeholder: '输入期刊/会议名…' });
    const qOut = qc.createEl('div', { cls: 'jrs-lookup-out' });
    let deb = null;
    const badge = (text, cls, title) => {
      const b = document.createElement('span');
      b.className = 'jrs-zone-badge';
      b.textContent = text;
      b.setAttribute('data-zone', cls);
      if (title) b.title = title;
      return b;
    };
    const runQ = async () => {
      const v = qInput.value.trim();
      qOut.empty();
      if (!v) return;
      const r = await this.plugin.lookupJournal(v);
      if (!r.found) {
        qOut.createEl('div', { cls: 'od-hint', text: `未收录「${v}」——内置库含 CCF2026/科协目录${this.plugin._jcache ? '' : '；点右上下载全量库可查中科院2025/新锐2026'}。试试全称或缩写？` });
        return;
      }
      const row = qOut.createEl('div', { cls: 'jrs-lookup-result' });
      row.createEl('span', { cls: 'jrs-lookup-name', text: v });
      const badges = row.createEl('span', { cls: 'jrs-ask-sources' });
      if (r.cas) badges.appendChild(badge(`中科院 ${r.cas}${r.casTop ? ' · Top' : ''}`, r.cas.includes('1区') ? 'top' : 'mid', r.cat ? `大类：${r.cat}` : ''));
      if (r.xr) badges.appendChild(badge(`新锐 ${r.xr}`, 'cn', '中科院2026新锐期刊分区'));
      if (r.ccf) badges.appendChild(badge(`CCF-${r.ccf.grade}`, 'top', `${r.ccf.type}${r.ccf.field ? ' · ' + r.ccf.field : ''}`));
      if (r.cast) badges.appendChild(badge(`科协 ${r.cast}`, r.cast.startsWith('T1') || r.cast === 'A' ? 'top' : 'mid', r.castField ? `中国科协高质量目录 · ${r.castField}` : '中国科协高质量目录'));
      if (r.jcr) badges.appendChild(badge(`JCR ${r.jcr}`, 'mid'));
      if (r.target) badges.appendChild(badge('目标刊', 'cn', '已在投稿冲刺目标期刊库'));
      if (r.warn) badges.appendChild(badge(`预警：${r.warn}`, 'top', '2025 国际期刊预警名单'));
    };
    qInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    qInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (deb) clearTimeout(deb); runQ(); } };
    this.plugin.loadJournalCache(true).then(() => { if (this.plugin._jcache && qInput.value) runQ(); });

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
      const g = pipe.createEl('div', { cls: 'jrs-submit-group' });
      g.createEl('div', { cls: 'jrs-submit-stage', text: `${stage.join(' / ')} · ${items.length}` });
      if (!items.length) g.createEl('p', { cls: 'od-hint', text: '暂无条目' });
      items.forEach((s) => {
        const row = g.createEl('div', { cls: 'jrs-paper-row jrs-submit-row' });
        const main = row.createEl('div', { cls: 'jrs-row-main' });
        const t = main.createEl('div', { cls: 'jrs-row-title', text: `${s.title} → ${s.target}` });
        t.onclick = () => this.plugin.smartOpenFile(s.file);
        const hint = main.createEl('div', { cls: 'od-hint' });
        let meta = `${s.status} · ${window.moment(s.added).format('M月D日')} 起`;
        if (s.deadline) {
          const md = window.moment(s.deadline, 'YYYY-MM-DD');
          if (!md.isValid()) { meta += ' · 截稿日期无效'; }
          else {
            const d = md.diff(window.moment().startOf('day'), 'days');
            meta += d >= 0 ? ` · 截稿还剩 ${d} 天` : ` · 截稿已过 ${-d} 天`;
          }
        }
        hint.textContent = meta;
        const acts = row.createEl('div', { cls: 'jrs-row-actions' });
        const st = acts.createEl('select', { cls: 'jrs-select jrs-sub-status', attr: { 'aria-label': `投稿状态：${s.title}` } });
        SUB_STATUSES.forEach(value => st.createEl('option', { value, text: value })); st.value = s.status;
        st.onchange = async () => { const status = st.value; st.disabled = true; try { await this.app.fileManager.processFrontMatter(s.file, fm => { fm.status = status; }); await SectionWorkspace.metadata(this.app, s.file, fm => fm.status === status); await this.render(); } catch (e) { st.disabled = false; st.value = s.status; new Notice(e.message); } };
        const open = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
        open.onclick = () => this.plugin.smartOpenFile(s.file);
      });
    });

    /* 今日收件箱（快速捕获的闭环出口） */
    const inboxItems = await this.plugin.getInboxToday();
    if (inboxItems.length) {
      const ib = page.createEl('section', { cls: 'jrs-card' });
      const ibh = ib.createEl('div', { cls: 'jrs-section-heading' });
      ibh.createEl('h2', { text: '今日收件箱' });
      ibh.createSpan({ text: `${inboxItems.length} 条想法待处理` });
      const openIb = ibh.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
      openIb.onclick = () => this.plugin.openInboxNote();
      inboxItems.slice(0, 5).forEach((txt) => {
        ib.createEl('div', { cls: 'od-hint', text: txt });
      });
    }

    /* 目标期刊速查 */
    const jcard = page.createEl('section', { cls: 'jrs-card' });
    head = jcard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '目标期刊速查' });
    head.createSpan({ text: 'EJOR 等运算顶刊与航天核心刊 · 分区以中科院最新版为准' });
    const grid = jcard.createEl('div', { cls: 'jrs-journal-grid' });
    JOURNALS.forEach((j) => {
      const c = grid.createEl('div', { cls: 'jrs-journal' });
      const top = c.createEl('div', { cls: 'jrs-journal-top' });
      const ab = top.createEl('span', { cls: 'jrs-journal-abbr', text: j.abbr });
      ab.setAttribute('title', j.name);
      const tag = top.createEl('span', { cls: 'jrs-journal-tag', text: j.tag });
      tag.setAttribute('data-tag', j.tag.includes('顶刊') ? 'top' : j.tag.includes('EI') ? 'cn' : 'mid');
      if (j.cas) {
        const z = top.createEl('span', { cls: 'jrs-journal-tag jrs-journal-zone', text: `中科院 ${j.cas}${j.jcr ? ' · ' + j.jcr : ''}` });
        z.setAttribute('data-tag', j.cas.includes('1区') ? 'top' : j.cas.includes('EI') ? 'cn' : 'mid');
      }
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
    const card = page.createEl('section', { cls: 'jrs-card jrs-ask' });
    const head = card.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '问你的文献库' });
    head.createSpan({ text: '问答自动存档到 科研工作台/AI问答/，重开不丢' });

    const inputRow = card.createEl('div', { cls: 'jrs-ask-input' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '问一个问题…' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary', text: '提问' });
    const busy = card.createEl('div', { cls: 'od-hint' });

    const list = page.createEl('div', { cls: 'jrs-ask-list' });

    const paperByBasename = (name) => this.plugin.getPapers().find((pp) => pp.file.basename === name);

    const renderAnswer = (item) => {
      const block = list.createEl('div', { cls: 'jrs-ask-item od-anim' });
      const q = block.createEl('div', { cls: 'jrs-ask-q' });
      setIcon(q.createSpan(), 'help-circle');
      q.createSpan({ text: item.q });
      const a = block.createEl('div', { cls: 'jrs-ask-a' });
      MarkdownRenderer.render(this.app, item.a, a, '/', this);
      if (item.sources?.length) {
        const src = block.createEl('div', { cls: 'jrs-ask-sources' });
        src.createSpan({ cls: 'jrs-ask-sources-label', text: '来源' });
        item.sources.forEach((s) => {
          const chip = src.createEl('span', { cls: 'od-chip' });
          const paper = s.file ? s : paperByBasename(s.basename || s.title);
          const label = (paper ? paper.title : (s.title || s.basename || '') || '');
          chip.textContent = label.length > 26 ? label.slice(0, 26) + '…' : label;
          if (paper) chip.onclick = () => this.plugin.openPaper(paper);
          else chip.style.opacity = '0.6';
        });
      }
      const acts = block.createEl('div', { cls: 'jrs-row-actions' });
      const save = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '沉淀为研究问题' });
      save.onclick = async () => {
        const names = (item.sources || []).map((s) => (s.file ? s.file.basename : s.basename)).filter(Boolean);
        await this.plugin.createQuestion(item.q, names.join(','));
        await this.plugin.appendAnswerToQuestion(item.q, item.a);
        new Notice('已沉淀到研究问题');
      };
    };

    const refreshList = async () => {
      const items = await this.plugin.getAskLogToday();
      list.empty();
      if (!items.length) {
        list.createEl('div', { cls: 'od-task-empty', text: this.plugin.settings.ai.apiKey ? '问一个你综述里的问题试试，回答会标注引用来源' : '先在 设置 → AI 助手 配置 API Key（DeepSeek 等），即可向自己的文献库提问' });
        return;
      }
      items.slice(0, 8).forEach(renderAnswer);
    };

    let asking = false;
    const ask = async () => {
      if (asking) return;
      const q = input.value.trim();
      if (!q) {
        new Notice('请输入问题，例如：网格热力图如何驱动多星调度决策？');
        input.focus();
        return;
      }
      asking = true;
      btn.disabled = true;
      busy.textContent = '正在检索文献库并生成回答…';
      try {
        const item = await this.plugin.aiAsk(q);
        await this.plugin.appendAskLog(item);
        input.value = '';
        busy.textContent = '';
        await refreshList();
      } catch (e) {
        busy.textContent = `${e.message}`;
        new Notice(`问答失败：${e.message}`);
      }
      asking = false;
      btn.disabled = false;
    };
    btn.onclick = ask;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } };

    /* 空态：示例问题 chips（点击即填入提问） */
    const _hist = await this.plugin.getAskLogToday();
    const _hasHistory = _hist.length > 0;
    if (!_hasHistory) {
      const sug = card.createEl('div', { cls: 'jrs-ask-suggest' });
      sug.createEl('div', { cls: 'od-hint', text: '试试这些问题：' });
      const chips = sug.createEl('div', { cls: 'od-chips' });
      ['网格热力图如何驱动多星调度决策？', '元启发式算法在卫星调度中怎么用？', '敏捷卫星与常规成像卫星的调度差异？'].forEach((q) => {
        const c = chips.createEl('span', { cls: 'od-chip', text: q });
        c.onclick = () => { input.value = q; input.focus(); };
      });
    }
    await refreshList();
  }

}

/* ==========================================================================
 * 文献库面板（可嵌入区段，也可挂独立视图）
 * ========================================================================== */

/* BEGIN GENERATED LIBRARY */
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

/* END GENERATED LIBRARY */

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
    mkText('标题 *', 'title', '论文标题…');
    mkText('作者', 'authors', '如：伍国华, 祝江汉');
    mkText('年份', 'year', '2024');
    mkText('论文项目', 'project', '例如：卫星任务规划综述');
    const venueWrap = new Setting(contentEl).setName('期刊 / 会议').setDesc('输入后自动识别 CCF/科协/中科院分区');
    const venueInput = venueWrap.controlEl.createEl('input', { type: 'text' });
    venueInput.className = 'jrs-inline-input';
    venueInput.style.width = '220px';
    venueInput.placeholder = 'EJOR / Journal of Scheduling / 宇航学报…';
    const venueHint = venueWrap.controlEl.createEl('div', { cls: 'od-hint' });
    venueHint.style.cssText = 'font-size:11px;margin-top:2px;';
    let venueTimer = null;
    venueInput.oninput = () => {
      this.data.venue = venueInput.value;
      if (venueTimer) clearTimeout(venueTimer);
      venueTimer = setTimeout(async () => {
        const v = venueInput.value.trim();
        if (!v) { venueHint.textContent = ''; return; }
        const r = await this.plugin.lookupJournal(v);
        venueHint.textContent = r.found
          ? [r.cas ? `中科院${r.cas}${r.casTop ? '·Top' : ''}` : '', r.xr ? `新锐${r.xr}` : '', r.ccf ? `CCF-${r.ccf.grade}` : '', r.cast ? `科协${r.cast}` : '', r.warn ? `${r.warn}` : ''].filter(Boolean).join(' · ')
          : '（未收录，可照常保存）';
      }, 250);
    };
    new Setting(contentEl).setName('PDF 链接或库内路径（可选）').addText((t) => {
      t.inputEl.placeholder = 'PDF 链接或路径…';
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
        b.setDisabled(true);
        try {
          await this.plugin.createPaperNote(this.data);
          new Notice(`已添加：${this.data.title.slice(0, 24)}…`);
          this.close();
          if (this.onDone) this.onDone();
        } catch (e) {
          new Notice(`创建失败：${e.message}`);
          b.setDisabled(false);
        }
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
        resultEl.createEl('div', { cls: 'od-hint', text: `新增 ${res.created} · 跳过 ${res.skipped} · 失败 ${res.failed}` });
        if (this.onDone) window.setTimeout(this.onDone, 400);
      } catch (err) {
        new Notice(`导入失败：${err.message}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `${err.message}` });
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
          try { await fn(); busy.textContent = `${name}完成`; }
          catch (e) { busy.textContent = `${e.message}`; new Notice(`${name}失败：${e.message}`); }
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
      t.onChange(() => {
        const v = parseInt(t.getValue(), 10);
        if (v > 1 && v <= 20) n = v;
        else { new Notice('纳入数限 2-20，已忽略该值'); t.setValue(String(n)); }
      });
    });
    new Setting(contentEl).setName('研究目标（可选）').addText((t) => { t.onChange(() => { goal = t.getValue(); }); });
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    this._cancelled = false;
    const origClose = this.onClose;
    this.onClose = () => { this._cancelled = true; if (origClose) origClose(); };
    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…（关闭弹窗可取消打开）';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        if (this._cancelled) { new Notice('综述已生成但未打开（弹窗已关闭）'); return; }
        busy.textContent = `已生成：${f.path}`;
        this.plugin.smartOpenFile(f);
      } catch (e) { if (!this._cancelled) { busy.textContent = `${e.message}`; new Notice(`综述失败：${e.message}`); } }
      if (!this._cancelled) b.setDisabled(false);
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
        new Notice('已存入今日收件箱');
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
        new Notice(`投稿已建档：${(custom || target)}`);
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
        new Notice('研究问题已记录');
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

    containerEl.createEl('h3', { text: '阅读与侧栏' });
    new Setting(containerEl).setName('文献来源文件夹').setDesc('扫描所选目录和子目录的 PDF；不移动原文件。').addDropdown(d => {
      this.plugin.sourceFolderOptions().forEach(option => d.addOption(option.path, `${option.path || '全库'} · ${option.count} PDF`));
      d.setValue(s.sourceFolder).onChange(async value => { await this.plugin.setSourceFolder(value); });
    });
    new Setting(containerEl).setName('PDF 批注笔记目录').setDesc('高亮、评论和译文同步写入 Markdown；原 PDF 保持原样。').addText(t => t.setValue(s.annotationsFolder).onChange(async value => { if (value.trim()) { s.annotationsFolder = value.trim(); await this.plugin.saveSettings(); } }));
    new Setting(containerEl).setName('PDF 阅读方式').setDesc('点击卡片或标题直接打开 PDF 标签页；需要对照笔记时点击「分栏阅读」。阅读位置与缩放自动保存。');
    new Setting(containerEl).setName('文献卡组视图').addDropdown(d => d.addOption('3d', '3D 卡片').addOption('list', '列表').setValue(s.deckMode).onChange(async value => { s.deckMode = value; await this.plugin.saveSettings(); for (const leaf of this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)) await leaf.view.render(); }));
    new Setting(containerEl).setName('右侧研究网页').setDesc('DeepSeek 等网页在同一个右栏中打开，登录状态保留在本机。').addButton(b => b.setButtonText('管理常用链接').onClick(() => new ResearchLinksModal(this.plugin).open()));
    new Setting(containerEl).setName('日历与日常提醒').setDesc('原生左栏包含日历、番茄钟、喝水/休息与健身打卡。').addButton(b => b.setButtonText('提醒设置').onClick(() => new WellnessSettingsModal(this.plugin).open()));
    containerEl.createEl('h3', { text: '应用外壳' });
    new Setting(containerEl).setName('左侧栏').setDesc('区段导航栏的显示方式')
      .addDropdown((d) => {
        d.addOption('full', '展开（图标+文字）');
        d.addOption('icon', '仅图标');
        d.addOption('hidden', '隐藏');
        d.setValue(s.sidebarMode);
        d.onChange(async (v) => { s.sidebarMode = v; await this.plugin.saveSettings(); for (const leaf of this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)) await leaf.view.render(); });
      });

    containerEl.createEl('h3', { text: '外观工作室' });
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
    new Setting(containerEl).setName('工作台风格').setDesc('玻璃材质与独立明暗配色').addDropdown((dropdown) => {
      dropdown.addOption('night', '夜航玻璃 · 3D 阅读台').addOption('auto', '跟随 Obsidian').addOption('day', '白昼玻璃');
      dropdown.setValue(s.workspaceTheme || 'night').onChange(async (value) => { s.workspaceTheme = value; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('自动打开研究助手').setDesc('打开工作站和阅读文献时，展开右侧研究助手').addToggle((toggle) => toggle.setValue(s.openAssistantOnDashboard).onChange(async (value) => { s.openAssistantOnDashboard = value; await this.plugin.saveSettings(); }));
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

    containerEl.createEl('h3', { text: '路径' });
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

    containerEl.createEl('h3', { text: '番茄钟' });
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

    containerEl.createEl('h3', { text: 'arXiv' });
    new Setting(containerEl).setName('研究方向标签').setDesc('在 AI 发现中，为常用关键词或完整检索式设置名称，可添加、更新和删除。').addButton(b => b.setButtonText('管理方向标签').onClick(() => { this.app.setting.close(); this.plugin.gotoSection('discover'); }));
    new Setting(containerEl).setName('检索关键词').addText((t) => {
      t.setValue(s.arxivQuery);
      t.onChange(async () => { s.arxivQuery = t.getValue(); s.arxivCache = null; await this.plugin.saveSettings(); });
    });
    numSetting('默认显示条数', 'arxivMax');

    containerEl.createEl('h3', { text: 'AI 助手（OpenAI 兼容）' });
    new Setting(containerEl).setName('API Base URL').addText((t) => { t.setValue(s.ai.baseUrl); t.onChange(async () => { s.ai.baseUrl = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('API Key').addText((t) => { t.inputEl.type = 'password'; t.setValue(s.ai.apiKey); t.onChange(async () => { s.ai.apiKey = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('模型').addText((t) => { t.setValue(s.ai.model); t.onChange(async () => { s.ai.model = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: 'MinerU 解析（可选）' });
    new Setting(containerEl).setName('MinerU 命令').addText((t) => { t.setValue(s.mineruCmd); t.onChange(async () => { s.mineruCmd = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '科研' });
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

    containerEl.createEl('h3', { text: '数据' });
    new Setting(containerEl).setName('导出插件设置').addButton((b) => b.setButtonText('复制 JSON').onClick(() => {
      navigator.clipboard?.writeText(JSON.stringify(s, null, 2)).then(() => new Notice('设置已复制到剪贴板')).catch(() => new Notice('复制失败（剪贴板不可用）'));
    }));
    new Setting(containerEl).setName('重置排版布局').addButton((b) => b.setButtonText('重置').onClick(async () => {
      s.layout = {};
      await this.plugin.saveSettings();
      new Notice('已重置');
    }));
    SectionWorkspace.settings(this);
  }
}

/* ==========================================================================
 * 主插件
 * ========================================================================== */

module.exports = class JensenResearchStationPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.pomo = new PomoEngine(this);
    Object.assign(this, WellnessMethods);
    this.startWellnessReminders();
    this.pdfResearch = new PdfResearch(this); this.pdfResearch.start();
    this.libFilterTopic = '';

    this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.registerView(VIEW_SIDE, (leaf) => new SidePanelView(leaf, this));
    this.registerView(VIEW_LIFE, (leaf) => new LifePanelView(leaf, this));
    this.addRibbonIcon('book-open', 'Jensen 科研工作站', () => this.activateDashboard());
    this.addSettingTab(new JrsSettingTab(this.app, this));

    const cmds = [
      ['open-dashboard', '打开工作站', () => this.activateDashboard()],
      ['open-library', '打开文献库（独立视图）', () => this.activateLibrary()],
      ['pdf-annotate', 'PDF：捕获选区并批注', async () => { this.pdfResearch.captureSelection(); await this.activateSidePanel(); const view = this.app.workspace.getLeavesOfType(VIEW_SIDE)[0]?.view; if (view) { view.tab = 'pdf'; view.render(); } }],
      ['life-panel', '打开左侧日历与生活', () => this.activateLifePanel()],
      ['wellness', '喝水与休息提醒设置', () => new WellnessSettingsModal(this).open()],
      ['research-links', '管理常用研究链接', () => new ResearchLinksModal(this).open()],
      ['sec-discover', '区段：AI 发现', () => this.gotoSection('discover')],
      ['sec-queue', '区段：阅读队列', () => this.gotoSection('queue')],
      ['sec-graph', '区段：论文图谱', () => this.gotoSection('graph')],
      ['sec-progress', '区段：研究进展', () => this.gotoSection('progress')],
      ['sec-reader', '区段：阅读笔记', () => this.gotoSection('reader')],
      ['sec-submit', '区段：投稿冲刺', () => this.gotoSection('submit')],
      ['sec-ask', '区段：知识问答', () => this.gotoSection('ask')],
      ['new-submission', '新建投稿', () => new AddSubmissionModal(this).open()],
      ['capture', '快速记想法（收件箱）', () => new CaptureModal(this).open()],
      ['daily-digest', '生成今日小结（写入日记）', () => this.generateDailyDigest()],
      ['side-panel', '打开研究助手（文献/写作/工具）', () => this.activateSidePanel()],
      ['add-paper', '添加文献', () => new AddPaperModal(this).open()],
      ['import-pdf', '批量导入 PDF 文件夹', () => new ImportFolderModal(this).open()],
      ['start-pomo', '开始专注（番茄钟）', () => { if (this.pomo.phase === 'idle') this.pomo.start(); }],
      ['gen-matrix', '生成文献矩阵', () => this.generateMatrix()],
      ['export-csv', '导出文献 CSV', () => this.exportPapers('csv', this.getPapers())],
      ['export-bibtex', '导出文献 BibTeX', () => this.exportPapers('bib', this.getPapers())],
      ['gen-bases', '生成 Bases 数据库', () => this.generateBases()],
      ['gen-graph', '重建论文图谱', () => this.generateGraphCanvas(true)],
      ['init-survey', '初始化综述大纲', () => this.ensureSurveyNote(true)],
      ['pdf-to-vault', '外部 PDF 一键入库', () => this.migrateExternalPdfs()],
      ['card-manager', '卡片管理', () => new CardManagerModal(this).open()],
      ['refresh-arxiv', '刷新 arXiv 资讯', async () => { await this.fetchArxiv(true); new Notice('arXiv 已刷新'); }],
      ['ai-synthesis', 'AI 跨论文综述', () => new AiSynthesisModal(this).open()],
    ];
    cmds.forEach(([id, name, cb]) => this.addCommand({ id, name, callback: cb }));
    /* 编辑器 AI 三连：命令面板 + 右键菜单 */
    [['ai-polish', 'AI 学术润色（选中段落）', 'polish', 'wand-2'],
      ['ai-expand', 'AI 扩写深化（选中段落）', 'expand', 'stretch-horizontal'],
      ['ai-condense', 'AI 精简提炼（选中段落）', 'condense', 'shrink']].forEach(([id, name, mode, icon]) => {
      this.addCommand({
        id, name,
        editorCallback: (editor) => this.aiEditSelection(editor, mode),
      });
    });
    this.registerEvent(this.app.workspace.on('file-open', (file) => { if (file?.parent) this._currentDocumentFolder = file.parent.path === '/' ? '' : file.parent.path; }));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (Array.isArray(file?.children)) menu.addItem((item) => item.setTitle('设为工作站文献来源').setIcon('library').onClick(async () => { await this.setSourceFolder(file.path); await this.gotoSection('library'); }));
    }));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
      if (!editor || !editor.getSelection || !editor.getSelection().trim()) return;
      menu.addItem((mi) => mi.setTitle('AI 学术润色').setIcon('wand-2').onClick(() => this.aiEditSelection(editor, 'polish')));
      menu.addItem((mi) => mi.setTitle('AI 扩写深化').setIcon('stretch-horizontal').onClick(() => this.aiEditSelection(editor, 'expand')));
      menu.addItem((mi) => mi.setTitle('AI 精简提炼').setIcon('shrink').onClick(() => this.aiEditSelection(editor, 'condense')));
    }));
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
    this.pdfResearch?.destroy();
    this.app.workspace.detachLeavesOfType(VIEW_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_LIBRARY);
    this.app.workspace.detachLeavesOfType(VIEW_SIDE);
    this.app.workspace.detachLeavesOfType(VIEW_LIFE);
    this.app.workspace.detachLeavesOfType(VIEW_WEB);
    document.body.removeClass('od-glass', 'jrs-bg-on');
    delete document.body.dataset.jrsTheme;
    /* 清理注入到 body 的内联样式变量 */
    ['--od-accent', '--od-accent-soft', '--od-accent-text', '--od-blur', '--od-card-alpha',
      '--od-radius-l', '--od-radius-m', '--od-gap', '--od-bg-dim',
      '--jrs-bg', '--jrs-bg-image'].forEach((k) => document.body.style.removeProperty(k));
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
    if (!stored?.workspaceTheme && stored?.accent === 'blue' && !stored.accentCustom) this.settings.accent = 'emerald';
    if (!this.settings.wellnessLog || typeof this.settings.wellnessLog !== 'object') this.settings.wellnessLog = {};
    this.settings.wellnessReminders = Object.assign({}, DEFAULT_SETTINGS.wellnessReminders, stored?.wellnessReminders);
    if (!this.settings.pdfAnnotations || typeof this.settings.pdfAnnotations !== 'object') this.settings.pdfAnnotations = {};
    if (!this.settings.pdfReadingPositions || typeof this.settings.pdfReadingPositions !== 'object' || Array.isArray(this.settings.pdfReadingPositions)) this.settings.pdfReadingPositions = {};
    for (const [path, position] of Object.entries(this.settings.pdfReadingPositions)) {
      if (!position || typeof position !== 'object') delete this.settings.pdfReadingPositions[path];
      else this.settings.pdfReadingPositions[path] = ResearchCore.normalizeReadingPosition(position);
    }
    if (!['active', 'reading', 'todo', 'all'].includes(this.settings.deckFilter)) this.settings.deckFilter = 'active';
    if (!['3d', 'list'].includes(this.settings.deckMode)) this.settings.deckMode = '3d';
    this.settings.discoveryTags = Array.isArray(this.settings.discoveryTags) ? this.settings.discoveryTags.filter(tag => tag && typeof tag.label === 'string' && typeof tag.query === 'string' && tag.label.trim() && tag.query.trim()) : [];
    if (!['compact','comfortable'].includes(this.settings.journalDensity)) this.settings.journalDensity = 'compact';
    for (const [path, list] of Object.entries(this.settings.pdfAnnotations)) this.settings.pdfAnnotations[path] = Array.isArray(list) ? list.filter((entry) => entry && typeof entry.id === 'string' && Number.isInteger(entry.page) && typeof entry.text === 'string') : [];
    if (!Array.isArray(this.settings.commonLinks)) this.settings.commonLinks = structuredClone(DEFAULT_SETTINGS.commonLinks);
    this.settings.commonLinks = this.settings.commonLinks.filter((link) => link && typeof link.name === 'string' && /^https?:\/\//i.test(link.url));
    if (typeof this.settings.sourceFolder !== 'string') this.settings.sourceFolder = '';
    if (!Object.hasOwn(stored || {}, 'sourceFolder')) { const file = this.app.workspace.getActiveFile(); if (file?.parent) this.settings.sourceFolder = file.parent.path === '/' ? '' : file.parent.path; }
    if (!Array.isArray(this.settings.savedLibraryViews)) this.settings.savedLibraryViews = [];
    this.settings.savedLibraryViews = this.settings.savedLibraryViews.filter((view) => view && typeof view.name === 'string' && view.state && typeof view.state === 'object');
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

  async saveSettings() {
    if (!String(this.settings.libFolder || '').trim()) {
      this.settings.libFolder = '科研工作台/文献';
      new Notice('文献目录不能为空，已重置为默认');
    }
    this.normalizeSettingPaths();
    await this.saveData(this.settings);
  }

  /** 库内路径字段统一清洗：反斜杠→正斜杠、去尾斜杠、非法字符拦截 */
  normalizeSettingPaths() {
    const keys = ['libFolder', 'pdfFolder', 'questionsFolder', 'submissionsFolder', 'inboxFolder', 'basesFolder', 'dailyFolder', 'annotationsFolder'];
    let warned = false;
    for (const k of keys) {
      const v = this.settings[k];
      if (typeof v !== 'string' || !v.trim()) continue;
      let nv = v.replace(/\\/g, '/').replace(/\/+$/, '').trim();
      if (/[:*?"<>|]/.test(nv)) {
        nv = nv.replace(/[:*?"<>|]/g, ' ');
        warned = true;
      }
      if (nv !== v) this.settings[k] = nv;
    }
    if (warned) new Notice('路径含非法字符（: * ? " < > |），已自动清理');
  }

  applyAppearance() {
    const s = this.settings;
    document.body.dataset.jrsTheme = s.workspaceTheme || 'night';
    let hex = (/^#[0-9a-fA-F]{6}$/.test(s.accentCustom || '') && s.accentCustom) || (ACCENTS[s.accent] || ACCENTS.blue).hex;
    if (s.workspaceTheme === 'day' && s.accent === 'emerald' && !s.accentCustom) hex = '#087b58';
    const rgb = hex.match(/[a-f0-9]{2}/gi).map((channel) => parseInt(channel, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    document.body.style.setProperty('--od-accent-text', luminance > 0.25 ? '#072c21' : '#ffffff');
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

  /** 智能打开文件：JRS 视图内一律开新标签页，避免吞掉工作台视图 */
  async smartOpenFile(f) {
    const ws = this.app.workspace;
    let cur = null;
    try { cur = ws.activeLeaf?.getRoot() === ws.rootSplit ? ws.activeLeaf : ws.getMostRecentLeaf?.(); } catch (e) { cur = null; }
    const vt = cur && cur.view && cur.view.getViewType ? cur.view.getViewType() : '';
    if (vt !== VIEW_DASHBOARD && vt !== VIEW_LIBRARY) {
      const leaf = cur?.parent && cur.getRoot() === ws.rootSplit && !cur.getViewState().pinned ? cur : ws.getLeaf('tab');
      await leaf.openFile(f, { active: true }); await ws.revealLeaf(leaf); ws.setActiveLeaf(leaf, { focus: true });
      if (leaf === this._fileLeaf) this._fileLeafPath = f.path;
      return leaf;
    }
    /* JRS 视图内：复用同一个文件标签页，避免标签堆积 */
    ws.setActiveLeaf(cur, { focus: false });
    if (!this._fileLeaf?.parent || this._fileLeaf.getRoot() !== ws.rootSplit || this._fileLeaf.parent !== cur.parent || this._fileLeaf.getViewState().pinned || this._fileLeaf.view.file?.path !== this._fileLeafPath) this._fileLeaf = ws.getLeaf('tab');
    await this._fileLeaf.openFile(f, { active: true });
    this._fileLeafPath = f.path;
    await ws.revealLeaf(this._fileLeaf);
    ws.setActiveLeaf(this._fileLeaf, { focus: true });
    return this._fileLeaf;
  }

  async activateDashboard() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_DASHBOARD);
    if (existing.length) { await workspace.revealLeaf(existing[0]); workspace.setActiveLeaf(existing[0], { focus: true }); }
    else await workspace.getLeaf(true).setViewState({ type: VIEW_DASHBOARD, active: true });
    if (this.settings.openAssistantOnDashboard) await this.activateSidePanel(false);
    await this.activateLifePanel(false);
  }

  async openResearchWeb(address) {
    const url = new URL(address); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP(S) 网页');
    await this.activateSidePanel(false);
    const leaf = this.app.workspace.getLeavesOfType(VIEW_SIDE)[0];
    if (!leaf) throw new Error('右侧研究助手暂不可用');
    await leaf.view.openWeb(url.href); this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async activateLifePanel(focus = true) {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(VIEW_LIFE);
    const leaf = existing[0] || workspace.getLeftLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: VIEW_LIFE, active: false });
    workspace.leftSplit?.expand?.(); const active = workspace.activeLeaf;
    await workspace.revealLeaf(leaf);
    if (!focus && active && active !== leaf) workspace.setActiveLeaf(active, { focus: false });
    else if (focus) workspace.setActiveLeaf(leaf, { focus: true });
  }

  async activateSidePanel(focus = true) {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_SIDE);
    const leaf = existing[0] || workspace.getRightLeaf(false);
    if (!leaf) return;
    if (!existing.length) await leaf.setViewState({ type: VIEW_SIDE, active: false });
    workspace.rightSplit?.expand?.();
    const active = workspace.activeLeaf;
    await workspace.revealLeaf(leaf);
    if (!focus && active && active !== leaf) workspace.setActiveLeaf(active, { focus: false });
    else if (focus) workspace.setActiveLeaf(leaf, { focus: true });
    leaf.view.refreshContext?.();
  }

  async openInboxNote() {
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      await this.ensureFolder(this.settings.inboxFolder);
      f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\n\n`);
    }
    await this.smartOpenFile(f);
  }

  async activateLibrary(topic) {
    if (topic) this.libFilterTopic = topic;
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_LIBRARY);
    const leaf = existing.length ? existing[0] : workspace.getLeaf(true);
    if (!existing.length) await leaf.setViewState({ type: VIEW_LIBRARY, active: true });
    else {
      await workspace.revealLeaf(leaf); workspace.setActiveLeaf(leaf, { focus: true });
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
      try {
        if (this.settings.dailyFolder) await this.ensureFolder(this.settings.dailyFolder);
        f = await this.app.vault.create(this.dailyPath(key), `# ${k}\n\n## 今日待办\n\n## 专注记录\n`);
      } catch (e) {
        new Notice(`日记创建失败：${e.message}（检查设置中的日记目录）`);
        return;
      }
    }
    await this.smartOpenFile(f);
  }
  appendPomoToDaily(minutes) {
    try {
      const f = this.findDailyNote();
      if (f) this.app.vault.append(f, `\n- 专注 ${minutes} 分钟（${window.moment().format('HH:mm')}）`);
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

  getPaperNotes() {
    const folder = this.settings.libFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/') || f.path === folder);
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const topics = Array.isArray(fm.topics) ? fm.topics : (typeof fm.topics === 'string' && fm.topics ? [fm.topics] : []);
      const authors = Array.isArray(fm.authors) ? fm.authors.join(', ') : String(fm.authors || '');
      const arr = authors.split(/[,，;；]/).filter(Boolean);
      const progressRaw = fm.reading_progress ?? fm.progress ?? 0;
      const readingState = ResearchCore.normalizeReadingState(fm.status, progressRaw);
      return {
        file: f, path: f.path, added: f.stat.ctime,
        title: String(fm.title || f.basename),
        authors, authorsShort: arr.length ? arr[0] + (arr.length > 1 ? ' 等' : '') : '',
        year: fm.year ? String(fm.year) : '',
        venue: String(fm.venue || ''),
        status: readingState.status,
        priority: PRIORITIES.includes(fm.priority) ? fm.priority : '',
        topics: topics.filter((topic) => typeof topic === 'string' && topic.trim()),
        rating: Math.max(0, Math.min(5, Math.round(Number(fm.rating) || 0))),
        progress: readingState.progress,
        pdf: typeof fm.pdf === 'string' ? fm.pdf : '',
        doi: typeof fm.doi === 'string' ? fm.doi : '',
        url: typeof fm.url === 'string' ? fm.url : '',
        summary: typeof fm.summary === 'string' ? fm.summary : '',
        project: typeof fm.project === 'string' ? fm.project : '',
        fmCas: typeof fm.cas === 'string' ? fm.cas : '',
        fmCasTop: fm.cas_top === true,
        fmXr: typeof fm.xr_zone === 'string' ? fm.xr_zone : '',
        fmCcf: typeof fm.ccf === 'string' ? fm.ccf : '',
        fmTier: typeof fm.cast_tier === 'string' ? fm.cast_tier : '',
      };
    });
  }

  sourceContains(path) {
    const folder = this.settings.sourceFolder;
    return !folder || path === folder || path.startsWith(folder + '/');
  }

  sourceFolderOptions() {
    const folders = new Set(['', this.settings.libFolder, this.settings.sourceFolder]);
    const pdfs = this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === 'pdf');
    for (const pdf of pdfs) {
      const parts = pdf.path.split('/'); parts.pop();
      while (parts.length) { folders.add(parts.join('/')); parts.pop(); }
    }
    return [...folders].sort((a, b) => a.localeCompare(b, 'zh')).map((path) => ({ path, count: pdfs.filter((pdf) => !path || pdf.path.startsWith(path + '/')).length }));
  }

  async setSourceFolder(path) {
    const folder = path === '/' ? '' : String(path).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (folder) {
      const target = this.app.vault.getAbstractFileByPath(folder);
      if (!target || !Array.isArray(target.children)) throw new Error('所选目录不存在于当前知识库');
    }
    this.settings.sourceFolder = folder; await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)) { if (leaf.view._panel) leaf.view._panel.reset(); await leaf.view.render(); }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_LIBRARY)) leaf.view._panel.reset();
    new Notice(`文献来源：${this.app.vault.getName()} / ${folder || '库根目录'}`);
  }

  currentDocumentFolder() {
    const file = this.app.workspace.getActiveFile();
    return file?.parent ? file.parent.path === '/' ? '' : file.parent.path : this._currentDocumentFolder ?? this.settings.sourceFolder;
  }

  getPapers() {
    const notes = this.getPaperNotes();
    const pdfs = this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === 'pdf' && this.sourceContains(file.path));
    const byPdf = new Map(); const pdfPaths = new Set(pdfs.map((file) => file.path));
    const result = [];
    for (const note of notes) {
      const pdf = toPosix(note.pdf);
      if (!this.sourceContains(note.path) && !pdfPaths.has(pdf)) continue;
      if (pdf && byPdf.has(pdf)) continue;
      if (pdf) byPdf.set(pdf, note);
      result.push(note);
    }
    for (const file of pdfs) {
      if (byPdf.has(file.path)) continue;
      const guessed = guessFromFilename(file.name);
      result.push({ file, path: file.path, added: file.stat.ctime, title: guessed.title, authors: '', authorsShort: '', year: guessed.year, venue: '',
        status: '待读', priority: '', topics: [], rating: 0, progress: 0, pdf: file.path, summary: '', project: '', doi: '', url: '', isPdfOnly: true,
        fmCas: '', fmCasTop: false, fmXr: '', fmCcf: '', fmTier: '' });
    }
    return result;
  }

  async preparePaper(paper) {
    if (!paper.isPdfOnly) return paper;
    const existing = this.getPaperNotes().find((note) => toPosix(note.pdf) === paper.pdf);
    if (existing) { Object.assign(paper, existing, { isPdfOnly: false }); return paper; }
    if (!this._paperNoteJobs) this._paperNoteJobs = new Map();
    if (!this._paperNoteJobs.has(paper.pdf)) this._paperNoteJobs.set(paper.pdf, this.createPaperNote({ title: paper.title, year: paper.year, pdf: paper.pdf, status: '待读', topics: [] }, false));
    try {
      const file = await this._paperNoteJobs.get(paper.pdf);
      Object.assign(paper, { file, path: file.path, isPdfOnly: false }); return paper;
    } catch (error) { this._paperNoteJobs.delete(paper.pdf); throw error; }
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
    await this.preparePaper(p);
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      const state = ResearchCore.normalizeReadingState(fm.status, Number(fm.reading_progress ?? fm.progress ?? p.progress) + delta, 'progress');
      fm.reading_progress = state.progress; fm.status = state.status;
    });
  }

  async ensureFolder(path) {
    if (!path) return;
    const parts = normalizePath(path).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); }
        catch (error) { if (!await this.app.vault.adapter.exists(cur)) throw error; }
      }
    }
  }

  async createPaperNote(data, open = true) {
    const folder = this.settings.libFolder;
    await this.ensureFolder(folder);
    let zoneFm = {};
    if (data.venue) {
      const r = await this.lookupJournal(data.venue);
      if (r.found) {
        zoneFm = {
          cas: r.cas || '', casTop: !!r.casTop, xr: r.xr || '',
          ccf: r.ccf ? r.ccf.grade : '', cast: r.cast || '',
        };
      }
    }
    const name = sanitizeFilename(data.title) || `文献 ${todayKey()}`;
    let path = await this.uniquePath(folder, `${name}.md`);
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
      `reading_progress: ${data.status === '已完成' ? 100 : 0}`,
      `project: ${JSON.stringify(String(data.project || ''))}`,
      ...(data.doi ? [`doi: ${JSON.stringify(String(data.doi))}`] : []),
      ...(data.url ? [`url: ${JSON.stringify(String(data.url))}`] : []),
      pdfVal ? `pdf: "${pdfVal.replace(/"/g, "'")}"` : 'pdf: ""',
      ...(zoneFm.cas ? [`cas: ${zoneFm.cas}`] : []),
      ...(zoneFm.casTop ? ['cas_top: true'] : []),
      ...(zoneFm.xr ? [`xr_zone: ${zoneFm.xr}`] : []),
      ...(zoneFm.ccf ? [`ccf: ${zoneFm.ccf}`] : []),
      ...(zoneFm.cast ? [`cast_tier: ${zoneFm.cast}`] : []),
      `added: ${todayKey()}`,
      '---',
      '',
    ].join('\n');
    const pdfLink = pdfVal && !isHttp(pdfVal) && !isExternalPath(pdfVal) ? `\n原文：[[${pdfVal.split('/').pop()}]]\n` : '';
    const body = [
      `# ${data.title}`, '', pdfLink.trim(),
      '## 一句话总结', '', '## 问题设定（卫星/目标/约束）', '',
      '## 网格 / 方法如何使用', '', '## 求解算法', '',
      '## 可借鉴点', '', '## 疑问与待办', '- [ ] ', '',
    ].join('\n');
    const file = await this.app.vault.create(path, fm + body);
    if (open) await this.smartOpenFile(file);
    return file;
  }

  async setPaperStatus(p, status) {
    await this.preparePaper(p);
    if (!STATUSES.includes(status)) throw new Error('未知的阅读状态');
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      const state = ResearchCore.normalizeReadingState(status, fm.reading_progress ?? fm.progress ?? 0, 'status');
      fm.status = state.status; fm.reading_progress = state.progress;
    });
  }
  async setPaperRating(p, rating) { await this.preparePaper(p); await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.rating = Math.max(0, Math.min(5, Math.round(Number(rating) || 0))); }); }
  async setPaperPriority(p, priority) { await this.preparePaper(p); await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.priority = PRIORITIES.includes(priority) ? priority : ''; }); }
  async openPaper(p) { await this.preparePaper(p); this._contextPaperPath = p.path; await this.smartOpenFile(p.file); }

  async openReading(p, { split = false } = {}) {
    await this.preparePaper(p);
    this._contextPaperPath = p.path;
    this.settings.lastReadingPath = p.path;
    await this.saveSettings();
    if (p.status === '待读') await this.setPaperStatus(p, '阅读中');
    if (this.settings.openAssistantOnDashboard) await this.activateSidePanel(false);
    const pdf = p.pdf;
    if (!pdf) { await this.smartOpenFile(p.file); return; }
    if (!split || isHttp(pdf) || isExternalPath(pdf)) { await this.openPdf(pdf); return; }
    const file = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (file instanceof TFile) {
      const ws = this.app.workspace;
      const savedPosition = structuredClone(this.pdfResearch.readingPosition(file.path));
      const previousNote = this._readingNoteLeaf;
      if (previousNote?.parent && previousNote.getRoot() === ws.rootSplit && previousNote.view.file?.path === this._readingNotePath && !previousNote.getViewState().pinned) {
        await previousNote.openFile(p.file, { active: true }); await ws.revealLeaf(previousNote);
        this._readingNoteLeaf = previousNote;
      } else this._readingNoteLeaf = await this.smartOpenFile(p.file);
      this._readingNotePath = p.file.path;
      if (this._readingNoteLeaf === this._fileLeaf) this._fileLeafPath = p.file.path;
      const previousPdf = this._readingPdfLeaf;
      if (!previousPdf?.parent || previousPdf.getRoot() !== ws.rootSplit || previousPdf === this._readingNoteLeaf || previousPdf.view.getViewType() !== 'pdf' || previousPdf.view.file?.path !== this._readingPdfPath || previousPdf.getViewState().pinned) this._readingPdfLeaf = ws.getLeaf('split', 'vertical');
      await this._readingPdfLeaf.openFile(file, { active: true });
      this._readingPdfPath = file.path;
      await ws.revealLeaf(this._readingPdfLeaf);
      await this.pdfResearch.restorePosition(file.path, this._readingPdfLeaf, savedPosition);
    } else new Notice('PDF 不在库内：可用「外部 PDF 入库」迁移后分栏阅读');
  }

  async openPdf(pdf) {
    if (!pdf) return;
    if (isHttp(pdf)) { window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) {
      const ws = this.app.workspace;
      const savedPosition = structuredClone(this.pdfResearch.readingPosition(f.path));
      const splitLeaf = this._readingPdfLeaf, noteLeaf = this._readingNoteLeaf;
      // Collapse only the reader pair we created, while both panes are still unchanged and unpinned.
      const collapse = splitLeaf?.parent && noteLeaf?.parent && splitLeaf !== noteLeaf && splitLeaf.getRoot() === ws.rootSplit && noteLeaf.getRoot() === ws.rootSplit
        && splitLeaf.view.getViewType() === 'pdf' && splitLeaf.view.file?.path === this._readingPdfPath && noteLeaf.view.file?.path === this._readingNotePath
        && !splitLeaf.getViewState().pinned && !noteLeaf.getViewState().pinned;
      let leaf;
      if (collapse) {
        await noteLeaf.openFile(f, { active: true }); leaf = noteLeaf;
        if (leaf === this._fileLeaf) this._fileLeafPath = f.path;
        splitLeaf.detach(); this._readingPdfLeaf = this._readingNoteLeaf = null; this._readingPdfPath = this._readingNotePath = null;
        await ws.revealLeaf(leaf);
      } else leaf = await this.smartOpenFile(f);
      if (leaf) await this.pdfResearch.restorePosition(f.path, leaf, savedPosition);
      return;
    }
    if (isExternalPath(pdf)) {
      try {
        const electron = window.require && window.require('electron');
        if (electron?.shell?.openPath) {
          const err = await electron.shell.openPath(pdf);
          if (err) new Notice(`打开失败：${err}`);
          return;
        }
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
    const destination = this.settings.sourceFolder || this.settings.pdfFolder;
    if (copyIntoVault) await this.ensureFolder(destination);
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
          const rel = `${destination}/${base}`;
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
    const destination = this.settings.sourceFolder || this.settings.pdfFolder;
    await this.ensureFolder(destination);
    let ok = 0; let fail = 0;
    new Notice(`开始迁移 ${papers.length} 个 PDF…`);
    for (const p of papers) {
      try {
        const base = toPosix(p.pdf).split('/').pop();
        const rel = `${destination}/${base}`;
        if (!(this.app.vault.getAbstractFileByPath(rel) instanceof TFile)) {
          const buf = fs.readFileSync(p.pdf);
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          await this.app.vault.adapter.writeBinary(normalizePath(rel), ab);
        }
        await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.pdf = rel; });
        const content = await this.app.vault.cachedRead(p.file);
        if (!content.includes(`[[${base}]]`)) {
          await this.app.vault.modify(p.file, content.replace(/^# .+\n/, (m) => `${m}\n原文：[[${base}]]\n`));
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

  /** Crossref 正式期刊检索（v0.9） */
  async searchCrossref(query, n = 8) {
    const q = (query || 'satellite scheduling').trim();
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${Math.min(20, Math.max(3, n))}&sort=relevance&select=title,author,container-title,issued,DOI,abstract`;
    const resp = await requestUrl({ url, method: 'GET', throw: false });
    if (resp.status !== 200) throw new Error(`Crossref 返回 ${resp.status}`);
    const items = (resp.json?.message?.items || []).map((w) => {
      const title = (w.title || [])[0] || '';
      const venue = (w['container-title'] || [])[0] || '';
      const year = (w.issued?.['date-parts'] || [[]])[0][0];
      const authors = (w.author || []).slice(0, 3).map((a) => [a.family, a.given].filter(Boolean).join(' ')).join(', ');
      const abs = w.abstract ? w.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return {
        source: 'crossref', title, venue, authors,
        date: year ? String(year) : '',
        year: year ? String(year) : '',
        url: w.DOI ? `https://doi.org/${w.DOI}` : '',
        doi: w.DOI || '',
        summary: abs.slice(0, 300),
      };
    }).filter((x) => x.title && (x.venue ? !x.venue.toLowerCase().includes('preprint') : true));
    return items;
  }

  async crossrefToLibrary(it) {
    const topics = this.settings.topics.filter((t) => `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title,
      authors: JensenResearchStationPlugin.normalizeAuthors(it.authors),
      year: it.year,
      venue: it.venue,
      status: '待读',
      topics: topics.slice(0, 3),
      pdf: it.doi ? `https://doi.org/${it.doi}` : '',
    }, false);
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

  /** 作者串归一：'Caldeiras , Paulo' → 'Paulo Caldeiras' 类脏空格清理 */
  static normalizeAuthors(s) {
    return String(s || '').replace(/\s*,\s*/g, ', ').replace(/,([^ ])/g, ', $1').trim();
  }

  async arxivToLibrary(it) {
    const year = it.date ? it.date.slice(0, 4) : '';
    const topics = this.settings.topics.filter((t) => `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title, authors: JensenResearchStationPlugin.normalizeAuthors(it.authors), year, venue: 'arXiv',
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
    await this.preparePaper(paper);
    const content = await this.app.vault.cachedRead(paper.file);
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').slice(0, 4000);
    if (paper.pdf && !isHttp(paper.pdf) && !isExternalPath(paper.pdf)) {
      try { return await this.pdfResearch.readText(toPosix(paper.pdf)) + '\n\n[个人笔记]\n' + body; }
      catch (error) {
        const substantive = body.replace(/^#+.*$/gm, '').replace(/^原文.*$/gm, '').replace(/^\s*- \[[ xX]\].*$/gm, '').trim();
        if (substantive.length < 30) throw error;
        return `[无法获取 PDF 正文：${error.message}。仅依据以下已有笔记。]\n${body}`;
      }
    }
    const substantive = body.replace(/^#+.*$/gm, '').replace(/^原文.*$/gm, '').replace(/^\s*- \[[ xX]\].*$/gm, '').trim();
    if (substantive.length < 30) throw new Error('尚无可用原文或实质笔记，请先打开本地 PDF 或补充笔记');
    return '[仅有个人笔记，未读取 PDF 正文]\n' + body;
  }

  async aiSummarize(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是严谨的科研助理。仅依据给定 PDF 摘取与笔记生成四个部分的简明中文要点。未提供的信息明确写未提供，禁止根据标题猜测结果或编造实验。只输出 markdown 正文。',
      `文献笔记：\n${source}\n\n请输出（使用这些确切标题）：\n## 一句话总结\n## 问题设定（卫星/目标/约束）\n## 求解算法\n## 可借鉴点`,
 );
    const headings = ['一句话总结', '问题设定（卫星/目标/约束）', '求解算法', '可借鉴点'];
    const blocks = headings.map((heading) => {
      const match = out.match(new RegExp(`## ${heading.replace(/[()]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
      return { heading, text: match?.[1]?.trim() || '' };
    });
    if (blocks.some((block) => !block.text)) throw new Error('模型未完整返回四个章节，笔记未修改，请重试');
    await this.backupFile(paper.file);
    await this.app.vault.process(paper.file, (latest) => blocks.reduce((result, block) => replaceSection(result, block.heading, block.text), latest));
    new Notice('AI 摘要已写入');
    await this.smartOpenFile(paper.file);
  }

  async aiGuide(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是导师，仅依据给定 PDF 摘取和笔记为研究生生成论文导读问题。未提供的结论标明未知，不编造实验与来源。只输出 markdown 正文。',
      `文献：\n${source}\n\n生成 10 个帮助深入理解该论文的问题，每题附 2-3 句参考答案。格式：\n## 导读十问\n1. **问题**\n   - 参考：…`,
      1400,
 );
    const match = out.match(/## 导读十问[\s\S]*/);
    const body = (match ? match[0] : out).replace(/^## 导读十问\s*\n/, '').trim();
    if (!body) throw new Error('导读内容为空，笔记未修改');
    await this.backupFile(paper.file);
    await this.app.vault.process(paper.file, (latest) => replaceSection(latest, '导读十问', body));
    new Notice('导读十问已生成');
    await this.smartOpenFile(paper.file);
  }

  async aiMetadata(paper) {
    const body = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '仅从给定 PDF 正文与笔记提取元数据，不推测。没有明确证据的作者、年份、期刊留空；方向只从候选中选择。只输出 JSON。',
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
    new Notice('MinerU 解析已写入');
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

  /** AI 起草大纲章节：检索文献 → 初稿带来源写回大纲（可重复起草，覆盖旧稿） */
  async aiDraftSection(sectionName) {
    if (!this.settings.ai.apiKey) throw new Error('请先在 设置 → AI 助手 配置 API Key');
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(f instanceof TFile)) throw new Error('综述大纲不存在');
    const content = await this.app.vault.cachedRead(f);

    const lines = content.split('\n');
    const hIdx = lines.findIndex((l) => l.trim() === `## ${sectionName}`);
    if (hIdx === -1) throw new Error(`未找到章节：${sectionName}`);
    let end = lines.length;
    for (let i = hIdx + 1; i < lines.length; i += 1) { if (/^## /.test(lines[i])) { end = i; break; } }
    const bullets = lines.slice(hIdx + 1, end).filter((l) => /^\s*- \[/.test(l)).map((l) => l.trim()).join('\n');

    const papers = this.getPapers();
    if (!papers.length) throw new Error('文献库为空');
    const segs = sectionName.match(/[\u4e00-\u9fff a-zA-Z0-9]{2,}/g) || [sectionName];
    const terms = new Set();
    segs.forEach((seg) => {
      for (let i = 0; i + 2 <= seg.length; i += 1) terms.add(seg.slice(i, i + 2).toLowerCase());
    });
    const scored = papers.map((p) => {
      let s = 0;
      const t = p.title.toLowerCase();
      const sm = (p.summary || '').toLowerCase();
      const tp = p.topics.join(' ').toLowerCase();
      terms.forEach((term) => {
        if (t.includes(term)) s += 3;
        if (tp.includes(term)) s += 2;
        if (sm.includes(term)) s += 1;
      });
      s += p.rating * 0.3 + (p.priority === '高' ? 1 : 0);
      return { p, s };
    }).filter((x) => x.s > 1).sort((a, b) => b.s - a.s).slice(0, 5);
    const picked = scored.length ? scored.map((x) => x.p) : papers.slice(0, 3);
    const ctx = picked.map((p, i) => `[${i + 1}] ${p.title}（${p.year || '年份未知'}${p.venue ? ' · ' + p.venue : ''}）${p.summary || p.topics.join('/') || ''}`).join('\n');

    const out = await this.aiChat(
      '你是运筹学/航天领域的综述写作助理。依据给定文献起草综述章节初稿：中文、学术书面语、2-3 个自然段，关键论断后标注 [n] 来源编号；不要杜撰文献中不存在的内容。只输出 markdown 正文。',
      `章节标题：${sectionName}\n该章节已有写作要点：\n${bullets || '（暂无）'}\n\n相关文献：\n${ctx}\n\n请起草该章节初稿。`,
      1600,
 );

    const startMark = `<!--jrs-draft:${sectionName}-->`;
    const srcLinks = picked.map((p, i) => `[[${p.file.basename}|${i + 1}]]`).join(' ');
    const block = [
      startMark,
      `> [!NOTE] AI 初稿（${window.moment().format('M月D日 HH:mm')} · 模型 ${this.settings.ai.model}）`,
      `> 来源：${srcLinks} · 人工审定后并入正文，重复起草将覆盖本块。`,
      '',
      out,
      '<!--/jrs-draft-->',
    ].join('\n');

    let updated;
    const existStart = content.indexOf(startMark);
    if (existStart >= 0) {
      const existEnd = content.indexOf('<!--/jrs-draft-->', existStart);
      updated = content.slice(0, existStart) + block + content.slice(existEnd + '<!--/jrs-draft-->'.length);
    } else {
      const head = `## ${sectionName}`;
      const at = content.indexOf(head);
      updated = content.slice(0, at + head.length) + '\n\n' + block + '\n\n' + content.slice(at + head.length).replace(/^\n+/, '');
    }
    await this.app.vault.modify(f, updated);
    await this.smartOpenFile(f);
  }

  /** 期刊 → {abbr, cas, jcr}（基于 cas/jcr 字段，参考值） */
  /** 分词：切出全词集合（比较 abbr 用），如 'operations research letters' → words */
  static venueWords(v) {
    return new Set(String(v).toLowerCase().split(/[^a-z0-9\u4e00-\u9fff+&.-]+/).filter(Boolean));
  }

  zoneOf(venue) {
    if (!venue) return null;
    const v = String(venue).toLowerCase().trim();
    const words = JensenResearchStationPlugin.venueWords(v);
    /* 目标刊：全称精确 或 缩写整词命中（杜绝 'xxejorxx' / 'or' 误配） */
    const j = JOURNALS.find((x) =>
      v === x.abbr.toLowerCase() || v === x.name.toLowerCase() || words.has(x.abbr.toLowerCase()));
    if (j) return { abbr: j.abbr, cas: j.cas, jcr: j.jcr, ccf: j.ccf, tier: j.tier };
    /* 内置库兜底：CCF / 科协（精确名匹配） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === v || (x[1] && x[1].toLowerCase() === v));
    if (ccfHit) return { abbr: '', cas: '', jcr: '', ccf: ccfHit[2], tier: '' };
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.ops)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.aero)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    /* 已下载的中科院缓存（精确键） */
    if (this._jcache?.cas?.[v]) return { abbr: '', cas: this._jcache.cas[v][0], jcr: '', ccf: '', tier: '', top: this._jcache.cas[v][1] };
    if (this._jcache?.xr?.[v]) return { abbr: '', cas: '', jcr: '', ccf: '', tier: '', xr: this._jcache.xr[v] };
    return null;
  }

  zoneBadge(zone) {
    if (!zone) return null;
    const el = document.createElement('span');
    el.className = 'jrs-zone-badge';
    const bits = [];
    if (zone.cas) bits.push(`中科院${zone.cas}${zone.top ? '·Top' : ''}`);
    if (zone.xr) bits.push(`新锐${zone.xr}`);
    if (zone.ccf) bits.push(`CCF-${zone.ccf}`);
    if (zone.tier) bits.push(`科协${zone.tier}`);
    if (!bits.length) return null;
    el.textContent = bits.join(' · ');
    el.setAttribute('data-zone', (zone.cas || '').includes('1区') || (zone.ccf || '').startsWith('A') || ['A', 'T1'].includes(zone.tier) ? 'top' : (zone.xr || '') ? 'cn' : 'mid');
    el.title = '分区/分级为参考值，以最新官方表为准';
    return el;
  }

  /* ---------- 期刊分级查询引擎（CCF/科协/中科院2025/新锐2026/预警） ---------- */

  journalCachePath() { return '科研工作台/期刊分区缓存.json'; }

  async loadJournalCache(force = false) {
    if (this._jcache && !force) return this._jcache;
    try {
      const f = this.app.vault.getAbstractFileByPath(this.journalCachePath());
      if (f instanceof TFile) this._jcache = JSON.parse(await this.app.vault.cachedRead(f));
    } catch (e) { this._jcache = null; }
    return this._jcache;
  }

  /** mini CSV 解析（处理双引号包裹与逗号） */
  static parseCsvLine(line) {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** 下载中科院2025 + 新锐2026 全量表 → 精简缓存（一次即可，之后离线） */
  async downloadJournalDB() {
    const base = 'https://raw.githubusercontent.com/hitfyd/ShowJCR/master/%E4%B8%AD%E7%A7%91%E9%99%A2%E5%88%86%E5%8C%BA%E8%A1%A8%E5%8F%8AJCR%E5%8E%9F%E5%A7%8B%E6%95%B0%E6%8D%AE%E6%96%87%E4%BB%B6';
    const pull = async (file) => {
      const r = await requestUrl({ url: `${base}/${file}`, method: 'GET', throw: false });
      if (r.status !== 200) throw new Error(`${file} 拉取失败 ${r.status}`);
      return r.text;
    };
    /* 中科院 2025：Journal(0) 大类(8) 大类分区(9) Top(10) */
    const fqbRaw = await pull('FQBJCR2025-UTF8.csv');
    const cas = {};
    fqbRaw.split('\n').slice(1).forEach((line) => {
      if (!line.trim()) return;
      const cols = JensenResearchStationPlugin.parseCsvLine(line);
      const name = (cols[0] || '').trim().toLowerCase();
      const zoneM = (cols[9] || '').match(/^(\d)/);
      if (name && zoneM) cas[name] = [`${zoneM[1]}区`, (cols[10] || '').trim() === '是', (cols[8] || '').trim()];
    });
    /* 新锐 2026：刊名(3) 大类新锐分区(15) */
    const xrRaw = await pull('XR2026-UTF8.csv');
    const xr = {};
    xrRaw.split('\n').slice(1).forEach((line) => {
      if (!line.trim()) return;
      const cols = JensenResearchStationPlugin.parseCsvLine(line);
      const name = (cols[3] || '').trim().toLowerCase();
      const z = (cols[15] || '').replace(' ', '').trim();
      if (name && /^\d区$/.test(z)) xr[name] = z;
    });
    await this.ensureFolder('科研工作台');
    const path = this.journalCachePath();
    const old = this.app.vault.getAbstractFileByPath(path);
    const payload = JSON.stringify({ v: 1, ts: Date.now(), cas, xr });
    if (old instanceof TFile) await this.app.vault.modify(old, payload);
    else await this.app.vault.create(path, payload);
    this._jcache = { v: 1, ts: Date.now(), cas, xr };
    return { cas: Object.keys(cas).length, xr: Object.keys(xr).length };
  }

  /** 万能期刊查询：内置（CCF/科协/预警/目标刊）+ 缓存（中科院2025/新锐2026） */
  async lookupJournal(nameRaw) {
    const name = String(nameRaw || '').trim().toLowerCase();
    if (!name) return { found: false };
    const out = { found: false, query: nameRaw };
    /* 目标刊 17 本 */
    const w1 = JensenResearchStationPlugin.venueWords(nameRaw);
    const j = JOURNALS.find((x) => name === x.abbr.toLowerCase() || name === x.name.toLowerCase() || w1.has(x.abbr.toLowerCase()));
    if (j) {
      out.found = true;
      if (j.cas) out.cas = j.cas;
      if (j.jcr) out.jcr = j.jcr;
      if (j.ccf) out.ccf = { grade: j.ccf, type: 'journal' };
      if (j.tier) out.cast = j.tier;
      out.target = true;
    }
    /* CCF 2026（含会议） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => {
      const xn = x[0].toLowerCase();
      if (xn === name || (x[1] && x[1].toLowerCase() === name)) return true;
      const xw = xn.split(/\s+/).filter((t) => t.length > 2);
      if (xw.length >= 2 && xw.every((t) => w1.has(t))) {
        const extra = [...w1].filter((t) => t.length > 2 && !xw.includes(t) && !['journal', 'transactions', 'of', 'the', 'on'].includes(t));
        return extra.length === 0;
      }
      return false;
    });
    if (ccfHit) {
      out.found = true;
      out.ccf = { grade: ccfHit[2], type: ccfHit[3] === 'conf' ? '会议' : '期刊', field: ccfHit[4] };
    }
    /* 科协：运筹与管理 + 航空航天 */
    for (const [k, v] of Object.entries(JOURNAL_BUILTIN.ops)) {
      if (k.toLowerCase() === name) { out.found = true; out.cast = v; out.castField = '运筹与管理'; break; }
    }
    if (!out.cast) {
      for (const [k, v] of Object.entries(JOURNAL_BUILTIN.aero)) {
        if (k.toLowerCase() === name) { out.found = true; out.cast = v; out.castField = '航空航天'; break; }
      }
    }
    /* 预警 */
    const warnHit = JOURNAL_BUILTIN.warn.find((x) => x[0].toLowerCase() === name);
    if (warnHit) { out.found = true; out.warn = warnHit[1]; }
    /* 缓存：中科院 2025 + 新锐 2026 */
    const cache = await this.loadJournalCache();
    if (cache?.cas?.[name]) {
      out.found = true;
      out.cas = cache.cas[name][0];
      out.casTop = cache.cas[name][1];
      out.cat = cache.cas[name][2];
    }
    if (cache?.xr?.[name]) { out.found = true; out.xr = cache.xr[name]; }
    return out;
  }

  /* ---------- 问答日志持久化（v0.8） ---------- */

  askLogPath() { return `科研工作台/AI问答/${todayKey()}.md`; }

  async appendAskLog(item) {
    await this.ensureFolder('科研工作台/AI问答');
    const path = this.askLogPath();
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      f = await this.app.vault.create(path, `# AI 问答 ${todayKey()}\n\n`);
    }
    const safeA = item.a.trim().replace(/^### /gm, '#### ').replace(/^来源：/gm, '**来源**：');
    const srcLine = item.sources?.length
      ? `

来源：${item.sources.map((s) => `[[${s.file ? s.file.basename : s.basename}]]`).join('、')}` : '';
    await this.app.vault.append(f, `\n### Q: ${item.q}\n\n${safeA}${srcLine}\n`);
  }

  async getAskLogToday() {
    const f = this.app.vault.getAbstractFileByPath(this.askLogPath());
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    return content.split(/\n(?=### Q: )/).map((block) => {
      const qm = block.match(/^### Q: (.+)$/m);
      if (!qm) return null;
      const q = qm[1].trim();
      const body = block.replace(/^### Q: .+$/m, '').trim();
      const srcMatch = body.match(/^来源：(.+)$/gm);  /* 全局匹配取最后一个 */
      const srcLine = srcMatch ? srcMatch[srcMatch.length - 1] : null;
      const srcText = srcLine ? srcLine.replace(/^来源：/, '') : '';
      const sources = srcText.split(/、/).map((l) => l.replace(/\[\[([^\]|]+).*?\]\]/, '$1').trim()).filter(Boolean)
        .map((basename) => ({ basename, title: basename }));
      const a = body.replace(/^来源：.+$/m, '').trim();
      return { q, a, sources };
    }).filter(Boolean).reverse();
  }

  /* ---------- 编辑器 AI 三连（润色/扩写/精简） ---------- */

  async aiEditSelection(editor, mode) {
    const sel = editor && editor.getSelection ? editor.getSelection() : '';
    if (!sel || !sel.trim()) {
      new Notice('请先选中要处理的段落文字');
      return;
    }
    if (sel.length > 6000) { new Notice('选区超过 6000 字符，请按段落处理'); return; }
    const from = { ...editor.getCursor('from') }; const to = { ...editor.getCursor('to') };
    const spec = {
      polish: ['学术润色', '改写为严谨的学术书面语：术语规范、逻辑连贯、去口语化。保持原意与长度相近，直接输出改写后的文字。'],
      expand: ['扩写深化', '在保持原意的前提下扩写：补充机理说明、对比视角与过渡句，篇幅约为原文 1.5-2 倍。直接输出扩写后的文字。'],
      condense: ['精简提炼', '压缩到原篇幅一半以内，保留全部关键论断与术语，删除冗余修饰。直接输出精简后的文字。'],
    }[mode];
    new Notice(`${spec[0]}处理中…`);
    try {
      const out = await this.aiChat(
        `你是运筹学/航天领域的学术写作助手。任务：${spec[0]}。要求：${spec[1]} 不要任何解释、前后缀或代码块。`,
        sel,
        1600,
 );
      const clean = out.trim().replace(/^```[a-z]*\n?|```$/g, '');
      if (!clean) throw new Error('模型返回为空');
      if (editor.getRange(from, to) !== sel) throw new Error('原选区已变化，请重新选择文字后处理');
      editor.replaceRange(clean, from, to);
      new Notice(`${spec[0]}完成（Ctrl+Z 可撤销）`);
    } catch (e) {
      new Notice(`${spec[0]}失败：${e.message}`);
    }
  }

  /* ---------- 今日小结（确定性汇总，不耗 AI） ---------- */

  async generateDailyDigest() {
    const key = todayKey();
    const log = (this.settings.pomoLog || {})[key] || {};
    const wellness = this.wellnessDay(key);
    const papers = this.getPapers();
    const addedToday = papers.filter((p) => window.moment(p.added).format('YYYY-MM-DD') === key);
    const questions = await this.getQuestions();
    const subs = this.getSubmissions();
    const lines = [
      `- 专注：${log.count || 0} 个番茄 · ${log.minutes || 0} 分钟`,
      `- 文献：今日新增 ${addedToday.length} 篇；阅读中 ${papers.filter((p) => p.status === '阅读中').length} · 待读 ${papers.filter((p) => p.status === '待读').length}`,
      `- 喝水 ${wellness.water} 次 · 休息 ${wellness.breaks} 次 · 健身${wellness.workouts ? '已打卡' : '未打卡'}`,
      `- 研究问题：待解答 ${questions.filter((q) => q.status === 'open').length} 个`,
      `- 投稿管线：${subs.filter((s) => ['写作中', '准备投稿'].includes(s.status)).length} 篇在写 · ${subs.filter((s) => ['已投', '审稿中', '大修', '小修'].includes(s.status)).length} 篇在审`,
    ];
    if (addedToday.length) lines.push(`- 新增：${addedToday.slice(0, 5).map((p) => p.title.slice(0, 18) + '…').join('；')}`);
    let f = this.findDailyNote();
    if (!f) {
      try {
        if (this.settings.dailyFolder) await this.ensureFolder(this.settings.dailyFolder);
        const k = key;
        f = await this.app.vault.create(this.dailyPath(), `# ${k}

## 今日待办

## 专注记录
`);
      } catch (e) {
        new Notice(`日记创建失败：${e.message}（检查设置中的日记目录）`);
        return;
      }
    }
    const content = await this.app.vault.cachedRead(f);
    await this.app.vault.modify(f, replaceSection(content, '今日小结', lines.join('\n')));
    new Notice('今日小结已写入日记');
    await this.smartOpenFile(f);
  }

  /* ---------- 快速捕获（ima 收藏哲学） ---------- */

  async captureThought(text) {
    await this.ensureFolder(this.settings.inboxFolder);
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\n\n`);
    const safeT = String(text).replace(/[\r\n]+/g, ' / ').slice(0, 2000);
    await this.app.vault.append(f, `\n- ${window.moment().format('HH:mm')} ${safeT}`);

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
        title: String(fm.title || f.basename),
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
      `target: "${String(target).replace(/"/g, "'")}"`,
      'status: 写作中',
      deadline ? `deadline: ${deadline}` : 'deadline: ',
      `created: ${todayKey()}`,
      '---',
      '',
      `# ${title}`,
      '',
      ` 目标期刊：**${target}**${j ? `（${j.name}，${j.tag}）` : ''}`,
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
    if (!papers.length) { new Notice('文献库为空，已阻止重建（避免清空现有图谱）'); return; }
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const untagged = papers.filter((p) => !p.topics.some((t) => topics.includes(t)));
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
    /* 未分类虚拟节点 */
    if (untagged.length) {
      nodes.push({ id: 'topic-uncategorized', type: 'text', text: '## 未标注方向', x: -rowW / 2 - 340, y: -520, width: T_W, height: T_H, color: '4' });
    }
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
    /* 未分类论文节点 */
    untagged.forEach((p, pi) => {
      const nid = `paper-unc-${pi}`;
      nodes.push({
        id: nid, type: 'text',
        text: `[[${p.file.basename}|${p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}]]\n${p.status}${p.year ? ' · ' + p.year : ''}`,
        x: -rowW / 2 - 350, y: -420 + pi * (P_H + P_GAP), width: P_W, height: P_H, color: '0',
      });
      edges.push({ id: `e-${nid}`, fromNode: 'topic-uncategorized', fromSide: 'bottom', toNode: nid, toSide: 'top', color: '4' });
    });
    if (!nodes.length) { new Notice('图谱无内容，已取消写入'); return; }
    const canvas = { nodes, edges, fmtMd: true };
    const path = this.settings.graphCanvas;
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) { await this.backupFile(old); await this.app.vault.modify(old, JSON.stringify(canvas, null, 1)); }
    else { await this.ensureFolder(path.split('/').slice(0, -1).join('/')); await this.app.vault.create(path, JSON.stringify(canvas, null, 1)); }
    new Notice(`图谱已生成：${topics.length} 主题 · 入图 ${papers.length - untagged.length} 篇（未标注 ${untagged.length} 篇归入"未标注方向"）`);
    if (open) await this.openGraphCanvas();
  }

  async openGraphCanvas() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.graphCanvas);
    if (f) await this.smartOpenFile(f);
  }

  /* ---------- Bases ---------- */

  /** 异步确认弹窗（替代 window.confirm 原生阻塞） */
  confirmDialog(title, message) {
    return new Promise((resolve) => {
      const m = new Modal(this.app);
      m.titleEl.setText(title);
      m.contentEl.createEl('p', { text: message });
      new Setting(m.contentEl)
        .addButton((b) => b.setButtonText('确认').setCta().onClick(() => { resolve(true); m.close(); }))
        .addButton((b) => b.setButtonText('取消').onClick(() => { resolve(false); m.close(); }));
      m.onClose = () => resolve(false);
      m.open();
    });
  }

  async generateBases() {
    const dir = this.settings.basesFolder;
    const existing = ['文献库', '阅读队列'].filter((n) => this.app.vault.getAbstractFileByPath(`${dir}/${n}.base`));
    if (existing.length) {
      const ok = await this.confirmDialog('重建 Bases', `将重建 ${existing.join('、')}。原配置会先保存到备份目录，可随时找回手工修改。`);
      if (!ok) { new Notice('已取消'); return; }
    }
    await this.ensureFolder(dir);
    const mk = async (name, yaml) => {
      const p = `${dir}/${name}.base`;
      const old = this.app.vault.getAbstractFileByPath(p);
      if (old instanceof TFile) { await this.backupFile(old); await this.app.vault.modify(old, yaml); }
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
    if (f) await this.smartOpenFile(f);
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
    new Notice('综述大纲已初始化');
    if (open) await this.smartOpenFile(f);
  }

  async openSurveyNote() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (f) await this.smartOpenFile(f);
  }

  async getSurveyProgress() {
    const file = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(file instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(file);
    const sections = []; let current = null;
    content.split('\n').forEach((raw, line) => {
      const heading = raw.match(/^## (.+)/);
      if (heading) { current = { name: heading[1].trim(), done: 0, total: 0, tasks: [] }; sections.push(current); return; }
      const task = raw.match(/^(\s*)- \[( |x|X)\] (.+)$/);
      if (task && current) {
        const done = task[2].toLowerCase() === 'x'; current.total++; if (done) current.done++;
        current.tasks.push({ line, text: task[3].trim(), done, raw });
      }
    });
    return sections.filter((section) => section.total);
  }

  async toggleSurveyTask(task) {
    const file = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(file instanceof TFile)) throw new Error('综述大纲不存在');
    await this.app.vault.process(file, (content) => {
      const lines = content.split('\n');
      if (lines[task.line] !== task.raw) throw new Error('大纲已变化，请刷新后再勾选');
      lines[task.line] = task.raw.replace(/^(\s*)- \[( |x|X)\]/, (_, indent) => `${indent}- [${task.done ? ' ' : 'x'}]`);
      return lines.join('\n');
    });
  }

  /* ---------- 文献矩阵 ---------- */

  async uniquePath(folder, filename) {
    await this.ensureFolder(folder);
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : '';
    let path = `${folder}/${filename}`; let index = 1;
    while (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${stem}-${index++}${extension}`;
    return path;
  }

  async backupFile(file) {
    const parent = this.settings.libFolder.split('/').slice(0, -1).join('/');
    const folder = `${parent ? parent + '/' : ''}备份`;
    const path = await this.uniquePath(folder, `${sanitizeFilename(file.basename)}-${window.moment().format('YYYYMMDD-HHmmss')}.${file.extension}`);
    return this.app.vault.create(path, await this.app.vault.read(file));
  }

  async exportPapers(format, papers) {
    if (!papers.length) { new Notice('没有可导出的文献'); return; }
    if (!['csv', 'bib'].includes(format)) throw new Error('不支持的导出格式');
    const parent = this.settings.libFolder.split('/').slice(0, -1).join('/');
    const folder = `${parent ? parent + '/' : ''}导出`;
    const path = await this.uniquePath(folder, `文献-${window.moment().format('YYYYMMDD-HHmmss')}.${format}`);
    const content = format === 'csv' ? ResearchCore.papersToCsv(papers) : ResearchCore.papersToBibtex(papers);
    const file = await this.app.vault.create(path, content);
    new Notice(`已导出 ${papers.length} 篇 → ${file.path}`, 6000);
    return file;
  }

  async applyPaperBatch(papers, patch) {
    if (this._paperBatchBusy) throw new Error('上一批修改尚未完成');
    const fields = Object.keys(patch);
    if (!fields.length || fields.some((key) => !['status', 'priority', 'project'].includes(key))) throw new Error('无效的批量字段');
    if ('status' in patch && !STATUSES.includes(patch.status)) throw new Error('无效的阅读状态');
    if ('priority' in patch && patch.priority && !PRIORITIES.includes(patch.priority)) throw new Error('无效的优先级');
    if ('project' in patch && typeof patch.project !== 'string') throw new Error('项目名称应为文本');
    this._paperBatchBusy = true;
    const history = []; const errors = [];
    try {
      for (const paper of papers) {
        try {
          await this.preparePaper(paper);
          let snapshot;
          await this.app.fileManager.processFrontMatter(paper.file, (fm) => {
            const updates = { ...patch };
            if ('status' in patch) {
              const state = ResearchCore.normalizeReadingState(patch.status, fm.reading_progress ?? fm.progress ?? 0, 'status');
              updates.status = state.status; updates.reading_progress = state.progress;
            }
            const before = {};
            for (const key of Object.keys(updates)) before[key] = { exists: Object.hasOwn(fm, key), value: structuredClone(fm[key]) };
            Object.assign(fm, updates);
            snapshot = { file: paper.file, before, after: updates };
          });
          if (snapshot) history.push(snapshot);
        } catch (error) { errors.push(`${paper.title}：${error.message}`); }
      }
      if (history.length) this._lastPaperBatch = history;
      new Notice(`已更新 ${history.length} 篇${errors.length ? `，${errors.length} 篇失败` : '，可撤销上次批量修改'}`, 5000);
      if (errors.length) console.warn('[JRS] 批量修改未完成项', errors);
      return { updated: history.length, failed: errors.length };
    } finally { this._paperBatchBusy = false; }
  }

  async undoPaperBatch() {
    if (this._paperBatchBusy) throw new Error('请等待当前批量操作完成');
    const history = this._lastPaperBatch || [];
    if (!history.length) return;
    this._paperBatchBusy = true;
    let restored = 0; const pending = [];
    try {
      for (const snapshot of history) {
        try {
          let changed = false;
          await this.app.fileManager.processFrontMatter(snapshot.file, (fm) => {
            if (Object.entries(snapshot.after).some(([key, value]) => fm[key] !== value)) return;
            for (const [key, entry] of Object.entries(snapshot.before)) {
              if (entry.exists) fm[key] = entry.value; else delete fm[key];
            }
            changed = true;
          });
          if (changed) restored++; else pending.push(snapshot);
        } catch (error) { pending.push(snapshot); }
      }
      this._lastPaperBatch = pending;
      new Notice(`已撤销 ${restored} 篇${pending.length ? `；${pending.length} 篇已被修改或无法读取，保留当前内容` : ''}`, 5000);
    } finally { this._paperBatchBusy = false; }
  }

  relatedPapers(paper, text = '') {
    const tokens = [...new Set(String(text).toLowerCase().match(/[a-z]{3,}|[\u4e00-\u9fff]{2,}/g) || [])];
    return this.getPapers().filter((candidate) => candidate.path !== paper?.path && candidate.status !== '已归档')
      .map((candidate) => {
        const shared = candidate.topics.filter((topic) => paper?.topics.includes(topic));
        const corpus = `${candidate.title} ${candidate.summary} ${candidate.topics.join(' ')}`.toLowerCase();
        const matches = tokens.filter((token) => corpus.includes(token)).length;
        return { paper: candidate, shared, score: shared.length * 5 + matches * 2 + (candidate.project && candidate.project === paper?.project ? 3 : 0) };
      }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.paper.rating - a.paper.rating).slice(0, 5);
  }

  async appendPaperThought(paper, text) {
    if (!paper?.file) throw new Error('请先打开一篇文献');
    await this.preparePaper(paper);
    const value = text.trim(); if (!value) throw new Error('请先输入想法');
    const heading = '## 阅读想法';
    const entry = `- ${window.moment().format('YYYY-MM-DD HH:mm')} ${value.replace(/\n/g, '\n  ')}`;
    await this.app.vault.process(paper.file, (content) => {
      const start = content.indexOf('\n' + heading + '\n');
      if (start < 0) return content.trimEnd() + `\n\n${heading}\n\n${entry}\n`;
      const next = content.indexOf('\n## ', start + heading.length + 2);
      const at = next < 0 ? content.length : next;
      return content.slice(0, at).trimEnd() + '\n' + entry + '\n\n' + content.slice(at).trimStart();
    });
  }

  async generateMatrix() {
    const papers = this.getPapersSorted('year');
    if (!papers.length) { new Notice('文献库为空'); return; }
    const mdCell = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|');
    const rows = [
      '| 文献 | 年份 | 来源 | 分区 | 方向 | 状态 | 优先级 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = mdCell(p.title);
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      const zone = this.zoneOf(p.venue);
      rows.push(`| ${link} | ${mdCell(p.year || '—')} | ${mdCell(p.venue || '—')} | ${zone ? mdCell(zone.abbr + ' ' + zone.cas) : '—'} | ${mdCell(p.topics.join('、') || '—')} | ${mdCell(p.status)} | ${mdCell(p.priority || '—')} | ${mdCell('★'.repeat(p.rating) || '—')} |  |  |  |`);
    }
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/');
    const matrixPath = `${dir ? dir + '/' : ''}文献矩阵.md`;
    const content = [
      '# 文献矩阵', '',
      `> 自动生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 共 ${papers.length} 篇。后三列留给精读填写。`, '',
      rows.join('\n'), '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(matrixPath);
    if (old instanceof TFile) { await this.backupFile(old); await this.app.vault.modify(old, content); await this.smartOpenFile(old); }
    else { await this.smartOpenFile(await this.app.vault.create(matrixPath, content)); }
    new Notice(`文献矩阵已生成（${papers.length} 篇）`);
  }
};
