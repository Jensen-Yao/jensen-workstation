const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const isFile = (x) => !!x && typeof x.path === 'string' && x.children === undefined;
const grabNotices = () => [...document.querySelectorAll('.notice')].map((n) => n.textContent.trim().slice(0, 100));
const rejections = [];
const onRej = (e) => rejections.push(String(e.reason?.message || e.reason).slice(0, 100));
window.addEventListener('unhandledrejection', onRej);
const origLib = p.settings.libFolder;
try {
  p.settings.libFolder = 'QA-测试/文献';

  // (a) 同题并发（模拟入库按钮连点两次：两个 createPaperNote 几乎同时跑）
  const r = await Promise.allSettled([
    p.createPaperNote({ title: 'QA并发同题', year: '2025', topics: [], status: '待读' }, false),
    p.createPaperNote({ title: 'QA并发同题', year: '2025', topics: [], status: '待读' }, false),
  ]);
  out.a_concurrent = r.map((x) => x.status === 'fulfilled' ? 'OK:' + x.value.path.slice(0, 50) : 'REJECT:' + x.reason.message.slice(0, 60));
  await new Promise((s) => setTimeout(s, 400));
  out.a_filesCreated = p.app.vault.getAllLoadedFiles().filter((f) => /QA并发同题/.test(f.path)).map((f) => f.path);
  out.a_notices = grabNotices();
  out.a_unhandled = [...rejections];

  // (b) 同题第三次（当天同名+日期后缀都存在）
  const r3 = await Promise.allSettled([
    p.createPaperNote({ title: 'QA并发同题', year: '2025', topics: [], status: '待读' }, false),
  ]);
  out.b_third = r3[0].status === 'fulfilled' ? 'OK（没炸？）' : 'REJECT:' + r3[0].reason.message.slice(0, 60);
  out.b_unhandled = [...rejections];
  out.b_notices = grabNotices();

  // (c) AddPaperModal 双击「创建文献笔记」（真实 UI 路径：命令打开模态）
  app.commands.executeCommandById('jensen-workstation:add-paper');
  await new Promise((s) => setTimeout(s, 300));
  const modalEl = document.querySelector('.modal-container .modal');
  out.c_modalOpened = !!modalEl;
  const titleInput = modalEl?.querySelector('input[type="text"]');
  titleInput.value = 'QA模态双击';
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  const btn = [...modalEl.querySelectorAll('button')].find((b) => b.textContent.includes('创建文献笔记'));
  out.c_btnFound = !!btn;
  out.c_btnDisabledBefore = btn?.disabled;
  rejections.length = 0;
  btn.click(); btn.click(); // 连点两次
  await new Promise((s) => setTimeout(s, 1200));
  out.c_unhandled = [...rejections];
  out.c_notices = grabNotices();
  out.c_filesCreated = p.app.vault.getAllLoadedFiles().filter((f) => /QA模态双击/.test(f.path)).map((f) => f.path);
  out.c_modalStillOpen = !!document.querySelector('.modal-container .modal');
  document.querySelector('.modal-container .modal-close-button')?.click();
  document.querySelector('.modal-bg')?.click();

  // (d) 知识问答：双回车并发提交（stub aiAsk，不花 token）
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view;
  await view.goto('ask');
  await new Promise((s) => setTimeout(s, 300));
  const input = view.contentEl.querySelector('.jrs-ask-input input');
  out.d_inputFound = !!input;
  let aiAskCalls = 0;
  const origAiAsk = p.aiAsk.bind(p);
  const origAppend = p.appendAskLog.bind(p);
  p.aiAsk = async (q) => { aiAskCalls += 1; await new Promise((s) => setTimeout(s, 400)); return { q, a: 'stub回答', sources: [] }; };
  p.appendAskLog = async () => {};
  input.value = 'QA双回车问题：网格热力图？';
  const kd = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  input.dispatchEvent(kd); input.dispatchEvent(kd); // 同一帧两次回车
  await new Promise((s) => setTimeout(s, 1200));
  out.d_aiAskCallsAfterDoubleEnter = aiAskCalls;
  p.aiAsk = origAiAsk; p.appendAskLog = origAppend;
} finally {
  p.settings.libFolder = origLib;
  window.removeEventListener('unhandledrejection', onRej);
  // 清理本测试创建的文件
  for (const f of p.app.vault.getAllLoadedFiles().filter((f) => /QA并发同题|QA模态双击/.test(f.path))) {
    try { await p.app.vault.delete(f, true); } catch (e) {}
  }
}
return JSON.stringify(out, null, 1);
