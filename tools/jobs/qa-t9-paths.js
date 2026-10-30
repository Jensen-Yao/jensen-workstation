const p = app.plugins.plugins['jensen-workstation'];
const out = {};
const orig = p.settings.libFolder;
const origSurvey = p.settings.surveyNote;
try {
  const cnt = (lbl) => { try { out[lbl] = p.getPapers().length; } catch (e) { out[lbl] = 'THROW: ' + e.message; } };
  out.before = p.getPapers().length;

  p.settings.libFolder = '科研工作台/文献/'; cnt('trailingSlash');
  p.settings.libFolder = '科研工作台\\文献'; cnt('backslash_winPaste');
  p.settings.libFolder = ''; cnt('emptyString');
  p.settings.libFolder = '科研工作台/文 献'; cnt('wrongName_silent');
  p.settings.libFolder = 'QA:非法路径'; cnt('colonPath');
  // colon path 下实际创建文献（AddPaperModal 的真实调用路径）
  try {
    await p.createPaperNote({ title: 'QA路径测试', authors: '', year: '2024', venue: '', status: '待读', topics: [], pdf: '' }, false);
    out.colonCreate = 'OK?! file=' + (p.app.vault.getAbstractFileByPath('QA:非法路径/QA路径测试.md') ? 'created' : 'unknown');
  } catch (e) { out.colonCreate = 'THROW: ' + e.message; }

  // ensureFolder 直接测试冒号
  p.settings.libFolder = 'QA/子:目录';
  try { await p.ensureFolder('QA/子:目录'); out.colonEnsure = 'OK'; }
  catch (e) { out.colonEnsure = 'THROW: ' + e.message; }

  // surveyNote 指向带引号路径 → 矩阵/base 文件生成检查（只测 dir 拼接，不真生成）
  p.settings.surveyNote = 'QA"注入/综述.md';
  out.matrixDirDerived = p.settings.surveyNote.split('/').slice(0, -1).join('/');
} finally {
  p.settings.libFolder = orig;
  p.settings.surveyNote = origSurvey;
}
out.restoredCount = p.getPapers().length;
// 清理可能的 QA 文件
const leftovers = p.app.vault.getAllLoadedFiles().filter((f) => /^QA/.test(f.path));
for (const f of leftovers) { try { await p.app.vault.delete(f, true); } catch (e) {} }
out.cleaned = leftovers.map((f) => f.path);
return JSON.stringify(out, null, 1);
