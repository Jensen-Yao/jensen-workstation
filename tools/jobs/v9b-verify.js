const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('submit');
await new Promise((r) => setTimeout(r, 500));
return JSON.stringify({
  zoneBadges: document.querySelectorAll('.jrs-journal-zone').length,
  first: document.querySelector('.jrs-journal-zone') ? document.querySelector('.jrs-journal-zone').textContent : null,
});
