import { useState } from 'react';
import { MistClient } from '@mistcash/sdk';

export function useMist() {
  const [client] = useState(() => new MistClient());
  
  return {
    connect: () => client.connect()
  };
}
