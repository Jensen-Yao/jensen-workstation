/* T1: SidePanelView — 连续开关 + 番茄钟引擎同步 + 重开后状态 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = { steps: [] };
try {
  await p.activateDashboard();
  const leaf = app.workspace.getLeavesOfType('jrs-dashboard')[0];
  const view = leaf.view;
  await view.goto('home');
  await new Promise((r) => setTimeout(r, 200));
  const base0 = p.pomo.listeners.size;

  /* A: 连续开关 3 次（基线已有 1 个侧栏叶，测试后须恢复为 1） */
  for (let i = 0; i < 3; i++) {
    await p.activateSidePanel();
    const sl = app.workspace.getLeavesOfType('jrs-sidepanel');
    out.steps.push(`open#${i} leaves=${sl.length} listeners=${p.pomo.listeners.size}`);
    if (sl.length > 1) sl[sl.length - 1].detach(); /* 防堆积，只留一个 */
    else sl[0].detach();
    await new Promise((r) => setTimeout(r, 80));
  }
  out.listenersDeltaAfterToggle = p.pomo.listeners.size - base0;

  /* B: 侧栏开始 → 主页卡片是否走字 */
  await p.activateSidePanel();
  const sv = app.workspace.getLeavesOfType('jrs-sidepanel')[0].view;
  out.sideViewType = sv.getViewType();
  sv._miniStart.click();
  await new Promise((r) => setTimeout(r, 2400));
  out.dashClock = view._pomoClock ? view._pomoClock.textContent : 'NO-CLOCK';
  out.sideClock = sv._miniClock ? sv._miniClock.textContent : 'NO-CLOCK';
  out.clockInSync = out.dashClock === out.sideClock && /^\d{2}:\d{2}$/.test(out.dashClock) && out.dashClock !== '25:00';
  out.phaseAfterStart = p.pomo.phase;
  out.miniBtnWhileRunning = sv._miniStart.textContent;

  /* C: 计时中关闭侧栏再打开 → 迷你钟应恢复显示运行态 */
  app.workspace.getLeavesOfType('jrs-sidepanel')[0].detach();
  await new Promise((r) => setTimeout(r, 120));
  await p.activateSidePanel();
  const sv2 = app.workspace.getLeavesOfType('jrs-sidepanel')[0].view;
  out.reopenMiniClock = sv2._miniClock.textContent;
  out.reopenBtnLabel = sv2._miniStart.textContent;
  out.reopenListeners = p.pomo.listeners.size;
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  try { p.pomo.reset(); } catch (e) {}
  /* 恢复侧栏叶数量到基线 1 */
  const cur = app.workspace.getLeavesOfType('jrs-sidepanel').length;
  if (cur === 0) { try { await p.activateSidePanel(); } catch (e) {} }
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
  p.applyAppearance();
}
out.finalPhase = p.pomo.phase;
out.finalSideLeaves = app.workspace.getLeavesOfType('jrs-sidepanel').length;
return out;
