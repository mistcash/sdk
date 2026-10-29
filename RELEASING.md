# Releasing `@mistcash/sdk`

The published package ships `wasm/mist.wasm` (the proving key, ~16 MB) and
`wasm/mist-webgpu.wasm` (the same prover built with gnark's WebGPU backend).
Both are gitignored and built in `core-deploy`, which is private and not yet
published as a release asset. CI therefore cannot produce a publishable
tarball, so **publishing is manual for now**.

## What is automated

- `ci.yml` runs `npm run verify` (typecheck, build, test) on Node 20 and 22 for
  every PR and push to `main`. The real-wasm tests are **skipped** there
  (`MIST_ALLOW_WASM_SKIP=1`), so CI does not exercise the circuit.
- `release.yml` runs on `v*` tags: it verifies, checks the tag against
  `package.json`, then **stops at a guard** that fails with "wasm missing"
  because CI has no wasm. The npm publish and GitHub release steps are wired
  up (provenance, `NPM_TOKEN`, generated notes) but cannot run until the wasm
  can be fetched in CI.

## Manual release procedure

On a machine with a `core-deploy` checkout:

1. Start from an up-to-date `main`: `git switch main && git pull`.
2. Sync the wasm and circuit record:
   `MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm`
   Commit the resulting `circuit.json` change if there is one. `prepack`
   refuses to pack a wasm whose sha256 does not match `circuit.json`, a
   vendored gnark WebGPU runtime from another gnark than `mist-webgpu.wasm`, or
   a `circuit.json` with no recorded `core` commit.
3. Verify with the real wasm: `npm ci && npm run verify`. Check that the wasm
   tests ran and were not skipped.
4. Bump the version: `npm version <patch|minor|major>` (this commits and tags
   `vX.Y.Z`). `0.6.0` is already in `package.json` but unpublished, so for
   that release skip the bump and tag the commit yourself: `git tag v0.6.0`.
5. Push the commit and tag: `git push origin main --follow-tags`.
   This triggers `release.yml`, which is expected to fail at the wasm guard.
6. Publish from the same machine: `npm publish --access public`
   (`prepack` re-checks the wasm). Provenance is only available from CI, so
   this publish has none.
7. Create the GitHub release:
   `gh release create vX.Y.Z --verify-tag --generate-notes`.

## Moving to automated releases

Once core publishes `mist.wasm` and `mist-webgpu.wasm` as release assets:
replace the "Require wasm/mist.wasm and wasm/mist-webgpu.wasm" guard in
`release.yml` with a download step, do the same in `ci.yml` and remove
`MIST_ALLOW_WASM_SKIP`, and add an `NPM_TOKEN` repository secret (an npm
automation token with publish rights to `@mistcash`). Then steps 5 to 7
collapse into pushing the tag.
