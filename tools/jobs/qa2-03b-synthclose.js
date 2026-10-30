/* T3b: 生成中关闭弹窗（单独重跑，稳健的 modal 定位） */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = {};
const cap = { count: 0 };
const origSynth = p.aiSynthesis;
window.__qaErrList = [];
window.addEventListener('error', (e) => window.__qaErrList.push(String(e.message)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findModal = () => [...document.querySelectorAll('.modal-container .modal')].find((m) => m.textContent.includes('AI 跨论文综述')) || null;
p.aiSynthesis = async function () {
  cap.count += 1;
  await sleep(700);
  let f = app.vault.getAbstractFileByPath('QA-R2-TMP/stub.md');
  if (!f) f = await app.vault.create('QA-R2-TMP/stub.md', 'stub');
  return f;
};
try {
  await p.ensureFolder('QA-R2-TMP');
  app.commands.executeCommandById('jensen-workstation:ai-synthesis');
  await sleep(200);
  const m = findModal();
  out.modalFound = !!m;
  const btn = m && [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click();
  await sleep(100);
  /* 立刻按 Escape 关闭 */
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(1000);
  out.modalGoneAfterEsc = !findModal();
  out.generationCompletedDespiteClose = cap.count === 1;
  out.windowErrors = window.__qaErrList;
  out.stubFileExists = !!app.vault.getAbstractFileByPath('QA-R2-TMP/stub.md');
} catch (e) { out.error = e.message; }
finally {
  p.aiSynthesis = origSynth;
  const m = findModal(); if (m) { const x = m.querySelector('.modal-close-button'); if (x) x.click(); }
  window.removeEventListener('error', (e) => window.__qaErrList.push(String(e.message)));
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
}
return out;
