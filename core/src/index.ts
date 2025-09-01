import { generateKeyPair } from '@mistcash/crypto';

export { generateKeyPair } from '@mistcash/crypto';

export class MistClient {
  constructor() {}

  connect() {
    const keyPair = generateKeyPair();
    return keyPair;
  }
}
