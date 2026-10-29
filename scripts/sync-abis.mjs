#!/usr/bin/env node
// scripts/sync-abis.mjs — generate src/abis.generated.ts from core's contracts.
// Usage: npm run abis          (regenerate)
//        npm run abis:check    (exit 1 with a diff if the committed file is stale,
//                               or if PUBLIC_INPUTS no longer matches the circuit)
// Source: $MIST_CORE/contracts (default: ../core), via `forge inspect <id> abi --json`.
//
// core is only read: forge compiles into a temp --out/--cache-path, so core's
// own build/ and cache/ are left alone. Set FORGE to pick the forge binary.
//
// The generated file holds two views of the same forge output:
//   - `<contract>Abi`: the full JSON ABI `as const` (internalType dropped),
//     which viem types from directly. The client encodes against these.
//   - `*HumanReadable`: abitype-formatted signatures backing the SDK's public
//     string ABIs (ABIS, CORE_ABI, SCREENING_ABI). CORE_ABI and SCREENING_ABI
//     are curated subsets, chosen by the allowlists below. A name missing from
//     core fails generation: that is the drift this script exists to catch.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAbiItem } from 'abitype';
import { checkPublicInputs } from './check-public-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = resolve(ROOT, process.env.MIST_CORE ?? '../core');
const CONTRACTS_DIR = join(CORE, 'contracts');
const OUT = join(ROOT, 'src/abis.generated.ts');
const FORGE = process.env.FORGE ?? 'forge';
const CHECK = process.argv.includes('--check');

/** Contracts the SDK talks to: [ABIS key, forge contract id, export name]. */
const CONTRACTS = [
  ['Chamber', 'src/Chamber.sol:Chamber', 'chamberAbi'],
  ['Reserve', 'src/Reserve.sol:Reserve', 'reserveAbi'],
  ['ManagerSigRegistrar', 'src/ManagerSigRegistrar.sol:ManagerSigRegistrar', 'managerSigRegistrarAbi'],
  ['ChamberVerifier', 'src/ChamberVerifier.sol:ChamberVerifier', 'chamberVerifierAbi'],
  ['ERC20', 'deps/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol:ERC20', 'erc20Abi'],
];

/** SCREENING_ABI: deposit screening (core#157), all on Chamber. */
const SCREENING = [
  ['Chamber', [
    'setReserveScreener', 'reserveScreeners', 'depositCount', 'pendingDeposits',
    'approveDeposits', 'rejectDeposits', 'reclaimDeposit',
    'ReserveScreenerSet', 'DepositQueued', 'DepositApproved', 'DepositRejected', 'DepositReclaimed',
  ]],
];

/**
 * CORE_ABI (before SCREENING_ABI is appended): the reads and writes a host's
 * ChainAdapter needs for MistClient and the playground, across contracts.
 */
const CORE_SUBSET = [
  ['Chamber', [
    'owner', 'verifier', 'merkleRoot', 'zkStateRoot', 'zkStateLeaf', 'getTxArray', 'reserveConfigs',
    'registerReserve', 'setVerifier', 'deposit', 'handleZkp',
  ]],
  ['Reserve', [
    'reserveManager', 'auditorKey', 'registeredUsersRoot', 'registeredUsersCount',
    'setRegisterUserCallback', 'registerUserCallback', 'registerUser', 'updateAuditorKey',
  ]],
  ['ManagerSigRegistrar', ['registerUserDigest']],
  ['ERC20', ['symbol', 'balanceOf', 'approve', 'transfer']],
  ['Reserve', ['UserRegistered']],
];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function provenance() {
  const sha = run('git', ['-C', CORE, 'rev-parse', 'HEAD']);
  const dirty = run('git', ['--no-optional-locks', '-C', CORE, 'status', '--porcelain', '--', 'contracts']) ? '+dirty' : '';
  const v = run(FORGE, ['--version']);
  const version = v.match(/Version:\s*(\S+)/i)?.[1] ?? v.split('\n')[0];
  const commit = v.match(/Commit SHA:\s*([0-9a-f]{7})/i)?.[1];
  const forge = commit ? `${version} (${commit})` : version;
  return { core: `${sha}${dirty}`, forge };
}

