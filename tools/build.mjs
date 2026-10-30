// Keep Obsidian distribution dependency-free: main.js + styles.css + manifest.json.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const entry = new URL('main.js', root);
let main = await readFile(entry, 'utf8');
for (const [name, path, transform] of [
  ['SECTIONS', 'src/section-workspace.js', (source) => source],
  ['CORE', 'src/core.cjs', (source) => 'const ResearchCore = (() => {\n' + source.replace(/^'use strict';\s*/, '').replace(/module\.exports = /, 'return ') + '\n})();'],
  ['LIBRARY', 'src/library-panel.js', (source) => source.replace(/\nmodule\.exports = LibraryPanel;\s*$/, '')],
  ['ASSISTANT', 'src/side-panel.js', (source) => source.replace(/\nmodule\.exports = SidePanelView;\s*$/, '')],
  ['DECK', 'src/reading-deck.js', (source) => source],
  ['LIFE', 'src/productivity.js', (source) => source],
  ['PDF', 'src/pdf-research.js', (source) => source],
  ['WEB', 'src/research-browser.js', (source) => source],
]) {
  const start = `/* BEGIN GENERATED ${name} */`;
  const end = `/* END GENERATED ${name} */`;
  const from = main.indexOf(start); const to = main.indexOf(end);
  if (from < 0 || to < from) throw new Error(`Missing ${name} markers in ${fileURLToPath(entry)}`);
  const source = transform((await readFile(new URL(path, root), 'utf8')).trim());
  main = main.slice(0, from) + start + '\n' + source + '\n' + main.slice(to);
}
await writeFile(entry, main);
const stylesPath = new URL('styles.css', root);
let styles = await readFile(stylesPath, 'utf8');
const cssStart = '/* BEGIN GENERATED WORKSPACE */';
const cssEnd = '/* END GENERATED WORKSPACE */';
const from = styles.indexOf(cssStart); const to = styles.indexOf(cssEnd);
if (from < 0 || to < from) throw new Error('Missing workspace CSS markers');
styles = styles.slice(0, from) + cssStart + '\n' + await readFile(new URL('src/workspace.css', root), 'utf8') + '\n' + await readFile(new URL('src/sections.css', root), 'utf8') + '\n' + styles.slice(to);
await writeFile(stylesPath, styles);
console.log('Embedded core, library, assistant and workspace styles');
