/* Round1 修复复验：T4 分区误标 / T7 日记ENOENT / T9+F2 数据蒸发链 */
const p = app.plugins.plugins['jensen-workstation'];

/* T4: 分区匹配精度 */
const t4a = p.zoneOf('operations research letters');
const t4b = p.zoneOf('xxejorxx');
const t4c = p.zoneOf('European Journal of Operational Research');
const t4d = p.zoneOf('operations research');
const t4e = await p.lookupJournal('Operations Research Letters');

/* T7: 日记目录不存在 */
const origDaily = p.settings.dailyFolder;
p.settings.dailyFolder = 'QA日记测试/子目录';
const dailySaved = p.settings.dailyFolder;
await p.openDailyNote('2026-10-29');
await new Promise((r) => setTimeout(r, 400));
const qaNote = app.vault.getAbstractFileByPath('QA日记测试/子目录/2026-10-29.md');
if (qaNote) await app.vault.trash(qaNote, true);
/* 清空 QA 目录 */
try { const d = app.vault.getAbstractFileByPath('QA日记测试'); if (d) await app.vault.delete(d, true); } catch (e) {}
p.settings.dailyFolder = origDaily;

/* T9: 路径归一化（尾斜杠/反斜杠） */
const origLib = p.settings.libFolder;
p.settings.libFolder = '科研工作台\\文献\\';
await p.saveSettings();
const normalized = p.settings.libFolder;
p.settings.libFolder = origLib;
await p.saveSettings();

/* F2: 空库图谱防护（内存重定向，不落盘） */
const origLib2 = p.settings.libFolder;
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {}; /* no-op 防污染 */
p.settings.libFolder = 'QA空库不存在';
const emptyNoticed = [];
const origNotice = window.Notice;
window.Notice = function (msg) { emptyNoticed.push(String(msg)); };
await p.generateGraphCanvas(false);
window.Notice = origNotice;
p.settings.libFolder = origLib2;
p.saveSettings = origSave;

return JSON.stringify({
  T4: {
    orl_should_be_null: t4a === null,
    xxejor_null: t4b === null,
    ejor_ok: t4c && t4c.cas === '1区',
    'operations research': t4d && t4d.abbr,
    orl_lookup: t4e.found ? { cas: t4e.cas, ccf: t4e.ccf } : '未收录(合理)',
  },
  T7: { dirCreated: !!qaNote, noCrash: true },
  T9: { normalized },
  F2: { notice: emptyNoticed[0] },
});
