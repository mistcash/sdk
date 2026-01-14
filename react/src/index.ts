import { useEffect, useMemo, useState } from 'react';
import { UseProviderResult, UseSendTransactionResult } from '@starknet-react/core';
import { CHAMBER_ADDR_MAINNET, ChamberTypedContract, } from '@mistcash/config';
import { full_prove, hash_with_asset, Witness } from '@mistcash/sdk';
import { calculateMerkleRootAndProof, txHash, txSecret } from '@mistcash/sdk';
import { devStr, devVal, Asset, fetchTxAssets, getChamber, initCore } from '@mistcash/sdk';
import { Call, ProviderInterface } from 'starknet';

export interface UseMistResult {
  chamberAddress: `0x${string}`;
  loadingStatus: LoadingStatus;
  loadingMessage: string;

  valTo: string;
  setTo: (val: string) => void;
  valKey: string;
  setKey: (val: string) => void;

  txLeaves: bigint[];
  asset: Asset | undefined;
  setAsset: (asset: Asset | undefined) => void;
  setAssetAddr: (addr: string) => void;
  setAssetAmt: (amount: bigint) => void;
  contract: ChamberTypedContract;
  send: (args?: Call[] | undefined) => void;
  isPending: boolean;
  error: string | null;
  txError: Error | null;
  fetchAsset: () => Promise<Asset>;
  updateTxLeaves: () => Promise<bigint[]>;
  handleWithdraw: (asset: Asset, new_tx_amount: string) => Promise<void>;

  valSnHTo: string;
  setSnHTo: (val: string) => void;
  valSnHKey: string;
  setSnHKey: (val: string) => void;
  valSnHAmt: string;
  setSnHAmt: (val: string) => void;
}

type LoadingStatus = 'FINDING_TX' | 'READY';

const loadingStatuses: Record<LoadingStatus, [LoadingStatus, string]> = {
  FINDING_TX: ['FINDING_TX', 'Finding transaction...'],
  READY: ['READY', ''],
};

export function useMist(
  provider: ProviderInterface | UseProviderResult,
  sendTx: UseSendTransactionResult,
): UseMistResult {
  const actualProvider = 'provider' in provider ? provider.provider : provider;

  const [txLeaves, setTxLeaves] = useState<bigint[]>([]);
  const [[loadingStatus, loadingMessage], _setLoadingMsg] = useState<[LoadingStatus, string]>(
    loadingStatuses.READY,
  );
  const setLoadingMsg = (status: LoadingStatus) => _setLoadingMsg(loadingStatuses[status]);

  const [valTo, setTo] = useState<string>(
    devStr('0x021233997111a61e323Bb6948c42441a2b1a25cc0AB29BB0B719c483f7C9f469'),
  );
  const [valKey, setKey] = useState<string>(devStr('0xdada'));
  const [asset, setAsset] = useState<Asset | undefined>(
    devVal({
      amount: BigInt('1000000000000'),
      addr: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    }),
  );
  const setAssetAddr = (addr: string) => setAsset({ amount: asset?.amount || 0n, addr });
  const setAssetAmt = (amount: bigint) => setAsset({ amount, addr: asset?.addr || '' });

  // Seek and hide second transaction params
  const [valSnHTo, setSnHTo] = useState<string>('');
  const [valSnHKey, setSnHKey] = useState<string>('');
  const [valSnHAmt, setSnHAmt] = useState<string>('');

  const contract = useMemo(() => {
    return getChamber(actualProvider);
  }, [actualProvider]) as ChamberTypedContract;

  const { send, isPending, error: txError } = sendTx;

  useEffect(() => {
    (async () => {
      initCore();
      const leaves = (await contract?.tx_array()) as bigint[];
      setTxLeaves(leaves);
    })();
  }, [contract]);

  async function updateTxLeaves() {
    const leaves = (await contract?.tx_array()) as bigint[];
    setTxLeaves(leaves);
    return leaves;
  }
  async function handleWithdraw(asset: Asset, new_tx_amount?: string) {
    const newTxAmt = BigInt(new_tx_amount || 0);
    const merkle_root = (await contract?.merkle_root()) as bigint;
    const new_tx_secret = txSecret(valSnHKey, valSnHTo);
    const tx_hash = txHash(
      valKey,
      valTo,
      BigInt(asset.addr).toString(),
      BigInt(asset.amount).toString(),
    );
    const nullifier = txHash(
      (BigInt(valKey) + 1n).toString(),
      valTo,
      BigInt(asset.addr).toString(),
      BigInt(asset.amount).toString(),
    );
    const tx1 = hash_with_asset(
      new_tx_secret,
      BigInt(asset.addr).toString(),
      BigInt(asset.amount).toString(),
    );
    const tx_index = txLeaves.indexOf(tx_hash);
    const merkleProofWRoot = calculateMerkleRootAndProof(txLeaves, tx_index);
    const merkleProof = merkleProofWRoot
      .slice(0, merkleProofWRoot.length - 1)
      .map((bi) => bi.toString());

    const withdrawAmount = BigInt(asset.amount) - newTxAmt;

    const witness: Witness = {
      ClaimingKey: valKey,
      Owner: valTo,
      TxAsset: {
        Amount: asset.amount.toString(),
        Addr: asset.addr,
      },
      MerkleProof: [...merkleProof, ...new Array(20 - merkleProof.length).fill('0')],
      MerkleRoot: merkle_root.toString(),
      Withdraw: {
        Amount: withdrawAmount.toString(),
        Addr: withdrawAmount == 0n ? '0' : asset.addr,
      },
      Nullifier: nullifier.toString(),
      Tx1Secret: new_tx_secret.toString(),
      Tx1: newTxAmt == 0n ? '0' : tx1,
      Tx2Amount: '0',
      Tx2Secret: '0',
      Tx2: '0',
    };

    console.log('Witness prepared:', witness);

    try {
      const calldata = (await full_prove(witness)).slice(1);
      if (contract) {
        send([contract.populate('handle_zkp', [calldata])]);
      } else {
        throw 'contract not set up!';
      }
    } catch (error) {
      console.error('Failed to process withdraw:', error);
    }
  }

  async function fetchAssets() {
    setLoadingMsg('FINDING_TX');
    const asset = await fetchTxAssets(contract, valKey, valTo);
    if (asset.amount != BigInt(0)) {
      setAsset(asset);
    }
    setLoadingMsg('READY'); // clearing loading message
    return asset;
  }

  // For accumulating all errors
  const error = `${txError || ''}`;

  return {
    chamberAddress: CHAMBER_ADDR_MAINNET,
    loadingStatus,
    loadingMessage,
    txLeaves,
    updateTxLeaves,

    // Seek and hide params
    valSnHTo,
    setSnHTo,
    valSnHKey,
    setSnHKey,
    valSnHAmt,
    setSnHAmt,

    valTo,
    setTo,
    valKey,
    setKey,
    asset,
    setAsset,
    setAssetAddr,
    setAssetAmt,
    contract,
    send,
    isPending,
    error,
    txError,
    fetchAsset: fetchAssets,
    handleWithdraw,
  };
}
