/* T8: 快速捕获 —— 超长想法 / 换行注入 / 收件箱今日文件被改成表格 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = {};
const today = window.moment().format('YYYY-MM-DD');
try {
  await p.ensureFolder('QA-R2-TMP');
  p.settings.inboxFolder = 'QA-R2-TMP/收件箱';
  const path = 'QA-R2-TMP/收件箱/' + today + '.md';

  await p.captureThought('正常想法一条');
  await p.captureThought('第一行\n- [ ] 伪任务注入\n## 假标题注入');
  let f = app.vault.getAbstractFileByPath(path);
  let c = await app.vault.cachedRead(f);
  out.afterInject = c.split('\n').slice(-4);
  out.injectedTaskPresent = c.includes('- [ ] 伪任务注入');
  out.injectedHeadingPresent = c.includes('## 假标题注入');
  out.parsedInboxAfterInject = await p.getInboxToday();

  await p.captureThought('长'.repeat(8000));
  f = app.vault.getAbstractFileByPath(path);
  out.longThought = { appended: (await app.vault.cachedRead(f)).includes('长'.repeat(1000)), fileBytes: f.stat.size, threw: false };

  /* 今日文件被用户改成表格 */
  await app.vault.modify(f, '| a | b |\n| --- | --- |\n| 1 | 2 |');
  await p.captureThought('表格后追加');
  c = await app.vault.cachedRead(f);
  out.afterTable = c.split('\n').slice(-3);
  out.blankLineBeforeListItem = /\n\n- \d{2}:\d{2} 表格后追加/.test(c);
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
