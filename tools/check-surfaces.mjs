import { connect } from './cdp.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
const cdp = await connect(); const checks = [];
await mkdir(new URL('../shots/v020/', import.meta.url), { recursive: true });
await mkdir(new URL('../.jrs-tmp/', import.meta.url), { recursive: true });
try {
  await cdp.evaluate(`window.__jrsErrors=[];window.__jrsErrorHandler=(event)=>{const text=event.error?.stack||event.reason?.stack||event.message||'';if(/jensen|ResearchBrowser|LibraryPanel|SidebarLife|PdfResearch|ReadingDeck/i.test(text))window.__jrsErrors.push(String(text));};window.addEventListener('error',window.__jrsErrorHandler);window.addEventListener('unhandledrejection',window.__jrsErrorHandler);`);
  for (const section of ['home', 'library', 'queue', 'reader', 'graph', 'progress', 'discover', 'submit', 'ask']) {
    const metrics = await cdp.evaluate(`(async()=>{const view=app.workspace.getLeavesOfType('jrs-dashboard')[0].view;await view.goto('${section}');await new Promise(r=>setTimeout(r,120));return{section:view.section,elements:view._page.querySelectorAll('*').length,overflow:view._page.scrollWidth>view._page.clientWidth+1,errors:window.__jrsErrors.splice(0)};})()`);
    checks.push({ section, ok: metrics.elements > 0 && !metrics.overflow && !metrics.errors.length, ...metrics });
    if (['home', 'library', 'reader', 'progress'].includes(section)) {
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(new URL(`../shots/v020/${section}.png`, import.meta.url), Buffer.from(screenshot.data, 'base64'));
    }
  }
  const side = await cdp.evaluate(`(async()=>{const side=app.workspace.getLeavesOfType('jrs-sidepanel')[0].view;const results=[];for(const tab of ['paper','pdf','writing','tools']){side.tab=tab;side.render();results.push({tab,visible:side._body.children.length,overflow:side._body.scrollWidth>side._body.clientWidth+1});}side.tab='paper';side.render();return results;})()`);
  checks.push(...side.map((entry) => ({ ...entry, ok: entry.visible > 0 && !entry.overflow })));
  await cdp.evaluate(`(async()=>{const plugin=app.plugins.plugins['jensen-workstation'];await plugin.gotoSection('home');window.removeEventListener('error',window.__jrsErrorHandler);window.removeEventListener('unhandledrejection',window.__jrsErrorHandler);return true;})()`);
  for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.section || check.tab}: ${JSON.stringify(check)}`);
  await writeFile(new URL('../.jrs-tmp/surfaces.json', import.meta.url), JSON.stringify(checks, null, 2));
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
} finally { cdp.close(); }
