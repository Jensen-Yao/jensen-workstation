const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const isFile = (x) => !!x && typeof x.path === 'string' && x.children === undefined;
const created = [];
const origDaily = p.settings.dailyFolder;
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
try {
  // ===== T7 日记 =====
  p.settings.dailyFolder = 'QA日记/子目录';
  try {
    await p.openDailyNote('2026-10-29');
    await new Promise((r) => setTimeout(r, 400));
    const f1 = p.app.vault.getAbstractFileByPath('QA日记/子目录/2026-10-29.md');
    out.daily_missingFolder_autocreate = isFile(f1) ? 'OK 自动建目录并创建' : 'FAIL 未创建';
    if (isFile(f1)) created.push(f1.path);
  } catch (e) {
    out.daily_missingFolder_autocreate = 'THROW: ' + e.message.slice(0, 90);
    out.daily_missingFolder_note = 'openDailyNote 无目录创建/无 catch，日历点击将静默失败';
  }

  // 非法日期 key（日历不会产生，但 API/命令层无防护）
  try {
    await p.openDailyNote('2026-13-45');
    await new Promise((r) => setTimeout(r, 300));
    const f2 = p.app.vault.getAbstractFileByPath('QA日记/子目录/2026-13-45.md');
    out.daily_invalidKey = isFile(f2) ? '接受了非法日期 2026-13-45（无校验）' : '未创建';
    if (isFile(f2)) created.push(f2.path);
  } catch (e) { out.daily_invalidKey = 'THROW: ' + e.message; }

  // 跨月日历：2月(28天) / 12月(31天) / 前后翻页
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view;
  const calCheck = (ym) => {
    view.calMoment = window.moment(ym + '-01');
    const grid = view.calGrid();
    const days = [...grid.children].filter((c) => c.className.includes('od-cal-day') && !c.className.includes('other'));
    return { days: days.length, first: days[0]?.textContent, last: days[days.length - 1]?.textContent };
  };
  out.cal_feb2026 = calCheck('2026-02'); // 28 天，2026-02-01 周日 → 偏移 0
  out.cal_dec2025 = calCheck('2025-12'); // 31 天
  out.cal_jan2027 = calCheck('2027-01');
  // 点一个无日记日期 → 应创建
  view.calMoment = window.moment('2026-02-01');
  const grid = view.calGrid();
  const day14 = [...grid.children].find((c) => c.textContent === '14' && c.className.includes('od-cal-day'));
  day14?.click();
  await new Promise((r) => setTimeout(r, 500));
  const f14 = p.app.vault.getAbstractFileByPath('QA日记/子目录/2026-02-14.md');
  out.cal_clickNoNote_creates = isFile(f14) ? '创建了 2026-02-14.md' : '未创建';
  if (isFile(f14)) created.push(f14.path);

  // ===== T10 问答日志破坏 =====
  const logPath = p.askLogPath();
  if (isFile(p.app.vault.getAbstractFileByPath(logPath))) {
    out.t10 = 'SKIP：今日已有真实问答日志，跳过破坏测试';
  } else {
    const poison = [
      '# AI 问答 2026-10-30', '',
      '随便手写的垃圾行，没有 Q 标记 {{{###', '',
      '### Q: 合法问题：网格如何驱动调度？', '',
      '这是回答正文。', '',
      '来源：[[文献A]]、[[文献B]]', '',
      '### Q: 第二个问题', '',
      '回答里嵌一行伪标题：',
      '### Q: 注入的假问题', '',
      '伪问题的"回答"。', '',
      '### Q: ', '',
    ].join('\n');
    await p.ensureFolder('科研工作台/AI问答');
    await p.app.vault.create(logPath, poison);
    created.push(logPath);
    const items = await p.getAskLogToday();
    out.t10_parsedItems = items.map((it) => ({ q: it.q.slice(0, 26), sources: it.sources.length, aLen: it.a.length }));
    // 区段还能开吗
    try {
      await view.goto('ask');
      await new Promise((r) => setTimeout(r, 300));
      out.t10_sectionOpens = { ok: true, itemCount: view.contentEl.querySelectorAll('.jrs-ask-item').length, hasParseError: false };
    } catch (e) { out.t10_sectionOpens = { ok: false, err: e.message }; }
  }
} finally {
  p.settings.dailyFolder = origDaily;
  p.saveSettings = origSave;
  for (const path of created) { const f = p.app.vault.getAbstractFileByPath(path); if (f) { try { await p.app.vault.delete(f, true); } catch (e) {} } }
  for (const f of p.app.vault.getAllLoadedFiles().filter((x) => /^QA/.test(x.path))) { try { await p.app.vault.delete(f, true); } catch (e) {} }
  app.workspace.iterateAllLeaves((leaf) => { if (leaf.view?.file?.path && /^QA/.test(leaf.view.file.path)) leaf.detach(); });
}
return JSON.stringify(out, null, 1);
