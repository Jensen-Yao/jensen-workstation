/* T6: 窄窗口 600px —— 侧栏/看板吸附/期刊卡网格溢出测量（结束后还原窗口尺寸） */
const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const w0 = window.innerWidth; const h0 = window.innerHeight;
try {
  window.resizeTo(600, 700);
  await sleep(600);
  out.size = [window.innerWidth, window.innerHeight];
  out.resized = window.innerWidth <= 620;
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  const ov = (sel) => { const el = document.querySelector(sel); return el ? { sw: el.scrollWidth, cw: el.clientWidth, overX: el.scrollWidth - el.clientWidth } : 'missing'; };
  await view.goto('home');
  await sleep(300);
  out.home = { shell: ov('.jrs-shell'), main: ov('.jrs-main'), page: ov('.jrs-page'), hero: ov('.jrs-hero-actions') };
  const shellCard = document.querySelector('.jrs-card-shell');
  out.minCardW = shellCard ? Math.round(shellCard.offsetWidth) : null;
  out.colW = view._metrics ? { cols: view._metrics.cols, colW: Math.round(view._metrics.colW), boardW: view._metrics.boardW } : null;
  await view.goto('submit');
  await sleep(300);
  const jg = document.querySelector('.jrs-journal-grid');
  out.journalGrid = jg ? { sw: jg.scrollWidth, cw: jg.clientWidth, overX: jg.scrollWidth - jg.clientWidth, gridCols: getComputedStyle(jg).gridTemplateColumns.split(' ').length } : 'missing';
  const jc = document.querySelector('.jrs-journal');
  out.journalCardW = jc ? Math.round(jc.getBoundingClientRect().width) : null;
  out.submitPage = ov('.jrs-page');
  await view.goto('queue');
  await sleep(250);
  out.queuePage = ov('.jrs-page');
  /* 侧栏工具面板在 600px 下的表现 */
  await p.activateSidePanel();
  await sleep(300);
  const side = document.querySelector('.jrs-side');
  out.side = side ? { w: side.clientWidth, overX: side.scrollWidth - side.clientWidth, inputW: document.querySelector('.jrs-side-input') ? document.querySelector('.jrs-side-input').clientWidth : null } : 'missing';
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  window.resizeTo(w0, h0);
  await sleep(500);
  out.restoredSize = [window.innerWidth, window.innerHeight];
  try { const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view; await v.goto('home'); } catch (e) {}
}
return out;
