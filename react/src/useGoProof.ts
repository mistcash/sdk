import { useCallback, useEffect, useState } from 'react';

export interface GoWitnessData {
  ClaimingKey: string;
  Owner: string;
  TxAsset: {
    Amount: number;
    Addr: string;
  };
  MerkleProof: (string | number)[];
  Withdraw: {
    Amount: number;
    Addr: string;
  };
  MerkleRoot: string;
  Nullifier: string;
  NewTxSecret: string;
  NewTx: string;
}

declare global {
  function prove(witness: string): Promise<string>;
  const Go: any;
}

// @NOTE: Assumption on wasm files location
const WASM_EXEC_PATH = '/wasm_exec.js';
const PROVER_WASM_PATH = '/main.wasm';

async function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve();
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = (err) => reject(new Error(`Failed to load script ${src}: ${err}`));
    document.head.appendChild(script);
  });
}

export function useGoProof() {
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [isProverReady, setIsProverReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        await loadScript(WASM_EXEC_PATH);
        if (cancelled) return;

        const go = new Go();
        const result = await WebAssembly.instantiateStreaming(
          fetch(PROVER_WASM_PATH),
          go.importObject
        );
        if (cancelled) return;

        go.run(result.instance);

        if (typeof prove === 'function') {
          setIsProverReady(true);
        } else {
          throw new Error('`prove` function not found after loading WASM module.');
        }
      } catch (error) {
        console.error('Failed to initialize Go prover:', error);
      }
    }

    setup();

    return () => {
      cancelled = true;
    };
  }, []);

  const generateProof = useCallback(async (params: GoWitnessData): Promise<any> => {
    if (!isProverReady) {
      throw new Error('Go prover is not initialized.');
    }

    setIsGeneratingProof(true);

    try {
      console.log(`Generating Proof...`);
      const witness = JSON.stringify(params);
      const proofJson = await prove(witness);
      const proof = JSON.parse(proofJson);
      return proof;
    } catch (error) {
      console.error('Failed to generate proof:', error);
      throw error;
    } finally {
      setIsGeneratingProof(false);
    }
  }, [isProverReady]);

  return {
    generateProof,
    isGeneratingProof,
    isProverReady,
  };
}
