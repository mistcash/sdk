import { isWasmInitialized, resetWasm, initWasm } from '..';

const FIXTURE_WITNESS = {
	"ClaimingKey": "0x6162726163616461627261",
	"Owner": "0x6a6f65",
	"TxAsset": {
		"Amount": "100000",
		"Addr": "0x2877e73feb5b7af1e12db1ff5b15db30ffa42182406241f672e9e611f42f3e1"
	},
	"MerkleProof": [
		"0x2cf31da613176ebbb3cf535bf414f28176bd29f1ea264db339391b66d555989c",
		"0x2f2c4d50de48b60a8188793052bbc92f2a381d066ff0d0fe1aee993f30fdb75c",
		"0x25ace6f1331e9d018407e5320eed5834f817618e7801ec5e59632e7eed9f2e40",
		"0x2495d8b88166a1e5131b8273f2ac1e2d21de892372c5e7d55bd8bdb88b420f5",
		"0x13c4a99c0082800866b2180df94ed9c3664210ac3717c51bbb3184a3ec64da8e",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0",
		"0"
	],
	"Withdraw": {
		"Amount": "97500",
		"Addr": "0x2877e73feb5b7af1e12db1ff5b15db30ffa42182406241f672e9e611f42f3e1"
	},
	"MerkleRoot": "0x1935947da594b4bc039293afa3a32bd696b5896bca7a427fc2162a7d50ae860b",
	"Nullifier": "0xb18d87552c5be0d021374ee6ba3b1d4dcfe8ac1af6a8a331d9598fec500642f",
	"NewTxSecret": "0x10934cf94af9fbb0fcd67fc9ee6da318ebcab9971de1fbb249e1c882cf2ac755",
	"NewTx": "0x1149e3056e43be4d8dc0ec673b01bb11a46933aad2b3237c81c993bdceca251e"
};

describe('@mistcash/sdk', () => {
	describe('load wasm', () => {
		it('should load wasm', async () => {
			let wasm = await initWasm();
			const wasmExports = Object.keys(wasm.exports);
			expect(wasmExports.indexOf('prove')).toBeGreaterThan(-1);
			expect(wasmExports.indexOf('hash2')).toBeGreaterThan(-1);
			expect(wasmExports.indexOf('hash3')).toBeGreaterThan(-1);
		});
	});

	describe('test hashing', () => {
		it('test hashing', async () => {
			let { exports } = await initWasm();
			expect(exports.hash3("0x1234567890", "0x9876543210", "1")).toBe("2784974624267642952678807846760602137517276342215733276839677432747945500053");
			expect(exports.hash2("0x1234567890", "0x9876543210")).toBe("12568779716737065222642790056079768987407335034357740360530248514749971992218");
		});
	});

	describe('test proofs', () => {
		it('proving error', async () => {
			let { exports } = await initWasm();
			const proofError = await exports.prove();
			expect(proofError.status).toBe("error");
			expect(proofError.status).toBeDefined();
		});
		it('proving incorrect proof format', async () => {
			let { exports } = await initWasm();
			const proofError = await exports.prove(`{"incorrect":true}`);
			expect(proofError.status).toBe("error");
			expect(proofError.status).toBeDefined();
		});
		it('proving incorrect witness', async () => {
			let { exports } = await initWasm();
			const witness = {
				...FIXTURE_WITNESS,
				// NOTICE: Wrong claiming key
				"ClaimingKey": "0x0"
			};

			const proofError = await exports.prove(JSON.stringify(witness));
			expect(proofError.status).toBe("error");
			expect(proofError.status).toBeDefined();
		});

		it('proving success', async () => {
			let { exports } = await initWasm();
			const proofError = await exports.prove("1");

			expect(proofError.status).toBe("error");

			const startTime = performance.now();
			const proofSuccess = await exports.prove(JSON.stringify(FIXTURE_WITNESS));
			const endTime = performance.now();
			console.log(`Proof generation took ${(endTime - startTime).toFixed(2)} ms`);

			expect(proofSuccess.status).toBe("success");
			expect(proofSuccess.proof).toBeDefined();
			expect(proofSuccess.proof.Ar).toBeDefined();
			expect(proofSuccess.proof.Bs).toBeDefined();
			expect(proofSuccess.proof.Krs).toBeDefined();
		});
	});
});
