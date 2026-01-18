# @mistcash/sdk

MIST Core SDK with Go WASM support for proof generation and verification.

## Features

- 🚀 **Universal**: Works in Node.js, browsers, React, Next.js, and more
- 🔧 **TypeScript**: Full TypeScript support with complete type definitions
- 📦 **Zero-config**: WASM loading with automatic environment detection
- 🎯 **Simple API**: Easy-to-use functions for proof generation and verification
- ⚡ **Efficient**: Singleton pattern for WASM instantiation (loads only once)
- � **Lightweight**: Minimal bundle size with no unnecessary dependencies

## Quick Start

### Installation

```bash
npm install @mistcash/sdk
# or
yarn add @mistcash/sdk
# or
pnpm add @mistcash/sdk
```

### Basic Usage

```typescript
import { initWasm, callWasmFunction } from '@mistcash/sdk';

// Initialize WASM (only needed once)
await initWasm();

// Call WASM functions
const result = await callWasmFunction('prove', inputData);
```

### Node.js

```typescript
import { initWasm, getWasmExports } from '@mistcash/sdk';

async function main() {
  // Initialize with custom WASM path (optional)
  await initWasm('./path/to/custom.wasm');

  // Get all exports
  const exports = await getWasmExports();

  // Use exported functions
  if (exports.prove) {
    const proof = await exports.prove({ input: 'data' });
    console.log('Proof:', proof);
  }
}

main();
```

### React

```typescript
import { useEffect, useState } from 'react';
import { initWasm, isWasmInitialized, callWasmFunction } from '@mistcash/sdk';

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initWasm('/main.wasm').then(() => {
      setReady(true);
    });
  }, []);

  const generateProof = async () => {
    if (!ready) return;

    const result = await callWasmFunction('prove', inputData);
    console.log('Proof generated:', result);
  };

  return (
    <div>
      <button onClick={generateProof} disabled={!ready}>
        {ready ? 'Generate Proof' : 'Loading...'}
      </button>
    </div>
  );
}
```

### Next.js

For Next.js, ensure WASM files are in the `public` directory:

```typescript
// pages/index.tsx
import { useEffect, useState } from 'react';
import { initWasm, getWasmExports } from '@mistcash/sdk';

export default function Home() {
  const [sdk, setSdk] = useState(null);

  useEffect(() => {
    // WASM file should be in public/main.wasm
    initWasm('/main.wasm').then(async () => {
      const exports = await getWasmExports();
      setSdk(exports);
    });
  }, []);

  // Use sdk...
}
```

## API Reference

### `initWasm(wasmPath?: string): Promise<WasmInstance>`

Initializes the WASM module. Only needs to be called once.

- `wasmPath` (optional): Custom path to the WASM file
- Returns: Promise resolving to the WASM instance

### `getWasmExports(wasmPath?: string): Promise<WasmExports>`

Gets the WASM exports, initializing if necessary.

- `wasmPath` (optional): Custom path to the WASM file
- Returns: Promise resolving to the WASM exports object

### `callWasmFunction<T>(functionName: string, ...args: any[]): Promise<T>`

Convenience function to call a WASM exported function.

- `functionName`: Name of the function to call
- `args`: Arguments to pass to the function
- Returns: Promise resolving to the function result

### `getWasmInstance(): WasmInstance | null`

Gets the current WASM instance without initializing.

- Returns: The current instance or null if not initialized

### `isWasmInitialized(): boolean`

Checks if WASM is initialized.

- Returns: true if initialized, false otherwise

### `resetWasm(): void`

Resets the WASM instance (useful for testing).

## Environment Setup

### Browser

Include `wasm_exec.js` in your HTML:

```html
<script src="/wasm_exec.js"></script>
<script src="/main.wasm" type="application/wasm"></script>
```

Or let the SDK load it dynamically (it will look for `/wasm_exec.js`).

### Node.js

The SDK will automatically load `wasm_exec_node.js` from the `gnark-dist` directory.

### Webpack/Vite

Configure your bundler to handle WASM files:

**Webpack:**

```javascript
module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
};
```

**Vite:**

```javascript
export default {
  assetsInclude: ['**/*.wasm'],
};
```

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## License

MIT
