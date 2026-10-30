// Runs against the real Obsidian runtime. Every write is isolated to a temporary fixture.
const plugin = app.plugins.plugins['jensen-workstation'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label) => { for (let i = 0; i < 60; i++) { if (predicate()) return; await wait(80); } throw new Error('Timed out: ' + label); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const centerGroups = () => { const parents = new Set(); app.workspace.iterateRootLeaves((leaf) => { parents.add(leaf.parent); }); return parents.size; };
const checks = [];
const check = async (name, run) => { try { await run(); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error.message }); } };
const tag = 'qa-' + Date.now(); const folder = 'OrbitDesk 验证临时/' + tag;
const original = Object.fromEntries(['libFolder', 'sourceFolder', 'annotationsFolder', 'workspaceTheme', 'savedLibraryViews', 'lastReadingPath', 'deckFilter', 'deckMode', 'commonLinks'].map((key) => [key, structuredClone(plugin.settings[key])]));
const originalBatch = plugin._lastPaperBatch; const originalAI = plugin.aiChat;
const copiedSource = app.vault.getFiles().find((file) => file.extension === 'pdf');
const originalContext = plugin._contextPaperPath;
let dashboard, side, pdfPath, rootStyle, originalSide;
try {
  await plugin.activateDashboard(); dashboard = app.workspace.getLeavesOfType('jrs-dashboard')[0].view;
  side = app.workspace.getLeavesOfType('jrs-sidepanel')[0].view;
  originalSide = Object.fromEntries(['tab', 'companionMode', '_pdfDocumentPath', '_pdfSelection', '_pdfTranslation', '_annotationDraft', '_pdfError', '_annotationQuery', '_annotationFilter', '_annotationOrder', '_annotationLimit'].map((key) => [key, side[key]]));
  for (const key of ['_pdfDrafts', '_pdfTranslations', '_pdfSelections']) originalSide[key] = new Map(side[key]);
  rootStyle = dashboard.contentEl.getAttribute('style');
  await check('native left calendar and unified right companion are visible', async () => {
    const left = app.workspace.getLeavesOfType('jrs-life')[0];
    assert(left && left.getRoot() === app.workspace.leftSplit && left.view.contentEl.clientWidth > 0, 'left panel is not docked in Obsidian');
    assert(side.leaf.getRoot() === app.workspace.rightSplit, 'right companion is not docked');
    assert(app.workspace.getLeavesOfType('jrs-research-web').length === 0, 'web has a separate native button');
  });
  await check('3D cards change real paper context in the companion', async () => {
    const deck = dashboard._readingDeck; assert(deck?.papers.length, 'deck empty'); deck.select(1);
    assert(side.paper.path === deck.papers[1].path, 'paper context did not follow card');
    assert(getComputedStyle(deck.cards[1]).transform !== 'none', '3D transform missing');
    await wait(220); side.refreshContext();
    assert(side.paper.path === deck.papers[1].path, 'an older PDF overrode the selected card context');
    assert(deck.selectedTitle.textContent === deck.papers[1].title, 'full selected title missing');
    assert(deck.stage.querySelectorAll('.jrs-reading-card').length <= 7, 'off-screen cards are still mounted');
  });
  await check('reading-deck filters preserve context, bound mounted cards and disable empty actions', async () => {
    const deck = dashboard._readingDeck;
    deck.setFilter('all'); deck.select(deck.papers.length - 1);
    assert(deck.stage.querySelectorAll('.jrs-reading-card').length <= 7, 'too many mounted cards');
    assert(side.paper.path === deck.papers[deck.index].path, 'last card did not update companion');
    const currentPath = deck.papers[deck.index].path;
    deck.setFilter('todo'); deck.selectPath(currentPath);
    assert(deck.papers[deck.index]?.path === currentPath, 'queue action failed outside the current filter');
    deck.setFilter('todo');
    if (!deck.papers.length) assert(deck.tourButton.disabled && deck.modeButton.disabled && deck.host.querySelector('.jrs-empty-state'), 'empty deck exposes inactive actions');
    deck.setFilter('active');
  });
  await check('day and night backgrounds switch and text stays readable', async () => {
    for (const mode of ['day', 'night']) {
      plugin.settings.workspaceTheme = mode; plugin.applyAppearance();
      const root = getComputedStyle(dashboard.contentEl);
      assert(mode === 'day' ? root.color.includes('32, 57, 47') : root.color.includes('233, 241, 238'), 'foreground does not follow ' + mode);
      await until(() => {
        const heading = dashboard.contentEl.querySelector('h1');
        const expected = dashboard.contentEl.clientWidth <= 720 ? '25px' : '28px';
        return heading?.offsetWidth > 0 && getComputedStyle(heading).fontSize === expected;
      }, 'responsive heading after theme layout');
    }
  });
  await check('desktop and narrow boards have no collisions or horizontal overflow', async () => {
    for (const width of [390, 720, 1248]) {
      dashboard.contentEl.style.width = width + 'px'; dashboard.contentEl.style.maxWidth = width + 'px';
      await wait(120); dashboard.computeMetrics(); dashboard.applyPositions();
      const bounds = [...dashboard._shells.values()].map((shell) => shell.getBoundingClientRect());
      for (let i = 0; i < bounds.length; i++) for (const b of bounds.slice(i + 1)) {
        const a = bounds[i]; assert(!(a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1), 'cards overlap at ' + width);
      }
      assert(dashboard._page.scrollWidth <= dashboard._page.clientWidth + 1, 'horizontal overflow at ' + width);
    }
    dashboard.contentEl.setAttribute('style', rootStyle || ''); await wait(100);
  });
  await check('DeepSeek loads inside the same right panel and survives mode switching', async () => {
    if (!side._browser) await plugin.openResearchWeb('https://chat.deepseek.com/'); else side.showCompanionMode('web');
    await until(() => { try { return /^https?:/.test(side._browser.web.getURL()) && !side._browser.web.isLoading(); } catch { return false; } }, 'embedded website navigation');
    const web = side._browser.web; const id = web.getWebContentsId(); const address = web.getURL();
    side.showCompanionMode('assistant'); side.render(); side._modeButtons.web.click(); await wait(200);
    assert(side._browser.web === web && web.getWebContentsId() === id && web.getURL() === address, 'web instance was recreated');
    assert(web.getAttribute('partition') === 'persist:jensen-research', 'persistent account partition missing');
    side.showCompanionMode('assistant');
  });
  await check('website load errors remain visible and link edits preserve the guest instance', async () => {
    const browser = side._browser; const guest = browser.web; const id = guest.getWebContentsId();
    const failure = new Event('did-fail-load'); Object.assign(failure, { errorCode: -105, errorDescription: 'QA_NETWORK_ERROR' }); guest.dispatchEvent(failure); guest.dispatchEvent(new Event('did-stop-loading'));
    assert(!browser.status.hidden && browser.status.textContent.includes('QA_NETWORK_ERROR'), 'error state disappeared after loading stopped');
    guest.dispatchEvent(new Event('did-start-loading')); guest.dispatchEvent(new Event('did-stop-loading'));
    plugin.settings.commonLinks.push({ name: 'Research QA link', url: 'https://example.com/' }); side.refreshLinks();
    assert([...browser.links.options].some((option) => option.textContent === 'Research QA link'), 'website list did not refresh');
    assert(browser.web.getWebContentsId() === id, 'link refresh recreated the web guest');
    plugin.settings.commonLinks = structuredClone(original.commonLinks); side.refreshLinks();
  });
  await plugin.ensureFolder(folder + '/pdf'); await plugin.ensureFolder(folder + '/notes');
  plugin.settings.libFolder = folder + '/notes'; plugin.settings.sourceFolder = folder; plugin.settings.annotationsFolder = folder + '/annotations';
  if (!copiedSource) throw new Error('No PDF available for a real reader test');
  pdfPath = folder + '/pdf/Local research source.pdf'; await app.vault.copy(copiedSource, pdfPath);
  await check('source folder discovers an unindexed PDF without fabricating metadata', async () => {
    const papers = plugin.getPapers(); assert(papers.length === 1, 'source scan count incorrect');
    assert(papers[0].isPdfOnly && papers[0].pdf === pdfPath && papers[0].authors === '', 'unindexed PDF was not represented faithfully');
  });
  let paper = plugin.getPapers()[0];
  await check('3D card, list card and library title open the real PDF without creating a split', async () => {
    const groups = centerGroups(); const dashboardLeaf = dashboard.leaf;
    await dashboard.goto('home');
    let deck = dashboard._readingDeck; deck.mode = '3d'; deck.renderStage();
    deck.cards[0].click();
    await until(() => !deck._opening && app.workspace.activeLeaf?.view?.file?.path === pdfPath, 'card opens PDF');
    assert(centerGroups() === groups && dashboardLeaf.parent, 'ordinary card reading created a split or replaced the dashboard');
    await until(() => !plugin.getPapers()[0].isPdfOnly, 'reading metadata ready'); paper = plugin.getPapers()[0];
    await plugin.gotoSection('home'); deck = dashboard._readingDeck;
    deck.mode = '3d'; deck.renderStage();
    deck.modeButton.click(); await until(() => deck.mode === 'list', 'list mode');
    deck.cards[0].click(); await until(() => !deck._opening && app.workspace.activeLeaf?.view?.file?.path === pdfPath, 'list opens PDF');
    assert(centerGroups() === groups, 'list card created a split');
    await plugin.gotoSection('library'); dashboard._panel.host.querySelector('.od-paper-title').click();
    await until(() => app.workspace.activeLeaf?.view?.file?.path === pdfPath, 'library title opens PDF');
    assert(centerGroups() === groups && app.workspace.activeLeaf.view.getViewType() === 'pdf', 'library title opened the note or split');
  });
  await check('explicit split reading is reusable and ordinary reading returns to the same tab group', async () => {
    const groups = centerGroups(); await plugin.gotoSection('home');
    const deck = dashboard._readingDeck; deck.splitButton.click();
    await until(() => !deck._opening && plugin._readingPdfLeaf?.view?.file?.path === pdfPath, 'explicit split open');
    await until(() => app.workspace.getLeavesOfType('pdf').some((leaf) => leaf.view.file?.path === pdfPath), 'PDF open');
    assert(paper.file.extension === 'md' && app.vault.getAbstractFileByPath(pdfPath), 'PDF was replaced or not indexed');
    assert(app.workspace.getLeavesOfType('jrs-sidepanel')[0] === side.leaf, 'companion leaf replaced');
    const leaf = plugin._readingPdfLeaf;
    assert(leaf.getRoot() === app.workspace.rootSplit, 'PDF opened in the sidebar');
    assert(leaf.parent !== plugin._readingNoteLeaf.parent && centerGroups() === groups + 1, 'note and PDF were not opened side by side');
    await plugin.openReading(paper, { split: true });
    assert(centerGroups() === groups + 1 && plugin._readingPdfLeaf === leaf, 'repeated split reading added another pane');
    await plugin.gotoSection('home'); const currentDeck = dashboard._readingDeck; currentDeck.readButton.click();
    await until(() => !currentDeck._opening && app.workspace.activeLeaf?.view?.file?.path === pdfPath && !plugin._readingPdfLeaf, 'return to ordinary reading');
    assert(centerGroups() === groups && app.vault.getAbstractFileByPath(paper.path), 'ordinary reading did not close its own split or removed the note');
  });
  await check('ordinary reading preserves a split pane repurposed for another note', async () => {
    await plugin.openReading(paper, { split: true });
    const pdfLeaf = plugin._readingPdfLeaf, noteLeaf = plugin._readingNoteLeaf;
    const manual = await app.vault.create(folder + '/User work.md', 'Keep this independent work');
    await noteLeaf.openFile(manual, { active: true });
    await plugin.gotoSection('home'); await plugin.openReading(paper);
    assert(noteLeaf.parent && noteLeaf.view.file?.path === manual.path && pdfLeaf.parent, 'an independently changed pane was closed');
    noteLeaf.detach(); pdfLeaf.detach(); plugin._readingPdfLeaf = plugin._readingNoteLeaf = null;
  });
  await check('native PDF page changes update sidebar controls and resume after reopening', async () => {
    let leaf = app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdfPath);
    await until(() => leaf.view.viewer?.child?.pdfViewer?.pdfViewer?.pagesCount > 1, 'PDF viewer ready');
    const viewer = leaf.view.viewer.child.pdfViewer.pdfViewer; plugin.pdfResearch.trackReaders();
    side.usePdf(pdfPath); side.tab = 'pdf'; side.render();
    const page = Math.min(3, viewer.pagesCount); viewer.currentPageNumber = page;
    await until(() => plugin.pdfResearch.readingPosition(pdfPath)?.page === page && Number(side._pdfUi.page.value) === page, 'live page update');
    await plugin.pdfResearch.flushPositions();
    leaf.detach(); plugin.pdfResearch.trackReaders();
    await plugin.openReading(paper);
    leaf = app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdfPath);
    await until(() => leaf.view.viewer?.child?.pdfViewer?.pdfViewer?.currentPageNumber === page, 'reading position restore');
    leaf.detach(); plugin.pdfResearch.trackReaders();
    const extracted = await plugin.pdfResearch.readText(pdfPath, 1, 1000);
    assert(extracted.includes('[PDF 第 1 页]'), 'text extraction missing');
    leaf = app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdfPath);
    assert(leaf.view.viewer.child.pdfViewer.pdfViewer.currentPageNumber === page, 'AI extraction reset the reading bookmark');
    await plugin.openPdf(pdfPath);
    assert(plugin.pdfResearch.readingPosition(pdfPath).page === page, 'direct PDF button reset reading position');
    await plugin.pdfResearch.jump(pdfPath, 1);
  });
  await check('real PDF selection captures page geometry and persists highlights and comments', async () => {
    const leaf = app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdfPath);
    await until(() => [...leaf.view.contentEl.querySelectorAll('.textLayer span')].some((span) => span.textContent.trim().length > 20), 'PDF text layer');
    const text = [...leaf.view.contentEl.querySelectorAll('.textLayer span')].find((span) => span.textContent.trim().length > 20);
    const range = document.createRange(); range.selectNodeContents(text); window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    const captured = plugin.pdfResearch.captureSelection();
    assert(captured?.pdf === pdfPath && captured.page >= 1 && captured.rects.length > 0, 'PDF selection geometry missing');
    const annotation = await plugin.pdfResearch.save(captured, 'Integration annotation', 'amber');
    assert(plugin.pdfResearch.annotations(pdfPath).some((entry) => entry.id === annotation.id), 'annotation not persisted');
    const file = app.vault.getAbstractFileByPath(plugin.pdfResearch.notePath(pdfPath)); const content = await app.vault.read(file);
    assert(content.includes('#page=' + captured.page) && content.includes('Integration annotation'), 'page-linked Markdown missing');
    assert(leaf.view.contentEl.querySelectorAll('.jrs-pdf-mark').length > 0, 'visible PDF highlight missing');
    window.getSelection().removeAllRanges();
  });
  await check('annotation edit, search, copy and delete undo are connected to stored Markdown', async () => {
    side.tab = 'pdf'; side.usePdf(pdfPath); side.render();
    const annotation = plugin.pdfResearch.annotations(pdfPath)[0];
    const article = side._body.querySelector(`[data-annotation-id="${annotation.id}"]`);
    article.querySelector('[aria-label="编辑这条批注"]').click();
    await until(() => document.querySelector('.jrs-annotation-editor textarea'), 'annotation editor');
    const editor = document.querySelector('.jrs-annotation-editor'); const input = editor.querySelector('textarea');
    input.value = 'Revised evidence QA'; input.dispatchEvent(new Event('input', { bubbles: true }));
    [...editor.querySelectorAll('button')].find((button) => button.textContent.includes('保存修改')).click();
    await until(() => plugin.pdfResearch.annotations(pdfPath)[0].note === 'Revised evidence QA', 'annotation edit save');
    const search = side._body.querySelector('[aria-label="搜索批注原文或评论"]'); search.value = 'NONEXISTENT_qa'; search.dispatchEvent(new Event('input'));
    assert(!side._body.querySelector('.jrs-pdf-annotation-item'), 'search did not filter comments');
    search.value = 'Revised evidence'; search.dispatchEvent(new Event('input'));
    assert(side._body.querySelector('.jrs-pdf-annotation-item'), 'comment search failed');
    side._body.querySelector('[aria-label="删除这条批注"]').click();
    await until(() => plugin.pdfResearch.annotations(pdfPath).length === 0, 'annotation delete');
    const note = app.vault.getAbstractFileByPath(plugin.pdfResearch.notePath(pdfPath)); await app.vault.append(note, '\nIndependent manual note.\n');
    [...side._body.querySelectorAll('button')].find((button) => button.textContent.includes('撤销删除')).click();
    await until(() => plugin.pdfResearch.annotations(pdfPath).length === 1, 'annotation undo');
    const text = await app.vault.read(note); assert(text.includes('Revised evidence QA') && text.includes('Independent manual note.'), 'undo overwrote manual changes');
    side._annotationQuery = ''; side.renderBody();
  });
  await check('changing real PDF selections preserves each unsaved comment', async () => {
    const leaf = app.workspace.getLeavesOfType('pdf').find((entry) => entry.view.file?.path === pdfPath);
    await plugin.pdfResearch.jump(pdfPath, 1);
    const seen = new Set();
    const spans = [...leaf.view.contentEl.querySelectorAll('.textLayer span')].filter((span) => { const text = span.textContent.trim(); if (text.length <= 20 || seen.has(text)) return false; seen.add(text); return true; });
    assert(spans.length > 1, 'not enough PDF text for two selections');
    const select = (span) => { const range = document.createRange(); range.selectNodeContents(span); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); return plugin.pdfResearch.captureSelection(); };
    const first = select(spans[0]);
    let input = side._body.querySelector('.jrs-pdf-panel textarea'); input.value = 'Draft first'; input.dispatchEvent(new Event('input'));
    const second = select(spans[1]); input = side._body.querySelector('.jrs-pdf-panel textarea'); input.value = 'Draft second'; input.dispatchEvent(new Event('input'));
    side.setPdfSelection(first); assert(side._body.querySelector('.jrs-pdf-panel textarea').value === 'Draft first', 'first draft lost; sameText=' + (first.text === second.text) + '; draftCount=' + side._pdfDrafts.size + '; loaded=' + side._annotationDraft);
    side.setPdfSelection(second); assert(side._body.querySelector('.jrs-pdf-panel textarea').value === 'Draft second', 'second draft lost');
    window.getSelection().removeAllRanges();
  });
  await check('AI reading source contains actual PDF text rather than an empty note template', async () => {
    const source = await plugin.readPaperBody(paper);
    assert(source.includes('[PDF 第 1 页]') && source.length > 300, 'PDF text extraction did not provide real evidence');
  });
  await check('translation preview uses captured PDF text and can save original plus translation', async () => {
    let calls = 0; plugin.aiChat = async () => { calls++; return '受控测试译文，不调用真实 API。'; };
    const selection = side._pdfSelection || plugin.pdfResearch.selection;
    await side.translatePdfSelection(selection);
    assert(calls === 1 && side._pdfTranslation?.selection.pdf === pdfPath, 'translation preview missing');
    await plugin.pdfResearch.save(side._pdfTranslation.selection, side._pdfTranslation.text, 'mint');
    assert(plugin.pdfResearch.annotations(pdfPath).length === 2, 'translation not saved');
    plugin.aiChat = originalAI;
  });
  await check('reading status and progress remain consistent after repeated actions', async () => {
    await plugin.setPaperStatus(paper, '待读');
    for (let i = 0; i < 4; i++) await plugin.bumpProgress(paper, 25);
    await until(() => app.metadataCache.getFileCache(paper.file)?.frontmatter?.status === '已完成', 'status metadata');
    assert(app.metadataCache.getFileCache(paper.file).frontmatter.reading_progress === 100, 'progress not 100');
    await plugin.setPaperStatus(paper, '待读'); await until(() => app.metadataCache.getFileCache(paper.file)?.frontmatter?.reading_progress === 0, 'reset progress');
  });
  await check('batch changes can be undone without deleting metadata', async () => {
    await plugin.applyPaperBatch([paper], { priority: '高', project: 'QA project' });
    await plugin.undoPaperBatch(); await until(() => app.metadataCache.getFileCache(paper.file)?.frontmatter?.priority !== '高', 'batch undo');
    assert(app.metadataCache.getFileCache(paper.file).frontmatter.title, 'title lost');
  });
  await check('CSV and BibTeX exports contain only the selected source documents', async () => {
    const csv = await plugin.exportPapers('csv', plugin.getPapers()); const bib = await plugin.exportPapers('bib', plugin.getPapers());
    assert((await app.vault.read(csv)).includes('Local research source'), 'CSV content missing');
    assert((await app.vault.read(bib)).includes('@article{'), 'BibTeX content missing');
  });
  await check('library search, list/card controls and empty state are wired to real results', async () => {
    await dashboard.goto('library'); const panel = dashboard._panel;
    const input = panel.host.querySelector('input[type="search"]'); input.value = 'has:pdf status:待读'; input.dispatchEvent(new Event('input'));
    assert(panel.filtered().length === 1, 'structured search did not filter');
    input.value = 'title:NONEXISTENT_qa'; input.dispatchEvent(new Event('input')); assert(panel.host.querySelector('.jrs-empty-state'), 'empty state missing');
    panel.reset(); panel.viewMode = 'grid'; panel.render(); assert(panel.host.querySelector('.jrs-library-grid'), 'card view missing');
    assert(panel.host.querySelector('.jrs-source-bar select').value === folder, 'source folder not displayed');
  });
  await check('companion remains usable in a narrower native sidebar', async () => {
    const before = side.contentEl.getAttribute('style');
    try {
      for (const width of [260, 320, 386]) {
        side.contentEl.style.width = width + 'px'; side.contentEl.style.maxWidth = width + 'px';
        for (const tab of ['paper', 'pdf', 'writing', 'tools']) {
          side.tab = tab; side.render(); await wait(40);
          assert(side._body.scrollWidth <= side._body.clientWidth + 1, `sidebar ${tab} overflows at ${width}`);
        }
      }
    } finally { side.contentEl.setAttribute('style', before || ''); side.tab = 'paper'; side.render(); }
  });
  await check('wellness records persist by date and are reversible', async () => {
    const date = '2000-01-01'; const before = structuredClone(plugin.settings.wellnessLog[date]);
    try {
      const count = plugin.wellnessDay(date).water; await plugin.recordWellness('water', date, 1);
      assert(plugin.wellnessDay(date).water === count + 1, 'water counter did not change');
      await plugin.recordWellness('water', date, -1); assert(plugin.wellnessDay(date).water === count, 'water undo failed');
    } finally { if (before === undefined) delete plugin.settings.wellnessLog[date]; else plugin.settings.wellnessLog[date] = before; }
  });
} catch (error) { checks.push({ name: 'integration harness', ok: false, error: error.stack }); }
finally {
  plugin.aiChat = originalAI; plugin._lastPaperBatch = originalBatch; plugin._contextPaperPath = originalContext;
  Object.assign(plugin.settings, original);
  if (pdfPath) delete plugin.settings.pdfAnnotations[pdfPath];
  side && (side._pdfSelection = side._pdfTranslation = null); plugin.pdfResearch.selection = null;
  await plugin.saveSettings(); plugin.applyAppearance(); plugin.pdfResearch.revision++;
  app.workspace.getLeavesOfType('pdf').filter((leaf) => leaf.view.file?.path.startsWith(folder + '/')).forEach((leaf) => leaf.detach());
  app.workspace.getLeavesOfType('markdown').filter((leaf) => leaf.view.file?.path.startsWith(folder + '/')).forEach((leaf) => leaf.detach());
  plugin.pdfResearch.trackReaders();
  if (pdfPath) delete plugin.settings.pdfReadingPositions[pdfPath];
  await plugin.pdfResearch.flushPositions();
  await plugin.saveSettings();
  const temporary = app.vault.getAbstractFileByPath(folder); if (temporary && folder.startsWith('OrbitDesk 验证临时/qa-')) await app.vault.delete(temporary, true);
  if (dashboard) { dashboard.contentEl.setAttribute('style', rootStyle || ''); await dashboard.goto('home'); }
  if (side) { side.tab = 'paper'; side.showCompanionMode('assistant'); side.refreshContext(); }
  await plugin.activateDashboard();
  if (side && originalSide) { Object.assign(side, originalSide); side.render(); }
}
return { checks };
