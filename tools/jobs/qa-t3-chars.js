const p = app.plugins.plugins['jensen-workstation'];
const out = { created: [], files: {} };
const isFile = (x) => !!x && typeof x.path === 'string' && x.children === undefined;
const origLib = p.settings.libFolder, origSurvey = p.settings.surveyNote, origCanvas = p.settings.graphCanvas;
const origTopics = p.settings.topics;
try {
  p.settings.libFolder = 'QA-测试/文献';
  p.settings.surveyNote = 'QA-测试/综述大纲.md';
  p.settings.graphCanvas = 'QA-测试/图谱.canvas';
  p.settings.topics = ['方向A', '方向B'];

  const t1 = '《"引号"｜竖线：半角|管道*星号?问号<尖>括号》QA测试' + '超'.repeat(60) + '😀';
  const f1 = await p.createPaperNote({ title: t1, authors: 'A, B', year: '2024', venue: 'Test|Venue"奇"刊', status: '待读', priority: '高', topics: ['方向A'], pdf: '' }, false);
  out.created.push(f1.path);
  const f2 = await p.createPaperNote({ title: 'QA无主题文献', authors: '', year: '2025', venue: '', status: '待读', topics: [], pdf: '' }, false);
  out.created.push(f2.path);
  const f3 = await p.createPaperNote({ title: 'QA双主题文献', authors: '', year: '2025', venue: '', status: '待读', topics: ['方向A', '方向B'], pdf: '' }, false);
  out.created.push(f3.path);
  await new Promise((r) => setTimeout(r, 800)); // 等 metadataCache

  out.sanitizedName = f1.basename;
  out.basenameLen = f1.basename.length;
  const raw1 = await p.app.vault.cachedRead(f1);
  out.fmTitleLine = raw1.split('\n').find((l) => l.startsWith('title:'))?.slice(0, 60);
  out.fmAddedLine = raw1.split('\n').find((l) => l.startsWith('added:'));
  const cache1 = p.app.metadataCache.getFileCache(f1);
  out.fmParsed = { venue: cache1?.frontmatter?.venue, year: cache1?.frontmatter?.year, topics: cache1?.frontmatter?.topics, status: cache1?.frontmatter?.status };

  const papers = p.getPapers();
  out.papersSeen = papers.length;
  out.titleFromFm = papers.find((x) => x.path === f1.path)?.title?.slice(0, 30);

  // 矩阵（重定向后写在 QA-测试/文献矩阵.md）
  await p.generateMatrix();
  const mf = p.app.vault.getAbstractFileByPath('QA-测试/文献矩阵.md');
  out.matrixCreated = isFile(mf);
  if (isFile(mf)) {
    const mc = await p.app.vault.cachedRead(mf);
    const lines = mc.split('\n').filter((l) => l.startsWith('|'));
    out.matrixHeaderCols = lines[0].split('|').length - 2;
    const t1row = lines.find((l) => l.includes('QA测试') || l.includes('引号'));
    out.matrixTestRowCols = t1row ? t1row.split('|').length - 2 : 'ROW NOT FOUND';
    out.matrixTestRowSample = t1row ? t1row.slice(0, 90) : '';
    out.matrixVenueCellRaw = t1row ? (t1row.split('|').map(s=>s.trim())[3] || '') : '';
  }

  // 图谱
  const stats = p.graphStats();
  out.graphStats = stats;
  await p.generateGraphCanvas(false);
  const cf = p.app.vault.getAbstractFileByPath('QA-测试/图谱.canvas');
  out.canvasCreated = isFile(cf);
  if (isFile(cf)) {
    const raw = await p.app.vault.cachedRead(cf);
    let json; try { json = JSON.parse(raw); } catch (e) { out.canvasJson = 'PARSE FAIL: ' + e.message; }
    if (json) {
      out.canvasNodes = json.nodes.length;
      out.nodeTexts = json.nodes.map((n) => (n.text || '').split('\n')[0].slice(0, 34));
      const dupPapers = json.nodes.filter((n) => (n.text || '').includes('QA双主题'));
      out.dualTopicNodeCount = dupPapers.length; // 双主题 → 重复节点？
      out.noTopicNodeCount = json.nodes.filter((n) => (n.text || '').includes('QA无主题')).length; // 无主题 → 0？
    }
  }
} finally {
  p.settings.libFolder = origLib;
  p.settings.surveyNote = origSurvey;
  p.settings.graphCanvas = origCanvas;
  p.settings.topics = origTopics;
}
return JSON.stringify(out, null, 1);
