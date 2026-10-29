/* 现场救援：关多余标签 + 恢复被隐藏的卡片 */
const p = app.plugins.plugins['jensen-workstation'];
/* 1) 收集所有叶子 */
const keepTypes = new Set(['jrs-dashboard', 'jrs-library']);
let closedMain = 0; let closedRight = 0;
const leaves = [];
app.workspace.iterateAllLeaves((l) => leaves.push(l));
for (const leaf of leaves) {
  const vt = leaf.view && leaf.view.getViewType ? leaf.view.getViewType() : '';
  if (keepTypes.has(vt)) continue;
  try {
    app.workspace.detachLeaf(leaf);
    if (leaf.getRoot && leaf.getRoot() === app.workspace.rightSplit) closedRight += 1;
    else closedMain += 1;
  } catch (e) { /* 忽略 */ }
}
/* 2) 恢复卡片显隐 + 重置可疑布局标记 */
const before = p.settings.hiddenCards.length;
p.settings.hiddenCards = [];
await p.saveSettings();
/* 3) 打开仪表盘验证 */
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view;
if (v) { v.editing = false; await v.goto('home'); }
await new Promise((r) => setTimeout(r, 900));
const cards = document.querySelectorAll('.jrs-card-shell').length;
let remaining = 0;
app.workspace.iterateAllLeaves(() => remaining += 1);
return JSON.stringify({ closedMain, closedRight, hiddenBefore: before, cardsNow: cards, leavesRemaining: remaining });
