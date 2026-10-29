import type { InstantiateFn } from './prover-core.js';

/**
 * The browser half of a loader: bytes, a Response, or a URL to fetch, with
 * `defaultURL` (the wasm beside the package) when no source is given. Shared
 * by the CPU and WebGPU entry points, which differ only in the wasm they load;
 * `file` and `loader` name them in errors.
 */
export function browserInstantiate(file: string, loader: string, defaultURL: () => string): InstantiateFn {
  return async (go, source) => {
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
      const result = await WebAssembly.instantiate(bytes as BufferSource, go.importObject) as WebAssembly.WebAssemblyInstantiatedSource;
      return result.instance;
    }
    if (source instanceof Response) {
      return instantiateFromResponse(source, go);
    }
    const url = source !== undefined ? String(source) : defaultURL();
    const res = await fetch(url).catch((cause: unknown) => {
      throw new Error(
        `could not fetch ${file} from ${url}: ${(cause as Error)?.message ?? String(cause)}. ` +
        'If this is a bundled app, the default path is resolved at runtime and the asset may not ' +
        'have been emitted — pass the URL your bundler gives you instead, e.g. ' +
        `${loader}(new URL('@mistcash/sdk/${file}', import.meta.url)) or, on Vite, ` +
        `${loader}((await import('@mistcash/sdk/${file}?url')).default).`,
        { cause },
      );
    });
    if (!res.ok) {
      throw new Error(
        `${file} not served at ${url} (HTTP ${res.status}${(res.statusText ? ' ' + res.statusText : '')}). ` +
        `Pass the wasm URL your bundler emits, or the bytes themselves, to ${loader}().`,
      );
    }
    return instantiateFromResponse(res, go);
  };
}

async function instantiateFromResponse(
  res: Response,
  go: { importObject: WebAssembly.Imports },
): Promise<WebAssembly.Instance> {
  if (typeof WebAssembly.instantiateStreaming === 'function' &&
      res.headers?.get('Content-Type') === 'application/wasm') {
    const result = await WebAssembly.instantiateStreaming(res, go.importObject);
    return result.instance;
  }
  const buf = await res.arrayBuffer();
  const result = await WebAssembly.instantiate(buf, go.importObject);
  return result.instance;
}
