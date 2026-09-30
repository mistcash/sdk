// Contract surface extracted from `playground/chain.js` (runtime ABI) and
// `playground/explorer.js` ABIS (from `forge inspect <contract> abi`).
// The SDK imports viem for encoding and keccak (identity, pq, client), but
// the ChainAdapter keeps it independent of any one client library for
// transport.

import type { Hex } from './types.js';

/** Calls the playground actually makes (`chain.js` abi). */
export const CORE_ABI = [
  'function owner() view returns (address)',
  'function verifier() view returns (address)',
  'function merkleRoot() view returns (uint256)',
  'function zkStateRoot() view returns (uint256)',
  'function zkStateLeaf(uint256) view returns (uint256)',
  'function getTxArray() view returns (uint256[])',
  'function reserveConfigs(address) view returns (uint256 leafIndex, uint256 reserveConfig, uint256 stateRoot)',
  'function registerReserve(address, uint256, uint256) returns (address)',
  'function setVerifier(address)',
  'function deposit(address, uint256, uint256, address) returns (uint256)',
  'function handleZkp(uint256[8], uint256[14], uint256[])',
  'function reserveManager() view returns (address)',
  'function auditorKey() view returns (uint256, uint256)',
  'function registeredUsersRoot() view returns (uint256)',
  'function registeredUsersCount() view returns (uint256)',
  'function setRegisterUserCallback(address, bytes4)',
  'function registerUserCallback() view returns (address, bytes4)',
  'function registerUser(bytes) returns (uint256)',
  'function updateAuditorKey(uint256, uint256)',
  'function registerUserDigest(address, uint256) view returns (bytes32)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transfer(address, uint256) returns (bool)',
  'event UserRegistered(uint256 indexed leaf, uint256 index, uint256 root)',
] as const;

/** Full per-contract decoding surface (`explorer.js` ABIS). */
export const ABIS = {
  Chamber: [
    'function deposit(address reserve_, uint256 ownerCommitment_, uint256 amount, address asset_) returns (uint256)',
    'function handleZkp(uint256[8] proof, uint256[14] input, uint256[] auditorCommitments_)',
    'function registerReserve(address reserveManager_, uint256 keyHash_, uint256 keyInputPoint_) returns (address)',
    'function setReserveConfig(uint256 reserveConfig)',
    'function setReserveStateRoot(uint256 stateRoot)',
    'function setVerifier(address verifier_)',
    'function transferOwnership(address newOwner)',
    'function renounceOwnership()',
    'function merkleRoot() view returns (uint256)',
    'function zkStateRoot() view returns (uint256)',
    'function reserveConfigs(address) view returns (uint256 leafIndex, uint256 reserveConfig, uint256 stateRoot)',
    'function nullified(uint256) view returns (bool)',
    'function chamberId() view returns (uint256)',
    'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
    'event VerifierUpdated(address indexed verifier)',
    'error OwnableInvalidOwner(address owner)',
    'error OwnableUnauthorizedAccount(address account)',
    'error ReentrancyGuardReentrantCall()',
    'error TreeIdAlreadySet()',
    'error TreeIdOutOfRange()',
  ],
  Reserve: [
    'function deposit(address from, uint256 amount, address asset) returns (uint256 received)',
    'function withdraw(address to, uint256 amount, address asset)',
    'function registerUser(bytes data) returns (uint256 leaf)',
    'function setRegisterUserCallback(address target, bytes4 entrypoint)',
    'function updateAuditorKey(uint256 keyHash_, uint256 keyInputPoint_)',
    'function reserveManager() view returns (address)',
    'function registeredUsersRoot() view returns (uint256)',
    'event RegisterUserCallbackSet(address indexed target, bytes4 entrypoint)',
    'event UserRegistered(uint256 indexed leaf, uint256 index, uint256 root)',
    'error SafeERC20FailedOperation(address token)',
  ],
  ManagerSigRegistrar: [
    'function registerUser(uint256 mistAddr, uint256 userKeyExchange, bytes signature) view returns (uint256 leaf)',
    'function registerUserDigest(address reserve, uint256 leaf) view returns (bytes32)',
  ],
  ChamberVerifier: [
    'function verifyProof(bytes proof, uint256[14] input) view',
    'error ProofInvalid()',
    'error PublicInputNotInField()',
  ],
  ERC20: [
    'function transfer(address to, uint256 value) returns (bool)',
    'function transferFrom(address from, address to, uint256 value) returns (bool)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
    'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
    'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
    'error ERC20InvalidReceiver(address receiver)',
    'error ERC20InvalidSender(address sender)',
  ],
} as const;

/** Deployment address book (`core-deploy/dist/deployments/*.json`). */
export interface AddressBook {
  chamber: Hex;
  registrar: Hex;
  reserve: Hex;
  token: Hex;
  verifier: Hex;
}

/** The 14 public inputs of `handleZkp`, in order (`explorer.js` PUBLIC_INPUTS). */
export const PUBLIC_INPUTS = [
  ['nullifier1', 'burns an input note, without naming it'],
  ['nullifier2', 'burns the second input, or a dummy'],
  ['newNote1', 'a new note hash'],
  ['newNote2', 'a new note hash, often the change'],
  ['transactionsRoot', 'a note tree root the proof was made against'],
  ['stateRoot', 'the zkState root: reserve membership'],
  ['withdrawAmount', 'public, 0 unless withdrawing'],
  ['withdrawAsset', 'the token withdrawn'],
  ['withdrawReserve', 'the reserve paying out'],
  ['withdrawTo', 'the public recipient'],
  ['txPayload', 'free metadata the prover may bind; the playground leaves it 0'],
  ['owner', "the notes' owner: the same on every spend by one identity"],
  ['authDone', '1: the proof authorizes the spend; 0: the owner submits it'],
  ['auditorCommitments', "fold of the outputs encrypted for the reserve's manager, 0 at a reserve without members"],
] as const;
