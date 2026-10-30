const p = app.plugins.plugins['jensen-workstation'];
const out = { zoneOf: {}, lookup: {} };
const cases = [
  '', '   ', '\t', 'ejor', 'EJOR', '  Ejor  ', 'EJOR ',
  'operations research letters',
  'OPERATIONS RESEARCH LETTERS',
  'operations research',
  'ieee transactions on aerospace and electronic systems',
  'IEEE TAES', 'journal of scheduling', 'networks', '期刊😀🎉', '📕📖',
  'a'.repeat(300), '宇航学报', '宇航学报 ', 123, 'EJOR期刊', 'xxEJORxx',
];
for (const c of cases) {
  const key = JSON.stringify(String(c)).slice(0, 40);
  try {
    const z = p.zoneOf(c);
    out.zoneOf[key] = z ? { abbr: z.abbr, cas: z.cas, ccf: z.ccf, tier: z.tier } : null;
  } catch (e) { out.zoneOf[key] = 'THROW: ' + e.message; }
}
// lookupJournal 是 async
for (const c of ['', '   ', '😀🎉📚', 'a'.repeat(200), 'operations research letters', 'ejor', 'xxEJORxx', 'IEEE TAES']) {
  const key = JSON.stringify(String(c)).slice(0, 30);
  try {
    const r = await p.lookupJournal(c);
    out.lookup[key] = { found: r.found, cas: r.cas, ccf: r.ccf && r.ccf.grade, cast: r.cast, target: !!r.target, warn: r.warn };
  } catch (e) { out.lookup[key] = 'THROW: ' + e.message; }
}
// zoneOf 对 null / undefined / 数字
out.zoneOfNull = (() => { try { return p.zoneOf(null); } catch (e) { return 'THROW ' + e.message; } })();
out.zoneOfUndef = (() => { try { return p.zoneOf(undefined); } catch (e) { return 'THROW ' + e.message; } })();
return JSON.stringify(out, null, 1);
