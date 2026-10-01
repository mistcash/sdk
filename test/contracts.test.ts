// The hand-maintained ABI surface.
//
// `CORE_ABI`, `ABIS` and the client's `*_MIN` ABIs are human-readable strings
// transcribed from `forge inspect`. A typo in one is invisible until a call
// fails against a real chain, which is the worst place to find out. Parsing
// them here turns that into a unit-test failure.
//
// The consistency check that matters most: `handleZkp` reads its public inputs
// positionally, so the `uint256[14]` in the ABI and the 14 entries in
// PUBLIC_INPUTS must agree. If a circuit change alters the input count and
// only one of the two is updated, every proof reverts on-chain.

import { describe, expect, it } from 'vitest';
import { parseAbi, parseAbiItem } from 'viem';
import { ABIS, CORE_ABI, PUBLIC_INPUTS } from '../src/contracts.js';

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
    const handleZkp = CORE_ABI.find((line) => line.startsWith('function handleZkp'));
    expect(handleZkp).toBeDefined();
    expect(handleZkp).toContain(`uint256[${PUBLIC_INPUTS.length}]`);
  });

  it('keeps the proof width at 8 elements', () => {
    const handleZkp = CORE_ABI.find((line) => line.startsWith('function handleZkp'))!;
    expect(handleZkp).toContain('uint256[8]');
    // The prover is validated against the same width in proveSpend().
    expect(handleZkp).toMatch(/handleZkp\(uint256\[8\], uint256\[\d+\], uint256\[\]\)/);
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
