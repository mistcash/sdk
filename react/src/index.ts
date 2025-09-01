import { useState } from 'react';
import { devStr, devVal, Asset, MistClient } from '@mistcash/sdk';

interface UseMist {
  connect: () => Promise<void>;
  valTo: string;
  setTo: (val: string) => void;
  valKey: string;
  setKey: (val: string) => void;
  asset: Asset | undefined;
  setAsset: (asset: Asset | undefined) => void;
}

// WIP
export function useMist(): UseMist {
  const [valTo, setTo] = useState<string>(devStr('0x021233997111a61e323Bb6948c42441a2b1a25cc0AB29BB0B719c483f7C9f469'));
  const [valKey, setKey] = useState<string>(devStr('22'));
  const [asset, setAsset] = useState<Asset | undefined>(devVal({
    amount: BigInt(10000000000000000),
    addr: '2009894490435840142178314390393166646092438090257831307886760648929397478285'
  }));
  const [client] = useState(() => new MistClient());

  return {
    connect: () => client.connect(),
    valTo, setTo,
    valKey, setKey,
    asset, setAsset,
  };
}
