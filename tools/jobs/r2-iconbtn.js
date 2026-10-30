const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('home');
await new Promise((r) => setTimeout(r, 800));
const btns = [...document.querySelectorAll('.od-card-ctrl .od-icon-btn')];
const out = { count: btns.length, results: [] };
for (const b of btns.slice(0, 3)) {
  const before = document.querySelectorAll('.modal-container').length;
  window.__m = 0;
  const ob = new MutationObserver(() => window.__m++);
  ob.observe(document.body, { subtree: true, childList: true });
  try { b.click(); } catch (e) { out.results.push('click-throw: ' + e.message.slice(0, 60)); }
  await new Promise((r) => setTimeout(r, 300));
  const after = document.querySelectorAll('.modal-container').length;
  out.results.push({ title: b.getAttribute('title'), mutations: window.__m, modalDelta: after - before });
  const mc = document.querySelector('.modal-container .modal-close-button'); if (mc) mc.click();
  await new Promise((r) => setTimeout(r, 200));
  ob.disconnect();
}
return JSON.stringify(out);
