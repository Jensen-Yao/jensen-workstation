const p = app.plugins.plugins['jensen-workstation'];
/* T12: appendAskLog 不再炸 */
let askLogOk = false;
try { await p.appendAskLog({ q: 'R3测试', a: '修复验证', sources: [] }); askLogOk = true; } catch (e) { askLogOk = e.message; }
/* T3: smartOpenFile 存在于 plugin */
const smartOk = typeof p.smartOpenFile === 'function';
/* T2: CCF 误配修复 */
const j1 = await p.lookupJournal('Journal on ACM');
const j2 = await p.lookupJournal('Journal of the ACM');
/* T5: backdrop-filter 变量化 */
await p.activateDashboard();
const card = document.querySelector('.od-card');
const blurVal = card ? getComputedStyle(card).backdropFilter : 'n/a';
/* T11: NaN 防护 */
const g = p.zoneOf('');  /* 应返回 null */
return JSON.stringify({ v: p.manifest.version, askLogOk, smartOk, jacmFake: j1.ccf ? j1.ccf.grade : null, jacmReal: j2.ccf ? j2.ccf.grade : null, blur: (blurVal || '').slice(0, 40) });
