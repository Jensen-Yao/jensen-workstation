const p = app.plugins.plugins['jensen-workstation'];
/* 右栏启动番茄钟 */
document.querySelector('.jrs-side .od-btn--primary').click();
await new Promise((r) => setTimeout(r, 3200));
const sideClock = document.querySelector('.jrs-side-clock')?.textContent;
const phase = p.pomo.phase;
const left = p.pomo.left;
p.pomo.reset();
return JSON.stringify({ sideClock, phase, leftBelow25: left < 1500 });
