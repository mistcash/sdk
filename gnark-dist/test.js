// Copy wasm_exec.js from Go installation first:
// cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" ./

require('./wasm_exec.js');
const { createProver } = require('./dist/index.js');

async function test() {
	console.log('Testing gnark prover...');

	try {
		const prover = await createProver();
		console.log('✓ Prover initialized');

		const result = await prover.prove({
			testInput: 'test value'
		});

		console.log('✓ Proof generated:', result);
	} catch (error) {
		console.error('✗ Test failed:', error);
		process.exit(1);
	}
}

test();
