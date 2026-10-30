const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
await new Promise((r) => setTimeout(r, 900));
const hero = document.querySelector('.jrs-hero-center');
return JSON.stringify({
  searchInHero: !!hero.querySelector('.od-search'),
  centered: hero.querySelector('.jrs-hero-brand') ? getComputedStyle(hero).alignItems : '?',
  cards: document.querySelectorAll('.jrs-card-shell').length,
});
