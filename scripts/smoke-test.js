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
    // Generic secret FORMATS are safe to hardcode; project-specific identifiers/
    // secrets come from a PRIVATE env var (JOINUS_LEAK_NEEDLES, regex-alternated)
    // so real values never live in this tracked file. Unset -> generic scan only.
    const genericNeedles = 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[posru]_[A-Za-z0-9]{36}|xox[bpars]-[A-Za-z0-9-]{10,}|i-0[0-9a-f]{10,}';
    const extraNeedles = (process.env.JOINUS_LEAK_NEEDLES || '').trim();
    const needles = extraNeedles ? genericNeedles + '|' + extraNeedles : genericNeedles;
    leak = run('grep', ['-rIlE', needles, extract], { stdio: 'pipe' }).trim();
  } catch (e) { leak = ''; } // grep exits 1 when there are no matches
  ok(leak === '', `packed contents carry no real secrets/identifiers${leak ? ' — LEAK in: ' + leak.replace(/\n/g, ', ') : ''}`);

  // 5) no writes outside temp
  ok(!fs.existsSync(path.join(home, '.codex')), 'dry-run wrote nothing (no HOME/.codex)');
  ok(!fs.existsSync(path.join(process.cwd(), '.codex')) || process.cwd() === home, 'dry-run created no .codex in repo cwd');

  // 6) co-install safety: join-us shares ~/.codex/skills with other plugins (e.g. banker) + omx skills.
  //    join-us's own setup/uninstall must touch ONLY join-us-* and never a foreign plugin's skills.
  //    Foreign skills are simulated (no dependency on the banker package) so this stays self-contained.
  const home2 = path.join(tmp, 'home2');
  const foreign = { banker: path.join(home2, '.codex', 'skills', 'banker-coexist-probe'), omx: path.join(home2, '.codex', 'skills', 'ralph') };
  for (const p of Object.values(foreign)) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'SKILL.md'), `---\nname: ${path.basename(p)}\n---\n`); }
  const env2 = { ...process.env, HOME: home2, USERPROFILE: home2 };
  const cs2 = path.join(home2, '.codex', 'skills');
  const foreignIntact = () => fs.existsSync(path.join(foreign.banker, 'SKILL.md')) && fs.existsSync(path.join(foreign.omx, 'SKILL.md'));

  run(binPath, ['setup', '--codex', '--scope', 'user'], { cwd: home2, env: env2 });
  const afterSetup = fs.readdirSync(cs2).filter((d) => d.startsWith('join-us-'));
  ok(afterSetup.length === 6, `co-install: join-us setup installs its 6 skills alongside foreign skills (got ${afterSetup.length})`);
  ok(foreignIntact(), 'co-install: join-us setup preserves foreign banker-*/omx skills (no cross-prefix clobber)');

  // dir==name (Codex discovery) + init-join-us must never reach codex + stale sweep on reinstall
  const readName = (md) => { const m = fs.readFileSync(md, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/); const n = m && m[1].match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m); return n ? n[1] : null; };
  const mismatched = afterSetup.filter((d) => readName(path.join(cs2, d, 'SKILL.md')) !== d);
  ok(mismatched.length === 0, `every installed join-us skill has dir==frontmatter name (mismatched: ${mismatched.join(', ') || 'none'})`);
  ok(!fs.existsSync(path.join(cs2, 'join-us-init-join-us')), 'init-join-us is never installed to codex (local-only, manifest-excluded)');
  fs.mkdirSync(path.join(cs2, 'join-us-OBSOLETE'), { recursive: true });
  fs.writeFileSync(path.join(cs2, 'join-us-OBSOLETE', 'SKILL.md'), '---\nname: join-us-OBSOLETE\n---\n');
  run(binPath, ['setup', '--codex', '--scope', 'user'], { cwd: home2, env: env2 });
  ok(!fs.existsSync(path.join(cs2, 'join-us-OBSOLETE')), 'stale join-us-* swept on reinstall (no leftover duplicate)');
  ok(foreignIntact(), 'sweep preserves foreign banker-*/omx skills');

  run(binPath, ['uninstall', '--codex', '--scope', 'user'], { cwd: home2, env: env2 });
  const afterUninstall = fs.readdirSync(cs2).filter((d) => d.startsWith('join-us-'));
  ok(afterUninstall.length === 0, 'co-install: join-us uninstall removes only its own join-us-* skills');
  ok(foreignIntact(), 'co-install: join-us uninstall preserves foreign banker-*/omx skills');
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  failures++;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
