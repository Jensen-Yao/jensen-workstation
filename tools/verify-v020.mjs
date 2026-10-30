import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { connect } from './cdp.mjs';
const cdp = await connect();
try {
  await mkdir(new URL('../.jrs-tmp/', import.meta.url), { recursive: true });
  const source = await readFile(new URL('../tests/obsidian-integration.js', import.meta.url), 'utf8');
  const report = await cdp.evaluate(`(async () => {${source}\n})()`);
  await writeFile(new URL('../.jrs-tmp/verification.json', import.meta.url), JSON.stringify(report, null, 2));
  for (const check of report.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.error ? ': ' + check.error : ''}`);
  console.log(`${report.checks.filter((check) => check.ok).length}/${report.checks.length} integration checks passed`);
  if (report.checks.some((check) => !check.ok)) process.exitCode = 1;
} finally { cdp.close(); }
