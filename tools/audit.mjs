// 全站交互审计 v2：逐区段点击所有可点元素，检测是否有真实反应
const base = 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(base + '/json')).json();
const page = list.find((t) => t.type === 'page' && /obsidian/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++mid; pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

const PREP = `(function(){
  window.__audit = { mutations: 0, opens: 0 };
  if (window.__ob) window.__ob.disconnect();
  window.__ob = new MutationObserver(() => { window.__audit.mutations++; });
  window.__ob.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  if (!window.__origOpen) { window.__origOpen = window.open; }
  window.open = function(){ window.__audit.opens++; return null; };
  return 'prep-ok';
})();`;
const SNAP = `(function(){
  return JSON.stringify({
    mut: window.__audit.mutations, opens: window.__audit.opens,
    notice: document.querySelectorAll('.notice').length,
    modal: document.querySelectorAll('.modal-container').length,
  });
})();`;
const CLICK_ONE = `(function(I){ /* CLICK */
  const sels = ['.jrs-view button', '.jrs-view .od-chip', '.jrs-view .od-filter',
    '.jrs-view .od-star', '.jrs-view .jrs-row-title', '.jrs-view .od-status',
    '.jrs-view .od-clickable', '.jrs-view .jrs-arxiv-title',
    '.jrs-view .od-task', '.jrs-view .od-paper'];
  const seen = new Set(); const els = [];
  for (const s of sels) document.querySelectorAll(s).forEach((el) => {
    if (!seen.has(el)) { seen.add(el); els.push(el); }
  });
  const el = els[I];
  if (!el) return JSON.stringify({ done: true });
  const r = el.getBoundingClientRect();
  const info = { done: false, tag: el.tagName, cls: String(el.className).slice(0, 44), text: (el.textContent || '').trim().slice(0, 24), visible: r.width > 0 && r.height > 0 };
  try { el.click(); info.clicked = true; } catch (e) { info.clicked = false; }
  return JSON.stringify(info);
})(IDX_PLACEHOLDER);`;

const DESCRIBE_ONE = `(function(I){
  const sels = ['.jrs-view button', '.jrs-view .od-chip', '.jrs-view .od-filter',
    '.jrs-view .od-star', '.jrs-view .jrs-row-title', '.jrs-view .od-status',
    '.jrs-view .od-clickable', '.jrs-view .jrs-arxiv-title',
    '.jrs-view .od-task', '.jrs-view .od-paper'];
  const seen = new Set(); const els = [];
  for (const s of sels) document.querySelectorAll(s).forEach((el) => {
    if (!seen.has(el)) { seen.add(el); els.push(el); }
  });
  const el = els[I];
  if (!el) return JSON.stringify({ done: true });
  const r = el.getBoundingClientRect();
  return JSON.stringify({
    done: false, tag: el.tagName, cls: String(el.className).slice(0, 44),
    text: (el.textContent || '').trim().slice(0, 24),
    visible: r.width > 0 && r.height > 0,
    skip: (el.getAttribute('title') || '').includes('隐藏卡片'),
    disabled: el.disabled === true || el.hasClass && el.hasClass('is-disabled'),
    connected: el.isConnected,
  });
})(IDX_PLACEHOLDER);`;

const CLOSE_MODAL = `(function(){
  const m = document.querySelector('.modal-container .modal-close-button');
  if (m) { m.click(); return 1; }
  const any = document.querySelector('.modal-container');
  if (any) { any.remove(); return 1; }
  return 0;
})();`;
const RESET = `(function(){ window.__audit.mutations = 0; window.__audit.opens = 0; return 1; })();`;

const prepR = await ev(PREP);
if (prepR.result?.result?.value !== 'prep-ok') {
  console.error('PREP 失败', JSON.stringify(prepR.result).slice(0, 300));
  process.exit(1);
}

const sections = ['home', 'discover', 'queue', 'library', 'graph', 'progress', 'reader', 'submit', 'ask'];
const expectLabel = { home: '总览', discover: 'AI 发现', queue: '阅读队列', library: '文献库', graph: '论文图谱', progress: '研究进展', reader: '阅读笔记', submit: '投稿冲刺', ask: '知识问答' };
const report = { dead: [], alive: 0, total: 0 };

for (const sec of sections) {
  await ev(`(async()=>{const p=app.plugins.plugins['jensen-workstation']; await p.activateDashboard(); const v=app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view; if(v) await v.goto('${sec}');})()`);
  await sleep(600);
  await ev(CLOSE_MODAL);
  await sleep(150);
  let idx = 0;
  let scanned = 0;
  for (;;) {
    const dR = await ev(DESCRIBE_ONE.replace('IDX_PLACEHOLDER', String(idx)));
    const raw = dR.result?.result?.value;
    if (!raw) { idx += 1; if (idx > 400) break; continue; }
    const info = JSON.parse(raw);
    if (info.done) break;
    idx += 1;
    if (!info.visible || !info.connected || info.disabled || info.skip) continue;
    scanned += 1;
    await ev(RESET);
    const before = JSON.parse((await ev(SNAP)).result.result.value);
    await ev(CLICK_ONE.replace('IDX_PLACEHOLDER', String(idx - 1)));
    await sleep(300);
    const after = JSON.parse((await ev(SNAP)).result.result.value);
    const reacted = after.mut > 0 || after.opens > before.opens || after.notice !== before.notice || after.modal !== before.modal;
    report.total += 1;
    if (reacted) report.alive += 1;
    else report.dead.push({ section: sec, ...info });
    await ev(CLOSE_MODAL);
    await sleep(120);
    const navR = await ev(`(function(){const a=document.querySelector('.jrs-nav-item.is-active .jrs-nav-label'); return a?a.textContent:'';})()`);
    if (navR.result.result.value !== expectLabel[sec]) {
      await ev(`(async()=>{const p=app.plugins.plugins['jensen-workstation']; await p.activateDashboard(); const v=app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view; if(v) await v.goto('${sec}');})()`);
      await sleep(400);
    }
  }
  console.log(`✅ ${sec}：扫描 ${scanned} 个可点元素`);
}
console.log('\n════ 审计结果 ════');
console.log(`有效交互 ${report.alive}/${report.total}`);
console.log(`疑似死点 ${report.dead.length} 个`);
report.dead.forEach((d) => console.log(`  ❌ [${d.section}] <${d.tag} class="${d.cls}"> "${d.text}"`));
const { writeFileSync } = await import('node:fs');
writeFileSync('F:/OrbitDesk/shots/audit-report.json', JSON.stringify(report, null, 2));
ws.close();
