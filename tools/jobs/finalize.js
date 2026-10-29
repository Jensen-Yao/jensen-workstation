const p = app.plugins.plugins['jensen-workstation'];
await p.generateBases();
await p.generateGraphCanvas(false);
await p.generateMatrix();
const lib = p.getPapers();
return JSON.stringify({
  bases: ['文献库', '阅读队列'].map((n) => !!app.vault.getAbstractFileByPath(`科研工作台/Bases/${n}.base`)),
  canvas: !!app.vault.getAbstractFileByPath(p.settings.graphCanvas),
  matrix: !!app.vault.getAbstractFileByPath('科研工作台/文献矩阵.md'),
  stats: {
    total: lib.length,
    withSummary: lib.filter((x) => x.summary).length,
    withTopics: lib.filter((x) => x.topics.length).length,
    reading: lib.filter((x) => x.status === '阅读中').length,
    done: lib.filter((x) => x.status === '已完成').length,
  },
});
