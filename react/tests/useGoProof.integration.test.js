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

// Load wasm_exec.js to get the Go class
const wasmExecPath = path.join(__dirname, '../../go-dist/wasm_exec.js');
require(wasmExecPath);

// Load the real witness data from assignment.json
const assignmentPath = path.join(__dirname, '../../go-dist/assignment.json');
const rawWitness = JSON.parse(fs.readFileSync(assignmentPath, 'utf-8'));

// Convert numeric values to strings (Go prover expects string representations for big integers)
const realWitness = {
  ...rawWitness,
  MerkleProof: rawWitness.MerkleProof.map(v => v.toString()),
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
    // Load and instantiate the WASM module
    const wasmPath = path.join(__dirname, '../../go-dist/main.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);

    goInstance = new Go();
    const result = await WebAssembly.instantiate(wasmBuffer, goInstance.importObject);

    // Start the Go runtime (don't await - it runs indefinitely)
    goInstance.run(result.instance);

    // Wait a bit for the Go runtime to initialize and expose the prove function
    await new Promise(resolve => setTimeout(resolve, 100));
  }, 30000);

  it('should have the prove function available after WASM loads', () => {
    expect(typeof globalThis.prove).toBe('function');
  });

  it('should generate a valid Groth16 proof with witness data', async () => {
    const witnessJson = JSON.stringify(realWitness);

    console.log('Generating proof with witness data...');
    const startTime = Date.now();

    const proofResult = await globalThis.prove(witnessJson);

    const duration = Date.now() - startTime;
    console.log(`Proof generated in ${duration}ms`);

    // Handle both string and object responses
    const proof = typeof proofResult === 'string' ? JSON.parse(proofResult) : proofResult;

    console.log('Proof type:', typeof proofResult);
    console.log('Proof:', JSON.stringify(proof, null, 2));

    // Verify the proof structure matches ProveResult type
    expect(proof).toBeDefined();
    expect(proof.status).toBe('success');
    expect(proof.proof).toBeDefined();
    expect(proof.publicInputs).toBeDefined();
    expect(Array.isArray(proof.publicInputs)).toBe(true);

    // Verify Groth16 proof components (G1Point and G2Point structures)
    const { Ar, Krs, Bs, Commitments, CommitmentPok } = proof.proof;

    // Ar is a G1Point
    expect(Ar).toBeDefined();
    expect(typeof Ar.X).toBe('string');
    expect(typeof Ar.Y).toBe('string');

    // Krs is a G1Point
    expect(Krs).toBeDefined();
    expect(typeof Krs.X).toBe('string');
    expect(typeof Krs.Y).toBe('string');

    // Bs is a G2Point
    expect(Bs).toBeDefined();
    expect(Bs.X).toBeDefined();
    expect(typeof Bs.X.A0).toBe('string');
    expect(typeof Bs.X.A1).toBe('string');
    expect(Bs.Y).toBeDefined();
    expect(typeof Bs.Y.A0).toBe('string');
    expect(typeof Bs.Y.A1).toBe('string');

    // Commitments and CommitmentPok
    expect(Array.isArray(Commitments)).toBe(true);
    expect(CommitmentPok).toBeDefined();
  }, 120000);
});
