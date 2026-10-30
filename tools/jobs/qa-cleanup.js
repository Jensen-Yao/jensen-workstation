const p = app.plugins.plugins['jensen-workstation'];
const out = { deleted: [] };
for (const f of p.app.vault.getAllLoadedFiles()) {
  if (/^(QA-测试|QA)/.test(f.path)) {
    try { await p.app.vault.delete(f, true); out.deleted.push(f.path); } catch (e) { out.deleted.push(f.path + ' ERR ' + e.message); }
  }
}
// 二次确认无残留
out.left = p.app.vault.getAllLoadedFiles().filter((f) => /QA/.test(f.path)).map((f) => f.path);
return JSON.stringify(out, null, 1);
