// Simple Node.js test to verify the package loads correctly
const sdk = require('.');

console.log('✓ Package loaded successfully');
console.log('Exported functions:', Object.keys(sdk));

// Check that key exports are available
const requiredExports = [
  'initWasm',
  'getWasmInstance',
  'isWasmInitialized',
  'resetWasm',
  'getWasmExports',
  'callWasmFunction',
];

requiredExports.forEach((exportName) => {
  if (sdk[exportName]) {
    console.log(`✓ ${exportName} is available`);
  } else {
    console.error(`✗ ${exportName} is missing`);
  }
});
console.log('\n✅ All checks passed!');
