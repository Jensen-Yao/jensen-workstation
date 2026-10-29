// OrbitDesk 视觉审查工具：连接 Obsidian CDP，执行命令并截图
// 用法: node shot.mjs <输出.png> [附加JS表达式]
const base = 'http://127.0.0.1:9223';
const out = process.argv[2] || 'F:/OrbitDesk/shot.png';
const extra = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(base + '/json')).json();
const page = list.find((t) => t.type === 'page' && /obsidian/i.test(t.url)) || list.find((t) => t.type === 'page');
if (!page) { console.error('未找到 Obsidian 页面目标', list.map((t) => t.type + ':' + t.url)); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

// 打开仪表盘
let r = await send('Runtime.evaluate', { expression: "app.commands.executeCommandById('jensen-workstation:open-dashboard')", awaitPromise: false });
if (r.result?.exceptionDetails) console.error('命令执行异常', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
await sleep(1200);

if (extra) {
  await send('Runtime.evaluate', { expression: extra, awaitPromise: false });
  await sleep(1000);
}

const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('✅ 截图已保存:', out);
} else {
  console.error('截图失败', JSON.stringify(shot).slice(0, 300));
  process.exit(1);
}
ws.close();
