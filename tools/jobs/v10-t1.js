const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
/* 1) 内置库查询（未下载全量前） */
const r1 = await p.lookupJournal('GECCO');
const r2 = await p.lookupJournal('Journal of Scheduling');
const r3 = await p.lookupJournal('European Journal of Operational Research');
const r4 = await p.lookupJournal('宇航学报');
const r5 = await p.lookupJournal('Wireless Personal Communications');
/* 2) 速查器 UI 就位 */
await v.goto('submit');
await new Promise((r) => setTimeout(r, 500));
return JSON.stringify({
  gecco: r1, sched: { ccf: r2.ccf, cast: r2.cast }, ejor: { cas: r3.cas, cast: r3.cast, target: r3.target },
  yuhang: { cast: r4.cast }, warn: r5.warn ? '⚠️' + r5.warn : null,
  uiInput: !!document.querySelector('.jrs-lookup-out'),
});
