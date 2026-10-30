'use strict';

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

module.exports = { normalizeReadingState, parsePaperQuery, matchPaperQuery, packBoardLayout, papersToCsv, papersToBibtex,
  normalizeReadingPosition, pdfSelectionKey, annotationBlock, replaceAnnotationBlock, filterAnnotations };
