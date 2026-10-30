/* T4b: 投稿管线 —— 原始文件内容断言（避开 metadataCache 竞态） */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await p.ensureFolder('QA-R2-TMP');
  p.settings.submissionsFolder = 'QA-R2-TMP/投';

  /* A: 非法截止日 —— 原始 YAML + 等 cache 后的 UI 渲染 */
  const sub = await p.createSubmission('QA测试论文B', 'QA R2 Journal', '2026-13-99', '');
  out.rawYamlBadDeadline = (await app.vault.cachedRead(sub)).split('---')[1];
  await sleep(500);
  const fmA = app.metadataCache.getFileCache(sub);
  out.fmAfterWait = { hasFm: !!fmA, hasFrontmatter: !!(fmA && fmA.frontmatter), deadline: fmA && fmA.frontmatter && fmA.frontmatter.deadline };
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  await view.goto('submit');
  await sleep(400);
  out.uiHintBadDeadline = ([...document.querySelectorAll('.jrs-submit-row')].map((r) => r.textContent).find((t) => t.includes('QA测试论文B')) || 'ROW-NOT-FOUND');

  /* B: 冒号期刊名 —— 原始 YAML + cache 解析结果 */
  const sub2 = await p.createSubmission('QA冒号论文B', 'IEEE Trans: Systems', '', '');
  out.rawYamlColon = (await app.vault.cachedRead(sub2)).split('---')[1];
  await sleep(500);
  const fmB = app.metadataCache.getFileCache(sub2);
  out.fmColon = { hasFrontmatter: !!(fmB && fmB.frontmatter), target: fmB && fmB.frontmatter && fmB.frontmatter.target, title: fmB && fmB.frontmatter && fmB.frontmatter.title };
  const s2 = p.getSubmissions().find((s) => s.file.path === sub2.path);
  out.submissionView = s2 ? { title: s2.title, target: s2.target, status: s2.status } : 'NOT-LISTED';

  /* C: 超长自定义名 */
  const long = 'Q'.repeat(300);
  const sub3 = await p.createSubmission('QA超长论文B', long, '', '');
  out.longName = { pathLen: sub3.path.length, basenameLen: sub3.basename.length, fmTargetLen: ((app.metadataCache.getFileCache(sub3) || {}).frontmatter || {}).target ? String(((app.metadataCache.getFileCache(sub3) || {}).frontmatter || {}).target).length : 'pending' };
  await sleep(400);
  out.longName.fmTargetLen = String(((app.metadataCache.getFileCache(sub3) || {}).frontmatter || {}).target || '').length;

  /* D: 垃圾状态 cycle（等 cache） */
  await app.fileManager.processFrontMatter(sub, (f) => { f.status = '幽灵状态'; });
  await sleep(400);
  out.beforeCycle = app.metadataCache.getFileCache(sub).frontmatter.status;
  await p.cycleSubmission({ file: sub });
  await sleep(400);
  out.afterCycle = app.metadataCache.getFileCache(sub).frontmatter.status;

  /* E: 昨天截止（渲染文案） */
  const y = window.moment().subtract(1, 'day').format('YYYY-MM-DD');
  const sub4 = await p.createSubmission('QA昨天截止', 'EJOR', y, '');
  await sleep(500);
  await view.goto('submit');
  await sleep(400);
  out.uiHintYesterday = ([...document.querySelectorAll('.jrs-submit-row')].map((r) => r.textContent).find((t) => t.includes('QA昨天截止')) || 'ROW-NOT-FOUND');
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
