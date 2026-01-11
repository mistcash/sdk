import {
  calculateMerkleRoot,
  calculateMerkleRootAndProof,
  merkleRootFromPath,
  txHash,
  txSecret,
} from '../src';
import { init } from 'garaga';

const BN254_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe('test: key too long', () => {
  it('compute tx merkle path', async () => {
    const key = 0xe9cbc8b5dae730000000a658d00e8fbeb8000000eb16df490bc020000000b9aabbe9c92460000000n;
    const tx_orig = await txSecret(key.toString(), '0');

    // key % BN254_ORDER
    const new_key = 6184067850860675403050272395057073375787531232490131160029633571728932913493n;
    const tx_hash = await txSecret(new_key.toString(), '0');
    // expect(tx_hash).toBe(merkleRoot);
    console.log('tx_orig', tx_orig);
    console.log('tx_hash', tx_hash);
    expect(tx_orig).toBe(tx_hash);
  });
});

describe('transaction_hashing_and_merkle_trees', () => {
  // this test requires setup
  // in the setup we need to init garaga wasm package
  beforeAll(async () => {
    await init();
  });
  const allTransactions = [
    0x8b8a7297bc4350dd84de1f21f5397389e7bd523dc4b1efbb42963f8fee53ce0n,
    0x7f474ce2c7d48131b3d0cd905442ade4d26fb6fdea99641f6580df11630812en,
    0x1d0828ee3b4accc842f212b5d740d3d251c7868cc01545898458375c26eda6b4n,
    0x1963ee68bbaa3fea50638a641781b3c97064b0a5b272b999b7b5624cd6593654n,
    0xd92e3066f7ffec8d664044a04aec68fae86ebcd93795e96b8270e2f4f60be7cn,
    0x1e595d7a64258384caa6c73838f105b544c0053f6ba623a101dab98e4f975968n,
    0x87ec3b064e9550b1a5100ea02bf3cf707dd658c60ccbe38d05ea1d4820b9866n,
    0x14aa49bc55ddaf858cf24454637a4c15f702c1a3c4a4999d74262c1dbf7264f0n,
    0x2fab1ca3e6d073b3a236f7f293b77b6bb39bf3e47e05f3228b562a804ddc2782n,
    0xab3654742c9cb58dc53487173bc7c009de93a2345cbde488667960ae984e8d6n,
    0x2339bad6019977816671a6f4460b10613ae882afc5ef12d34c545340749fa166n,
    0x1809c1097d6678b733b237ba29f333969eb02004979dfd098a61a3d547bddc6en,
    0x2a7059232aea75e10e7f616c3c6bd2dceb6cf7a2b66078e76574428f03e2a24en,
    0x2b2e3bb89ab28ca89e4195a0e20f60633bee168311a1b067fdea31609d6586a6n,
    0x17e1abf4b87730ea5bd2bce589ac40c59c54c715299bb3febaf15d8cf8c7d6a8n,
    0x25cefca3693d6d2673dd626f71b44c5d84703f8cb71c1f776995730614da37f0n,
    0x3a6970b2c1915e400be8671190a88a90052929be07cc3cfe6f2e00d99fe4cean,
  ];

  let proverArgs = {
    asset: {
      amount: '100000',
      addr: '0x2877e73feb5b7af1e12db1ff5b15db30ffa42182406241f672e9e611f42f3e1',
    },
    claiming_key: '0x6162726163616461627261',
    recipient: '0x6a6f65',
    root: '0x12b5f872ab26fe936a02b0d9c2184379ec18c27e76fa9c2bf36aad952fcae239',
    new_tx_secret: '0x17fac61fa9d3f0b73ba678c69cfb943d2645a42d7a37902788789b702bdd6844',
    new_tx_amount: 2500,
    proof: [
      0x87ec3b064e9550b1a5100ea02bf3cf707dd658c60ccbe38d05ea1d4820b9866n,
      0x18d6209a939a0fa9bc43d37d85d43227378ef2bf41e0d3844b9e1a0c7b236199n,
      0x216bc11a7be9067d09d7a4cd4681eb4c7e436d36ff61892fd896009c6a1869fbn,
      0x1526a6df23ab306af0949d738f9725a1a6126383c9c345735d9b9fd0a0eab4d5n,
      0x3a6970b2c1915e400be8671190a88a90052929be07cc3cfe6f2e00d99fe4cebn,
    ],
  };

  const merkleRoot = BigInt(proverArgs.root);

  it('merkle root from tx path', async () => {
    const tx_hash = await txHash(
      proverArgs.claiming_key,
      proverArgs.recipient,
      proverArgs.asset.addr,
      proverArgs.asset.amount,
    );
    expect(merkleRootFromPath(tx_hash, proverArgs.proof)).toBe(merkleRoot);
  });

  it('correct transactions root', () => {
    expect(calculateMerkleRoot(allTransactions)).toBe(merkleRoot);
  });

  it('correct transactions hash', async () => {
    const tx_hash = await txHash(
      proverArgs.claiming_key,
      proverArgs.recipient,
      proverArgs.asset.addr,
      proverArgs.asset.amount,
    );
    expect(allTransactions.indexOf(tx_hash)).toBe(7);
  });

  it('compute tx merkle path', async () => {
    const merkle_path = calculateMerkleRootAndProof(allTransactions, 7).slice(0, -1);
    expect(merkle_path).toStrictEqual(proverArgs.proof);
  });

  it('playground', async () => {
    const tx_array = [
      7508279698343527503902402174768964428792096324211161464126726681304168302102n,
      11005686008470500244644459282625309319676461949565506265183206533653155580562n,
      18972279296642075558863225637175657098888948977078325320599275770249989895734n,
      20830081309978706816024371703597357579503731043511582743884130713842018608212n,
      12212320763260917340539910063569736021789264378979534116863882888515743963374n,
    ];
    const merkleRoot =
      16247412791711058059958322912866945196043536767728836384345637472479895576331n;
    const tx = tx_array[4];

    const path_ = [
      0n,
      0n,
      17979291733834645102530182788181826513193316690362781568893660924490084521137n,
    ];
    expect(merkleRootFromPath(tx, path_)).toBe(merkleRoot);
  });
});
