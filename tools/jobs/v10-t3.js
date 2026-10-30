const p = app.plugins.plugins['jensen-workstation'];
await app.plugins.disablePlugin('jensen-workstation');
await app.plugins.enablePlugin('jensen-workstation');
const p2 = app.plugins.plugins['jensen-workstation'];
await p2.loadJournalCache(true);
const r1 = await p2.lookupJournal('Applied Soft Computing');
const r2 = await p2.lookupJournal('Swarm and Evolutionary Computation');
const r3 = await p2.lookupJournal('IEEE Transactions on Aerospace and Electronic Systems');
const r4 = await p2.lookupJournal('自然资源学报');
return JSON.stringify({
  cache: { cas: Object.keys(p2._jcache.cas).length, xr: Object.keys(p2._jcache.xr).length },
  asoc: { cas: r1.cas, top: r1.casTop },
  sevc: { cas: r2.cas, top: r2.casTop, xr: r2.xr },
  taes: { cas: r3.cas, top: r3.casTop, cast: r3.cast },
  chinese: { cas: r4.cas, cat: r4.cat },
});
