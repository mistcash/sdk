import {
  calculateMerkleRoot,
  calculateMerkleRootAndProof,
  FIXTURES,
  merkleRootFromPath,
  txHash,
  txSecret,
  initCore
} from '../src/index';

describe('transaction_hashing_and_merkle_trees', () => {
  // this test requires setup
  // in the setup we need to init garaga wasm package
  beforeAll(async () => {
    await initCore();
  });
  const allTransactions = [
    "0x1b4adef71dd989e8fec13f06e6c9d585f6de0c7dd929e6855c1a696459d82f1b",
    "0x14b29b475563a280d0a16132a6c7199d21a18351b86fa900211c471e59e3f3ca",
    "0x1af7cdc80b745c42f8c5877b9147b096959192646aac921b4ab22b45d7e84631",
    "0x2193b8ccdc56d833d00bacd86c31421865b7326715f2e93a0097d617fcccee65",
    "0x1593cf6a98c4d827243453016515d69acaac65169720b30a36fb9149c22aecf",
    "0x22fe1811b8efa0e4832c1e5f1510e3314dd9a699c64a40328a17ccc23e8f4cd1",
    "0x2cf31da613176ebbb3cf535bf414f28176bd29f1ea264db339391b66d555989c",
    "0x1291646ac1ba37e246d84fde6ff41f784fc3d90da73091e0818a6e6a84bc1474",
    "0x4a4f9b46ef4564f6cd3e1533e593f9b9e99dad66fccdd70c5397136a93bba51",
    "0x2495c6969e370949f735f004a6261a6b95b15f6c795b7b1c37d848757af56199",
    "0x2248fc427a22a9f7247f2d31a2a4c52726a29015377de3a274241b932a61bfba",
    "0x1155c89283c0a4c07a3201cd3ce3d49547bb011ae906dac15da8d0be6262dfd",
    "0x26173c3c12e44dd954fb027ab2d09c3c7fba00e9e180b437960c5b7965e4150b",
    "0x1e1fa675df171699b4bac33ec6ee59fdaa596ccc77003f779d6c9b9df5ad6af7",
    "0x2a2c21df812f0312d9a4014f4702194b19bdbcde499275ebac9a43b615d61a46",
    "0x26ffb0ff811b0fab4d19fd8b600665e95f59fc03c9ae0158b3936b2bf1c4db09",
    "0x13c4a99c0082800866b2180df94ed9c3664210ac3717c51bbb3184a3ec64da8e",
  ].map((x) => BigInt(x));

  let proverArgs = FIXTURES.WITNESS;

  const merklePath = proverArgs.MerkleProof.map((x) => BigInt(x)).filter(x => x !== 0n).map((x) => x.toString());

  const merkleRoot = BigInt(proverArgs.MerkleRoot).toString();

  it('merkle root from tx path', async () => {
    const tx_hash = txHash(
      proverArgs.ClaimingKey,
      proverArgs.Owner,
      proverArgs.TxAsset.Addr,
      proverArgs.TxAsset.Amount,
    );

    // Compute merkle root for the transaction
    const computedRoot = merkleRootFromPath(tx_hash, proverArgs.MerkleProof.map(x => BigInt(x))).toString();

    expect(computedRoot.toString()).toBe(merkleRoot);
  });

  it('correct transactions root', () => {
    expect(calculateMerkleRoot(allTransactions).toString()).toBe(merkleRoot);
  });

  it('correct transactions hash', async () => {
    const tx_hash = txHash(
      proverArgs.ClaimingKey,
      proverArgs.Owner,
      proverArgs.TxAsset.Addr,
      proverArgs.TxAsset.Amount,
    );
    expect(allTransactions.indexOf(tx_hash)).toBe(7);
  });

  it('compute tx merkle path', async () => {
    const merkle_path = calculateMerkleRootAndProof(allTransactions, 7).slice(0, -1);
    expect(merkle_path.map(x => x.toString())).toStrictEqual(merklePath);
  });
});