function inspectAll() {
  const tmp = mkdtempSync(join(tmpdir(), 'mist-abis-'));
  try {
    const flags = ['--root', CONTRACTS_DIR, '--out', join(tmp, 'out'), '--cache-path', join(tmp, 'cache')];
    // One build up front so each inspect below reuses it.
    run(FORGE, ['build', ...flags, '--quiet'], { cwd: CONTRACTS_DIR });
    return Object.fromEntries(
      CONTRACTS.map(([key, id]) => [key, JSON.parse(run(FORGE, ['inspect', ...flags, id, 'abi', '--json'], { cwd: CONTRACTS_DIR }))]),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Drop internalType (viem-style, smaller bundle); keep everything else verbatim. */
const strip = (abi) => JSON.parse(JSON.stringify(abi, (k, v) => (k === 'internalType' ? undefined : v)));

function pick(abis, spec, label) {
  const out = [];
  for (const [contract, names] of spec) {
    for (const name of names) {
      const items = abis[contract].filter((item) => item.name === name);
      if (!items.length) throw new Error(`${label}: ${contract}.${name} is not in core's ABI (drift: the SDK uses it)`);
      out.push(...items);
    }
  }
  return out;
}

const lit = (v) => JSON.stringify(v, null, 2);
const human = (abi) => abi.map((item) => formatAbiItem(item));

function render(abis, { core, forge }) {
  const lines = [
    '// Code generated by scripts/sync-abis.mjs. DO NOT EDIT.',
    '// Regenerate with `npm run abis`; `npm run abis:check` fails when this is stale.',
    '//',
    `// core commit: ${core}`,
    `// forge: ${forge}`,
    '',
  ];
  for (const [key, id, name] of CONTRACTS) {
    lines.push(`/** \`forge inspect ${id} abi\` */`, `export const ${name} = ${lit(abis[key])} as const;`, '');
  }
  const full = Object.fromEntries(CONTRACTS.map(([key]) => [key, human(abis[key])]));
  lines.push('/** Every ABI above as human-readable signatures (`ABIS`). */');
  lines.push(`export const abisHumanReadable = ${lit(full)} as const;`, '');
  lines.push('/** Deposit screening subset of Chamber (`SCREENING_ABI`). */');
  lines.push(`export const screeningAbiHumanReadable = ${lit(human(pick(abis, SCREENING, 'SCREENING_ABI')))} as const;`, '');
  lines.push('/** Host read/write subset across contracts (`CORE_ABI`, before SCREENING_ABI). */');
  lines.push(`export const coreAbiHumanReadable = ${lit(human(pick(abis, CORE_SUBSET, 'CORE_ABI')))} as const;`, '');
  return lines.join('\n');
}

/** The file minus its provenance lines, so a core bump that leaves ABIs alone is not drift. */
const body = (text) => text.split('\n').filter((l) => !/^\/\/ (core commit|forge):/.test(l)).join('\n');

function main() {
  if (!existsSync(CONTRACTS_DIR)) {
    console.error(`core contracts not found at ${CONTRACTS_DIR}`);
    console.error('Set MIST_CORE to the core checkout, or run from the superrepo layout.');
    process.exit(1);
  }
  const prov = provenance();
  const abis = Object.fromEntries(Object.entries(inspectAll()).map(([k, abi]) => [k, strip(abi)]));
  const text = render(abis, prov);
  let failed = false;

  if (CHECK) {
    const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (body(committed) !== body(text)) {
      const tmp = mkdtempSync(join(tmpdir(), 'mist-abis-check-'));
      const fresh = join(tmp, 'abis.generated.ts');
      writeFileSync(fresh, text);
      const rel = relative(ROOT, OUT);
      const diff = spawnSync('diff', ['-u', '--label', `${rel} (committed)`, '--label', `${rel} (core ${prov.core})`, OUT, fresh], { encoding: 'utf8' });
      rmSync(tmp, { recursive: true, force: true });
      process.stdout.write(diff.stdout);
      console.error(`\n${rel} is stale against core ${prov.core}. Run \`npm run abis\` and review the diff.`);
      failed = true;
    } else if (committed !== text) {
      console.log(`ABIs match core ${prov.core}; only the provenance header differs (run \`npm run abis\` to refresh it).`);
    } else {
      console.log(`ABIs match core ${prov.core} (forge ${prov.forge}).`);
    }
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${relative(ROOT, OUT)} from core ${prov.core} (forge ${prov.forge}).`);
  }

  const { go, problems } = checkPublicInputs(CORE);
  if (problems.length) {
    console.error('\nPUBLIC_INPUTS (src/contracts.ts) does not match core/circuits/src/primary.go:');
    for (const p of problems) console.error(`  ${p}`);
    failed = true;
  } else {
    console.log(`PUBLIC_INPUTS matches primary.go (${go.length} inputs, in order).`);
  }
  process.exit(failed ? 1 : 0);
}

main();
