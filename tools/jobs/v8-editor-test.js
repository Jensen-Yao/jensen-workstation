const p = app.plugins.plugins['jensen-workstation'];
/* 清理可能的残留 */
const old = app.vault.getAbstractFileByPath('jrs-ai-test.md');
if (old) await app.vault.trash(old, true);
const tf = await app.vault.create('jrs-ai-test.md', '这个方法让卫星拍照片变得更快更好了，效果不错。');
const leaf = app.workspace.getLeaf('tab');
await leaf.openFile(tf);
await new Promise((r) => setTimeout(r, 600));
const editor = app.workspace.activeEditor?.editor;
if (!editor) { await app.vault.trash(tf, true); return 'no editor'; }
const lineLen = editor.getLine(0).length;
editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: lineLen });
await p.aiEditSelection(editor, 'polish');
await new Promise((r) => setTimeout(r, 300));
const after = editor.getValue();
await app.vault.trash(tf, true);
return JSON.stringify({ polished: after.slice(0, 90), changed: after !== '这个方法让卫星拍照片变得更快更好了，效果不错。' });
