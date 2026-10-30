/* T11: 图谱缩略 —— 未分类节点 / 破坏 JSON / 200 节点性能 / 缺坐标节点 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const canvasPath = 'QA-R2-TMP/qa.canvas';
try {
  await p.ensureFolder('QA-R2-TMP');
  p.settings.graphCanvas = canvasPath;
  await p.activateDashboard();
  const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  const writeCanvas = async (obj) => {
    const f = app.vault.getAbstractFileByPath(canvasPath);
    const txt = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (f) await app.vault.modify(f, txt); else await app.vault.create(canvasPath, txt);
  };
  const renderAndGet = async () => {
    await view.goto('graph');
    await sleep(200);
    const svg = document.querySelector('.jrs-graph-thumb svg');
    const cap = [...document.querySelectorAll('.od-hint')].map((e) => e.textContent).find((t) => t.includes('缩略预览')) || null;
    const err = [...document.querySelectorAll('.od-hint')].map((e) => e.textContent).find((t) => t.includes('解析失败')) || null;
    return { svg: !!svg, viewBox: svg ? svg.getAttribute('viewBox') : null, circles: svg ? svg.querySelectorAll('circle').length : 0, rects: svg ? svg.querySelectorAll('rect').length : 0, cap, err };
  };

  /* A: 正常 + 未分类节点 + 悬空边 + 缺 width/height */
  await writeCanvas({ nodes: [
    { id: 'topic-0', type: 'text', text: '## T', x: 0, y: 0, width: 260, height: 60 },
    { id: 'paper-0-0', type: 'text', text: 'p', x: 0, y: 200, width: 280, height: 80 },
    { id: 'weird-unc', type: 'text', text: '孤儿节点', x: -600, y: 300 },
    { id: 'grp', type: 'group', x: 900, y: 0, width: 300, height: 200 },
  ], edges: [
    { id: 'e1', fromNode: 'topic-0', toNode: 'paper-0-0' },
    { id: 'e2', fromNode: 'ghost', toNode: 'paper-0-0' },
  ], fmtMd: true });
  out.A = await renderAndGet();

  /* B: 节点缺 x/y → viewBox NaN？ */
  await writeCanvas({ nodes: [
    { id: 'topic-0', type: 'text', text: '## T', x: 0, y: 0, width: 260, height: 60 },
    { id: 'nan-node', type: 'text', text: 'no coords' },
  ], edges: [] });
  out.B = await renderAndGet();

  /* C: 手工破坏 JSON */
  await writeCanvas('{oops not json');
  out.C = await renderAndGet();

  /* D: 200 节点超大图谱 */
  const nodes = []; const edges = [];
  for (let i = 0; i < 10; i++) nodes.push({ id: 'topic-' + i, type: 'text', text: '## T' + i, x: i * 320, y: -520, width: 260, height: 60 });
  for (let i = 0; i < 190; i++) { const t = i % 10; nodes.push({ id: 'p' + i, type: 'text', text: 'x', x: t * 320, y: -400 + Math.floor(i / 10) * 106, width: 280, height: 80 }); edges.push({ id: 'e' + i, fromNode: 'topic-' + t, toNode: 'p' + i }); }
  await writeCanvas({ nodes, edges, fmtMd: true });
  const t0 = performance.now();
  out.D = await renderAndGet();
  out.D.renderMs = Math.round(performance.now() - t0);
  out.D.totalNodes = 200;
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
  try { const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view; await v.goto('home'); } catch (e) {}
}
return out;
