# Releasing `@mistcash/sdk`

The published package ships `wasm/mist.wasm` (the proving key, ~16 MB) and
`wasm/mist-webgpu.wasm` (the same prover built with gnark's WebGPU backend).
Both are built in `core-deploy`, which is private, so they are **committed to
this repo** next to the `circuit.json` that records their sha256s and the
`core` commit they were built from.

## What is automated

- `ci.yml` checks the committed wasm against `circuit.json`
  (`scripts/prepack.mjs`), then runs `npm run verify` (typecheck, build, test)
  on Node 20 and 22 for every PR and push to `main`, including the real-wasm
  tests.
- `release.yml` runs on `v*` tags: it verifies, checks the tag against
  `package.json`, publishes to npm with provenance (`prepack` re-checks the
  wasm), and creates the GitHub release (a prerelease for `-` versions). It
  needs an `NPM_TOKEN` repository secret: an npm automation token with
  publish rights to `@mistcash`.

## Updating the wasm

After a circuit change, on a machine with the `mist` superrepo:

1. Rebuild in `core-deploy`: `scripts/build.sh`, and land its `core` and
   `core-deploy/dist` changes first, so `circuit.json` records merged commits.
2. Sync: `MIST_CORE_DEPLOY=/path/to/core-deploy npm run sync:wasm`.
3. Verify: `npm run verify`. Check that the wasm tests ran and were not
   skipped.
4. Commit `wasm/`, `circuit.json` and any vendored runtime changes together.

Each resync adds about 21 MB (gzipped, both wasms) to the repo history, so only resync
when the circuit or gnark actually changed.

## Release procedure

1. Start from an up-to-date `main`: `git switch main && git pull`.
2. Bump the version: `npm version <patch|minor|major|prerelease>` (this
   commits and tags `vX.Y.Z`).
3. Push the commit and tag: `git push origin main --follow-tags`.
   `release.yml` publishes and cuts the GitHub release.
