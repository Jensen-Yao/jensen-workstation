/* 清理 + 还原验证 */
const p = app.plugins.plugins['jensen-workstation'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
try {
  /* 1. 关闭残留弹窗 */
  let closed = 0;
  for (let i = 0; i < 12; i++) { const b = document.querySelector('.modal-container .modal-header-button'); if (!b) break; b.click(); closed++; await sleep(60); }
  out.modalsClosed = closed;

  /* 2. 删除 QA 临时目录（进系统回收站，可恢复） */
  const tf = app.vault.getAbstractFileByPath('QA-R2-TMP');
  if (tf) { await app.vault.trash(tf, true); out.tempFolderTrashed = true; }
  else out.tempFolderTrashed = 'already-gone';

  /* 3. 删除测试创建的 AI问答 今日日志（基线不存在） */
  const askPath = '科研工作台/AI问答/' + window.moment().format('YYYY-MM-DD') + '.md';
  if (window.__qaR2AskCreated) {
    const af = app.vault.getAbstractFileByPath(askPath);
    if (af) { await app.vault.trash(af, true); out.askLogTrashed = true; }
  } else out.askLogTrashed = 'not-created-by-qa';

  /* 4. 若残留指向临时目录的 _fileLeaf 已清理；确认 tabs 无 QA 文件 */
  out.qaTabsLeft = app.workspace.getLeavesOfType('markdown').concat(app.workspace.getLeavesOfType('base')).filter((l) => l.view && l.view.file && String(l.view.file.path).startsWith('QA-R2-TMP')).length;

  /* 5. 设置还原验证（与基线快照深比较） */
  await sleep(200);
  out.settingsEqualBaseline = JSON.stringify(p.settings) === JSON.stringify(window.__qaR2Baseline.settings);
  if (!out.settingsEqualBaseline) {
    const a = p.settings; const b = window.__qaR2Baseline.settings;
    out.settingsDiff = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  }

  /* 6. 界面恢复 */
  try { const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view; await v.goto('home'); } catch (e) { out.renderErr = e.message; }
  p.applyAppearance();

  /* 7. 环境终态 */
  out.final = {
    pomoPhase: p.pomo.phase,
    pomoListeners: p.pomo.listeners.size,
    dashLeaves: app.workspace.getLeavesOfType('jrs-dashboard').length,
    sideLeaves: app.workspace.getLeavesOfType('jrs-sidepanel').length,
    modalsLeft: document.querySelectorAll('.modal-container').length,
    windowSize: [window.innerWidth, window.innerHeight],
    tempFolderGone: !app.vault.getAbstractFileByPath('QA-R2-TMP'),
    askLogGone: !app.vault.getAbstractFileByPath(askPath),
    papersCount: p.getPapers().length,
    userSubmissionsIntact: p.settings.submissionsFolder,
  };
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
return out;
