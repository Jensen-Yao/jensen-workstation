const p = app.plugins.plugins['jensen-workstation'];
const out = {};
// 1) hook Notice
const notices = [];
const OrigNotice = window.Notice;
window.Notice = class extends OrigNotice { constructor(msg, o) { super(msg, o); notices.push(String(msg).slice(0, 120)); } };
// 2) hook electron.shell.openPath（真实返回失败错误串，模拟系统找不到文件）
let openPathCalls = [];
let electronPatched = false, origOpenPath = null;
try {
  const electron = window.require && window.require('electron');
  if (electron && electron.shell && electron.shell.openPath) {
    origOpenPath = electron.shell.openPath;
    electron.shell.openPath = async (pth) => { openPathCalls.push(pth); return 'The system cannot find the file specified.'; };
    electronPatched = true;
  }
} catch (e) { out.electronHookErr = e.message; }
try {
  // A. 外部绝对路径不存在
  p.openPdf('F:/QA不存在的目录/不存在的文献.pdf');
  await new Promise((r) => setTimeout(r, 600));
  out.A_external_missing = { openPathCalls: [...openPathCalls], notices: [...notices], userSees: openPathCalls.length && !notices.length ? 'NOTHING（静默无反馈）' : '有反馈' };

  // B. 库内相对路径不存在
  notices.length = 0;
  p.openPdf('科研工作台/PDF/QA不存在.pdf');
  await new Promise((r) => setTimeout(r, 300));
  out.B_vault_missing = { notices: [...notices] };

  // C. 空/undefined
  notices.length = 0;
  p.openPdf(''); p.openPdf(undefined); p.openPdf(null);
  await new Promise((r) => setTimeout(r, 200));
  out.C_empty = { notices: [...notices], noCrash: true };

  // D. 外部路径存在但 openPath 失败（如无关联程序）——同 A 的返回串
  // E. http 链接（不真开窗口，hook window.open）
  const origOpen = window.open; let winOpen = [];
  window.open = (u) => { winOpen.push(u); return null; };
  p.openPdf('https://arxiv.org/pdf/9999.9999');
  await new Promise((r) => setTimeout(r, 200));
  window.open = origOpen;
  out.E_http = { winOpen };

  // F. openReading：paper 对象带外部不存在 pdf（smartOpenFile 会打开笔记文件——用临时文献测，或者只验证 Notice 分支）
  // 构造假 paper（不真打开笔记：openReading 先 smartOpenFile(p.file)——file 必须真实。跳过 UI 层，逻辑同 B。
} finally {
  window.Notice = OrigNotice;
  if (electronPatched && origOpenPath) { const electron = window.require('electron'); electron.shell.openPath = origOpenPath; }
}
return JSON.stringify(out, null, 1);
