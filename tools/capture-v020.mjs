import { connect } from './cdp.mjs';
import { writeFile } from 'node:fs/promises';
const label = process.argv[2] || 'v020';
if (!/^[a-zA-Z0-9-]+$/.test(label)) throw new Error('Invalid screenshot label');
const cdp = await connect(); let original;
try {
  original = await cdp.evaluate(`app.plugins.plugins['jensen-workstation'].settings.workspaceTheme`);
  await cdp.evaluate(`(async()=>{for(let i=0;i<40&&document.querySelector('.notice');i++)await new Promise(r=>setTimeout(r,200));return true;})()`);
  for (const theme of ['day', 'night']) {
    await cdp.evaluate(`(async()=>{const plugin=app.plugins.plugins['jensen-workstation'];plugin.settings.workspaceTheme='${theme}';plugin.applyAppearance();await plugin.gotoSection('home');const side=app.workspace.getLeavesOfType('jrs-sidepanel')[0].view;side.tab='paper';side.showCompanionMode('assistant');side.refreshContext();side.render();app.workspace.getLeavesOfType('jrs-life')[0].view.render();await new Promise(r=>setTimeout(r,150));return true;})()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 60 });
    await cdp.evaluate('new Promise(resolve => setTimeout(resolve, 180))');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`../screenshots/${label}-${theme}.png`, import.meta.url), Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/${label}-${theme}.png`);
  }
} finally {
  if (original) await cdp.evaluate(`(async()=>{const plugin=app.plugins.plugins['jensen-workstation'];plugin.settings.workspaceTheme=${JSON.stringify(original)};await plugin.saveSettings();plugin.applyAppearance();await plugin.gotoSection('home');app.workspace.getLeavesOfType('jrs-life')[0].view.render();app.workspace.getLeavesOfType('jrs-sidepanel')[0].view.render();return true;})()`);
  cdp.close();
}
