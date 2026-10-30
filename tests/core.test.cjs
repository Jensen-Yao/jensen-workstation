const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../src/core.cjs');

test('reading transitions preserve status/progress invariants', () => {
  for (const [status, progress, field, expected] of [
    ['待读', 100, '', ['已完成', 100]], ['已完成', 0, '', ['已完成', 100]],
    ['待读', 25, '', ['阅读中', 25]], ['已归档', 70, '', ['已归档', 70]],
    ['待读', 100, 'status', ['待读', 0]], ['阅读中', 100, 'status', ['阅读中', 0]],
    ['已完成', 75, 'progress', ['阅读中', 75]], ['阅读中', 150, 'progress', ['已完成', 100]],
  ]) {
    const result = core.normalizeReadingState(status, progress, field);
    assert.deepEqual([result.status, result.progress], expected);
  }
});

const paper = { title: 'Grid based satellite scheduling', authors: 'Jensen Yao', year: '2024', venue: 'EJOR', status: '阅读中', priority: '高', rating: 4, topics: ['卫星任务规划', '时空网格'], project: 'My research project', pdf: 'Papers/grid.pdf', summary: 'rolling horizon' };
test('structured search composes fields, quotes, numeric ranges and negation', () => {
  for (const query of ['status:阅读中 topic:网格 year:>=2023 rating:>=4 has:pdf', 'project:"My research project"', '年份:2020..2025 -status:已归档', '"satellite scheduling" author:Yao', 'rolling horizon']) assert.equal(core.matchPaperQuery(paper, query), true, query);
  for (const query of ['year:<2020', 'status:待读', 'has:summary -topic:网格', 'rating:>4', 'unknown:value']) assert.equal(core.matchPaperQuery(paper, query), false, query);
});

