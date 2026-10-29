const p = app.plugins.plugins['jensen-workstation'];
/* 1) 问答日志持久化：先造一条日志再读取 */
await p.appendAskLog({ q: '验证：日志持久化吗？', a: '**是**，写入后重开可见。', sources: [] });
const log = await p.getAskLogToday();
/* 2) 今日小结 */
await p.generateDailyDigest();
const daily = p.findDailyNote();
const digest = daily ? (await app.vault.cachedRead(daily)).includes('今日小结') : false;
/* 3) 命令注册 */
const cmds = Object.keys(app.commands.commands).filter((c) => c.startsWith('jensen-workstation:ai-') || c.includes('daily-digest'));
/* 4) 区段渲染 */
await p.activateDashboard();
const v = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
await v.goto('ask');
await new Promise((r) => setTimeout(r, 600));
const askItems = document.querySelectorAll('.jrs-ask-item').length;
return JSON.stringify({ version: p.manifest.version, askLogEntries: log.length, firstQ: log[0] ? log[0].q.slice(0, 12) : null, digestWritten: digest, newCommands: cmds.length, askItemsRendered: askItems });
