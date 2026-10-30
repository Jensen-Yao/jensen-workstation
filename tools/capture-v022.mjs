import {writeFile,mkdir} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const cdp=await connect(); const dir=new URL('../screenshots/v022/',import.meta.url); await mkdir(dir,{recursive:true});
const save=async (name,client=cdp)=>{const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile(new URL(name+'.png',dir),Buffer.from(shot.data,'base64'));};
let theme;
try {
  theme=await cdp.evaluate(`app.plugins.plugins['jensen-workstation'].settings.workspaceTheme`);
  for(const mode of ['day','night']) {
    await cdp.evaluate(`(()=>{const p=app.plugins.plugins['jensen-workstation'];p.settings.workspaceTheme='${mode}';p.applyAppearance();return true;})()`);
    for(const section of ['library','queue','reader','graph','progress','discover','submit','ask']) {
      await cdp.evaluate(`(async()=>{const p=app.plugins.plugins['jensen-workstation'];await p.gotoSection('${section}');const v=app.workspace.getLeavesOfType('jrs-dashboard')[0].view;if('${section}'==='submit'){v._submissionTab='pipeline';await v.render();}v.contentEl.querySelector('.jrs-main').scrollTop=0;await new Promise(r=>setTimeout(r,160));return true;})()`);
      await save(`${section}-${mode}`);
      if(section==='submit') {
        await cdp.evaluate(`(async()=>{const v=app.workspace.getLeavesOfType('jrs-dashboard')[0].view;const buttons=[...v._page.querySelectorAll('.jrs-submission-tab')];buttons.find(b=>b.textContent==='目标期刊').click();await new Promise(r=>setTimeout(r,100));return true;})()`);
        await save(`journals-${mode}`);
      }
    }
  }
  await cdp.evaluate(`(async()=>{const p=app.plugins.plugins['jensen-workstation'];p.settings.workspaceTheme='day';p.applyAppearance();await p.gotoSection('home');const v=app.workspace.getLeavesOfType('jrs-dashboard')[0].view;v._board.hidden=false;v._board.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,160));return true;})()`);
  await save('lower-desktop');
  await cdp.evaluate(`(async()=>{app.setting.open();app.setting.openTabById('jensen-workstation');await new Promise(r=>setTimeout(r,160));return true;})()`);
  const settings = await connect('about:blank');
  try { await save('settings', settings); } finally { settings.close(); }
  console.log('Saved eight workspaces in both themes, lower desktop and settings.');
}finally {
  await cdp.evaluate(`(async()=>{app.setting.close();const p=app.plugins.plugins['jensen-workstation'];p.settings.workspaceTheme=${JSON.stringify(theme || 'day')};p.applyAppearance();await p.gotoSection('home');app.workspace.getLeavesOfType('jrs-dashboard')[0].view._submissionTab='pipeline';await p.saveSettings();return true;})()`);cdp.close();
}
