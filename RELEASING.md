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
  wasm), and creates the GitHub release (a prerelease for `-` versions). A
  prerelease such as `0.6.0-beta.1` is published under the dist-tag named by
  its first identifier (`beta`), never `latest`. It
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

Each resync adds about 21 MB (gzipped, both wasms) to the repo history, so
only resync when the circuit or gnark actually changed.

## Release procedure

1. Start from an up-to-date `main`: `git switch main && git pull`.
2. Check the ABIs against the `core` commit the release targets (CI has no
   `core` checkout, so this is on you):
   `MIST_CORE=/path/to/core npm run abis:check`. Do not release on a failure.
3. Check `circuit.json` records merged commits (`core` on core's `main`,
   `builtFrom` on mist's `main`) and that the wasm matches the verifier
   deployed on the target chain.
4. Bump the version (this commits and tags `vX.Y.Z`):
   - betas: `npm version prerelease --preid beta` (`0.6.0-beta.1` →
     `0.6.0-beta.2`); always `-beta.N`, with the dot, so versions sort
     numerically
   - stable: `npm version <patch|minor|major>`
5. Push the commit and tag: `git push origin main --follow-tags`.
   `release.yml` publishes and cuts the GitHub release. Add the target
   deployments (address books) to the release notes.
