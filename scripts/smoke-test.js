#!/usr/bin/env node
'use strict';
/*
 * Verification harness (no network). Run: `node scripts/smoke-test.js`.
 * npm pack -> install the tarball into a TEMP prefix + TEMP HOME -> dry-run setup for both
 * targets -> assert planned actions match the manifest (6 eligible skills, init-join-us absent
 * from the tarball, AGENTS.md untouched, no writes). Exits non-zero on any failed assertion.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`); if (!cond) failures++; };
const run = (cmd, args, opts = {}) => cp.execFileSync(cmd, args, { encoding: 'utf8', ...opts });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'join-us-smoke-'));
const prefix = path.join(tmp, 'prefix');
const home = path.join(tmp, 'home');
fs.mkdirSync(prefix, { recursive: true });
fs.mkdirSync(home, { recursive: true });

try {
  // 1) pack
  const packOut = run('npm', ['pack', '--silent', '--pack-destination', tmp], { cwd: root });
  const tarball = packOut.trim().split('\n').filter(Boolean).pop().trim();
  const tarPath = path.join(tmp, tarball);
  ok(fs.existsSync(tarPath), `npm pack produced ${tarball}`);

  // init-join-us must NOT be in the tarball (local-only: secrets/PII/infra)
  const tarList = run('tar', ['-tzf', tarPath]);
  const tarLines = tarList.split('\n').map((s) => s.trim());
  ok(!/skills\/init-join-us\//.test(tarList), 'tarball excludes skills/init-join-us (local-only)');
  // config: template ships, real private config never does
  ok(tarLines.some((l) => l.endsWith('config/join-us.env.example')), 'tarball includes config/join-us.env.example (template)');
  ok(!tarLines.some((l) => l.endsWith('config/join-us.env')), 'tarball excludes real config/join-us.env (private)');
  // build artifacts must never ship (a stray .pyc embeds an absolute path + bypasses name-only scans)
  ok(!tarLines.some((l) => l.endsWith('.pyc')), 'tarball excludes compiled *.pyc');
  ok(!/__pycache__/.test(tarList), 'tarball excludes __pycache__');

  // 2) global install into temp prefix (offline; no deps)
  run('npm', ['i', '-g', '--prefix', prefix, tarPath], { stdio: 'pipe' });
  const binPath = process.platform === 'win32' ? path.join(prefix, 'join-us.cmd') : path.join(prefix, 'bin', 'join-us');
  ok(fs.existsSync(binPath), `installed join-us bin (${path.relative(tmp, binPath)})`);

  const env = { ...process.env, HOME: home, USERPROFILE: home };

  // 3) codex dry-run (project scope)
  const codexOut = run(binPath, ['setup', '--codex', '--scope', 'project', '--dry-run'], { cwd: home, env });
  const copies = (codexOut.match(/\[dry-run\] copy skills\//g) || []).length;
  ok(copies === 6, `codex dry-run plans 6 skill copies (got ${copies})`);
  ok(!codexOut.includes('copy skills/init-join-us'), 'codex dry-run excludes init-join-us');
  ok(codexOut.includes('AGENTS.md is NOT modified'), 'codex states AGENTS.md untouched');

  // 4) claude dry-run
  const claudeOut = run(binPath, ['setup', '--claude', '--dry-run'], { cwd: home, env });
  ok(/marketplace add/.test(claudeOut) && /plugin install join-us@join-us-plugins/.test(claudeOut) || /claude CLI not found/.test(claudeOut),
     'claude dry-run prints register commands (or notes missing claude)');

  // 4b) byte-level secret scan of the ACTUAL packed contents (not just filenames) —
  //     catches blind spots like a .pyc compiled from a non-generalized source.
  const extract = path.join(tmp, 'extract');
  fs.mkdirSync(extract, { recursive: true });
  run('tar', ['-xzf', tarPath, '-C', extract]);
  let leak = '';
  try {
    leak = run('grep', ['-rIlE', 'acme-corp|ACME-ORG|acme-repo|AKIA[0-9A-Z]{16}|REDACTED-SECRET|i-0[0-9a-f]{10,}', extract], { stdio: 'pipe' }).trim();
  } catch (e) { leak = ''; } // grep exits 1 when there are no matches
  ok(leak === '', `packed contents carry no real secrets/identifiers${leak ? ' — LEAK in: ' + leak.replace(/\n/g, ', ') : ''}`);

  // 5) no writes outside temp
  ok(!fs.existsSync(path.join(home, '.codex')), 'dry-run wrote nothing (no HOME/.codex)');
  ok(!fs.existsSync(path.join(process.cwd(), '.codex')) || process.cwd() === home, 'dry-run created no .codex in repo cwd');
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  failures++;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
