export * from './useNoir';
import { useState } from 'react';
import { devStr, devVal, Asset, fetchTxAssets, getChamber } from '@mistcash/sdk';
import { StarknetTypedContract, UseProviderResult, UseSendTransactionResult } from '@starknet-react/core';
import { Call, ProviderInterface } from "starknet";
import { CHAMBER_ABI, CHAMBER_ADDR_MAINNET, ChamberTypedContract } from '@mistcash/config';

export interface UseMistResult {
  chamberAddress: `0x${string}`;
  loadingStatus: LoadingStatus;
  loadingMessage: string;
  valTo: string;
  setTo: (val: string) => void;
  valKey: string;
  setKey: (val: string) => void;
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
}

type LoadingStatus = "FINDING_TX" | "READY";

const loadingStatuses: Record<LoadingStatus, [LoadingStatus, string]> = {
  FINDING_TX: ["FINDING_TX", "Finding transaction..."],
  READY: ["READY", ""]
};

export function useMist(provider: ProviderInterface | UseProviderResult, sendTx: UseSendTransactionResult): UseMistResult {
  const actualProvider = 'provider' in provider ? provider.provider : provider;

  const [[loadingStatus, loadingMessage], _setLoadingMsg] = useState<[LoadingStatus, string]>(loadingStatuses.READY);
  const setLoadingMsg = (status: LoadingStatus) => _setLoadingMsg(loadingStatuses[status]);

  const [valTo, setTo] = useState<string>(devStr('0x021233997111a61e323Bb6948c42441a2b1a25cc0AB29BB0B719c483f7C9f469'));
  const [valKey, setKey] = useState<string>(devStr('22'));
  const [asset, setAsset] = useState<Asset | undefined>(devVal({
    amount: BigInt('1000000000000'),
    addr: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
  }));
  const setAssetAddr = (addr: string) => setAsset({ amount: asset?.amount || 0n, addr });
  const setAssetAmt = (amount: bigint) => setAsset({ amount, addr: asset?.addr || '' });
  const contract = getChamber(actualProvider);
  const { send, isPending, error: txError } = sendTx;

  async function fetchAssets() {
    setLoadingMsg('FINDING_TX');
    const asset = await fetchTxAssets(contract, valKey, valTo);
    setAsset(asset)
    setLoadingMsg('READY'); // clearing loading message
    return asset
  }

  // For accumulating all errors
  const error = `${txError || ''}`;

  return {
    chamberAddress: CHAMBER_ADDR_MAINNET,
    loadingStatus,
    loadingMessage,
    valTo, setTo,
    valKey, setKey,
    asset, setAsset,
    setAssetAddr,
    setAssetAmt,
    contract,
    send,
    isPending,
    error,
    txError,
    fetchAsset: fetchAssets
  };
}
