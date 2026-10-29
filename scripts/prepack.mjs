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

// The WebGPU prover ships beside it, and its TypeScript half must come from
// the same gnark: the bridge protocol between them is unversioned.
const WEBGPU = resolve(ROOT, 'wasm/mist-webgpu.wasm');
if (!existsSync(WEBGPU) || !circuit.webgpu) {
  console.error('prepack: wasm/mist-webgpu.wasm or its circuit.json record missing — run npm run sync:wasm');
  process.exit(1);
}
const webgpuActual = createHash('sha256').update(readFileSync(WEBGPU)).digest('hex');
if (webgpuActual !== circuit.webgpu.sha256) {
  console.error('prepack: wasm/mist-webgpu.wasm sha256 mismatch');
  console.error(`  expected: ${circuit.webgpu.sha256}`);
  console.error(`  actual:   ${webgpuActual}`);
  process.exit(1);
}
const vendored = readFileSync(resolve(ROOT, 'src/prover/gnark-webgpu/version.ts'), 'utf-8').match(/GNARK_VERSION = "([^"]+)"/)?.[1];
if (vendored !== circuit.gnark) {
  console.error(`prepack: vendored gnark WebGPU runtime is ${vendored}, mist-webgpu.wasm links gnark ${circuit.gnark}`);
  process.exit(1);
}
console.log(`prepack: wasm/mist-webgpu.wasm OK (gnark ${circuit.gnark})`);

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
