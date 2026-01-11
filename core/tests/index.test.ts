import { isWasmInitialized, resetWasm, initWasm } from '..';

describe('@mistcash/sdk', () => {
  describe('SDK_VERSION', () => {
    it('should load wasm', async () => {
      let wasm = await initWasm();
      console.log('WASM initialized:', wasm);
      expect(true).toBe(false);
    });
  });

  describe('isWasmInitialized', () => {
    it('should return false when WASM is not initialized', () => {
      resetWasm();
      expect(isWasmInitialized()).toBe(false);
    });
  });
});
