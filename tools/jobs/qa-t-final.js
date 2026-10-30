const p = app.plugins.plugins['jensen-workstation'];
const out = {};
out.finalSettings = {
  libFolder: p.settings.libFolder, pdfFolder: p.settings.pdfFolder,
  graphCanvas: p.settings.graphCanvas, surveyNote: p.settings.surveyNote,
  dailyFolder: p.settings.dailyFolder, questionsFolder: p.settings.questionsFolder,
  basesFolder: p.settings.basesFolder,
  hasApiKey: !!p.settings.ai.apiKey, apiKeyLen: (p.settings.ai.apiKey || '').length,
  topicsCount: p.settings.topics.length,
};
out.papersCount = p.getPapers().length;
out.qaLeftovers = p.app.vault.getAllLoadedFiles().filter((f) => /QA|qa-t/.test(f.path)).map((f) => f.path);
out.askLogToday = !!p.app.vault.getAbstractFileByPath(p.askLogPath());
out.graphCanvasStillThere = !!p.app.vault.getAbstractFileByPath(p.settings.graphCanvas);
out.surveyStillThere = p.surveyExists();
// dashboard 恢复到 home 且能正常渲染
try {
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view;
  await view.goto('home');
  await new Promise((r) => setTimeout(r, 400));
  out.dashboardHealthy = view.contentEl.querySelectorAll('.jrs-card, section').length;
} catch (e) { out.dashboardHealthy = 'ERR ' + e.message; }
// AI 问答 stub 是否已还原（应为函数且未被替换计数器污染——检查函数名）
out.aiAskRestored = p.aiAsk.name;
return JSON.stringify(out, null, 1);
