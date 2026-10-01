// Packaging and export-condition checks.
//
// Every other test imports from `src/`, which means the built `dist/` tree and
// the `exports` map in package.json are never exercised. A broken export
// condition, a missing entry point or a runtime inlined into the wrong chunk
// is therefore invisible to `npm test` and only shows up for consumers.
//
// This file skips itself when `dist/` is absent so a plain `npm test` stays
// fast. `npm run verify` builds first, so it always runs there.

import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WASM_FILE, hasWasm } from './helpers/artifacts.js';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');

const distExists = existsSync(DIST);
const distEntry = (name: string) => resolve(DIST, name);
const importDist = (name: string) => import(/* @vite-ignore */ pathToFileURL(distEntry(name)).href);

describe('packaging', () => {
  it.skipIf(!distExists)('ships every entry point the exports map advertises', async () => {
    // Two different invariants, and conflating them makes this fail on a fresh
    // clone: build outputs must exist here and now, while the vendored wasm is
    // gitignored and only present after `npm run sync:wasm`. What actually
    // matters for the tarball is that the wasm is *covered by* `files`.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
      exports: Record<string, unknown>;
      files: string[];
      main: string;
      module: string;
      types: string;
    };

    // Conditions nest arbitrarily deep ({".": {"import": {"types": ..., "default": ...}}}),
    // so walk the whole tree and collect every leaf.
    const collectStrings = (node: unknown, out: string[] = []): string[] => {
      if (typeof node === 'string') out.push(node);
      else if (node && typeof node === 'object') {
        for (const value of Object.values(node)) collectStrings(value, out);
      }
      return out;
    };

    const leaves = collectStrings(pkg.exports);
    const isBuildOutput = (file: string) => file.startsWith('./dist/');

    for (const file of [pkg.main, pkg.module, pkg.types, ...leaves]) {
      if (!isBuildOutput(file) || file === './package.json') continue;
      expect(existsSync(resolve(ROOT, file)), `exports map points at a missing build output: ${file}`).toBe(true);
    }

    for (const file of leaves.filter((f) => !isBuildOutput(f) && f !== './package.json')) {
      // e.g. ./wasm/mist.wasm and ./circuit.json — shipped as-is, so `files`
      // must cover them or they are advertised but absent from the tarball.
      const dir = file.slice(2).split('/')[0];
      expect(
        pkg.files.includes(dir) || pkg.files.includes(file.slice(2)),
        `exports map advertises ${file} but package.json "files" does not ship it`,
      ).toBe(true);
    }
  });

  it.skipIf(!distExists)('keeps the Go runtime out of the root bundle', () => {
    // The root entry must stay importable during SSR: `await import('./prover/wasm_exec.js')`
    // is deferred, so the runtime should not be pulled into the CJS/ESM root chunks.
    const cjs = readFileSync(distEntry('index.cjs'), 'utf-8');
    const esm = readFileSync(distEntry('index.js'), 'utf-8');
    expect(cjs, 'index.cjs inlined the Go runtime').not.toContain('wasm_exec');
    expect(esm, 'index.js inlined the Go runtime').not.toContain('wasm_exec');
  });

  it.skipIf(!distExists)('inlines the Go runtime into the prover entry, so it is not fetched at runtime', () => {
    // The built prover chunk must carry the runtime itself: `src/prover/wasm_exec.js`
    // is not published, so a bare `import()` of it would 404 for consumers.
    for (const entry of ['prover.js', 'prover.node.js', 'prover-worker.js']) {
      const code = readFileSync(distEntry(entry), 'utf-8');
      expect(code, `${entry} lost the Go runtime`).toContain('wasm_exec');
    }
  });

  it.skipIf(!distExists || !hasWasm)('loads the real prover from the built Node entry', async () => {
    // The real check: instantiate the published artifact, not the source tree.
    const mod = await importDist('prover.node.js') as {
      loadProver: (source?: string) => Promise<{ hash2: (a: string, b: string) => string }>;
    };
    const prover = await mod.loadProver(WASM_FILE);
    expect(prover.hash2('1', '2')).toMatch(/^\d+$/);
  });

  it.skipIf(!distExists)('resolves the node condition to the Node prover entry', () => {
    // A package with an `exports` map can self-reference by name, so this
    // exercises real Node resolution rather than a reimplementation of it.
    // Node always applies the "node" condition, so the server-side entry is
    // what a Node consumer must get — the whole reason the condition exists.
    const script = "console.log(await import.meta.resolve('@mistcash/sdk/prover'))";
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim();
    expect(out).toMatch(/prover\.node\.js$/);
  });

  it.skipIf(!distExists)('resolves the root entry to the ESM build', () => {
    const script = "console.log(await import.meta.resolve('@mistcash/sdk'))";
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim();
    expect(out).toMatch(/index\.js$/);
  });

  it.skipIf(!distExists)('offers a browser-usable default for every prover entry', () => {
    // Bundlers resolve "browser"/"import" and fall through to "default"; the
    // Node-only entry must never be the sole target of a browser-facing subpath.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
      exports: Record<string, Record<string, string>>;
    };
    const prover = pkg.exports['./prover'];
    expect(prover.node).toBe('./dist/prover.node.js');
    expect(prover.default).toBe('./dist/prover.js');
  });

  it.skipIf(!distExists)('reports a missing wasm with an actionable message', async () => {
    // A cache-busting query gives a fresh module instance: `loadProver` memoizes
    // on first success, so reusing the module imported above would hand back the
    // already-loaded prover and never touch the bad path.
    const url = pathToFileURL(distEntry('prover.node.js')).href + '?fresh=missing-wasm';
    const mod = await import(/* @vite-ignore */ url) as {
      loadProver: (source?: string) => Promise<unknown>;
    };
    await expect(mod.loadProver(resolve(ROOT, 'no-such-dir/mist.wasm'))).rejects.toThrow(
      /npm run sync:wasm/,
    );
  });
});
