const p = app.plugins.plugins['jensen-workstation'];
const out = {};
out.version = p.manifest?.version;
out.settings = {
  libFolder: p.settings.libFolder,
  pdfFolder: p.settings.pdfFolder,
  graphCanvas: p.settings.graphCanvas,
  surveyNote: p.settings.surveyNote,
  dailyFolder: p.settings.dailyFolder,
  questionsFolder: p.settings.questionsFolder,
  basesFolder: p.settings.basesFolder,
  arxivQuery: (p.settings.arxivQuery || '').slice(0, 30),
  hasApiKey: !!p.settings.ai.apiKey,
  apiKeyLen: (p.settings.ai.apiKey || '').length,
  baseUrl: p.settings.ai.baseUrl,
  topics: p.settings.topics,
};
out.papersCount = p.getPapers().length;
out.jcacheLoaded = !!p._jcache;
const isFile = (x) => !!x && typeof x.path === 'string' && x.children === undefined;
out.askLogTodayExists = isFile(app.vault.getAbstractFileByPath(p.askLogPath()));
out.graphCanvasExists = isFile(app.vault.getAbstractFileByPath(p.settings.graphCanvas));
out.surveyExists = p.surveyExists();
out.matrixExists = isFile(app.vault.getAbstractFileByPath('科研工作台/文献矩阵.md'));
out.vaultRoot = app.vault.getRoot().path;
// 现有 QA 残留检查
out.qaLeftovers = app.vault.getAllLoadedFiles().filter(f => /QA|qa-t/.test(f.path)).map(f => f.path);
return JSON.stringify(out, null, 1);
