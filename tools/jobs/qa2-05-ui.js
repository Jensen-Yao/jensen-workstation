/* T5: 设置滑杆 —— blur 0 玻璃降级 / 列数 4 后越界坐标 / 剪贴板 / view.smartOpenFile */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
try {
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  await view.goto('home');
  await sleep(250);

  /* A: blurPx=0 玻璃降级 */
  p.settings.blurPx = 0;
  p.applyAppearance();
  await sleep(60);
  const shell = document.querySelector('.jrs-card-shell.od-card, .od-card');
  out.A = {
    cssVar: document.body.style.getPropertyValue('--od-blur'),
    glassClassStillOn: document.body.hasClass('od-glass'),
    computedBackdrop: shell ? getComputedStyle(shell).backdropFilter : 'n/a',
    computedBg: shell ? getComputedStyle(shell).backgroundColor : 'n/a',
  };

  /* B: 列数 6→4，已有卡片 x=6 越界 */
  const board0 = document.querySelector('.jrs-board');
  out.boardW6 = board0 ? board0.clientWidth : null;
  p.settings.columns = 4;
  p.settings.layout.pomo = { x: 6, y: 0, w: 2, h: 2 };
  p.settings.layout.tasks = { x: 3, y: 0, w: 3, h: 2 }; /* w=3 也会被钳到 4 列内? x=3+w=3 → 跨界 */
  await view.goto('home');
  await sleep(250);
  const b2 = document.querySelector('.jrs-board');
  const sPomo = b2.querySelector('[data-card-id="pomo"]');
  const sTasks = b2.querySelector('[data-card-id="tasks"]');
  const rect = (el) => el ? { left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.offsetWidth), styleLeft: el.style.left, styleW: el.style.width } : 'MISSING';
  out.B = {
    boardW4: b2.clientWidth,
    boardRight: Math.round(b2.getBoundingClientRect().right),
    pomo: rect(sPomo),
    tasks: rect(sTasks),
    pomoOffBoard: sPomo ? sPomo.getBoundingClientRect().right > b2.getBoundingClientRect().right + 4 : null,
    pomoOffViewport: sPomo ? sPomo.getBoundingClientRect().right > window.innerWidth + 4 : null,
    tasksOverlapsPomoX: !!(sPomo && sTasks && sTasks.getBoundingClientRect().right > sPomo.getBoundingClientRect().left),
  };

  /* C: 剪贴板导出 */
  out.C = { isSecureContext: window.isSecureContext };
  let prev = '';
  try { const electron = window.require('electron'); prev = electron.clipboard ? electron.clipboard.readText() : ''; out.C.electronClipboard = !!electron.clipboard; } catch (e) { out.C.electronClipboard = 'no-electron: ' + e.message; }
  try { await navigator.clipboard.writeText('__QA_PROBE__'); out.C.writeOk = true; } catch (e) { out.C.writeOk = 'FAIL: ' + e.message; }
  /* 模拟拒绝：临时替换 clipboard 对象 */
  const realCb = navigator.clipboard;
  try {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    await navigator.clipboard.writeText('x');
    out.C.rejectPath = 'unexpected-ok';
  } catch (e) { out.C.rejectPath = 'rejects-as-expected: ' + e.message; }
  finally { Object.defineProperty(navigator, 'clipboard', { value: realCb, configurable: true }); }
  /* 还原用户剪贴板 */
  try { const electron = window.require('electron'); if (electron.clipboard) electron.clipboard.writeText(prev); } catch (e) {}

  /* D: view 上的 smartOpenFile（研究问题/投稿行点击路径） */
  out.D = { type: typeof view.smartOpenFile };
  try { view.smartOpenFile(app.vault.getMarkdownFiles()[0]); out.D.call = 'no-throw'; }
  catch (e) { out.D.call = 'THROW: ' + e.message; }
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
  p.applyAppearance();
  try { const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view; await v.goto('home'); } catch (e) {}
}
return out;
