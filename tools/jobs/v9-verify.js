const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
/* 1) 主页 */
await v.goto('home');
await new Promise((r) => setTimeout(r, 800));
const homeCards = document.querySelectorAll('.jrs-card-shell').length;
/* 2) 投稿冲刺分区徽章 */
await v.goto('submit');
await new Promise((r) => setTimeout(r, 500));
const zoneBadges = document.querySelectorAll('.jrs-journal-zone').length;
/* 3) Crossref 实测 */
const cr = await p.searchCrossref('satellite scheduling grid', 8);
const withVenue = cr.filter((x) => x.venue).length;
const zoneHits = cr.map((x) => ({ v: x.venue.slice(0, 30), z: p.zoneOf(x.venue) ? p.zoneOf(x.venue).abbr + p.zoneOf(x.venue).cas : null }));
/* 4) zoneOf 单测 */
const t1 = p.zoneOf('European Journal of Operational Research');
const t2 = p.zoneOf('Aerospace Science and Technology');
const t3 = p.zoneOf('arXiv');
return JSON.stringify({
  homeCards, zoneBadges,
  crossref: { total: cr.length, withVenue, sample: zoneHits.slice(0, 5) },
  zoneUnit: { ejor: t1 && t1.cas, ast: t2 && t1 ? (t2 && t2.cas) : null, arxiv: t3 },
});
