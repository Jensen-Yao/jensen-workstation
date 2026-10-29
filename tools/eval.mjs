// 在 Obsidian 页面里执行诊断表达式并输出结果
const base = 'http://127.0.0.1:9223';
const expr = process.argv[2];
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
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (r.result?.exceptionDetails) {
  console.log('❌ 异常:', JSON.stringify(r.result.exceptionDetails, null, 1).slice(0, 1500));
} else {
  console.log('结果:', r.result?.result?.value);
}
ws.close();
