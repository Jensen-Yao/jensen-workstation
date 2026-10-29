const p = app.plugins.plugins['jensen-workstation'];
const papers = p.getPapers().filter((x) => !x.summary);
let ok = 0; let fail = 0; let firstErr = '';
for (const paper of papers) {
  let done = false;
  for (let attempt = 0; attempt < 2 && !done; attempt += 1) {
    try {
      const s = await p.aiChat(
        '根据学术论文的标题、研究方向、作者，用一句中文（35字以内）概括其核心贡献。只输出这句话，不要任何前缀。',
        `标题：${paper.title}\n方向：${paper.topics.join('/') || '未知'}\n作者：${paper.authors || '未知'}\n年份：${paper.year || '未知'}`,
        80,
      );
      const clean = s.trim().split('\n')[0].slice(0, 80);
      if (clean) {
        await app.fileManager.processFrontMatter(paper.file, (f) => { f.summary = clean; });
        ok += 1; done = true;
      }
    } catch (e) {
      if (!firstErr) firstErr = e.message.slice(0, 180);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  if (!done) fail += 1;
  await new Promise((r) => setTimeout(r, 1200));
}
await new Promise((r) => setTimeout(r, 500));
const a = p.getPapers();
return JSON.stringify({ generated: ok, fail, firstErr, nowWithSummary: a.filter((x) => x.summary).length, total: a.length });
