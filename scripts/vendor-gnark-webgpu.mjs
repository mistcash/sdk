// scripts/vendor-gnark-webgpu.mjs — vendor gnark's WebGPU TypeScript runtime.
// Called by sync-wasm.mjs; not a script of its own.
//
// mist-webgpu.wasm calls back into JavaScript through the `gnarkGroth16WebGPU`
// bridge, and the byte protocol between the two halves is internal to gnark
// and unversioned. So the TypeScript half is copied from the exact gnark
// module the wasm was built against — `go list` inside core-deploy's
// builders/wasm resolves it — never from a separate npm package (gnark's is
// private) or an independent pin.
//
// Two changes are made to the copy, and both are asserted rather than assumed:
//   - the shader bundle is regenerated with BN254 + the common kernels only
//     (the circuit's curve); other curves would fall back to fetch() and are
//     never created;
//   - the default URLs of gnark's own runtime loader (`new URL("../../assets/…",
//     import.meta.url)`) become plain strings. The SDK never uses that loader,
//     but bundlers treat the `new URL` pattern as an asset reference and fail
//     on files that do not exist.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MODULE = 'github.com/consensys/gnark';
const SHADER_DIRS = ['shaders/curves/bn254', 'shaders/common'];

export function vendorGnarkWebGPU(wasmModuleDir, dest) {
  const [dir, version] = execFileSync('go', ['list', '-m', '-f', '{{.Dir}} {{.Version}}', MODULE], {
    cwd: wasmModuleDir,
    encoding: 'utf-8',
  }).trim().split(' ');
  const webgpu = resolve(dir, 'backend/accelerated/webgpu');
  const src = resolve(webgpu, 'web/src/curvegpu');

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  const header = `// Vendored from ${MODULE}@${version} backend/accelerated/webgpu/web/src/curvegpu\n` +
    '// by scripts/sync-wasm.mjs — do not edit; re-run `npm run sync:wasm`.\n';
  for (const name of readdirSync(src)) {
    if (!name.endsWith('.ts') || name.startsWith('shader_bundle')) continue;
    let text = readFileSync(resolve(src, name), 'utf-8');
    if (name === 'proof_module.ts') text = unbundleDefaultURLs(text);
    writeFileSync(resolve(dest, name), '// @ts-nocheck\n' + header + text);
  }
  copyFileSync(resolve(dir, 'LICENSE'), resolve(dest, 'LICENSE'));

  const shaders = [];
  for (const sub of SHADER_DIRS) {
    for (const name of readdirSync(resolve(webgpu, sub)).filter((n) => n.endsWith('.wgsl')).sort()) {
      shaders.push([`/${sub}/${name}`, readFileSync(resolve(webgpu, sub, name), 'utf-8')]);
    }
  }
  writeFileSync(
    resolve(dest, 'shader_bundle.generated.ts'),
    '// @ts-nocheck\n' + header +
      'import { setBundledShaders } from "./shaders.js";\n\nsetBundledShaders({\n' +
      shaders.map(([path, text]) => `  ${JSON.stringify(path)}: ${JSON.stringify(text)},\n`).join('') +
      '});\n',
  );
  writeFileSync(resolve(dest, 'version.ts'), header + `export const GNARK_VERSION = ${JSON.stringify(version)};\n`);
  return { version, shaders: shaders.length };
}

function unbundleDefaultURLs(text) {
  const pattern = /new URL\("\.\.\/\.\.\/assets\/([\w.-]+)", import\.meta\.url\)\.toString\(\)/g;
  const count = text.match(pattern)?.length ?? 0;
  if (count !== 6) {
    throw new Error(`proof_module.ts: expected 6 default runtime URLs, found ${count}; review the patch in vendor-gnark-webgpu.mjs`);
  }
  return text.replace(pattern, (_, file) => JSON.stringify(`assets/${file}`));
}
