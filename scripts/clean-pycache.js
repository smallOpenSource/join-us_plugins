#!/usr/bin/env node
'use strict';
/*
 * prepack/prepublish hygiene: remove Python bytecode caches under skills/ so a stray
 * __pycache__/*.pyc (created by test-running a skill's script) can never enter the npm
 * tarball. The `files` allowlist also negates them; this is belt-and-suspenders + cleans
 * the working tree. Cross-OS (no shell). Runs via `npm run clean-pycache` and `prepack`.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let removed = 0;
function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__pycache__') { fs.rmSync(p, { recursive: true, force: true }); removed++; }
      else walk(p);
    } else if (e.name.endsWith('.pyc')) { fs.rmSync(p, { force: true }); removed++; }
  }
}
walk(path.join(root, 'skills'));
console.log(`clean-pycache: removed ${removed} __pycache__/.pyc entr${removed === 1 ? 'y' : 'ies'}.`);
