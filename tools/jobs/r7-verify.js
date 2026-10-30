const p = app.plugins.plugins['jensen-workstation'];
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
/* F1: 连续 5 次 goto home，resize 只应触发 1 次 computeMetrics */
let resizeCount = 0;
const origCM = v.computeMetrics.bind(v);
v.computeMetrics = (...args) => { resizeCount++; return origCM(...args); };
for (let i = 0; i < 5; i++) { await v.goto('home'); await new Promise((r) => setTimeout(r, 200)); }
app.workspace.trigger('resize');
await new Promise((r) => setTimeout(r, 300));
v.computeMetrics = origCM;
/* F4: emoji 残留 */
const emojiLeft = ['☕','⚠️','📥','📚','✨','❓','✅','🎯','📎','⭐'].filter((e) => p.settings && false); // settings 里查不了源码，改用 Notice 测试
return JSON.stringify({ v: p.manifest.version, resizeTriggers: resizeCount });
