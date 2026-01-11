#!/bin/bash

# Script to embed WASM files as base64 in TypeScript source files
# This makes the SDK more portable and eliminates file system dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GO_DIST_DIR="$PROJECT_ROOT/go-dist"
CORE_SRC_DIR="$PROJECT_ROOT/core/src"

echo "🔧 Embedding WASM files as base64 in TypeScript..."

# Function to convert WASM to base64 and generate TS file
embed_wasm() {
  local wasm_file=$1
  local output_file=$2
  local var_name=$3
  
  echo "📦 Processing $wasm_file..."
  
  if [ ! -f "$wasm_file" ]; then
    echo "❌ Error: WASM file not found: $wasm_file"
    exit 1
  fi
  
  # Get file size for info
  local file_size=$(stat -f%z "$wasm_file" 2>/dev/null || stat -c%s "$wasm_file" 2>/dev/null)
  echo "   Size: $(numfmt --to=iec-i --suffix=B $file_size 2>/dev/null || echo "$file_size bytes")"
  
  # Convert to base64
  local base64_content
  if command -v base64 &> /dev/null; then
    # macOS and most Linux systems
    base64_content=$(base64 -i "$wasm_file" | tr -d '\n')
  else
    echo "❌ Error: base64 command not found"
    exit 1
  fi
  
  # Generate TypeScript file
  cat > "$output_file" << EOF
/**
 * Embedded WASM binary as base64
 * Generated automatically by scripts/embed-wasm.sh
 * DO NOT EDIT MANUALLY
 * 
 * Original file: $(basename "$wasm_file")
 * Size: $file_size bytes
 * Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
 */

/**
 * Base64-encoded WASM binary
 */
export const ${var_name}_BASE64 = '${base64_content}';

/**
 * Decode the base64 WASM binary to Uint8Array
 */
export function decode${var_name}(): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    return new Uint8Array(Buffer.from(${var_name}_BASE64, 'base64'));
  } else {
    // Browser environment
    const binaryString = atob(${var_name}_BASE64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Get the WASM binary as ArrayBuffer
 */
export function get${var_name}Buffer(): ArrayBuffer {
  return decode${var_name}().buffer;
}
EOF
  
  echo "✅ Generated $output_file"
}

# Embed main.wasm
embed_wasm \
  "$GO_DIST_DIR/main.wasm" \
  "$CORE_SRC_DIR/wasm-main.embedded.ts" \
  "MAIN_WASM"

echo ""
echo "✨ Successfully embedded all WASM files!"
echo ""
echo "📝 Next steps:"
echo "   1. Update loader.node.ts to use the embedded WASM"
echo "   2. Update loader.browser.ts to use the embedded WASM"
echo "   3. Add 'prepare' script to package.json to run this before build"
echo ""
