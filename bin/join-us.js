#!/usr/bin/env node
'use strict';
/*
 * join-us — multi-target installer CLI for the join-us plugin.
 * Installs the join-us skills into Claude Code and/or Codex CLI from one source of truth.
 * No runtime deps (Node built-ins only). Cross-OS. Idempotent. Never runs as root. Supports --dry-run.
 * Source of truth: this package's skills/ + codex/manifest.json. The Claude Code marketplace flow
 * is unchanged; this is an additive layer. (init-join-us is local-only and not in this package.)
 *
 * The skills are generalized templates: their placeholders (<OWNER>/<REPO>, <my-gh-login>, ...)
 * resolve at runtime from a PRIVATE config (env file) or interactively. `join-us config` manages it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(PKG_ROOT, 'codex', 'manifest.json');
const PLUGIN_JSON = path.join(PKG_ROOT, '.claude-plugin', 'plugin.json');
const EXAMPLE_CONFIG = path.join(PKG_ROOT, 'config', 'join-us.env.example');
const MARKETPLACE = 'join-us-plugins';
const PLUGIN_NAME = 'join-us';

function version() {
  try { return require(path.join(PKG_ROOT, 'package.json')).version; } catch { return '0.0.0'; }
}
function log(...a) { console.log(...a); }
function warn(...a) { console.error(...a); }

function parseArgs(argv) {
  const a = { cmd: null, claude: false, codex: false, scope: 'user', scopeExplicit: false, dryRun: false, init: false, force: false, help: false, version: false };
  for (const t of argv) {
    if (t === 'setup' || t === 'doctor' || t === 'uninstall' || t === 'config' || t === 'help') { if (!a.cmd) a.cmd = t; }
    else if (t === '--claude') a.claude = true;
    else if (t === '--codex') a.codex = true;
    else if (t === '--dry-run' || t === '-n') a.dryRun = true;
    else if (t === '--init') a.init = true;
    else if (t === '--force') a.force = true;
    else if (t === '--scope=project' || t === 'project') { a.scope = 'project'; a.scopeExplicit = true; }
    else if (t === '--scope=user') { a.scope = 'user'; a.scopeExplicit = true; }
    else if (t === '--scope') a._wantScope = true;
    else if (a._wantScope) { a.scope = (t === 'project') ? 'project' : 'user'; a.scopeExplicit = true; a._wantScope = false; }
    else if (t === '-h' || t === '--help') a.help = true;
    else if (t === '-v' || t === '--version') a.version = true;
  }
  // If neither target specified for setup/uninstall, default to BOTH.
  if ((a.cmd === 'setup' || a.cmd === 'uninstall') && !a.claude && !a.codex) { a.claude = true; a.codex = true; }
  return a;
}

function assertNotRoot() {
  if (process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0) {
    warn('join-us: refusing to run as root (would write root-owned files into a user home). Re-run as your normal user.');
    process.exit(2);
  }
}

function readManifest() { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
function eligible(m) { return m.surfaces.filter(s => s.target === 'both'); }

function homeDir() { return os.homedir(); }
function codexBase(scope) { return scope === 'project' ? path.join(process.cwd(), '.codex') : path.join(homeDir(), '.codex'); }

/* ---------- config (private placeholder values) ---------- */
function userConfigPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(homeDir(), '.config');
  return path.join(base, 'join-us', 'config.env');
}
function configCandidates() {
  return [
    process.env.JOINUS_CONFIG,
    path.join(process.cwd(), '.join-us.env'),
    userConfigPath(),
  ].filter(Boolean);
}
function resolveConfig() {
  for (const p of configCandidates()) {
    try { if (fs.statSync(p).isFile()) return p; } catch { /* keep looking */ }
  }
  return null;
}
function parseEnvKeys(file) {
  const out = [];
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      out.push([s.slice(0, i).trim(), s.slice(i + 1).trim()]);
    }
  } catch { /* unreadable */ }
  return out;
}
function isUnset(v) { return v === '' || /<[^>]+>/.test(v); }
function configKeyStatus(file) {
  const keys = parseEnvKeys(file);
  return {
    keys,
    set: keys.filter(([, v]) => !isUnset(v)).map(([k]) => k),
    unset: keys.filter(([, v]) => isUnset(v)).map(([k]) => k),
  };
}

