const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
const out = {};
for (const sec of ['reader', 'ask', 'submit', 'queue']) {
  await v.goto(sec);
  await new Promise((r) => setTimeout(r, 450));
  out[sec] = document.querySelectorAll('.jrs-view button, .jrs-view .jrs-row-title, .jrs-view .od-chip, .jrs-view .od-status').length;
}
return JSON.stringify(out);
