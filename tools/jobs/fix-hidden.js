const p = app.plugins.plugins['jensen-workstation'];
const before = [...p.settings.hiddenCards];
p.settings.hiddenCards = [];
await p.saveSettings();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('home');
await new Promise((r) => setTimeout(r, 900));
return JSON.stringify({
  wasHidden: before,
  cardsNow: document.querySelectorAll('.jrs-card-shell').length,
  cardIds: [...document.querySelectorAll('.jrs-card-shell')].map((c) => c.dataset.cardId),
});
