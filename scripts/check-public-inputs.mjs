#!/usr/bin/env node
// scripts/check-public-inputs.mjs — assert PUBLIC_INPUTS (src/contracts.ts)
// matches the public inputs of core's PrimaryTransactionCircuit, in order.
// Usage: node scripts/check-public-inputs.mjs   (also run by `npm run abis:check`)
// Source: $MIST_CORE/circuits/src/primary.go (default: ../core)
//
// Chamber.handleZkp reads input[i] by position, so the order is the contract,
// not just the count. gnark numbers public inputs in struct declaration order,
// flattening a nested struct field-by-field, so the Go struct is parsed the
// same way: every field tagged `gnark:",public"`, with a struct-typed field
// expanded into its own fields (they inherit the parent's visibility unless
// they carry their own tag).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Go calls the withdrawn token `Withdraw.Addr`; Chamber's PublicInputs struct
// and the SDK call it `withdrawAsset`. Any other rename is a mismatch.
const ALIASES = { withdrawAddr: 'withdrawAsset' };

const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

/** Body of `type <name> struct { ... }` in `src`, or undefined. */
function structBody(src, name) {
  const m = src.match(new RegExp(`type\\s+${name}\\s+struct\\s*\\{`));
  if (!m) return undefined;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return src.slice(start, i - 1);
}

/** `[{ name, type, tag }]` for each named field of a struct body. */
function fields(body) {
  const out = [];
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    const m = line.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+([\w.*[\]]+)\s*(`[^`]*`)?$/);
    if (!m) continue;
    const gnark = m[3]?.match(/gnark:"([^"]*)"/)?.[1];
    for (const name of m[1].split(',').map((s) => s.trim())) out.push({ name, type: m[2], gnark });
  }
  return out;
}

/** Visibility from a gnark tag (`",public"`, `"-"`, ...), or `inherit`. */
function visibility(gnark) {
  if (gnark === undefined) return 'inherit';
  if (gnark === '-') return 'skip';
  const opts = gnark.split(',').slice(1);
  if (opts.includes('public')) return 'public';
  if (opts.includes('secret')) return 'secret';
  return 'inherit';
}

/**
 * Resolve a struct type to its body. `pkg.Type` is looked up through the
 * file's imports and go.mod's module path; a bare `Type` in the same package.
 */
function resolveStruct(type, file, core, module) {
  const [pkg, name] = type.includes('.') ? type.split('.') : [undefined, type];
  let dir = dirname(file);
  if (pkg) {
    const src = readFileSync(file, 'utf8');
    const imports = [...src.matchAll(/^\s*(?:(\w+)\s+)?"([^"]+)"\s*$/gm)];
    const imp = imports.find(([, alias, path]) => (alias ?? path.split('/').pop()) === pkg);
    if (!imp || !imp[2].startsWith(`${module}/`)) return undefined; // e.g. frontend.Variable
    dir = join(core, imp[2].slice(module.length + 1));
  }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'))) {
    const path = join(dir, f);
    const body = structBody(readFileSync(path, 'utf8'), name);
    if (body !== undefined) return { body, file: path };
  }
  return undefined;
}

/** Ordered public-input names of `PrimaryTransactionCircuit`, SDK-cased. */
export function goPublicInputs(core) {
  const file = join(core, 'circuits/src/primary.go');
  if (!existsSync(file)) throw new Error(`primary.go not found at ${file}; set MIST_CORE to the core checkout`);
  const module = readFileSync(join(core, 'go.mod'), 'utf8').match(/^module\s+(\S+)/m)?.[1];
  const body = structBody(readFileSync(file, 'utf8'), 'PrimaryTransactionCircuit');
  if (body === undefined) throw new Error(`PrimaryTransactionCircuit not found in ${file}`);

  const names = [];
  const walk = (body, file, prefix, inherited) => {
    for (const f of fields(body)) {
      const vis = visibility(f.gnark);
      if (vis === 'skip') continue;
      const isPublic = vis === 'public' || (vis === 'inherit' && inherited);
      if (f.type === 'frontend.Variable' || f.type === 'Variable') {
        if (isPublic) names.push(prefix + f.name);
        continue;
      }
      if (!isPublic) continue;
      const nested = resolveStruct(f.type, file, core, module);
      if (!nested) throw new Error(`cannot resolve public field type ${f.type} (${prefix}${f.name}) in ${file}`);
      walk(nested.body, nested.file, prefix + f.name, true);
    }
  };
  walk(body, file, '', false);
  return names.map((n) => {
    const camel = lowerFirst(n);
    return ALIASES[camel] ?? camel;
  });
}

/** PUBLIC_INPUTS names as declared in src/contracts.ts, in order. */
export function sdkPublicInputs() {
  const src = readFileSync(join(ROOT, 'src/contracts.ts'), 'utf8');
  const block = src.match(/export const PUBLIC_INPUTS = \[([\s\S]*?)\] as const;/)?.[1];
  if (!block) throw new Error('PUBLIC_INPUTS not found in src/contracts.ts');
  return [...block.matchAll(/^\s*\[\s*'(\w+)'/gm)].map((m) => m[1]);
}

/** Returns a list of human-readable problems (empty when in sync). */
export function checkPublicInputs(core) {
  const go = goPublicInputs(core);
  const sdk = sdkPublicInputs();
  const problems = [];
  if (go.length !== sdk.length) problems.push(`count: circuit has ${go.length} public inputs, PUBLIC_INPUTS has ${sdk.length}`);
  for (let i = 0; i < Math.max(go.length, sdk.length); i++) {
    if (go[i] !== sdk[i]) problems.push(`[${i}]: circuit ${go[i] ?? '(none)'}, PUBLIC_INPUTS ${sdk[i] ?? '(none)'}`);
  }
  return { go, sdk, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const core = resolve(ROOT, process.env.MIST_CORE ?? '../core');
  const { go, problems } = checkPublicInputs(core);
  if (problems.length) {
    console.error('PUBLIC_INPUTS does not match core/circuits/src/primary.go:');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`PUBLIC_INPUTS matches primary.go (${go.length}): ${go.join(', ')}`);
}
