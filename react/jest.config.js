import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  preset: "ts-jest/presets/js-with-ts",
  testEnvironment: "jsdom",
  clearMocks: true,
  transform: {
    ...tsJestTransformCfg,
  },
  // Tell Jest to transform ES modules in node_modules
  // transformIgnorePatterns: [
  //   'node_modules/(?!(@aztec/bb\\.js)/)',
  // ],
  // Alternative: if you have multiple ES module dependencies
  // transformIgnorePatterns: [
  //   'node_modules/(?!(@aztec|@noir-lang)/)',
  // ],
  transformIgnorePatterns: [],

  // Optional but recommended for better ES module support
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};