function configCmd(a) {
  const found = resolveConfig();
  const target = userConfigPath();
  if (a.init) {
    if (found && !a.force) {
      log(`config already present: ${found}`);
      log('  edit it directly, or pass --force to overwrite from the template.');
      return;
    }
    if (a.dryRun) { log(`[dry-run] would write ${target} from ${path.relative(PKG_ROOT, EXAMPLE_CONFIG)} (mode 600)`); return; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(EXAMPLE_CONFIG, target);
    try { fs.chmodSync(target, 0o600); } catch { /* best effort */ }
    log(`created ${target} (mode 600).`);
    log('  → fill in your real values (JOINUS_REPO, JOINUS_GH_LOGIN, JOINUS_PROJECT_ROOT, ...).');
    log('  → it is PRIVATE: never commit/publish it. Skills/scripts pick it up automatically.');
    return;
  }
  log('join-us config:');
  log(`  resolution order: $JOINUS_CONFIG -> ./.join-us.env -> ${target}`);
  log(`  template: ${path.relative(PKG_ROOT, EXAMPLE_CONFIG)}`);
  if (!found) {
    log('  active config: (none found)');
    log('  → run `join-us config --init`, or the skills will ask you interactively.');
    return;
  }
  const { set, unset } = configKeyStatus(found);
  log(`  active config: ${found}`);
  log(`  keys set: ${set.length ? set.join(', ') : '(none)'}`);
  if (unset.length) log(`  still placeholder/empty: ${unset.join(', ')}`);
}

function copyDir(src, dest, dryRun) {
  if (dryRun) { log(`  [dry-run] copy ${path.relative(PKG_ROOT, src)} -> ${dest}`); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });            // idempotent: replace
  fs.cpSync(src, dest, { recursive: true });                    // COPY (not symlink) — Windows-safe
}
function copyFile(src, dest, dryRun) {
  if (dryRun) { log(`  [dry-run] copy ${path.relative(PKG_ROOT, src)} -> ${dest}`); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// CO-INSTALL INVARIANT: join-us shares ~/.codex/skills with other plugins (e.g. banker) and omx.
// Every Codex operation here is scoped to the `join-us-` prefix ONLY, so it never sweeps, rewrites,
// or removes a foreign plugin's skills. Keep any new codex op prefix-scoped (scripts/smoke-test.js guards this).
function sweepCodexArtifacts(base, dryRun) {
  let removed = 0;
  for (const sub of ['skills', 'prompts']) {
    const dir = path.join(base, sub);
    let entries = [];
    try { entries = fs.readdirSync(dir).filter(d => d.startsWith('join-us-')); } catch { /* dir absent */ }
    for (const e of entries) {
      const p = path.join(dir, e);
      if (dryRun) { log(`  [dry-run] sweep ${p}`); continue; }
      fs.rmSync(p, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

// Read a SKILL.md frontmatter `name:` (used by doctor to verify the Codex dir==name rule).
function readSkillName(skillMd) {
  let src;
  try { src = fs.readFileSync(skillMd, 'utf8'); } catch { return null; }
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return m ? m[1] : null;
}

// Codex discovers skills by directory and expects the SKILL.md frontmatter `name:` to equal the
// directory name. Our Codex dir is `join-us-<name>`, so rewrite ONLY the first `name:` line to match.
function setCodexSkillName(skillMd, newName, dryRun) {
  if (dryRun) { log(`  [dry-run] set frontmatter name: ${newName}`); return; }
  let src;
  try { src = fs.readFileSync(skillMd, 'utf8'); } catch { return; }
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return;
  let block = fm[1];
  block = /^name:.*$/m.test(block) ? block.replace(/^name:.*$/m, `name: ${newName}`) : `name: ${newName}\n${block}`;
  fs.writeFileSync(skillMd, src.slice(0, fm.index) + `---\n${block}\n---` + src.slice(fm.index + fm[0].length));
}

/* ---------- Claude Code target ---------- */
function setupClaude(dryRun) {
  log('• Claude Code:');
  if (!have('claude')) { warn('  claude CLI not found on PATH — install Claude Code first. Skipping --claude.'); return false; }
  const steps = [
    ['claude', ['plugin', 'marketplace', 'add', PKG_ROOT]],          // local dir is a marketplace (.claude-plugin/marketplace.json)
    ['claude', ['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE}`]],
  ];
  for (const [bin, args] of steps) {
    if (dryRun) { log(`  [dry-run] ${bin} ${args.join(' ')}`); continue; }
    try { cp.execFileSync(bin, args, { stdio: 'inherit' }); }
    catch (e) { warn(`  step failed (may already be applied): ${bin} ${args.join(' ')}`); }
  }
  log('  → skills available as /join-us:* (reload-plugins or restart to apply).');
  return true;
}

function have(bin) {
  // PATH scan — no shell (avoids DEP0190 + injection). Cross-OS.
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    for (const e of exts) {
      try { fs.accessSync(path.join(d, bin + e), fs.constants.X_OK); return true; } catch { /* keep scanning */ }
    }
  }
  return false;
}

/* ---------- Codex target ---------- */
function setupCodex(dryRun, scope) {
  log(`• Codex CLI (scope=${scope}):`);
  const m = readManifest();
  const base = codexBase(scope);
  const skillsDir = path.join(base, 'skills');
  const promptsDir = path.join(base, 'prompts');
  // Clean reinstall: remove any prior join-us-* first so an update never leaves a stale duplicate
  // (prefix-scoped: only join-us-*, never a co-installed plugin's skills).
  const swept = sweepCodexArtifacts(base, dryRun);
  if (swept) log(`  swept ${swept} prior join-us-* artifact(s) before reinstall.`);
  let nSkill = 0, nCmd = 0;
  for (const s of eligible(m)) {
    if (s.type === 'skill') {
      const dest = path.join(skillsDir, `join-us-${s.name}`);
      copyDir(path.join(PKG_ROOT, 'skills', s.name), dest, dryRun);
      setCodexSkillName(path.join(dest, 'SKILL.md'), `join-us-${s.name}`, dryRun); // dir==name (Codex discovery)
      nSkill++;
    } else if (s.type === 'command') {
      copyFile(path.join(PKG_ROOT, 'commands', `${s.name}.md`), path.join(promptsDir, `join-us-${s.name}.md`), dryRun);
      nCmd++;
    }
  }
  log(`  → ${nSkill} skills -> ${path.join(base, 'skills', 'join-us-*')}, ${nCmd} prompts -> ${path.join(base, 'prompts', 'join-us-*.md')}`);
  log('  → skills are invoked as `join-us-<name>` (frontmatter name rewritten to match the dir).');
  log('  → ~/.codex/AGENTS.md is NOT modified (omx regenerates it); skills auto-discovered from ~/.codex/skills/.');
  log('  → reminder: set your private config (`join-us config --init`) so skill placeholders resolve.');
  return true;
}

/* ---------- doctor ---------- */
function doctor() {
  log(`join-us v${version()}  (pkg: ${PKG_ROOT})`);
  log(`plugin.json version: ${(() => { try { return require(PLUGIN_JSON).version; } catch { return '?'; } })()}`);
  log('Claude Code:');
  log(`  claude CLI: ${have('claude') ? 'found' : 'NOT found'}`);
  log('Codex CLI:');
  const base = codexBase('user');
  const sdir = path.join(base, 'skills');
  let installed = [];
  try { installed = fs.readdirSync(sdir).filter(d => d.startsWith('join-us-')); } catch { /* none */ }
  log(`  codex CLI: ${have('codex') ? 'found' : 'NOT found'}`);
  log(`  installed join-us skills in ~/.codex/skills: ${installed.length}`);
  // Codex only discovers a skill when its dir name equals the SKILL.md `name:` — flag any mismatch.
  const mismatched = installed
    .map(d => ({ d, name: readSkillName(path.join(sdir, d, 'SKILL.md')) }))
    .filter(x => x.name && x.name !== x.d);
  if (mismatched.length) {
    log('  ⚠ dir/name mismatch (Codex will NOT list these) — reinstall with this version:');
    for (const x of mismatched) log(`      ${x.d}/  has  name: ${x.name}`);
  }
  if (have('codex') && installed.length === 0) log('  ⚠ codex found but 0 join-us skills installed — run: join-us setup --codex');
  const m = readManifest();
  log(`  manifest: ${eligible(m).length} codex-eligible surfaces (of ${m.surfaces.length}).`);
  log('Config (placeholder resolution):');
  const cfg = resolveConfig();
  if (!cfg) {
    log('  active config: (none) — run `join-us config --init` or answer skills interactively.');
  } else {
    const { keys, set } = configKeyStatus(cfg);
    log(`  active config: ${cfg}`);
    log(`  keys set: ${set.length}/${keys.length}${set.length < keys.length ? ' (some still placeholder)' : ''}`);
  }
}

/* ---------- uninstall ---------- */
function uninstallClaude(dryRun) {
  log('• Claude Code uninstall:');
  if (!have('claude')) { warn('  claude CLI not found; skipping.'); return; }
  for (const args of [['plugin', 'uninstall', PLUGIN_NAME], ['plugin', 'marketplace', 'remove', MARKETPLACE]]) {
    if (dryRun) { log(`  [dry-run] claude ${args.join(' ')}`); continue; }
    try { cp.execFileSync('claude', args, { stdio: 'inherit' }); } catch { warn(`  (not present) claude ${args.join(' ')}`); }
  }
}
function uninstallCodex(dryRun, scopes) {
  // sweep each scope (default = both user+project so project installs aren't orphaned)
  for (const scope of scopes) {
    log(`• Codex uninstall (scope=${scope}):`);
    const base = codexBase(scope);
    let removedAny = false;
    for (const sub of ['skills', 'prompts']) {
      const dir = path.join(base, sub);
      let entries = [];
      try { entries = fs.readdirSync(dir).filter(d => d.startsWith('join-us-')); } catch { /* none */ }
      for (const e of entries) {
        const p = path.join(dir, e);
        if (dryRun) { log(`  [dry-run] rm ${p}`); continue; }
        fs.rmSync(p, { recursive: true, force: true });
      }
      if (entries.length) { log(`  removed ${entries.length} join-us-* from ${dir}`); removedAny = true; }
    }
    if (!removedAny) log(`  (nothing in ${base})`);
  }
}

const HELP = `join-us v${version()} — install the join-us plugin into Claude Code and/or Codex CLI

Usage:
  join-us setup [--claude] [--codex] [--scope user|project] [--dry-run]
  join-us uninstall [--claude] [--codex] [--scope user|project] [--dry-run]
  join-us config [--init] [--force] [--dry-run]
  join-us doctor
  join-us help

Notes:
  - setup/uninstall with no target flag applies to BOTH tools.
  - --claude registers the marketplace + installs join-us@join-us-plugins (skills as /join-us:*).
  - --codex copies codex-eligible skills -> ~/.codex/skills/join-us-*.
  - config (no flag) shows the resolved private config + which keys are set.
  - config --init scaffolds ~/.config/join-us/config.env from the template (mode 600; --force to overwrite).
    The skills' placeholders (<OWNER>/<REPO>, <my-gh-login>, ...) resolve from that PRIVATE file
    ($JOINUS_CONFIG -> ./.join-us.env -> ~/.config/join-us/config.env) or interactively when absent.
  - Never runs as root. --dry-run prints planned actions without writing.`;

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.version) { log(version()); return; }
  if (a.help || a.cmd === 'help' || !a.cmd) { log(HELP); return; }
  if (a.cmd === 'doctor') { doctor(); return; }
  if (a.cmd === 'config') { if (a.init) assertNotRoot(); configCmd(a); return; }
  assertNotRoot();
  if (a.cmd === 'setup') {
    log(`join-us setup${a.dryRun ? ' (dry-run)' : ''}: claude=${a.claude} codex=${a.codex}`);
    if (a.claude) setupClaude(a.dryRun);
    if (a.codex) setupCodex(a.dryRun, a.scope);
    log('done.');
    return;
  }
  if (a.cmd === 'uninstall') {
    if (a.claude) uninstallClaude(a.dryRun);
    if (a.codex) uninstallCodex(a.dryRun, a.scopeExplicit ? [a.scope] : ['user', 'project']);
    log('done.');
    return;
  }
}
main();
