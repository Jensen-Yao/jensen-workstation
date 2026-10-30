export async function connect(urlPart = 'index.html') {
  const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
  const target = targets.find((item) => item.type === 'page' && item.url.includes(urlPart));
  if (!target) throw new Error('Obsidian CDP target missing');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = ({ data }) => { const message = JSON.parse(data.toString()); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error('CDP timeout: ' + method)); }, 45000);
    pending.set(key, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  return {
    send,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    },
    close: () => socket.close(),
  };
}
