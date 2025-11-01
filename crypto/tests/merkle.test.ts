import { calculateMerkleRoot, calculateMerkleRootAndProof } from "../src";
import { init, poseidonHashBN254 } from "garaga";

const maybePoseidonHash254 = (left: bigint, right: bigint): bigint => {
	if (right < left) {
		const temp = left;
		left = right;
		right = temp;
	}
	return left == 0n ? right : poseidonHashBN254(left, right);
};

describe("calculateMerkleRoot", () => {
	// this test requires setup
	// in the setup we need to init garaga wasm package
	beforeAll(async () => {
		await init();
	});
	const leaves = [
		0x8b8a7297bc4350dd84de1f21f5397389e7bd523dc4b1efbb42963f8fee53ce1n,
		0x7f474ce2c7d48131b3d0cd905442ade4d26fb6fdea99641f6580df11630812fn,
		0x1d0828ee3b4accc842f212b5d740d3d251c7868cc01545898458375c26eda6b5n,
		0x1963ee68bbaa3fea50638a641781b3c97064b0a5b272b999b7b5624cd6593654n,
		0xd92e3066f7ffec8d664044a04aec68fae86ebcd93795e96b8270e2f4f60be7dn,
		0x1e595d7a64258384caa6c73838f105b544c0053f6ba623a101dab98e4f975968n,
		0x87ec3b064e9550b1a5100ea02bf3cf707dd658c60ccbe38d05ea1d4820b9866n,
		0x14aa49bc55ddaf858cf24454637a4c15f702c1a3c4a4999d74262c1dbf7264f0n,
		0x2fab1ca3e6d073b3a236f7f293b77b6bb39bf3e47e05f3228b562a804ddc2783n,
		0xab3654742c9cb58dc53487173bc7c009de93a2345cbde488667960ae984e8d6n,
		0x2339bad6019977816671a6f4460b10613ae882afc5ef12d34c545340749fa166n,
		0x1809c1097d6678b733b237ba29f333969eb02004979dfd098a61a3d547bddc6en,
		0x2a7059232aea75e10e7f616c3c6bd2dceb6cf7a2b66078e76574428f03e2a24fn,
		0x2b2e3bb89ab28ca89e4195a0e20f60633bee168311a1b067fdea31609d6586a6n,
		0x17e1abf4b87730ea5bd2bce589ac40c59c54c715299bb3febaf15d8cf8c7d6a8n,
		0x25cefca3693d6d2673dd626f71b44c5d84703f8cb71c1f776995730614da37f0n,
		0x3a6970b2c1915e400be8671190a88a90052929be07cc3cfe6f2e00d99fe4cebn,
	];
	const path = [
		0x87ec3b064e9550b1a5100ea02bf3cf707dd658c60ccbe38d05ea1d4820b9866n,
		0x1a6e231f8012ef3c2c40e07b9f66f1fac82faa764ae795e385400d76a624a547n,
		0x185e54c4653815c950126e1ca7d4d4345df5dddd3c4ef238d22b3ec2bec62d2dn,
		0x17197b8f183da6b2b1bd95af6185f3c536c312ee06c6d7ebcd29825b8d7374en,
		0x3a6970b2c1915e400be8671190a88a90052929be07cc3cfe6f2e00d99fe4cebn,
	];
	const merkleRoot = 6438977049748256494652080486557650606703653145732020688108992093677347159459n;

	it("correct merkle root", () => {
		expect(calculateMerkleRoot(leaves, maybePoseidonHash254, l => l)).toBe(merkleRoot);
	});

	it("merkle proof", () => {
		const merkle_path = calculateMerkleRootAndProof(leaves, 7, maybePoseidonHash254, l => l).slice(0, -1);
		expect(merkle_path.length).toBe(path.length);
		expect(merkle_path).toStrictEqual(path);
	});
});
