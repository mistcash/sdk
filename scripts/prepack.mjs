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