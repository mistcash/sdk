# MIST SDK

## Workspace layout

pnpm workspace with four packages:

- `core/` — `@mistcash/sdk` — Core SDK with Go WASM embeddings (gnark), Starknet integration
- `config/` — `@mistcash/config` — Shared config
- `crypto/` — listed in workspace config but directory doesn't exist yet
- `react/` — `@mistcash/react` — React components wrapping core SDK
- `gnark-dist/` — Pre-built Go WASM artifacts used by the embed script
- `scripts/gnark-embeddings.sh` — Embeds WASM files as base64 in TypeScript source

## Commands

| Command | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run embed` | Base64-encode pre-built Go WASM files into `core/src/gnark/` |
| `pnpm run build` | `embed` followed by `pnpm -r build` |
| `pnpm -r build` | Build all packages |
| `pnpm run dev` | Watch-mode dev for all packages |
| `pnpm test` | Run Jest tests across all packages |
| `pnpm run clean` | Clean build outputs |
| `pnpm run format` | Prettier write all source |
| `pnpm run format:check` | Prettier check (CI) |

## CI

GitHub Actions workflow in `.github/workflows/ci.yml` runs on push/PR to `main`:

1. Setup Node 20 + pnpm (corepack) + Go 1.22
2. `pnpm install`
3. `pnpm run embed` — embeds WASM artifacts
4. `pnpm -r build` — builds all packages
5. `pnpm test` — runs tests
6. `pnpm run format:check` — formatting validation
