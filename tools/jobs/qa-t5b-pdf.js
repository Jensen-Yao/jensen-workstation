const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const grabNotices = () => [...document.querySelectorAll('.notice')].map((n) => n.textContent.trim().slice(0, 100));
let openPathCalls = [];
let electronPatched = false, origOpenPath = null;
try {
  const electron = window.require && window.require('electron');
  if (electron && electron.shell && electron.shell.openPath) {
    origOpenPath = electron.shell.openPath;
    electron.shell.openPath = async (pth) => { openPathCalls.push(pth); return 'The system cannot find the file specified.'; };
    electronPatched = true;
  }
  // A. 外部路径不存在（系统 openPath 返回错误串）
  p.openPdf('F:/QA不存在的目录/不存在的文献.pdf');
  await new Promise((r) => setTimeout(r, 700));
  out.A_external_missing = { openPathCalled: openPathCalls.length, domNotices: grabNotices() };

  // B. 库内路径不存在
  p.openPdf('科研工作台/PDF/QA不存在.pdf');
  await new Promise((r) => setTimeout(r, 400));
  out.B_vault_missing = { domNotices: grabNotices() };
} finally {
  if (electronPatched && origOpenPath) { const electron = window.require('electron'); electron.shell.openPath = origOpenPath; }
}
return JSON.stringify(out, null, 1);
