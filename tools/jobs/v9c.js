await app.plugins.disablePlugin('jensen-workstation');
await app.plugins.enablePlugin('jensen-workstation');
const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('submit');
await new Promise((r) => setTimeout(r, 600));
const badges = [...document.querySelectorAll('.jrs-journal-zone')].map((b) => b.textContent);
await v.goto('home');
await new Promise((r) => setTimeout(r, 700));
return JSON.stringify({
  zoneBadges: badges.length,
  sample: badges.slice(0, 4),
  homeCards: document.querySelectorAll('.jrs-card-shell').length,
});
