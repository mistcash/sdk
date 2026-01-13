import { hash3, hash2, prove_groth16, initWasm, initCore } from '..';
import { full_prove, FIXTURES } from '../src';

const FIXTURE_WITNESS = FIXTURES.WITNESS;

describe('@mistcash/sdk', () => {
  describe('load wasm', () => {
    it('should load wasm', async () => {
      let wasm = await initWasm();
      const wasmExports = Object.keys(wasm);
      expect(wasmExports.indexOf('prove')).toBeGreaterThan(-1);
      expect(wasmExports.indexOf('hash2')).toBeGreaterThan(-1);
      expect(wasmExports.indexOf('hash3')).toBeGreaterThan(-1);
    });
  });

  describe('test hashing', () => {
    it('test hashing', async () => {
      expect(await hash3('0x1234567890', '0x9876543210', '1')).toBe(
        '2784974624267642952678807846760602137517276342215733276839677432747945500053',
      );
      expect(await hash2('0x1234567890', '0x9876543210')).toBe(
        '12568779716737065222642790056079768987407335034357740360530248514749971992218',
      );
    });
  });

  describe('test proofs', () => {
    it('proving incorrect proof format', async () => {
      const proofError = await prove_groth16({ incorrect: true } as any);
      expect(proofError.status).toBe('error');
      expect(proofError.status).toBeDefined();
    });
    it('proving incorrect witness', async () => {
      const witness = {
        ...FIXTURE_WITNESS,
        // NOTICE: Wrong claiming key
        ClaimingKey: '0x0',
      };

      const proofError = await prove_groth16(witness);
      expect(proofError.status).toBe('error');
      expect(proofError.status).toBeDefined();
    });

    it('proving success', async () => {
      await initCore();
      const startTime = performance.now();
      const proofSuccess = await prove_groth16(FIXTURE_WITNESS);
      const endTime = performance.now();
      // console.log(`Proof generation took ${(endTime - startTime).toFixed(2)} ms`);

      expect(proofSuccess.status).toBe('success');
      if (proofSuccess.status === 'success') {
        expect(proofSuccess.proof).toBeDefined();
        expect(proofSuccess.proof.Ar).toBeDefined();
        expect(proofSuccess.proof.Bs).toBeDefined();
        expect(proofSuccess.proof.Krs).toBeDefined();
        expect(proofSuccess.publicInputs).toBeDefined();
      }
    });
  });
  describe('test proof and calldata', () => {
    it('proving success', async () => {
      await initCore();
      const startTime = performance.now();
      const proofCalldata = await full_prove(FIXTURE_WITNESS);
      const endTime = performance.now();
      // console.log(`Proof+Calldata generation took ${(endTime - startTime).toFixed(2)} ms`);

      expect(proofCalldata.length).toBeGreaterThan(0);
    });
  });
});
