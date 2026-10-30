/* T4: 投稿管线 —— 九态循环 / 非法截止日 / 昨天-今天 / 冒号+超长自定义期刊名 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = {};
try {
  await p.ensureFolder('QA-R2-TMP');
  p.settings.submissionsFolder = 'QA-R2-TMP/投';

  /* A: 非法截止日 2026-13-99 */
  const sub = await p.createSubmission('QA测试论文', 'QA R2 Journal', '2026-13-99', '');
  out.createdPath = sub.path;
  let fm = app.metadataCache.getFileCache(sub);
  out.A = { deadline: fm && fm.frontmatter && fm.frontmatter.deadline, status: fm && fm.frontmatter && fm.frontmatter.status };
  const calc = (dl) => window.moment(dl, 'YYYY-MM-DD').diff(window.moment().startOf('day'), 'days');
  out.A.daysBad = calc('2026-13-99');

  /* 渲染 submit 区段看真实 UI 文案 */
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  await view.goto('submit');
  await new Promise((r) => setTimeout(r, 200));
  out.A.uiHint = ([...document.querySelectorAll('.jrs-submit-row .od-hint')].map((e) => e.textContent).find((t) => t.includes('QA测试论文')) || 'ROW-NOT-FOUND');

  /* B: 截止日=昨天 / =今天 */
  const y = window.moment().subtract(1, 'day').format('YYYY-MM-DD');
  const td = window.moment().format('YYYY-MM-DD');
  out.B = { yesterday: calc(y), today: calc(td), yesterdayUI: calc(y) < 0 ? `截稿已过 ${-calc(y)} 天` : 'ok', todayUI: calc(td) >= 0 ? `截稿还剩 ${calc(td)} 天` : 'ok' };

  /* C: 九态循环 10 次 */
  const seq = [];
  for (let i = 0; i < 10; i++) {
    await p.cycleSubmission({ file: sub });
    seq.push(app.metadataCache.getFileCache(sub).frontmatter.status);
  }
  out.C = { seq, nineUnique: new Set(seq.slice(0, 9)).size === 9, wrapsToStart: seq[9] === '写作中' };

  /* D: 垃圾状态（手改 frontmatter）后 cycle */
  await app.fileManager.processFrontMatter(sub, (f) => { f.status = '幽灵状态'; });
  await p.cycleSubmission({ file: sub });
  out.D = { afterGarbageCycle: app.metadataCache.getFileCache(sub).frontmatter.status };

  /* E: 自定义期刊名含冒号 → YAML 注入 */
  const sub2 = await p.createSubmission('QA冒号论文', 'IEEE Trans: Systems & Robots', '', '');
  fm = app.metadataCache.getFileCache(sub2);
  out.E = { frontmatterParsed: !!fm.frontmatter, target: fm.frontmatter && fm.frontmatter.target, title: fm.frontmatter && fm.frontmatter.title, subRowWouldShow: fm.frontmatter ? `${fm.frontmatter.title || sub2.basename} → ${fm.frontmatter.target || ''}` : 'FM-BROKEN' };
  /* getSubmissions 视角 */
  const subsView = p.getSubmissions().filter((s) => s.file.path.startsWith('QA-R2-TMP'));
  out.E.parsedTarget = subsView.find((s) => s.file.path === sub2.path).target;

  /* F: 超长自定义期刊名 300 字符 */
  const long = 'Q'.repeat(300);
  const sub3 = await p.createSubmission('QA超长论文', long, '', '');
  out.F = { pathLen: sub3.path.length, nameClamped: sub3.name || sub3.basename, fmTargetLen: (app.metadataCache.getFileCache(sub3).frontmatter.target || '').length };

  /* G: 同名同日重复创建 → 文件名冲突处理 */
  const sub4 = await p.createSubmission('QA测试论文', 'QA R2 Journal', '', '');
  out.G = { dupPath: sub4.path, distinct: sub4.path !== sub.path };
  const sub5try = await p.createSubmission('QA测试论文', 'QA R2 Journal', '', '').catch((e) => 'THROW: ' + e.message);
  out.G.thirdCreate = typeof sub5try === 'string' ? sub5try : sub5try.path;
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
