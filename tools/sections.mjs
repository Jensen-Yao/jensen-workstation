// 逐区段截图：node tools/sections.mjs
const base = 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(base + '/json')).json();
const page = list.find((t) => t.type === 'page' && /obsidian/i.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id; pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync('F:/OrbitDesk/shots/sections', { recursive: true });
const sections = ['discover', 'queue', 'library', 'graph', 'progress', 'reader', 'submit', 'ask'];
for (const sec of sections) {
  await send('Runtime.evaluate', {
    expression: `(async()=>{ const v = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view; if (v) { await v.goto('${sec}'); } })()`,
    awaitPromise: true,
  });
  await sleep(900);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
  writeFileSync(`F:/OrbitDesk/shots/sections/${sec}.jpg`, Buffer.from(shot.result.data, 'base64'));
  console.log('✅', sec);
}
/* 回到总览并截全貌 */
await send('Runtime.evaluate', {
  expression: `(async()=>{ const v = app.workspace.getLeavesOfType('jrs-dashboard')[0]?.view; if (v) await v.goto('home'); })()`,
  awaitPromise: true,
});
await sleep(900);
const home = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
writeFileSync('F:/OrbitDesk/shots/sections/home.jpg', Buffer.from(home.result.data, 'base64'));
console.log('✅ home');
ws.close();
