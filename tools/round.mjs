#!/usr/bin/env node
/* ==========================================================================
 * round.mjs —— 迭代循环固化：取证 → (双子代理批评, 见 tools/critic-prompts.md)
 *             → 人工修复 → verify 复验 → 发布
 * 用法:
 *   node tools/round.mjs evidence          采证：10视图截图 + 全量交互审计 + 危险测试重放
 *   node tools/round.mjs verify            复验：audit + 功能重放 + DOM 抽查
 *   node tools/round.mjs release 0.X.0 "notes..."   bump版本+commit+tag+release+同步母版
 * 前置：Obsidian 以 --remote-debugging-port=9223 启动
 * ========================================================================== */
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';

const run = (cmd, opts = {}) => execSync(cmd, { cwd: 'F:/OrbitDesk', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const log = (s) => console.log(s);

function nextRound() {
  const dirs = readdirSync('F:/OrbitDesk/shots').filter((d) => /^round\d+$/.test(d));
  return dirs.length ? Math.max(...dirs.map((d) => Number(d.slice(5)))) + 1 : 1;
}

function evidence() {
  const N = nextRound();
  const dir = `F:/OrbitDesk/shots/round${N}`;
  mkdirSync(dir, { recursive: true });
  log(`── Round ${N} 取证 ──`);
  log('[1/3] 9 区段截图 + 右栏…');
  run('node tools/sections.mjs', { stdio: 'inherit' });
  run('node tools/eval.mjs "(async()=>{const p=app.plugins.plugins[\'jensen-workstation\'];await p.activateSidePanel();return 1;})()"');
  run('node tools/shot.mjs "F:/OrbitDesk/shots/round' + N + '/sidepanel.jpg"', { stdio: 'inherit' });
  for (const f of readdirSync('F:/OrbitDesk/shots/sections')) {
    try { require('node:fs').copyFileSync(`F:/OrbitDesk/shots/sections/${f}`, `${dir}/${f}`); } catch (e) {}
  }
  log('[2/3] 全量交互审计…');
  const audit = run('node tools/audit.mjs').toString();
  const dead = (audit.match(/疑似死点 (\d+) 个/) || [])[1];
  log(`      审计完成，疑似死点 ${dead} 个`);
  log('[3/3] 危险测试重放…');
  const rv = run('node tools/run.mjs tools/jobs/r1-reverify.js').toString();
  log(`      ${rv.trim().split('\n').pop()}`);
  writeFileSync(`${dir}/summary.json`, JSON.stringify({ round: N, deadPoints: dead, reverify: rv.trim(), ts: Date.now() }, null, 2));
  log(`\n✅ 证据就绪：${dir}（10+ 截图 + audit-report.json + summary.json）`);
  log(`下一步：按 tools/critic-prompts.md 各派一个子代理（视觉/功能），把 ${dir} 路径填入模板。`);
}

function verify() {
  log('── 复验 ──');
  const audit = run('node tools/audit.mjs').toString();
  const m = audit.match(/有效交互 (\d+)\/(\d+)/);
  log(`audit: ${m ? m[1] + '/' + m[2] : '?'}`);
  const dead = [...audit.matchAll(/❌ \[(\w+)\] <(\w+)[^>]*> "([^"]*)"/g)].map((x) => `${x[1]} | ${x[2]} | ${x[3]}`);
  dead.forEach((d) => log('  死点:', d));
  const rv = run('node tools/run.mjs tools/jobs/r1-reverify2.js').toString();
  log('危险测试:', rv.trim().split('\n').pop());
  log(dead.length === 0 ? '✅ audit 全绿' : `⚠️ ${dead.length} 个死点待修`);
}

function release(ver, notes) {
  const m = JSON.parse(readFileSync('F:/OrbitDesk/manifest.json', 'utf8'));
  m.version = ver;
  writeFileSync('F:/OrbitDesk/manifest.json', JSON.stringify(m, null, 2));
  run('node --check main.js');
  run('git add -A');
  try { run(`git commit -q -m "v${ver}: ${notes.split('\n')[0]}"`); } catch (e) { log('(commit 跳过：无新变更或已提交)'); }
  run('git push -q origin main');
  run(`git tag ${ver.startsWith('v') ? ver : 'v' + ver} 2>nul || exit 0`, { shell: 'cmd.exe' });
  run(`git push -q origin v${ver}`);
  run('cp main.js manifest.json styles.css /tmp/');
  run(`gh release create v${ver} --title "v${ver}" --notes ${JSON.stringify(notes)} /tmp/main.js /tmp/manifest.json /tmp/styles.css`, { stdio: 'inherit' });
  /* 同步中央母版：直接拷三件套（bat 含 pause 会挂起） */
  for (const f of ['main.js', 'manifest.json', 'styles.css']) {
    cpSync(`F:/OrbitDesk/${f}`, `F:/ObWork/.shared-plugins/jensen-workstation/${f}`);
  }
  log(`✅ v${ver} 发布并同步母版`);
}

const [, , cmd, ...args] = process.argv;
if (cmd === 'evidence') evidence();
else if (cmd === 'verify') verify();
else if (cmd === 'release') release(args[0], args.slice(1).join(' '));
else console.log('用法: node tools/round.mjs evidence|verify|release <ver> <notes>');
