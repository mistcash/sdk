#!/bin/bash

# Script to embed WASM files as base64 in TypeScript source files
# This makes the SDK more portable and eliminates file system dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GO_DIST_DIR="$PROJECT_ROOT/gnark-dist"
TARGET_DIR="$PROJECT_ROOT/core/src/gnark"

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
  return decode${var_name}().buffer as ArrayBuffer;
}
EOF
  
  echo "✅ Generated $output_file"
}

# Embed main.wasm
embed_wasm \
  "$GO_DIST_DIR/main.wasm" \
  "$TARGET_DIR/wasm-main.embedded.ts" \
  "MAIN_WASM"

# Copy wasm_exec.js to core/src for easy import
if [ -f "$GO_DIST_DIR/wasm_exec.js" ]; then
  cp "$GO_DIST_DIR/wasm_exec.js" "$TARGET_DIR/wasm_exec.js"
  echo "✅ Copied wasm_exec.js to $TARGET_DIR/wasm_exec.js"
  
  # Also create a TypeScript declaration file if it doesn't exist
  if [ ! -f "$TARGET_DIR/wasm_exec.d.ts" ]; then
    cat > "$TARGET_DIR/wasm_exec.d.ts" << 'EOF'
/**
 * Type definitions for wasm_exec.js
 * This file is generated/copied by scripts/embed-wasm.sh
 */

declare global {
  var Go: any;
}

export {};
EOF
    echo "✅ Created wasm_exec.d.ts type definitions"
  fi
else
  echo "⚠️  Warning: wasm_exec.js not found in $GO_DIST_DIR"
fi

# Copy JSON files to core/src/goWasm
for json_file in vk.json assignment.json proof.json; do
  if [ -f "$GO_DIST_DIR/$json_file" ]; then
    cp "$GO_DIST_DIR/$json_file" "$TARGET_DIR/$json_file"
    echo "✅ Copied $json_file to $TARGET_DIR/$json_file"
  else
    echo "⚠️  Warning: $json_file not found in $GO_DIST_DIR"
  fi
done

echo ""
echo "✨ Successfully embedded all WASM files!"
echo ""
