const p = app.plugins.plugins['jensen-workstation'];
if (!p) return '插件未加载';
window.__errs = [];
const oe = console.error;
console.error = function () { window.__errs.push([].map.call(arguments, (x) => String(x && (x.stack || x))).join(' ').slice(0, 300)); oe.apply(null, arguments); };
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('home');
await new Promise((r) => setTimeout(r, 1000));
console.error = oe;
return JSON.stringify({
  errs: window.__errs.slice(0, 3),
  navCount: document.querySelectorAll('.jrs-nav-item').length,
  cardCount: document.querySelectorAll('.jrs-card-shell').length,
  boardExists: !!document.querySelector('.jrs-board'),
  heroExists: !!document.querySelector('.jrs-hero'),
  section: v.section,
});
