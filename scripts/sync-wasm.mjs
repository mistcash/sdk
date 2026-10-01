#!/usr/bin/env node
// scripts/sync-wasm.mjs — vendor mist.wasm and wasm_exec.js from core-deploy.
// Usage: npm run sync:wasm
// Source: $MIST_CORE_DEPLOY/dist (default: ../core-deploy/dist)

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = process.env.MIST_CORE_DEPLOY
  ? resolve(process.env.MIST_CORE_DEPLOY, 'dist')
  : resolve(ROOT, '../core-deploy/dist');

const WASM_SRC = resolve(SRC, 'mist.wasm');
const WASM_EXEC_SRC = resolve(SRC, 'wasm_exec.js');
const WASM_DST = resolve(ROOT, 'wasm/mist.wasm');
const WASM_EXEC_DST = resolve(ROOT, 'src/prover/wasm_exec.js');
const CIRCUIT_JSON = resolve(ROOT, 'circuit.json');

if (!existsSync(WASM_SRC)) {
  console.error(`mist.wasm not found at ${WASM_SRC}`);
  console.error('Set MIST_CORE_DEPLOY to the core-deploy checkout, or run from the superrepo layout.');
  process.exit(1);
}
if (!existsSync(WASM_EXEC_SRC)) {
  console.error(`wasm_exec.js not found at ${WASM_EXEC_SRC}`);
  process.exit(1);
}

mkdirSync(dirname(WASM_DST), { recursive: true });
mkdirSync(dirname(WASM_EXEC_DST), { recursive: true });

copyFileSync(WASM_SRC, WASM_DST);
copyFileSync(WASM_EXEC_SRC, WASM_EXEC_DST);

const wasmBuf = readFileSync(WASM_DST);
const sha256 = createHash('sha256').update(wasmBuf).digest('hex');
const size = wasmBuf.length;

let goVersion = 'unknown';
try {
  goVersion = execSync('go version', { encoding: 'utf-8' }).trim();
  const m = goVersion.match(/go[\d.]+/);
  if (m) goVersion = m[0];
} catch { /* not available */ }

let coreDeployCommit = 'unknown';
const deployDir = process.env.MIST_CORE_DEPLOY ?? resolve(ROOT, '../core-deploy');
try {
  coreDeployCommit = execSync(`git -C ${deployDir} rev-parse --short HEAD`, { encoding: 'utf-8' }).trim();
} catch { /* not a git repo */ }

const circuit = { sha256, size, go: goVersion, coreDeployCommit, timestamp: new Date().toISOString() };
writeFileSync(CIRCUIT_JSON, JSON.stringify(circuit, null, 2) + '\n');

console.log(`synced mist.wasm (${(size / 1e6).toFixed(1)}MB, sha256:${sha256.slice(0, 12)}…)`);
console.log(`synced wasm_exec.js`);
console.log(`wrote circuit.json`);