// The contract ABI surface.
//
// `CORE_ABI` and `ABIS` are human-readable strings generated from
// `forge inspect` into src/abis.generated.ts (`npm run abis`); the client
// encodes against the JSON ABIs in the same file. Drift against core is
// caught by `npm run abis:check`, which needs a core checkout; these tests
// run without one and check the committed file is internally consistent.
//
// The consistency check that matters most: `handleZkp` reads its public inputs
// positionally, so the `uint256[14]` in the ABI and the 14 entries in
// PUBLIC_INPUTS must agree. If a circuit change alters the input count and
// only one of the two is updated, every proof reverts on-chain.

import { describe, expect, it } from 'vitest';
import { parseAbi, parseAbiItem } from 'viem';
import { ABIS, CORE_ABI, PUBLIC_INPUTS } from '../src/contracts.js';
import { chamberAbi, chamberVerifierAbi } from '../src/abis.generated.js';

const parsedHandleZkp = () =>
  (parseAbi(CORE_ABI as unknown as string[]) as Array<{ type: string; name?: string; inputs?: Array<{ type: string }> }>)
    .find((item) => item.type === 'function' && item.name === 'handleZkp');

describe('contracts', () => {
  it('parses CORE_ABI', () => {
    expect(() => parseAbi(CORE_ABI as unknown as string[])).not.toThrow();
  });

  it('parses every per-contract ABI', () => {
    for (const [name, abi] of Object.entries(ABIS)) {
      expect(() => parseAbi(abi as unknown as string[]), `${name} ABI does not parse`).not.toThrow();
    }
  });

  it('declares handleZkp with the public input count PUBLIC_INPUTS describes', () => {
    const handleZkp = parsedHandleZkp();
    expect(handleZkp).toBeDefined();
    expect(handleZkp!.inputs![1].type).toBe(`uint256[${PUBLIC_INPUTS.length}]`);
  });

  it('keeps the proof width at 8 elements', () => {
    // The prover is validated against the same width in proveSpend().
    expect(parsedHandleZkp()!.inputs!.map((p) => p.type)).toEqual(['uint256[8]', `uint256[${PUBLIC_INPUTS.length}]`, 'uint256[]']);
  });

  it("names PUBLIC_INPUTS as Chamber's PublicInputs struct does, in order", () => {
    // handleZkp returns the decoded PublicInputs struct, so the generated ABI
    // carries core's field order. (`abis:check` also checks primary.go.)
    const handleZkp = chamberAbi.find((item) => item.type === 'function' && item.name === 'handleZkp')!;
    const [params] = handleZkp.outputs as unknown as [{ components: Array<{ name: string }> }];
    expect(params.components.map((c) => c.name)).toEqual(PUBLIC_INPUTS.map(([name]) => name));
  });

  it('verifies proofs over the same public input count', () => {
    const verifyProof = chamberVerifierAbi.find((item) => item.type === 'function' && item.name === 'verifyProof')!;
    expect(verifyProof.inputs.map((p) => p.type)).toEqual(['bytes', `uint256[${PUBLIC_INPUTS.length}]`]);
  });

  it('lists the public inputs in a stable order', () => {
    // Positional: Chamber reads input[i] by index, and the client indexes
    // publicInputs[0..1] for the two input nullifiers and [2..3] for the two
    // new note hashes. A reorder here silently re-points every one of them.
    expect(PUBLIC_INPUTS).toHaveLength(14);
    const names = PUBLIC_INPUTS.map(([name]) => name);
    expect(new Set(names).size).toBe(14);
    expect(names.slice(0, 4)).toEqual(['nullifier1', 'nullifier2', 'newNote1', 'newNote2']);
    // The withdraw block is positional too, and read by name at fixed offsets.
    expect(names.slice(6, 10)).toEqual([
      'withdrawAmount', 'withdrawAsset', 'withdrawReserve', 'withdrawTo',
    ]);
  });

  it('describes every public input', () => {
    for (const [name, description] of PUBLIC_INPUTS) {
      expect(name, 'a public input has no name').toBeTruthy();
      expect(description, `${name} has no description`).toBeTruthy();
    }
  });

  it('parses the event declarations', () => {
    const event = CORE_ABI.find((line) => line.startsWith('event UserRegistered'));
    expect(event).toBeDefined();
    const parsed = parseAbiItem(event!) as { type: string; name: string };
    expect(parsed.type).toBe('event');
    expect(parsed.name).toBe('UserRegistered');
  });

  it('declares the owner() getter the client reads on construction', () => {
    expect(CORE_ABI.some((line) => line.startsWith('function owner()'))).toBe(true);
  });
});
