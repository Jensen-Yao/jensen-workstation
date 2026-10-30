/* T2+T10: 期刊速查 —— 特殊字符 / 同名中文刊 / CCF 首尾词误配 / 全量库强制重载耗时 */
const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const probes = ['EJOR', 'ejor', 'OR', 'Journal of the ACM', 'Journal on ACM', 'Proceedings of Machine Learning Research',
  '(((', '"OR"', '<img src=x onerror=alert(1)>', '宇航学报', '%_like', "IEEE Trans' --", '①②③', '\\backslash'];
out.probes = {};
for (const q of probes) {
  try {
    const r = await p.lookupJournal(q);
    out.probes[q] = { found: r.found, ccf: r.ccf && r.ccf.grade, cas: r.cas, cast: r.cast, target: !!r.target, warn: r.warn };
  } catch (e) { out.probes[q] = 'THROW: ' + e.message; }
}
/* 全量库强制重载（renderSubmit 每次渲染都调 loadJournalCache(true)） */
const jf = app.vault.getAbstractFileByPath('科研工作台/期刊分区缓存.json');
out.cacheBytes = jf ? jf.stat.size : null;
let t0 = performance.now();
await p.loadJournalCache(true);
out.forcedReloadMs = Math.round(performance.now() - t0);
t0 = performance.now();
await p.lookupJournal('journal of scheduling');
out.queryAfterReloadMs = Math.round(performance.now() - t0);
t0 = performance.now();
for (let i = 0; i < 50; i++) await p.lookupJournal('aerospace science and technology');
out.warm50QueriesMs = Math.round(performance.now() - t0);
/* 同名/中文刊 */
out.cn = {};
for (const q of ['中国科学：信息科学', '科学通报', '电子与信息学报', '通信学报']) {
  try { const r = await p.lookupJournal(q); out.cn[q] = { found: r.found, cas: r.cas, ccf: r.ccf && r.ccf.grade, cast: r.cast, xr: r.xr }; }
  catch (e) { out.cn[q] = 'THROW ' + e.message; }
}
return out;
