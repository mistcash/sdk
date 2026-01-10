import { renderHook, act, waitFor } from '@testing-library/react';
import { useGoProof, GoWitnessData, ProveResult } from '../src/useGoProof';

// Mock global objects and functions
const mockProve = jest.fn();
const mockGoRun = jest.fn();
const mockInstantiateStreaming = jest.fn();

// Define the globals that useGoProof expects
(globalThis as any).fetch = jest.fn(() =>
  Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as Response)
);

(globalThis as any).WebAssembly.instantiateStreaming = mockInstantiateStreaming;

beforeAll(() => {
  (globalThis as any).prove = mockProve;
  (globalThis as any).Go = jest.fn(() => ({
    importObject: {},
    run: mockGoRun,
  }));

  const script = document.createElement('script');
  script.src = '/wasm_exec.js';
  document.head.appendChild(script);
});

beforeEach(() => {
  jest.clearAllMocks();

  mockInstantiateStreaming.mockResolvedValue({
    instance: {},
  });
});

describe('useGoProof', () => {
  const mockWitness: GoWitnessData = {
    ClaimingKey: '0x123',
    Owner: '0x456',
    TxAsset: { Amount: '100', Addr: '0x789' },
    MerkleProof: [],
    Withdraw: { Amount: '90', Addr: '0x789' },
    MerkleRoot: '0xabc',
    Nullifier: '0xdef',
    NewTxSecret: '0xghi',
    NewTx: '0xjkl',
  };

  const mockProof: ProveResult = {
    status: 'success',
    proof: {
      Ar: { X: '123', Y: '456' },
      Krs: { X: '789', Y: '012' },
      Bs: {
        X: { A0: '111', A1: '222' },
        Y: { A0: '333', A1: '444' },
      },
      Commitments: [],
      CommitmentPok: { X: '0', Y: '0' },
    },
    publicInputs: ['123', '456'],
  };

  it('should initialize the prover and set isProverReady to true', async () => {
    const { result } = renderHook(() => useGoProof());

    expect(result.current.isProverReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isProverReady).toBe(true);
    });
  });


  it('should call the prove function with the correct witness and return the proof (string response)', async () => {
    mockProve.mockResolvedValue(JSON.stringify(mockProof));

    const { result } = renderHook(() => useGoProof());

    await waitFor(() => expect(result.current.isProverReady).toBe(true));

    let proof: ProveResult | undefined;
    await act(async () => {
      proof = await result.current.generateProof(mockWitness);
    });

    expect(result.current.isGeneratingProof).toBe(false);
    expect(mockProve).toHaveBeenCalledWith(JSON.stringify(mockWitness));
    expect(proof).toEqual(mockProof);
  });

  it('should call the prove function with the correct witness and return the proof (object response)', async () => {
    mockProve.mockResolvedValue(mockProof);

    const { result } = renderHook(() => useGoProof());

    await waitFor(() => expect(result.current.isProverReady).toBe(true));

    let proof: ProveResult | undefined;
    await act(async () => {
      proof = await result.current.generateProof(mockWitness);
    });

    expect(result.current.isGeneratingProof).toBe(false);
    expect(mockProve).toHaveBeenCalledWith(JSON.stringify(mockWitness));
    expect(proof).toEqual(mockProof);
  });

  it('should set isGeneratingProof to true while generating the proof', async () => {
    let resolveProof: (value: string) => void;
    const promise = new Promise<string>(resolve => {
      resolveProof = resolve;
    });
    mockProve.mockReturnValue(promise);

    const { result } = renderHook(() => useGoProof());

    await waitFor(() => expect(result.current.isProverReady).toBe(true));

    act(() => {
      result.current.generateProof(mockWitness);
    });

    await waitFor(() => expect(result.current.isGeneratingProof).toBe(true));

    await act(async () => {
      resolveProof!(JSON.stringify(mockProof));
    });

    await waitFor(() => expect(result.current.isGeneratingProof).toBe(false));
  });

  it('should throw an error if the prover is not ready', async () => {
    mockInstantiateStreaming.mockRejectedValue(new Error('WASM load failed'));

    const { result } = renderHook(() => useGoProof());

    await act(async () => { });

    await expect(result.current.generateProof(mockWitness)).rejects.toThrow('Go prover is not initialized.');
  });

  it('should handle errors from the prove function', async () => {
    const errorMessage = 'Proof generation failed';
    mockProve.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useGoProof());

    await waitFor(() => expect(result.current.isProverReady).toBe(true));

    await expect(result.current.generateProof(mockWitness)).rejects.toThrow(errorMessage);
    expect(result.current.isGeneratingProof).toBe(false);
  });
});
