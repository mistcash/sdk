/**
 * Integration test for useGoProof - tests actual WASM proof generation
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

// Set up Node.js globals that Go WASM requires
globalThis.fs = fs;
globalThis.path = path;
globalThis.TextEncoder = require('util').TextEncoder;
globalThis.TextDecoder = require('util').TextDecoder;
globalThis.performance ??= require('perf_hooks').performance;
globalThis.crypto ??= require('crypto');

const wasmExecPath = path.join(__dirname, '../../go-dist/wasm_exec.js');
require(wasmExecPath);

const assignmentPath = path.join(__dirname, '../../go-dist/assignment.json');
const rawWitness = JSON.parse(fs.readFileSync(assignmentPath, 'utf-8'));

const realWitness = {
  ...rawWitness,
  MerkleProof: rawWitness.MerkleProof.map(v => typeof v === 'number' ? v.toString() : v),
  TxAsset: {
    Amount: rawWitness.TxAsset.Amount.toString(),
    Addr: rawWitness.TxAsset.Addr,
  },
  Withdraw: {
    Amount: rawWitness.Withdraw.Amount.toString(),
    Addr: rawWitness.Withdraw.Addr,
  },
};

describe('useGoProof Integration', () => {
  let goInstance;

  beforeAll(async () => {
    const wasmPath = path.join(__dirname, '../../go-dist/main.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    goInstance = new Go();
    const result = await WebAssembly.instantiate(wasmBuffer, goInstance.importObject);

    goInstance.run(result.instance);

    await new Promise(resolve => setTimeout(resolve, 100));
  }, 30000);

  it('should have the prove function available after WASM loads', () => {
    expect(typeof globalThis.prove).toBe('function');
  });

  it('should generate a proof with witness data', async () => {
    const witnessJson = JSON.stringify(realWitness);

    console.log('Generating proof with witness data...');
    const startTime = Date.now();

    const proofResult = await globalThis.prove(witnessJson);

    const duration = Date.now() - startTime;
    console.log(`Proof generated in ${duration}ms`);

    const proof = typeof proofResult === 'string' ? JSON.parse(proofResult) : proofResult;

    console.log('Proof type:', typeof proofResult);
    console.log('Proof:', JSON.stringify(proof, null, 2));

    // Verify the proof structure
    expect(proof).toBeDefined();
    expect(proof.status).toBe('success');
    expect(proof.proof).toBeDefined();
    expect(proof.publicInputs).toBeDefined();
    expect(Array.isArray(proof.publicInputs)).toBe(true);

    // Verify proof components exist (Groth16 proof structure)
    expect(proof.proof.Ar).toBeDefined();
    expect(proof.proof.Bs).toBeDefined();
    expect(proof.proof.Krs).toBeDefined();
  }, 120000);
});
