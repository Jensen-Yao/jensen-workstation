const p = app.plugins.plugins['jensen-workstation'];
/* 1) 下载全量库（真实网络） */
const dl = await p.downloadJournalDB();
/* 2) 查非内置期刊：中科院2025 + 新锐2026 */
const r1 = await p.lookupJournal('Applied Soft Computing');
const r2 = await p.lookupJournal('Swarm and Evolutionary Computation');
const r3 = await p.lookupJournal('Chinese Journal of Aeronautics');
/* 3) venue 自动分级冒烟：模拟添加文献 */
return JSON.stringify({
  dl,
  asoc: { cas: r1.cas, top: r1.casTop, cat: r1.cat, xr: r1.xr },
  sevc: { cas: r2.cas, top: r2.casTop, xr: r2.xr },
  cja: { cas: r3.cas, top: r3.casTop, cast: r3.cast },
});
