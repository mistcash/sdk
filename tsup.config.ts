import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    entry: { prover: 'src/prover.ts', 'prover.node': 'src/prover.node.ts' },
    format: ['esm'],
    dts: true,
  },
]);