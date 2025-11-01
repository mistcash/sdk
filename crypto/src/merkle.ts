import { poseidonHashBN254 } from "garaga";

function merkleHasher(left: bigint, right: bigint): bigint {
	if (right < left) {
		const temp = left;
		left = right;
		right = temp;
	}

	const node = left == 0n ? right : poseidonHashBN254(left, right);
	return node % 2n == 0n ? node + 1n : node;
}

function evenLeafFilter(leaf: bigint): bigint {
	return leaf % 2n == 1n ? leaf - 1n : leaf;
}

// write merkle root calculator
export function calculateMerkleRoot(leaves: bigint[], hasher = merkleHasher, leafFilter = evenLeafFilter): bigint {
	let tree = leaves.map(leafFilter);
	while (tree.length > 1) {
		if (tree.length % 2 != 0) {
			tree.push(0n);
		}
		tree = get_next_level(tree, hasher);
	}

	return tree[0];
}

export function merkleRootFromPath(element: bigint, path: bigint[], hasher = merkleHasher, leafFilter = evenLeafFilter): bigint {
	let el = leafFilter(element);
	for (let i = 0; i < path.length; i++) {
		el = hasher(el, path[i]);
	}
	return el;
}

// write merkle root calculator
export function calculateMerkleRootAndProof(leaves: bigint[], index: number, hasher = merkleHasher, leafFilter = evenLeafFilter): bigint[] {
	let tree = leaves.map(leafFilter);
	const proof: bigint[] = [];

	while (tree.length > 1) {
		if (tree.length % 2 != 0) {
			tree.push(0n);
		}

		if (index % 2 == 0) {
			proof.push(tree[index + 1]);
		} else {
			proof.push(tree[index - 1]);
		}

		index = Math.floor(index / 2);

		tree = get_next_level(tree, hasher);
	}

	proof.push(tree[0]);

	return proof;
}

export function get_next_level(tree: bigint[], hasher = merkleHasher): bigint[] {
	const newLevel: bigint[] = [];
	for (let i = 0; i < tree.length; i += 2) {
		let left = tree[i];
		let right = tree[i + 1];
		const combined = hasher(left, right);
		newLevel.push(combined);
	}
	return newLevel;
}