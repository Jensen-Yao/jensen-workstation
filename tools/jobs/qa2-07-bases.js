/* T7: Bases —— libFolder 含空格的 YAML 过滤器引号 / 重复生成覆盖行为 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
try {
  await p.ensureFolder('QA-R2-TMP');
  p.settings.basesFolder = 'QA-R2-TMP/Bases';
  p.settings.libFolder = 'QA Space Lib 文献'; /* 含空格 */
  await p.generateBases();
  await sleep(150);
  const dir = app.vault.getAbstractFileByPath('QA-R2-TMP/Bases');
  out.filesAfterGen1 = dir ? dir.children.map((c) => c.name) : 'missing';
  const read = async (n) => { const f = app.vault.getAbstractFileByPath('QA-R2-TMP/Bases/' + n); return f ? await app.vault.cachedRead(f) : null; };
  const c1 = await read('文献库.base');
  out.filterLines = c1.split('\n').filter((l) => l.includes('inFolder') || l.includes('filters'));
  out.viewLines = c1.split('\n').filter((l) => l.includes('status =='));
  await sleep(100);
  await p.generateBases();
  await sleep(150);
  const c2 = await read('文献库.base');
  const dir2 = app.vault.getAbstractFileByPath('QA-R2-TMP/Bases');
  out.regenIdentical = c1 === c2;
  out.filesAfterGen2 = dir2.children.map((c) => c.name);
  out.noDupFiles = dir2.children.length === 2;
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  /* 关掉 generateBases 打开的 .base 标签页（仅当指向 QA 临时目录） */
  try {
    if (p._fileLeaf && p._fileLeaf.view && p._fileLeaf.view.file && String(p._fileLeaf.view.file.path || '').startsWith('QA-R2-TMP')) { p._fileLeaf.detach(); p._fileLeaf = null; }
  } catch (e) {}
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
