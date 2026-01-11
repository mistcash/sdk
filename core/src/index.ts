// Main entry point with environment detection
import type { WasmInstance, WasmExports } from './types';

import * as nodeLoader from './loaders/nodeLoader'
import * as browserLoader from './loaders/browserLoader'

// Re-export types
export * from './dev';
export * from './utils';
export * from './types';

// Platform-specific loader - will be resolved by bundler
// For Node.js, use loader.node; for browsers, use loader.browser
let loaderModule: any = null;
let isInitialized = false;

/**
 * Detects the current environment
 */
export function detectEnvironment(): 'browser' | 'node' {
  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
    return 'node';
  }

  // Check for browser environment
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return 'browser';
  }

  // Default to browser for other environments (e.g., React Native, Electron renderer)
  return 'browser';
}

/**
 * Loads the appropriate loader based on environment
 */
async function loadLoader() {
  if (loaderModule) {
    return loaderModule;
  }

  const env = detectEnvironment();

  return env === 'node' ? nodeLoader : browserLoader;
}

/**
 * Initializes the WASM module
 * @param wasmPath Optional custom path to the WASM file
 */
export async function initWasm(wasmPath?: string): Promise<WasmInstance> {
  const loader = await loadLoader();
  const instance = await loader.initWasm(wasmPath);
  isInitialized = true;
  return instance;
}

/**
 * Gets the current WASM instance
 */
export function getWasmInstance(): WasmInstance | null {
  if (!loaderModule) {
    return null;
  }
  return loaderModule.getWasmInstance();
}

/**
 * Checks if WASM is initialized
 */
export function isWasmInitialized(): boolean {
  return isInitialized;
}

/**
 * Resets the WASM instance (useful for testing)
 */
export function resetWasm(): void {
  if (loaderModule) {
    loaderModule.resetWasm();
  }
  loaderModule = null;
  isInitialized = false;
}

/**
 * Gets WASM exports, initializing if necessary
 */
export async function getWasmExports(wasmPath?: string): Promise<WasmExports> {
  let instance = getWasmInstance();

  if (!instance) {
    instance = await initWasm(wasmPath);
  }

  return instance.exports;
}

/**
 * Convenience function to call a WASM exported function
 */
export async function callWasmFunction<T = any>(functionName: string, ...args: any[]): Promise<T> {
  const exports = await getWasmExports();

  if (typeof exports[functionName] !== 'function') {
    throw new Error(`Function '${functionName}' not found in WASM exports`);
  }

  return exports[functionName](...args);
}
