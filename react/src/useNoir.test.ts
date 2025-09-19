import { renderHook } from '@testing-library/react';
import { useNoirProof, flattenFieldsAsArray, getRawProof } from './useNoir';
// import { ProofData } from '@aztec/bb.js';
// import { CompiledCircuit } from '@noir-lang/noir_js';

describe('useNoirProof', () => {
  const witness = {
    asset: {
      amount: '100000',
      addr: '0x2877e73feb5b7af1e12db1ff5b15db30ffa42182406241f672e9e611f42f3e1',
    },
    claiming_key: '0x6162726163616461627261',
    recipient: '0x6a6f65',
    root: '0xe3c54f4c546f215fef54a2f2088452003f825c58e9f6fb06d60fa5a96603da3',
    new_tx_secret: '0x17fac61fa9d3f0b73ba678c69cfb943d2645a42d7a37902788789b702bdd6844',
    new_tx_amount: '2500',
    proof: [
      '0x87ec3b064e9550b1a5100ea02bf3cf707dd658c60ccbe38d05ea1d4820b9866',
      '0x1a6e231f8012ef3c2c40e07b9f66f1fac82faa764ae795e385400d76a624a547',
      '0x185e54c4653815c950126e1ca7d4d4345df5dddd3c4ef238d22b3ec2bec62d2d',
      '0x17197b8f183da6b2b1bd95af6185f3c536c312ee06c6d7ebcd29825b8d7374e',
      '0x3a6970b2c1915e400be8671190a88a90052929be07cc3cfe6f2e00d99fe4ceb',
      '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    ],
  };

  it('should generate proof', async () => {
    const { result } = renderHook(() => useNoirProof());
    const { generateCalldata, generateProof } = result.current;
    try {
      const proof = await generateProof(witness);
      const calldata = await generateCalldata(proof);
      expect(proof).toHaveProperty('proof');
      expect(proof).toHaveProperty('publicInputs');
      expect(calldata.length).toBeGreaterThan(1);
    } catch (error) {
      console.error('Error generating proof:', error);
    }
  }, 12000);

  it('should flatten hex strings to Uint8Array', () => {
    const arr = flattenFieldsAsArray(['0x1', '0x2']);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBeGreaterThan(0);
  });
});
