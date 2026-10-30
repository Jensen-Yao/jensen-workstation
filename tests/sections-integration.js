const plugin = app.plugins.plugins['jensen-workstation'];
const view = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
const original = Object.fromEntries(['sourceFolder','libFolder','surveyNote','submissionsFolder','boardCollapsed','workspaceTheme','discoveryTags','journalDensity'].map(key => [key, structuredClone(plugin.settings[key])]));
const originalCrossref = plugin.searchCrossref;
const folder = 'OrbitDesk 验证临时/qa-sections-' + Date.now();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => { for(let i=0;i<70;i++){if(predicate())return;await wait(60);}throw new Error('UI update timed out'); };
const assert = (condition, message) => { if(!condition)throw new Error(message); };
const checks = [];
const check = async (name, run) => { try { await run(); checks.push({name,ok:true}); } catch(e){ checks.push({name,ok:false,error:e.message}); } };
try {
  await plugin.ensureFolder(folder + '/notes'); await plugin.ensureFolder(folder + '/submissions');
  plugin.settings.libFolder = folder + '/notes'; plugin.settings.sourceFolder = folder; plugin.settings.surveyNote = folder + '/Survey.md'; plugin.settings.submissionsFolder = folder + '/submissions';
  await app.vault.create(plugin.settings.surveyNote, '# Survey\n\n## Chapter A\n- [ ] First task\n- [ ] Second task\n\n## Chapter B\n- [x] Completed task\n');
  const source = app.vault.getFiles().find(file => file.extension === 'pdf'); await app.vault.copy(source, folder + '/Paper.pdf');
  await check('queue search, scope and live graph use the selected folder', async () => {
    await view.goto('queue'); assert(view._page.querySelectorAll('.jrs-work-paper').length === 1,'queue missing local PDF');
    const search = view._page.querySelector('input[type=search]'); search.value = 'NONEXISTENT'; search.dispatchEvent(new Event('input'));
    assert(view._page.querySelector('.jrs-empty-state'),'queue empty result missing');
    search.value=''; search.dispatchEvent(new Event('input')); assert(view._page.querySelector('.jrs-work-paper-title').textContent==='Paper','queue search did not restore');
    await view.goto('graph'); assert(view._page.querySelectorAll('.jrs-graph-paper-link').length===1,'graph includes another source');
    const chip=[...view._page.querySelectorAll('.od-filter')].find(b=>b.textContent==='未分类'); chip.click();
    await until(()=>chip.disabled===false); assert(view._page.querySelector('.jrs-graph-papers h2').textContent.includes('未分类'),'graph node filtering missing');
  });
  await check('chapter checkboxes support repeated edits and update totals without losing the chapter', async () => {
    await view.goto('progress'); const checkbox=view._page.querySelector('.jrs-survey-task input');
    const details=checkbox.closest('details'); details.open=true; checkbox.focus();
    checkbox.click(); await until(()=>!checkbox.disabled); assert((await app.vault.read(app.vault.getAbstractFileByPath(plugin.settings.surveyNote))).includes('- [x] First task'),'task was not saved');
    assert(view._page.querySelector('.jrs-section-metric small').textContent.startsWith('2 / 3'),'task total did not update');
    checkbox.click(); await until(()=>!checkbox.disabled); assert((await app.vault.read(app.vault.getAbstractFileByPath(plugin.settings.surveyNote))).includes('- [ ] First task'),'second task edit failed');
    assert(details.open && view._page.querySelector('.jrs-section-metric small').textContent.startsWith('1 / 3'),'chapter closed or totals stale');
  });
  await check('submission state can be explicitly selected and survives rendering', async () => {
    const file=await app.vault.create(folder+'/submissions/QA.md','---\ntitle: QA manuscript\ntarget: QA venue\nstatus: 写作中\nadded: 2026-10-30\n---\n');
    await until(()=>plugin.getSubmissions().length===1); await view.goto('submit');
    const select=view._page.querySelector('.jrs-sub-status'); assert(select.options.length===9,'submission state options missing');
    select.value='小修'; select.dispatchEvent(new Event('change')); await until(()=>app.metadataCache.getFileCache(file)?.frontmatter?.status==='小修');
    await until(()=>view._page.querySelector('.jrs-sub-status')?.value==='小修');
    assert(view._page.querySelectorAll('.jrs-submit-group').length===5,'empty stages disappear');
  });
  await check('discovery Enter search preserves results and query after leaving the page', async () => {
    plugin.searchCrossref=async query=>[{title:'Controlled result '+query,source:'crossref',authors:'QA',date:'2026',url:'https://example.com',summary:'Controlled test response'}];
    view._discoverSrc='crossref'; await view.goto('discover'); const input=view._page.querySelector('.jrs-discover-form input[type=text]'); input.value='QA query'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await until(()=>view._page.querySelector('.jrs-discover-results .jrs-row-title'));
    await view.goto('ask'); await view.goto('discover');
    assert(view._page.querySelector('.jrs-discover-form input').value==='QA query','discovery query lost');
    assert(view._page.querySelector('.jrs-discover-results').textContent.includes('Controlled result QA query'),'discovery results lost');
  });
  await check('custom direction tags save a named query and can be removed', async () => {
    await view.goto('discover');
    const editor=view._page.querySelector('.jrs-direction-editor');editor.open=true;
    editor.querySelector('input').value='QA direction';editor.querySelector('textarea').value='QA tagged search';
    const save=editor.querySelector('button');save.click();await until(()=>!save.disabled && plugin.settings.discoveryTags?.some(t=>t.label==='QA direction'));
    assert(view._page.querySelector('.jrs-discover-form input').value==='QA tagged search','saved tag did not fill query');
    await view.goto('discover');const chip=[...view._page.querySelectorAll('.jrs-direction-tag')].find(el=>el.textContent==='QA direction');assert(chip,'saved tag did not survive render');
    chip.querySelector('.jrs-direction-remove').click();await until(()=>!plugin.settings.discoveryTags.some(t=>t.label==='QA direction'));
  });
  await check('submission tabs separate tasks and journal cards support compact filtering', async () => {
    await view.goto('submit');const buttons=[...view._page.querySelectorAll('.jrs-submission-tab')];assert(buttons.length===3,'submission views missing');
    buttons.find(b=>b.textContent==='目标期刊').click();await until(()=>!buttons.find(b=>b.textContent==='目标期刊').disabled);
    const input=view._page.querySelector('.jrs-journal-search');assert(!input.closest('section').hidden,'journal view hidden');input.value='NONEXISTENT';input.dispatchEvent(new Event('input'));assert([...view._page.querySelectorAll('.jrs-journal')].every(card=>card.hidden),'journal filter failed');
    input.value='';input.dispatchEvent(new Event('input'));const density=view._page.querySelector('[aria-label="目标期刊卡片密度"]');density.value='comfortable';density.dispatchEvent(new Event('change'));await until(()=>plugin.settings.journalDensity==='comfortable');assert(density.closest('section').classList.contains('is-comfortable'),'journal density did not change');
    view._submissionTab='pipeline';
  });
  await check('lower desktop folds and expands without deleting or overlapping cards', async () => {
    plugin.settings.boardCollapsed=false; await view.goto('home'); const board=view._board;
    const button=[...view._page.querySelectorAll('.jrs-board-heading button')].find(b=>b.textContent==='收起桌面');
    button.click(); await until(()=>!button.disabled); assert(board.hidden && plugin.settings.boardCollapsed,'desktop did not collapse');
    button.click(); await until(()=>!button.disabled); assert(!board.hidden && board.children.length,'desktop failed to expand');
  });
  await check('settings categories and search expose new PDF and sidebar controls', async () => {
    app.setting.open(); app.setting.openTabById(plugin.manifest.id); await until(()=>app.setting.activeTab?.id===plugin.manifest.id && app.setting.activeTab.containerEl.querySelector('.jrs-settings-layout'));
    const root=app.setting.activeTab.containerEl; assert(root.querySelectorAll('nav button').length>=10,'settings not categorized');
    assert(root.textContent.includes('文献来源文件夹')&&root.textContent.includes('PDF 批注笔记目录'),'new PDF settings missing');
    const search=root.querySelector('.jrs-settings-search'); search.value='API Key'; search.dispatchEvent(new Event('input'));
    assert([...root.querySelectorAll('.jrs-settings-group:not([hidden]) .setting-item:not([hidden])')].some(row=>row.querySelector('.setting-item-name')?.textContent==='API Key'),'settings search did not find API control');
    app.setting.close();
  });
  await check('all workspaces fit narrow and wide layouts in both themes', async () => {
    const style=view.contentEl.getAttribute('style');
    try { for(const theme of ['day','night']) {plugin.settings.workspaceTheme=theme;plugin.applyAppearance();
      for(const section of ['library','queue','reader','graph','progress','discover','submit','ask']) {
        await view.goto(section);
        for(const width of [390,720,1248]) {view.contentEl.style.width=width+'px';view.contentEl.style.maxWidth=width+'px';await wait(20);assert(view._page.scrollWidth<=view._page.clientWidth+1,section+' overflows at '+width+' '+theme);}
      }
    }} finally {view.contentEl.setAttribute('style',style||'');}
  });
} finally {
  app.setting.close(); plugin.searchCrossref=originalCrossref;
  view._discoverResults={};view._discoverQueries={};view._discoverSrc='arxiv';
  Object.assign(plugin.settings,original);await plugin.saveSettings();plugin.applyAppearance();
  const owned=[];app.workspace.iterateRootLeaves(leaf=>{if(leaf.view.file?.path.startsWith(folder+'/'))owned.push(leaf);});owned.forEach(leaf=>leaf.detach());
  const temporary=app.vault.getAbstractFileByPath(folder);if(temporary)await app.vault.delete(temporary,true);
  await plugin.gotoSection('home');
}
return {checks};
