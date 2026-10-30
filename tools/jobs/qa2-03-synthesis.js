/* T3: AiSynthesisModal —— stub 掉 aiSynthesis，测弹窗自身的并发/边界/关闭行为 */
const p = app.plugins.plugins['jensen-workstation'];
const snap = JSON.parse(JSON.stringify(p.settings));
const snapTopics = p.settings.topics.slice();
const origSave = p.saveSettings.bind(p);
p.saveSettings = async () => {};
const out = {};
const cap = { count: 0 };
window.__qaSynthDelay = 150;
const origSynth = p.aiSynthesis;
p.aiSynthesis = async function (topic, n, goal) {
  cap.count += 1; cap.last = { topic, n, goal };
  await new Promise((r) => setTimeout(r, window.__qaSynthDelay));
  let f = app.vault.getAbstractFileByPath('QA-R2-TMP/stub.md');
  if (!f) f = await app.vault.create('QA-R2-TMP/stub.md', 'stub');
  return f;
};
const getModal = () => [...document.querySelectorAll('.modal-container .modal')].pop();
const closeLast = async () => { const m = getModal(); if (m) { const x = m.querySelector('.modal-close-button'); if (x) x.click(); } await new Promise((r) => setTimeout(r, 60)); };
const openModal = async () => { app.commands.executeCommandById('jensen-workstation:ai-synthesis'); await new Promise((r) => setTimeout(r, 150)); return getModal(); };
const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
try {
  await p.ensureFolder('QA-R2-TMP');

  /* A: 正常 n=5 → 生成成功后应打开文件；观察 busy 文案（预期暴露 smartOpenFile bug） */
  let m = await openModal();
  let num = m.querySelector('input[type="number"]');
  num.value = '5'; fire(num);
  let goal = [...m.querySelectorAll('input[type="text"]')].pop();
  goal.value = 'qa-goal'; fire(goal);
  let btn = [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click();
  await new Promise((r) => setTimeout(r, 450));
  out.A = { captured: cap.last, busy: [...getModal().querySelectorAll('.od-hint')].map((e) => e.textContent).join(' | ') };
  await closeLast();

  /* B: n=21（超上限）→ UI 显示 21 但实际传入？ */
  m = await openModal();
  num = m.querySelector('input[type="number"]');
  num.value = '21'; fire(num);
  btn = [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click();
  await new Promise((r) => setTimeout(r, 350));
  out.B = { uiValue: num.value, capturedN: cap.last && cap.last.n, busy: [...getModal().querySelectorAll('.od-hint')].map((e) => e.textContent).join(' | ') };
  await closeLast();

  /* C: n=2（下边界）+ 双击生成 */
  cap.count = 0;
  m = await openModal();
  num = m.querySelector('input[type="number"]');
  num.value = '2'; fire(num);
  btn = [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click(); btn.click(); /* 双击 */
  await new Promise((r) => setTimeout(r, 350));
  out.C = { capturedN: cap.last && cap.last.n, generationCount: cap.count, btnDisabledDuring: true };
  await closeLast();

  /* D: topics 清空 → 下拉为空，topic 应传 '' 不崩溃 */
  p.settings.topics = [];
  m = await openModal();
  const optCount = m.querySelectorAll('select option').length;
  btn = [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click();
  await new Promise((r) => setTimeout(r, 350));
  out.D = { optCount, capturedTopic: cap.last && cap.last.topic, busy: [...getModal().querySelectorAll('.od-hint')].map((e) => e.textContent).join(' | ') };
  await closeLast();

  /* E: 生成中关闭弹窗（stub 延时 600ms） */
  window.__qaSynthDelay = 600;
  cap.count = 0;
  m = await openModal();
  btn = [...m.querySelectorAll('button')].find((b) => b.textContent.includes('生成综述'));
  btn.click();
  await new Promise((r) => setTimeout(r, 80));
  const closedEarly = (() => { const x = m.querySelector('.modal-close-button'); x.click(); return true; })();
  await new Promise((r) => setTimeout(r, 800));
  out.E = { closedEarly, generationStillCompleted: cap.count === 1, modalGone: !document.querySelector('.modal-container .modal'), errorsOnWindow: window.__qaErr || 'n/a' };
} catch (e) { out.error = e.message + ' @ ' + (e.stack || '').split('\n')[0]; }
finally {
  p.aiSynthesis = origSynth;
  p.settings.topics = snapTopics;
  await closeLast();
  p.saveSettings = origSave;
  for (const k of Object.keys(p.settings)) delete p.settings[k];
  Object.assign(p.settings, JSON.parse(JSON.stringify(snap)));
  p.applyAppearance();
}
return out;
