import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/prover.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});