const p = app.plugins.plugins['jensen-workstation'];
await p.activateSidePanel();
await new Promise((r) => setTimeout(r, 800));
const side = document.querySelector('.jrs-side');
return JSON.stringify({
  sideOpen: !!side,
  pomoClock: side?.querySelector('.jrs-side-clock')?.textContent,
  journalInput: !!side?.querySelector('.jrs-side-input'),
  captureBtn: [...(side?.querySelectorAll('button') || [])].some((b) => b.textContent.includes('存入收件箱')),
  sharedEngine: p.pomo.phase,
});
