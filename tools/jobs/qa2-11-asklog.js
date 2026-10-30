/* T12: 问答日志持久化 —— appendAskLog 的 srcLine 引用 */
const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const path = '科研工作台/AI问答/' + window.moment().format('YYYY-MM-DD') + '.md';
const existed = !!app.vault.getAbstractFileByPath(path);
window.__qaR2AskCreated = !existed;
out.existedBefore = existed;
try {
  await p.appendAskLog({ q: 'QA测试问题', a: 'QA测试回答', sources: [{ basename: 'x', title: 'x' }] });
  out.call = 'RESOLVED（未抛错——意外）';
} catch (e) { out.call = 'THROW: ' + e.message; }
out.fileExistsNow = !!app.vault.getAbstractFileByPath(path);
out.fileContentIfNew = out.fileExistsNow && !existed ? await app.vault.cachedRead(app.vault.getAbstractFileByPath(path)) : '(未创建或已存在，不读取)';
/* getAskLogToday 视角 */
try { out.askLogToday = await p.getAskLogToday(); } catch (e) { out.askLogToday = 'THROW: ' + e.message; }
return out;
