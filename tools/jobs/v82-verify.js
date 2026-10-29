const p = app.plugins.plugins['jensen-workstation'];
/* 验证：主页卡片数、分区匹配、期刊卡分区徽章、标签复用 */
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('home');
await new Promise((r) => setTimeout(r, 700));
const homeCards = document.querySelectorAll('.jrs-card-shell').length;
await v.goto('submit');
await new Promise((r) => setTimeout(r, 500));
const zoneBadges = document.querySelectorAll('.jrs-journal-zone').length;
const zoneMatch = { ejor: p.journalZone('EJOR'), ast: p.journalZone('Aerospace Science and Technology'), none: p.journalZone('野鸡刊') };
/* 连续打开两个文件：应复用同一标签 */
const f1 = app.vault.getAbstractFileByPath('科研工作台/综述大纲.md');
await new Promise((r) => setTimeout(r, 900));
const papers0 = p.getPapers();
if (!papers0.length) return JSON.stringify({ err: 'papers empty after reload' });
const f2 = papers0[0].file;
await p.smartOpenFile(f1);
await p.smartOpenFile(f2);
let leaves = 0; app.workspace.iterateAllLeaves((l) => leaves += 1);
/* 再回主页确认 */
await p.activateDashboard();
const homeCards2 = document.querySelectorAll('.jrs-card-shell').length;
return JSON.stringify({ homeCards, zoneBadges, zoneMatch, leavesAfterTwoOpens: leaves, homeCards2 });
