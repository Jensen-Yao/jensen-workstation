const p = app.plugins.plugins['jensen-workstation'];
const q = '网格热力图如何驱动多星调度决策？现有文献的主要思路是什么？';
const item = await p.aiAsk(q);
/* 更新已沉淀的研究问题笔记 */
const f = await p.appendAnswerToQuestion(q, `【补充回答（29篇摘要入库后）】\n\n${item.a}`);
return JSON.stringify({
  answerLen: item.a.length,
  sources: item.sources.map((s) => s.title.slice(0, 16)),
  updatedNote: f ? f.path : null,
  answerHead: item.a.slice(0, 260),
});
