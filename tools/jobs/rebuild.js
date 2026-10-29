const p = app.plugins.plugins['jensen-workstation'];
if (!p) return '插件未加载';
/* 1) 批量导入 PDF（复制入库） */
const res = await p.importPdfFolder('D:/Desktop/ycs/卫星网格化智能规划综述/文献', true, true, () => {});
/* 2) 确定性组织 */
const TOPIC_MAP = [
  [/热力/g, '网格热力图'], [/网格|格网|剖分|编码|H3|GeoSOT|grid/i, '时空网格'],
  [/敏捷/i, '敏捷卫星'], [/成像|imaging/i, '成像卫星'], [/电磁|探测/i, '电磁探测卫星'],
  [/星座|constellation/i, '巨星座'], [/天临空|协同/i, '天临空协同'],
  [/遗传|进化|差分|模因|memetic|evolution|heuristic|启发/i, '元启发式算法'],
  [/强化学习|reinforcement|DRL/i, '深度强化学习'], [/大模型|LLM|大语言/i, '大模型驱动'],
  [/在轨|自主/i, '在轨自主'], [/调度|scheduling|规划|planning/i, '卫星任务规划'],
  [/区域目标|area target|覆盖|coverage/i, '区域目标覆盖'],
];
const CORE = [[/基于热力图的星载自主任务规划/, 65], [/网格剖分的敏捷卫星区域目标观测调度方法/, 45], [/基于网格的区域目标多星调度问题/, 30]];
const papers = p.getPapers();
let organized = { authors: 0, topics: 0 };
for (const paper of papers) {
  const fm = {};
  if (!paper.authors) {
    const m1 = paper.file.basename.match(/[\u4e00-\u9fff]{2,4}$/);
    const m2 = paper.file.basename.match(/^([A-Za-z][a-z]+) 等/);
    let a = '';
    if (m1 && !['方法', '研究', '综述', '技术', '问题'].includes(m1[0])) a = m1[0];
    else if (m2) a = m2[1] + ' 等';
    if (a) { fm.authors = a.slice(0, 60); organized.authors += 1; }
  }
  if (!paper.topics.length) {
    const t = new Set();
    for (const [re, topic] of TOPIC_MAP) { if (re.test(paper.title)) t.add(topic); }
    if (t.size) { fm.topics = [...t].slice(0, 4); organized.topics += 1; }
  }
  const title = paper.title;
  const core = CORE.find(([re]) => re.test(title));
  if (core) Object.assign(fm, { status: '阅读中', priority: '高', rating: 5, reading_progress: core[1] });
  else if (/综述|survey|review/i.test(title)) Object.assign(fm, { status: '已完成', rating: 4, reading_progress: 100 });
  else if (/贺仁杰|王钧|徐师兄|袁健波/.test(title)) Object.assign(fm, { status: '已完成', rating: 4, reading_progress: 100 });
  else if (/强化学习|reinforcement|大模型|LLM/i.test(title)) Object.assign(fm, { status: '待读', priority: '中', rating: 4 });
  else Object.assign(fm, { status: '待读' });
  if (Object.keys(fm).length) await app.fileManager.processFrontMatter(paper.file, (f) => { Object.assign(f, fm); });
}
/* 3) 大纲 + Bases */
await p.ensureSurveyNote(false);
await p.generateBases();
await new Promise((r) => setTimeout(r, 800));
const a = p.getPapers();
return JSON.stringify({
  import: res, organized,
  stats: { total: a.length, withTopics: a.filter((x) => x.topics.length).length, reading: a.filter((x) => x.status === '阅读中').length },
});
