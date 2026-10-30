const p = app.plugins.plugins['jensen-workstation'];
const papers = p.getPapers();
const rules = [
  [/基于热力图的星载自主任务规划/, { status: '阅读中', priority: '高', rating: 5, reading_progress: 65 }],
  [/网格剖分的敏捷卫星区域目标观测调度方法/, { status: '阅读中', priority: '高', rating: 5, reading_progress: 45 }],
  [/基于网格的区域目标多星调度问题/, { status: '阅读中', priority: '高', rating: 5, reading_progress: 30 }],
  [/综述|survey|review|贺仁杰|王钧|徐师兄|袁健波/, { status: '已完成', priority: '中', rating: 4, reading_progress: 100 }],
  [/强化学习|reinforcement|大模型|LLM|DeepSeek/i, { status: '待读', priority: '中', rating: 4 }],
];
for (const paper of papers) {
  const fm = {};
  for (const [re, patch] of rules) {
    if (re.test(paper.title)) { Object.assign(fm, patch); break; }
  }
  if (!fm.status) Object.assign(fm, { status: '待读', priority: '', rating: 0, reading_progress: 0 });
  await app.fileManager.processFrontMatter(paper.file, (f) => { Object.assign(f, fm); });
}
await new Promise((r) => setTimeout(r, 600));
const a = p.getPapers();
return JSON.stringify({ reading: a.filter(x=>x.status==='阅读中').length, todo: a.filter(x=>x.status==='待读').length, done: a.filter(x=>x.status==='已完成').length });
