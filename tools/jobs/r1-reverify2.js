const p = app.plugins.plugins['jensen-workstation'];
/* T4a 详情：ORL 应命中缓存自己的 4区，而非 OR */
const t4a = p.zoneOf('operations research letters');
/* F2 文件级：记录图谱 mtime → 空库调用 → mtime 不应变 */
const gpath = p.settings.graphCanvas;
const gfile = app.vault.getAbstractFileByPath(gpath);
const mtimeBefore = gfile ? gfile.stat.mtime : 0;
const origLib = p.settings.libFolder;
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
p.settings.libFolder = 'QA空库不存在2';
await p.generateGraphCanvas(false);
p.settings.libFolder = origLib;
p.saveSettings = origSave;
const gfile2 = app.vault.getAbstractFileByPath(gpath);
const mtimeAfter = gfile2 ? gfile2.stat.mtime : 0;
return JSON.stringify({ orl: t4a, graphUnchanged: mtimeBefore === mtimeAfter });
