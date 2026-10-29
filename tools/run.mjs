// 在 Obsidian 里执行一个 JS 文件（async IIFE 包裹），避免 bash 转义问题
// 用法: node tools/run.mjs path/to/script.js
const base = 'http://127.0.0.1:9223';
const { readFileSync } = await import('node:fs');
const code = readFileSync(process.argv[2], 'utf8');
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
const wrapped = `(async () => {\n${code}\n})()`;
const r = await send('Runtime.evaluate', { expression: wrapped, awaitPromise: true, returnByValue: true });
if (r.result?.exceptionDetails) {
  console.log('❌', JSON.stringify(r.result.exceptionDetails, null, 1).slice(0, 800));
} else {
  console.log('结果:', r.result?.result?.value);
}
ws.close();
