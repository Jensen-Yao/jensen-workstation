/* T9: 今日小结 —— 无日记目录写入 / 重复生成覆盖 or 追加 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
try {
  await p.ensureFolder('QA-R2-TMP');
  /* A: dailyFolder 指向不存在目录（设置页允许任意字符串） */
  p.settings.dailyFolder = 'QA-R2-TMP/不存在的日记目录';
  try {
    await p.generateDailyDigest();
    out.A = 'RESOLVED-NO-ERROR（意外）';
  } catch (e) { out.A = 'REJECT: ' + e.message; }
  /* B: 正常目录 → 重复生成是覆盖还是追加 */
  p.settings.dailyFolder = 'QA-R2-TMP/日记';
  await p.ensureFolder('QA-R2-TMP/日记');
  await app.vault.create(p.dailyPath(), '# t\n\n## 今日待办\n\n## 专注记录\n');
  await p.generateDailyDigest();
  await p.generateDailyDigest();
  const f = app.vault.getAbstractFileByPath(p.dailyPath());
  const c = await app.vault.cachedRead(f);
  out.B = { digestHeadingCount: (c.match(/## 今日小结/g) || []).length, pomoLineCount: (c.match(/🍅 专注：/g) || []).length, onceOnly: (c.match(/## 今日小结/g) || []).length === 1 };
  /* C: 命令入口同路径（模拟用户点击 daily-digest 命令、目录缺失时是否有 Notice 反馈）—— 捕获 Notice */
  const notices = [];
  const origNotice = window.Notice;
  /* 插件闭包内 Notice 无法替换，改查 console.error 是否出现未处理拒绝 */
  window.__qaUnhandled = [];
  const h = (ev) => window.__qaUnhandled.push(ev.reason ? String(ev.reason && ev.reason.message || ev.reason) : 'unknown');
  window.addEventListener('unhandledrejection', h);
  p.settings.dailyFolder = 'QA-R2-TMP/不存在的日记目录2';
  try { await app.commands.executeCommandById('jensen-workstation:daily-digest'); out.C = 'no-throw'; } catch (e) { out.C = 'THROW: ' + e.message; }
  await sleep(300);
  window.removeEventListener('unhandledrejection', h);
  out.unhandledAfterCommand = window.__qaUnhandled;
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  /* 关闭 digest 打开的日记标签（仅 QA 临时目录） */
  try { if (p._fileLeaf && p._fileLeaf.view && p._fileLeaf.view.file && String(p._fileLeaf.view.file.path || '').startsWith('QA-R2-TMP')) { p._fileLeaf.detach(); p._fileLeaf = null; } } catch (e) {}
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
