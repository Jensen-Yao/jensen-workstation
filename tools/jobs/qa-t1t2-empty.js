const p = app.plugins.plugins['jensen-workstation'];
const out = { sections: {}, notices: [] };
const isFile = (x) => !!x && typeof x.path === 'string' && x.children === undefined;
const grabNotices = () => [...document.querySelectorAll('.notice')].map((n) => n.textContent.trim().slice(0, 90));
const rejections = [];
const onRej = (e) => rejections.push(String(e.reason?.message || e.reason).slice(0, 110));
window.addEventListener('unhandledrejection', onRej);
// 防止测试期间 settings 落盘
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const orig = { lib: p.settings.libFolder, survey: p.settings.surveyNote, canvas: p.settings.graphCanvas, key: p.settings.ai.apiKey };
try {
  p.settings.libFolder = 'QA空库/文献'; // 目录都不存在 = 真空库
  p.settings.surveyNote = 'QA空库/综述大纲.md';
  p.settings.graphCanvas = 'QA空库/图谱.canvas';

  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view;
  out.viewFound = !!view;
  for (const sec of ['home', 'queue', 'graph', 'progress', 'reader', 'submit', 'ask']) {
    try {
      await view.goto(sec);
      await new Promise((r) => setTimeout(r, 250));
      const cards = view.contentEl.querySelectorAll('.jrs-card, section');
      const first = cards[0]?.textContent?.replace(/\s+/g, ' ').slice(0, 80);
      out.sections[sec] = { ok: true, cards: cards.length, firstText: first };
    } catch (e) { out.sections[sec] = { ok: false, err: e.message }; }
  }

  // 矩阵：空库时
  out.notices_before_matrix = grabNotices();
  await p.generateMatrix();
  await new Promise((r) => setTimeout(r, 300));
  out.matrix_emptyLib = {
    notices: grabNotices(),
    fileCreated: isFile(p.app.vault.getAbstractFileByPath('QA空库/文献矩阵.md')),
  };

  // 图谱：空库时（注意与矩阵的差异）
  await p.generateGraphCanvas(false);
  await new Promise((r) => setTimeout(r, 300));
  const cf = p.app.vault.getAbstractFileByPath('QA空库/图谱.canvas');
  let canvasEmpty = null;
  if (isFile(cf)) { try { canvasEmpty = JSON.parse(await p.app.vault.cachedRead(cf)).nodes.length; } catch (e) { canvasEmpty = 'BAD JSON'; } }
  out.graph_emptyLib = { notices: grabNotices(), fileCreated: isFile(cf), nodesCount: canvasEmpty };

  // AI 各入口（有 key、空库）
  try { await p.aiAsk('测试问题'); out.aiAsk_emptyLib = 'NO THROW?!'; } catch (e) { out.aiAsk_emptyLib = e.message; }
  try { await p.aiSynthesis('卫星任务规划', 5, ''); out.aiSynth_emptyLib = 'NO THROW?!'; } catch (e) { out.aiSynth_emptyLib = e.message; }
  try { await p.aiDraftSection('1. 引言'); out.aiDraft_noSurvey = 'NO THROW?!'; } catch (e) { out.aiDraft_noSurvey = e.message; }

  // ===== T2: 无 API Key =====
  p.settings.ai.apiKey = '';
  try { await p.aiAsk('测试'); out.aiAsk_noKey = 'NO THROW?!'; } catch (e) { out.aiAsk_noKey = e.message; }
  try { await p.aiChat('s', 'u'); out.aiChat_noKey = 'NO THROW?!'; } catch (e) { out.aiChat_noKey = e.message; }
  try { await p.aiDraftSection('1. 引言'); out.aiDraft_noKey = 'NO THROW?!'; } catch (e) { out.aiDraft_noKey = e.message; }
  await view.goto('ask');
  await new Promise((r) => setTimeout(r, 400));
  out.ask_emptyState = view.contentEl.querySelector('.jrs-ask-list')?.textContent?.replace(/\s+/g, ' ').slice(0, 80);
  out.ask_submitBtnStillEnabled = ![...view.contentEl.querySelectorAll('button')].find((b) => b.textContent.trim() === '提问')?.disabled;

  // ===== modal 无 try/catch 实证：非法目录 + 点击创建 =====
  p.settings.ai.apiKey = orig.key;
  p.settings.libFolder = 'QA:非法目录';
  app.commands.executeCommandById('jensen-workstation:add-paper');
  await new Promise((r) => setTimeout(r, 300));
  const modalEl = document.querySelector('.modal-container .modal');
  const ti = modalEl?.querySelector('input[type="text"]');
  ti.value = 'QA非法路径点击';
  ti.dispatchEvent(new Event('input', { bubbles: true }));
  ti.dispatchEvent(new Event('change', { bubbles: true }));
  rejections.length = 0;
  const noticesBefore = grabNotices().length;
  [...modalEl.querySelectorAll('button')].find((b) => b.textContent.includes('创建文献笔记'))?.click();
  await new Promise((r) => setTimeout(r, 1200));
  out.modal_badPath = {
    unhandledRejections: [...rejections],
    newNotices: grabNotices().slice(noticesBefore),
    modalStillOpenAfterError: !!document.querySelector('.modal-container .modal'),
    userSeesAnything: rejections.length === 0 && grabNotices().length === noticesBefore ? 'NOTHING（按钮点了没任何反应）' : '有反馈',
  };
  document.querySelector('.modal-container .modal-close-button')?.click();
} finally {
  p.saveSettings = origSave;
  p.settings.libFolder = orig.lib;
  p.settings.surveyNote = orig.survey;
  p.settings.graphCanvas = orig.canvas;
  p.settings.ai.apiKey = orig.key;
  window.removeEventListener('unhandledrejection', onRej);
  for (const f of p.app.vault.getAllLoadedFiles().filter((f) => /^QA空库|^QA/.test(f.path))) {
    try { await p.app.vault.delete(f, true); } catch (e) {}
  }
  // 关掉可能打开的 QA 标签页
  app.workspace.iterateAllLeaves((leaf) => { if (leaf.view?.file?.path && /^QA/.test(leaf.view.file.path)) leaf.detach(); });
}
return JSON.stringify(out, null, 1);
