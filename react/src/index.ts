import { useState } from 'react';
import { MistClient } from '@mistcash/sdk';

interface UseMist {
  connect: () => Promise<void>;
}

// WIP
export function useMist(): UseMist {
  const [client] = useState(() => new MistClient());

  return {
    connect: () => client.connect()
  };
}
