#!/usr/bin/env node
// scripts/prepack.mjs — validate wasm artifacts before publish.
// Runs automatically via the "prepack" script.

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WASM = resolve(ROOT, 'wasm/mist.wasm');
const CIRCUIT = resolve(ROOT, 'circuit.json');

if (!existsSync(WASM)) {
  console.error('prepack: wasm/mist.wasm missing — run npm run sync:wasm first');
  process.exit(1);
}

const circuit = JSON.parse(readFileSync(CIRCUIT, 'utf-8'));
const actual = createHash('sha256').update(readFileSync(WASM)).digest('hex');
if (actual !== circuit.sha256) {
  console.error(`prepack: wasm/mist.wasm sha256 mismatch`);
  console.error(`  expected: ${circuit.sha256}`);
  console.error(`  actual:   ${actual}`);
  process.exit(1);
}

console.log('prepack: wasm/mist.wasm OK');

// A published wasm has to say which circuits it was built from: a proving key
// is only valid against the verifier for that exact circuit, so "unknown" here
// means nobody can tell what a consumer is trusting.
if (!circuit.core || circuit.core.commit === 'unknown') {
  console.error('prepack: circuit.json does not record the `core` commit');
  console.error('  a shipped proving key must state the circuits it came from');
  console.error('  re-run: MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm');
  process.exit(1);
}
console.log(`prepack: circuits ${circuit.core.repo}@${circuit.core.commit.slice(0, 12)}`);