test('collision packing repairs duplicate coordinates and stays within responsive bounds', () => {
  for (let columns = 2; columns <= 12; columns++) {
    const cards = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, layout: { x: i % 3, y: i % 2, w: i % 4 + 1, h: i % 5 + 1 } }));
    const packed = Object.values(core.packBoardLayout(cards, columns));
    for (let i = 0; i < packed.length; i++) {
      const a = packed[i]; assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= columns);
      for (const b of packed.slice(i + 1)) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
    }
  }
});
test('responsive packing does not mutate saved coordinates', () => {
  const input = [{ id: 'wide', layout: { x: 4, y: 2, w: 4, h: 3 } }]; const before = JSON.stringify(input);
  assert.deepEqual(core.packBoardLayout(input, 2, true).wide, { x: 0, y: 0, w: 2, h: 3 });
  assert.equal(JSON.stringify(input), before);
});
test('CSV preserves Unicode, quoting and protects spreadsheet formulas', () => {
  const csv = core.papersToCsv([{ ...paper, title: '=HYPERLINK("x")', authors: 'Yao, "J"', topics: ['网格'], path: '论文.md' }]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=HYPERLINK(""x"")"')); assert.ok(csv.includes('"Yao, ""J"""')); assert.ok(csv.includes('网格'));
});
test('BibTeX escapes syntax and creates distinct citation keys', () => {
  const bib = core.papersToBibtex([{ ...paper, title: 'A & B_{x} 50%' }, paper]);
  assert.ok(bib.includes('A \\& B\\_\\{x\\} 50\\%')); assert.ok(bib.includes('@article{JensenYao2024,')); assert.ok(bib.includes('@article{JensenYao2024_1,'));
});
test('reading positions clamp pages and reject invalid zoom without changing reading status', () => {
  assert.deepEqual(core.normalizeReadingPosition({ page: 99, pages: 10, scale: 'javascript:x' }), { page: 10, pages: 10, scale: 'page-width', updated: 0 });
  assert.equal(core.normalizeReadingPosition({ page: -4, pages: 8, scale: '1.5' }).page, 1);
  assert.equal(core.normalizeReadingPosition({ page: 8, pages: 20, scale: 'page-fit' }, 5).page, 5);
});
test('annotation edits and undo blocks preserve unrelated handwritten content', () => {
  const entry = { id: 'note1', pdf: 'paper.pdf', page: 2, text: 'Evidence', note: 'Original', created: '2026-10-30T08:00:00Z' };
  const original = 'My introduction\n\n' + core.annotationBlock(entry) + '\n\nMy conclusion';
  const changed = core.replaceAnnotationBlock(original, entry.id, core.annotationBlock({ ...entry, note: 'Edited' }));
  assert.ok(changed.includes('Edited')); assert.ok(!changed.includes('Original')); assert.ok(changed.includes('My conclusion'));
  const removed = core.replaceAnnotationBlock(changed, entry.id, '');
  assert.ok(!removed.includes('Evidence')); assert.ok(removed.includes('My introduction'));
  assert.ok(core.replaceAnnotationBlock(removed, entry.id, core.annotationBlock(entry)).includes('Original'));
});
test('annotation search finds comments and colors without mutating source order', () => {
  const entries = [{ id: 'b', page: 9, text: 'Grid', note: '算法证据', color: 'mint', created: '2026-10-29' }, { id: 'a', page: 2, text: 'Model', color: 'amber', created: '2026-10-30' }];
  assert.deepEqual(core.filterAnnotations(entries, '算法', 'mint').map((entry) => entry.id), ['b']);
  assert.deepEqual(core.filterAnnotations(entries).map((entry) => entry.id), ['a', 'b']); assert.equal(entries[0].id, 'b');
  assert.notEqual(core.pdfSelectionKey({ pdf: 'a.pdf', page: 1, text: 'same' }), core.pdfSelectionKey({ pdf: 'b.pdf', page: 1, text: 'same' }));
  assert.notEqual(core.pdfSelectionKey({ pdf: 'a.pdf', page: 1, text: 'same', anchor: 1 }), core.pdfSelectionKey({ pdf: 'a.pdf', page: 1, text: 'same', anchor: 100 }));
});

class File { constructor(path, text = '') { this.path = path; this.name = path.split('/').pop(); this.basename = this.name.replace(/\.[^.]+$/, ''); this.extension = this.name.split('.').pop(); this.stat = { ctime: 1, mtime: 1 }; this.text = text; this.fm = {}; } }
class FakeModal { constructor() { FakeModal.last = this; this.buttons = []; this.titleEl = { setText() {} }; this.contentEl = { owner: this, createEl() {} }; } open() {} close() { this.onClose?.(); } }
class FakeSetting { constructor(host) { this.host = host; } addButton(callback) { const button = { setButtonText() { return this; }, setCta() { return this; }, onClick(handler) { this.click = handler; return this; } }; callback(button); this.host.owner.buttons.push(button); return this; } }
const context = vm.createContext({ module: { exports: {} }, require: () => ({ Plugin: class {}, ItemView: class {}, Modal: FakeModal, Notice: class {}, PluginSettingTab: class {}, Setting: FakeSetting, TFile: File, normalizePath: (path) => path }),
  structuredClone, console, URL, window: { moment: () => ({ format: (format) => format === 'YYYY-MM-DD' ? '2026-10-30' : '20261030-180000' }) } });
vm.runInContext(fs.readFileSync(require.resolve('../main.js'), 'utf8'), context);
const Plugin = context.module.exports;
function fixture() {
  const plugin = new Plugin(); const files = new Map();
  plugin.settings = { libFolder: 'Library', sourceFolder: '', annotationsFolder: 'Annotations', pdfAnnotations: {}, wellnessLog: {}, surveyNote: 'survey.md' };
  plugin.saveSettings = async () => {};
  plugin.app = { workspace: { getLeavesOfType: () => [] }, metadataCache: { getFileCache: (file) => ({ frontmatter: file.fm }) },
    fileManager: { processFrontMatter: async (file, mutate) => { assert.equal(file.extension, 'md', 'never write frontmatter into PDF'); mutate(file.fm); } },
    vault: { getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === 'md'), getFiles: () => [...files.values()], getAbstractFileByPath: (path) => files.get(path),
      read: async (file) => file.text, cachedRead: async (file) => file.text, process: async (file, mutate) => { file.text = mutate(file.text); },
      modify: async (file, text) => { assert.equal(file.extension, 'md'); file.text = text; },
      append: async (file, text) => { file.text += text; }, create: async (path, text) => { const file = new File(path, text); files.set(path, file); return file; }, createFolder: async () => {} } };
  return { plugin, files };
}
test('folder source discovers PDFs and deduplicates linked literature notes', () => {
  const { plugin, files } = fixture();
  files.set('Research/grid.pdf', new File('Research/grid.pdf'));
  files.set('Elsewhere/other.pdf', new File('Elsewhere/other.pdf'));
  const note = new File('Library/grid.md'); note.fm = { title: 'Grid paper', pdf: 'Research/grid.pdf', status: '阅读中', reading_progress: 25 }; files.set(note.path, note);
  plugin.settings.sourceFolder = 'Research';
  assert.equal(plugin.getPapers().length, 1); assert.equal(plugin.getPapers()[0].title, 'Grid paper');
  plugin.settings.sourceFolder = 'Elsewhere'; assert.equal(plugin.getPapers()[0].isPdfOnly, true);
});
test('reopening a completed paper as unread resets progress', async () => {
  const { plugin } = fixture(); const file = new File('Library/a.md'); file.fm = { status: '已完成', reading_progress: 100 };
  await plugin.setPaperStatus({ file }, '待读'); assert.equal(file.fm.reading_progress, 0); assert.equal(file.fm.status, '待读');
});
test('progress increments use current frontmatter rather than a stale card snapshot', async () => {
  const { plugin } = fixture(); const file = new File('Library/a.md'); file.fm = { status: '阅读中', reading_progress: 0 };
  const card = { file, progress: 0 }; await plugin.bumpProgress(card, 25); await plugin.bumpProgress(card, 25);
  assert.equal(file.fm.reading_progress, 50);
});
test('batch undo restores only changed fields and preserves newer user edits', async () => {
  const { plugin } = fixture(); const file = new File('Library/a.md'); file.fm = { status: '待读', title: 'Original' };
  await plugin.applyPaperBatch([{ file, title: 'A' }], { status: '已完成', priority: '高' });
  file.fm.title = 'Edited'; await plugin.undoPaperBatch();
  assert.equal(file.fm.title, 'Edited'); assert.equal(file.fm.status, '待读'); assert.equal(Object.hasOwn(file.fm, 'priority'), false);
  await plugin.applyPaperBatch([{ file, title: 'A' }], { priority: '高' }); file.fm.priority = '中'; await plugin.undoPaperBatch();
  assert.equal(file.fm.priority, '中'); assert.equal(plugin._lastPaperBatch.length, 1);
});
test('confirmation resolves true before the modal close handler runs', async () => {
  const { plugin } = fixture(); const answer = plugin.confirmDialog('title', 'message'); FakeModal.last.buttons[0].click(); assert.equal(await answer, true);
});
test('survey task edits refuse stale line references', async () => {
  const { plugin, files } = fixture(); const file = new File('survey.md', '# Survey\n\n## Scope\n- [ ] Read sources\n'); files.set(file.path, file);
  const sections = await plugin.getSurveyProgress(); assert.equal(sections[0].total, 1);
  await plugin.toggleSurveyTask(sections[0].tasks[0]); assert.ok(file.text.includes('- [x] Read sources'));
  await assert.rejects(plugin.toggleSurveyTask(sections[0].tasks[0]), /大纲已变化/);
});
test('PDF annotations persist page-linked Markdown without touching the PDF binary', async () => {
  const { plugin, files } = fixture(); const PdfResearch = vm.runInContext('PdfResearch', context); const pdf = new PdfResearch(plugin); pdf.paint = () => {};
  const record = await pdf.save({ pdf: 'Research/a.pdf', page: 3, text: 'A passage\nSecond line', rects: [{ x: .1, y: .2, w: .4, h: .02 }] }, 'My interpretation', 'mint');
  assert.equal(plugin.settings.pdfAnnotations['Research/a.pdf'].length, 1);
  const markdown = files.get(pdf.notePath('Research/a.pdf')).text;
  assert.ok(markdown.includes('[[Research/a.pdf#page=3|')); assert.ok(markdown.includes('> Second line')); assert.ok(markdown.includes('My interpretation'));
  await pdf.remove('Research/a.pdf', record.id); assert.equal(pdf.annotations('Research/a.pdf').length, 0); assert.ok(!files.get(pdf.notePath('Research/a.pdf')).text.includes('My interpretation'));
});
test('concurrent PDF saves keep both annotations and a single Markdown note', async () => {
  const { plugin, files } = fixture(); const PdfResearch = vm.runInContext('PdfResearch', context); const pdf = new PdfResearch(plugin); pdf.paint = () => {};
  const create = plugin.app.vault.create;
  plugin.app.vault.create = async (path, text) => { await new Promise((resolve) => setTimeout(resolve, 5)); if (files.has(path)) throw new Error('file exists'); return create(path, text); };
  const [first, second] = await Promise.all([pdf.save({ pdf: 'a.pdf', page: 1, text: 'First' }, 'One', 'mint'), pdf.save({ pdf: 'a.pdf', page: 2, text: 'Second' }, 'Two', 'amber')]);
  assert.equal(pdf.annotations('a.pdf').length, 2); const text = files.get(pdf.notePath('a.pdf')).text;
  assert.ok(text.includes(first.id) && text.includes(second.id));
});
test('PDF annotation editing rejects stale dialogs and undo preserves later manual notes', async () => {
  const { plugin, files } = fixture(); const PdfResearch = vm.runInContext('PdfResearch', context); const pdf = new PdfResearch(plugin); pdf.paint = () => {};
  const first = await pdf.save({ pdf: 'a.pdf', page: 2, text: 'Evidence' }, 'Initial', 'mint');
  await pdf.update('a.pdf', first.id, { note: 'Revised', color: 'violet' }, first);
  await assert.rejects(pdf.update('a.pdf', first.id, { note: 'Stale overwrite' }, first), /已被其他操作修改/);
  await pdf.remove('a.pdf', first.id); assert.ok(pdf.canUndoDelete('a.pdf'));
  const file = files.get(pdf.notePath('a.pdf')); file.text += '\nHandwritten after deletion.\n';
  await pdf.undoDelete('a.pdf');
  assert.equal(pdf.annotations('a.pdf')[0].note, 'Revised'); assert.ok(file.text.includes('Handwritten after deletion.')); assert.ok(file.text.includes('Revised'));
});
test('unsaved annotation drafts survive selection and document changes', () => {
  const { plugin } = fixture(); const Side = vm.runInContext('SidePanelView', context); const side = new Side({}, plugin);
  side.render = () => {}; side.renderBody = () => {};
  const first = { pdf: 'a.pdf', page: 1, text: 'First passage' }; const second = { pdf: 'a.pdf', page: 2, text: 'Second passage' };
  side.setPdfSelection(first); side._annotationDraft = 'My first thought'; side.setPdfSelection(second); side._annotationDraft = 'My second thought';
  side.usePdf('b.pdf'); side.usePdf('a.pdf'); assert.equal(side._annotationDraft, 'My second thought');
  side.setPdfSelection(first); assert.equal(side._annotationDraft, 'My first thought');
});
test('late translation results stay with their original selection', async () => {
  const { plugin } = fixture(); const Side = vm.runInContext('SidePanelView', context); const side = new Side({}, plugin);
  side.render = () => {}; side.renderBody = () => {}; plugin.pdfResearch = {};
  const first = { pdf: 'a.pdf', page: 1, text: 'Source A' }; const second = { pdf: 'a.pdf', page: 2, text: 'Source B' };
  let resolve; plugin.aiChat = () => new Promise((done) => { resolve = done; });
  side.setPdfSelection(first); const pending = side.translatePdfSelection(first); side.setPdfSelection(second);
  resolve('Translation for A'); await pending; assert.equal(side._pdfTranslation, null);
  side.setPdfSelection(first); assert.equal(side._pdfTranslation.text, 'Translation for A');
});
test('finishing an older annotation save does not clear a newly selected draft', () => {
  const { plugin } = fixture(); const Side = vm.runInContext('SidePanelView', context); const side = new Side({}, plugin);
  side.render = () => {}; side.renderBody = () => {};
  const first = { pdf: 'a.pdf', page: 1, text: 'Old passage' }; const second = { pdf: 'a.pdf', page: 2, text: 'New passage' };
  plugin.pdfResearch = { selection: second };
  side.setPdfSelection(first); side._annotationDraft = 'Old note'; side.setPdfSelection(second); side._annotationDraft = 'New note';
  side.finishSavedSelection(first);
  assert.equal(side._pdfSelection.text, 'New passage'); assert.equal(side._annotationDraft, 'New note'); assert.equal(plugin.pdfResearch.selection.text, 'New passage');
});
test('PDF reader event subscriptions do not accumulate across binds and file switches', () => {
  const { plugin } = fixture(); const PdfResearch = vm.runInContext('PdfResearch', context); const pdf = new PdfResearch(plugin);
  const events = new Map(); const bus = { on(name, handler) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(handler); }, off(name, handler) { events.get(name)?.delete(handler); } };
  const viewer = { eventBus: bus }; const leaf = { view: { file: { path: 'a.pdf' }, viewer: { child: { pdfViewer: { pdfViewer: viewer } } } } };
  let leaves = [leaf]; plugin.app.workspace.getLeavesOfType = (type) => type === 'pdf' ? leaves : [];
  pdf.trackReaders(); pdf.trackReaders(); pdf.trackReaders(); assert.equal(events.get('pagechanging').size, 1);
  leaf.view.file = { path: 'b.pdf' }; pdf.trackReaders(); assert.equal(events.get('pagechanging').size, 1);
  leaves = []; pdf.trackReaders(); assert.equal(events.get('pagechanging').size, 0); assert.equal(events.get('scalechanging').size, 0);
});
test('daily wellness counters persist per date and workouts toggle without going negative', async () => {
  const { plugin } = fixture(); Object.assign(plugin, vm.runInContext('WellnessMethods', context));
  await plugin.recordWellness('water', '2026-10-29', 1); await plugin.recordWellness('workouts', '2026-10-30', 1); await plugin.recordWellness('workouts', '2026-10-30', 1);
  assert.equal(plugin.wellnessDay('2026-10-29').water, 1); assert.equal(plugin.wellnessDay('2026-10-30').workouts, 1);
  await plugin.recordWellness('workouts', '2026-10-30', -1); await plugin.recordWellness('workouts', '2026-10-30', -1); assert.equal(plugin.wellnessDay('2026-10-30').workouts, 0);
});
test('external PDF migration writes into the chosen source folder and keeps the original', async () => {
  const { plugin, files } = fixture(); const note = new File('Library/external.md', '# External paper\n');
  note.fm = { title: 'External paper', pdf: 'C:/Original/paper.pdf' }; files.set(note.path, note);
  plugin.settings.sourceFolder = 'Library'; plugin.settings.pdfFolder = 'PDFs';
  plugin.app.vault.adapter = { writeBinary: async (path, bytes) => { assert.ok(bytes.byteLength); files.set(path, new File(path)); } };
  const previous = context.window.require;
  context.window.require = (name) => { assert.equal(name, 'fs'); return { readFileSync: (path) => { assert.equal(path, 'C:/Original/paper.pdf'); return Buffer.from('%PDF-1.4'); } }; };
  try { await plugin.migrateExternalPdfs(); } finally { context.window.require = previous; }
  assert.equal(note.fm.pdf, 'Library/paper.pdf'); assert.ok(files.has('Library/paper.pdf')); assert.ok(note.text.includes('[[paper.pdf]]'));
});
test('AI summary refuses empty templates before making an API request', async () => {
  const { plugin } = fixture(); const file = new File('Library/empty.md', '# Paper\n\n## 一句话总结\n\n## 求解算法\n\n- [ ] \n');
  let calls = 0; plugin.aiChat = async () => { calls++; return 'invented'; };
  await assert.rejects(plugin.aiSummarize({ file, title: 'Paper' }), /尚无可用原文/);
  assert.equal(calls, 0); assert.ok(!file.text.includes('invented'));
});
test('structured AI summary saves all four sections and preserves unrelated notes', async () => {
  const { plugin } = fixture(); const file = new File('Library/paper.md', '# Paper\n\n## My own notes\nKeep this.\n');
  plugin.readPaperBody = async () => 'Real PDF source'; plugin.backupFile = async () => {}; plugin.smartOpenFile = async () => {};
  plugin.aiChat = async () => '## 一句话总结\nEvidence summary\n## 问题设定（卫星/目标/约束）\nEvidence problem\n## 求解算法\nEvidence algorithm\n## 可借鉴点\nEvidence ideas';
  await plugin.aiSummarize({ file });
  assert.ok(file.text.includes('Evidence summary')); assert.ok(file.text.includes('Evidence ideas')); assert.ok(file.text.includes('Keep this.'));
});
test('AI guide parses and saves its answers instead of dropping the generated body', async () => {
  const { plugin } = fixture(); const file = new File('Library/paper.md', '# Paper\n');
  plugin.readPaperBody = async () => 'Real PDF source'; plugin.backupFile = async () => {}; plugin.smartOpenFile = async () => {};
  plugin.aiChat = async () => '## 导读十问\n1. **Question**\n   - 参考：Evidence-based answer.';
  await plugin.aiGuide({ file }); assert.ok(file.text.includes('Evidence-based answer.'));
});
