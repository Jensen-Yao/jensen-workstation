const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const today = window.moment().format('YYYY-MM-DD');
out.manifestRunning = p.manifest && p.manifest.version;
out.repoExpect = '0.13.0';
window.__qaR2Baseline = {
  settings: JSON.parse(JSON.stringify(p.settings)),
  dashLeaves: app.workspace.getLeavesOfType('jrs-dashboard').length,
  sideLeaves: app.workspace.getLeavesOfType('jrs-sidepanel').length,
  fileLeaf: p._fileLeaf ? 'set' : 'none',
  askLogExisted: !!app.vault.getAbstractFileByPath('科研工作台/AI问答/' + today + '.md'),
};
out.hiddenCards = p.settings.hiddenCards;
out.columns = p.settings.columns;
out.dashLeaves = window.__qaR2Baseline.dashLeaves;
out.sideLeaves = window.__qaR2Baseline.sideLeaves;
out.askLogExisted = window.__qaR2Baseline.askLogExisted;
const leaf = app.workspace.getLeavesOfType('jrs-dashboard')[0];
if (leaf) {
  const v = leaf.view;
  out.renderGraphHasThumb = String(v.renderGraph).includes('jrs-graph-thumb');
  out.renderSubmitForceReload = String(v.renderSubmit).includes('loadJournalCache(true)');
  out.viewHasSmartOpenFn = typeof v.smartOpenFile;
}
const jf = app.vault.getAbstractFileByPath('科研工作台/期刊分区缓存.json');
out.jcacheBytes = jf ? jf.stat.size : null;
out.jcacheLoaded = !!p._jcache;
out.pomoPhase = p.pomo.phase;
out.pomoListeners = p.pomo.listeners.size;
out.windowSize = [window.innerWidth, window.innerHeight];
out.papers = p.getPapers().length;
out.tempFolderExists = !!app.vault.getAbstractFileByPath('QA-R2-TMP');
return out;
