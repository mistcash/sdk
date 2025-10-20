import { calculateMerkleRoot, calculateMerkleRootAndProof, txHash } from "../src";
import { init } from "garaga";

describe("transaction_hashing_and_merkle_trees", () => {
	// this test requires setup
	// in the setup we need to init garaga wasm package
	beforeAll(async () => {
		await init();
	});
	const allTransactions = [
		0x21042359879f6e54bdf9fcde4cfc9efc671c4ad43f8b759b5333d91ec3c14e9bn,
		0x21bc664ed5022124d8a4749b62dee18974e4dd9f5b618d75857e7632f41068a4n,
		0x1a2740b53766d00f3a0390fa32c77e1db669c82e09109808997d613ed8bc4241n,
		0x1a223bf4cedc9794d637277677c35703bead61a4ab45343ba8e93e393653bbbcn,
		0x24e5294b93b81b46f2afd3fbeb94393cb79e8084e3d8f44de8e675b028992111n,
		0x773007c131d0ab453f63b29aa00e1dfdda229ef14c07421c5f1a01ed5d1d0dfn,
		0x1f9c7e43207fa116e3a4f83699f2fc14bfbaa31a75a30a444bb6c431c1535f93n,
		0x2ffd1423b36283012b5f6312729ea1092695ed94fd54be613f8db5cd17912a49n,
		0x187a7d7189943e18a56cdddd82a3a79cd7029f938527e0de9bacfacb4d740014n,
		0x18fdf5577971b8a1405f84b1e48ed9e3d37e8c79c0c86e7f4d7b109b94ed4c62n,
		0x1d9d957439007c404d9e820f54f7e4d9655e6e2f893a7d38ea17ba0c709de232n,
		0x1216825aa2d4d96e0f1511194bcdb74f5f784a9544f2712c03144e9c0b5457efn,
		0x255c0fe6b445aac4ae140acb2df88bfc59cfcc7b7ac2412031ebf5866cdc6a5fn,
		0x456590e2d66b5d2281dc092b9d187f3632c71931e9dc2b0e672911b2d04748n,
		0x1dc82ccfde271c6bfa53881dc033c7614672b4b51d3f9729d773da109c8cb7f3n,
		0x2f9959c406a8650d8648deecfcf8eb7f9f85bcb7db5284d229eb7b317b1783d4n,
		0x88c26bd06815f0f1b2a1716fb7e211dde5a4368f07b2a665a93adc902a9da0dn,
	];

	let proverArgs = {
		asset: {
			amount: '100000',
			addr: '0x2877e73feb5b7af1e12db1ff5b15db30ffa42182406241f672e9e611f42f3e1'
		},
		claiming_key: '0x6162726163616461627261',
		recipient: '0x6a6f65',
		root: '0x13fd4e365257b399eaecce98e29bc3c6a68e08731fd419ae351f6cf72bd16e3c',
		new_tx_secret: '0x17fac61fa9d3f0b73ba678c69cfb943d2645a42d7a37902788789b702bdd6844',
		new_tx_amount: '2500',
		proof: [
			0x1f9c7e43207fa116e3a4f83699f2fc14bfbaa31a75a30a444bb6c431c1535f93n,
			0x579db66c3680bfefeccae502e036bb34d8aa075a3b761a93fa884422cc81263n,
			0x1ba3129c0ef6450ebb499a192623dc7d207ec3a22dd08cbe741c1dabe25dad7cn,
			0x1be25b8d7083888bcbeec02ec7c43d607a954761c1f73300bbe5637bbea07789n,
			0x88c26bd06815f0f1b2a1716fb7e211dde5a4368f07b2a665a93adc902a9da0dn,
		],
	}

	const merkleRoot = BigInt(proverArgs.root);

	it("correct transactions root", () => {
		expect(calculateMerkleRoot(allTransactions)).toBe(merkleRoot);
	});

	it("correct transactions hash", async () => {
		const tx_hash = await txHash(
			proverArgs.claiming_key,
			proverArgs.recipient,
			proverArgs.asset.addr,
			proverArgs.asset.amount,
		);
		expect(allTransactions.indexOf(tx_hash)).toBe(7);
	});

	it("compute tx merkle path", async () => {
		const merkle_path = calculateMerkleRootAndProof(allTransactions, 7).slice(0, -1);
		expect(merkle_path).toStrictEqual(proverArgs.proof);
	});
});
