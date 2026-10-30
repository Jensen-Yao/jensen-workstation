const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
/* F1: 自适应列数（用户真实布局 380px leaf） */
await v.goto('home');
await new Promise((r) => setTimeout(r, 800));
const board = document.querySelector('.jrs-board');
const boardW = board?.clientWidth || 0;
const metrics = v._metrics;
const cardWs = [...document.querySelectorAll('.jrs-card-shell')].map((c) => c.getBoundingClientRect().width);
const minCardW = Math.min(...cardWs);
/* F4: submit 收件箱 */
await v.goto('submit');
await new Promise((r) => setTimeout(r, 600));
const inboxCard = [...document.querySelectorAll('.jrs-section-heading h2')].some((h) => h.textContent.includes('收件箱'));
return JSON.stringify({
  v: p.manifest.version,
  board: { width: boardW, effectiveCols: metrics?.cols, colW: Math.round(metrics?.colW || 0), minCardW: Math.round(minCardW) },
  inboxCard,
});
