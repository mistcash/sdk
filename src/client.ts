// MistClient: stateful gateway for the playground flows (`app.js` `flows`,
// `spendNotes`, `join`, `openPayload`), decoupled from viem clients and DOM.
// Transport (`ChainAdapter`), proving (`ProverAdapter`), and observation
// (`MistCallbacks`) are all injected — set `sendTransaction` to route MIST
// spends through a relayer while public spends go direct.

import { encodeAbiParameters, encodeFunctionData, parseAbiParameters } from 'viem';
import { account, isMist, ownerOf } from './identity.js';
import { plan, total, unspent } from './notes.js';
import { buildSpendRequest, proveSpend, type ProverAdapter, type SpendRequest } from './proving.js';
import type { AddressBook } from './contracts.js';
import type { ChainAdapter, Hex, MistCallbacks, Note, StorageAdapter, TxReceipt } from './types.js';

export interface MistClientOpts {
  book: AddressBook;
  chainId: number | string;
  chain: ChainAdapter;
  prover: ProverAdapter;
  callbacks?: MistCallbacks;
  store?: StorageAdapter;
  /** Resolve a MIST/public identity to its secret (host keyring). */
  secretOf?: (id: string) => string;
  /** Resolve an account name to its address (for public owners). */
  addressOf?: (name: string) => Hex;
}

export interface DepositOpts {
  who: string;
  reserve: Hex;
  /** Identity the note belongs to (`alice` or `alice (MIST)`). */
  id: string;
  amount: bigint;
  blinding: string;
}

export interface SpendOpts {
  /** Spending identity. */
  id: string;
  amount: bigint;
  /** Recipient identity for sends; null for withdrawals. */
  to?: string | null;
  withdraw?: bigint;
  withdrawTo?: string;
  notes?: Note[];
  /** Reserve to spend at. Defaults to first known. */
  reserve?: Hex;
  /** Blinding for the recipient output (else '0' dummy in tests). */
  blindingA?: string;
  /** Blinding for the change output. */
  blindingB?: string;
  /** Fetched chain state; when omitted the client reads it via the adapter. */
  state?: {
    txLeaves: string[];
    stateLeaves: string[];
    userLeaves: string[];
    reserveConfig: string;
    reserveUsers: bigint;
    ukx?: string;
  };
}

export class MistClient {
  readonly book: AddressBook;
  readonly chainId: string;
  readonly chain: ChainAdapter;
  readonly prover: ProverAdapter;
  readonly callbacks: MistCallbacks;
  readonly store?: StorageAdapter;
  /** Local note cache (mirrors `app.js` `state.notes`). */
  notes: Note[] = [];
  /** Key exchanges by `${reserve}:${owner}` (mirrors `state.ukx`). */
  ukx: Record<string, string> = {};

  constructor(opts: MistClientOpts) {
    this.book = opts.book;
    this.chainId = String(opts.chainId);
    this.chain = opts.chain;
    this.prover = opts.prover;
    this.callbacks = opts.callbacks ?? {};
    this.store = opts.store;
    this.secretOf = opts.secretOf ?? (() => { throw new Error('MistClient: secretOf not configured'); });
    this.addressOf = opts.addressOf ?? (() => { throw new Error('MistClient: addressOf not configured'); });
  }

  private secretOf: (id: string) => string;
  private addressOf: (name: string) => Hex;

  private progress(stage: string) {
    this.callbacks.onProgress?.(stage);
  }

  /** Simulate `app.js write()`: before-send hook, submit, after-tx hook. */
  private async write(to: Hex, data: Hex, functionName: string): Promise<{ receipt: TxReceipt; result?: unknown }> {
    const veto = await this.callbacks.onBeforeSend?.({ to, data, functionName });
    if (veto === false) throw new Error(`MistClient: send of ${functionName} vetoed by onBeforeSend`);
    const sent = await this.chain.sendTransaction({ to, data });
    this.callbacks.onTx?.({ functionName, receipt: sent.receipt });
    return { receipt: sent.receipt, result: sent.result };
  }

  private ownerFor(id: string): string {
    if (isMist(id)) return ownerOf(id, { secret: this.secretOf(id), hash2: this.prover.hash2 });
    return BigInt(this.addressOf(account(id))).toString();
  }

  // ── Deposit ──────────────────────────────────────────────────────────────

  /** Approve + deposit into a reserve vault. Returns the new local note. */
  async deposit(opts: DepositOpts): Promise<Note> {
    const { who: _who, reserve, id, amount, blinding } = opts;
    if (amount <= 0n) throw new Error('Enter a whole amount above zero.');
    const owner = this.ownerFor(id);
    const commitment = this.prover.hash2(blinding, owner);
    this.progress('Approving');
    await this.write(
      this.book.token,
      encodeFunctionData({ abi: ERC20_MIN, functionName: 'approve', args: [reserve, amount] }),
      'approve',
    );
    this.progress('Depositing');
    const { result } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: CHAMBER_MIN, functionName: 'deposit', args: [reserve, BigInt(commitment), amount, this.book.token] }),
      'deposit',
    );
    const note: Note = { reserve, id, blinding, amount, hash: String(result ?? ''), kind: 'deposit' };
    this.notes.push(note);
    return note;
  }

  // ── Spend (send / withdraw) ──────────────────────────────────────────────

  /** Unified ZK spend. Sends when `to` is set, withdraws when `withdraw > 0`. */
  async spend(opts: SpendOpts): Promise<{ receipt: TxReceipt; secs: number }> {
    const notes = opts.notes ?? this.notes;
    const reserve = opts.reserve ?? this.defaultReserve();
    const amount = opts.amount + (opts.withdraw ?? 0n);
    const st = opts.state ?? (await this.spendState(reserve, opts.id));
    const p = plan({ id: opts.id, amount, reserve, reserveUsers: st.reserveUsers, isMember: this.isMember(reserve, opts.id), notes });
    if ('error' in p) throw new Error(p.error);

    const owner = this.ownerFor(opts.id);
    const out: SpendRequest['Out'] = [
      { id: opts.to ?? null, Owner: opts.to ? this.ownerFor(opts.to) : '0', Blinding: opts.blindingA ?? '0', Amount: Number(opts.amount) },
      { id: opts.id, Owner: owner, Blinding: opts.blindingB ?? '0', Amount: Number(p.change) },
    ];
    const req = buildSpendRequest({
      chainId: this.chainId,
      chamber: this.book.chamber,
      reserve,
      token: this.book.token,
      reserveConfig: st.reserveConfig,
      owner,
      ownerSecret: isMist(opts.id) ? this.secretOf(opts.id) : '',
      userKeyExchange: st.ukx ?? this.ukx[`${reserve}:${owner}`] ?? '0',
      inputs: p.notes.map((nn) => ({ Blinding: nn.blinding, Amount: String(nn.amount) })),
      outputs: out,
      withdraw: Number(opts.withdraw ?? 0),
      withdrawTo: opts.withdraw && opts.withdrawTo ? this.addressOf(opts.withdrawTo) : '0',
      txLeaves: st.txLeaves,
      stateLeaves: st.stateLeaves,
      userLeaves: st.userLeaves,
    });
    this.progress('Proving in your browser');
    const { res, secs } = await proveSpend(this.prover, req);
    this.callbacks.onProof?.({ kind: 'spend', secs });
    this.progress(p.submitter === 'relayer' ? 'Relayer submitting' : 'Submitting');
    const { receipt } = await this.write(
      this.book.chamber,
      encodeFunctionData({
        abi: CHAMBER_MIN,
        functionName: 'handleZkp',
        args: [res.proof.map(BigInt), res.publicInputs.map(BigInt), (res.ciphertext ?? []).map(BigInt)],
      }),
      'handleZkp',
    );
    p.notes.forEach((nn, i) => Object.assign(nn, { spent: true, nullifier: res.publicInputs[i] }));
    out.forEach((o, i) => {
      if (o.Amount > 0 && o.id) {
        this.notes.push({ reserve, id: o.id, blinding: o.Blinding, amount: BigInt(o.Amount), hash: res.publicInputs[2 + i], kind: i ? 'change' : 'received' });
      }
    });
    return { receipt, secs };
  }

  // ── Membership (X-Wing join) ─────────────────────────────────────────────

  /**
   * Join a reserve through an X-Wing key exchange, then `registerUser`.
   * The manager's decapsulation runs wherever the host provides it via
   * `managerSide` (this tab plays both sides in the playground).
   */
  async join(opts: {
    id: string;
    reserve: Hex;
    managerPublicKey: Uint8Array;
    managerSide: (cipherText: Uint8Array) => { sharedSecret: Uint8Array; signature: Hex; digest?: Hex };
    deriveUkx: (secret: Uint8Array, reserve: Hex, mistAddr: string) => string;
    encapsulate: (pk: Uint8Array) => { cipherText: Uint8Array; sharedSecret: Uint8Array };
  }): Promise<{ ukx: string }> {
    const { id, reserve } = opts;
    this.progress('Exchanging keys');
    const { cipherText, sharedSecret } = opts.encapsulate(opts.managerPublicKey);
    const { sharedSecret: _m, signature } = opts.managerSide(cipherText);
    const mistAddr = this.ownerFor(id);
    const ukx = opts.deriveUkx(sharedSecret, reserve, mistAddr);
    this.progress('Registering');
    const data = encodeAbiParameters(parseAbiParameters('uint256, uint256, bytes'), [BigInt(mistAddr), BigInt(ukx), signature]);
    await this.write(reserve, encodeFunctionData({ abi: RESERVE_MIN, functionName: 'registerUser', args: [data] }), 'registerUser');
    this.ukx[`${reserve}:${mistAddr}`] = ukx;
    return { ukx };
  }

  // ── Auditor inbox ────────────────────────────────────────────────────────

  /**
   * Try each member key exchange on a payload until one opens it (manager side).
   * Mirrors `app.js openPayload`.
   */
  async openPayload(opts: { reserve: Hex; ciphertext: string[]; txHash: Hex }): Promise<{ id?: string; plaintext?: unknown; matches: boolean }> {
    if (!this.prover.decrypt) throw new Error('Prover predates decrypt: rebuild mist.wasm.');
    const tx = await this.chain.getTransaction?.(opts.txHash);
    void tx;
    for (const [key, ukx] of Object.entries(this.ukx).filter(([k]) => k.startsWith(`${opts.reserve}:`))) {
      const hit = this.prover.decrypt(ukx, this.book.token, opts.ciphertext) as { plaintext?: unknown } | undefined;
      if (hit) return { id: key.split(':')[1], plaintext: hit.plaintext ?? hit, matches: true };
    }
    return { matches: false };
  }

  // ── Owner / manager admin ────────────────────────────────────────────────

  async registerReserve(manager: Hex, keyHash: bigint, keyInputPoint: bigint): Promise<TxReceipt> {
    const { receipt } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: CHAMBER_MIN, functionName: 'registerReserve', args: [manager, keyHash, keyInputPoint] }),
      'registerReserve',
    );
    return receipt;
  }

  async setVerifier(verifier: Hex): Promise<TxReceipt> {
    const { receipt } = await this.write(
      this.book.chamber, encodeFunctionData({ abi: CHAMBER_MIN, functionName: 'setVerifier', args: [verifier] }), 'setVerifier',
    );
    return receipt;
  }

  async setCallback(reserve: Hex, selector: Hex): Promise<TxReceipt> {
    const { receipt } = await this.write(
      reserve,
      encodeFunctionData({ abi: RESERVE_MIN, functionName: 'setRegisterUserCallback', args: [this.book.registrar, selector] }),
      'setRegisterUserCallback',
    );
    return receipt;
  }

  async updateAuditorKey(reserve: Hex, keyHash: bigint, keyInputPoint: bigint): Promise<TxReceipt> {
    const { receipt } = await this.write(
      reserve, encodeFunctionData({ abi: RESERVE_MIN, functionName: 'updateAuditorKey', args: [keyHash, keyInputPoint] }), 'updateAuditorKey',
    );
    return receipt;
  }

  // ── State helpers ────────────────────────────────────────────────────────

  isMember(reserve: Hex, id: string): boolean {
    try {
      return this.ukx[`${reserve}:${this.ownerFor(id)}`] !== undefined;
    } catch {
      return false;
    }
  }

  unspent(reserve: Hex, id: string, notes: Note[] = this.notes): Note[] {
    return unspent(notes, reserve, id);
  }

  total(notes: Note[] = this.notes): bigint {
    return total(notes.filter((x) => !x.spent));
  }

  private defaultReserve(): Hex {
    const r = this.notes.find((x) => !x.spent)?.reserve;
    if (!r) throw new Error('No reserve: pass `reserve` explicitly or deposit first.');
    return r;
  }

  private async spendState(
    reserve: Hex,
    id: string,
  ): Promise<NonNullable<SpendOpts['state']>> {
    const [txLeaves, stateLeaves, reserveCfg, users] = await Promise.all([
      this.chain.readContract(this.book.chamber, 'getTxArray'),
      this.zkStateLeaves(),
      this.chain.readContract(this.book.chamber, 'reserveConfigs', [reserve]),
      this.chain.readContract(reserve, 'registeredUsersCount'),
    ]);
    const userLeaves = await this.chain.getEvents?.(reserve, 'UserRegistered', 0n).then((evts) => evts.map((e) => String(e.args['leaf']))) ?? [];
    const owner = (() => { try { return this.ownerFor(id); } catch { return '0'; } })();
    return {
      txLeaves: (txLeaves as bigint[]).map(String),
      stateLeaves,
      userLeaves,
      reserveConfig: String((reserveCfg as [bigint, bigint, bigint])[1] ?? reserveCfg),
      reserveUsers: BigInt(String(users)),
      ukx: this.ukx[`${reserve}:${owner}`] ?? '0',
    };
  }

  async zkStateLeaves(): Promise<string[]> {
    const leaves: string[] = [];
    for (let i = 0n; ; i++) {
      const leaf = (await this.chain.readContract(this.book.chamber, 'zkStateLeaf', [i])) as bigint;
      if (leaf === 0n) break;
      leaves.push(leaf.toString());
    }
    return leaves;
  }
}

// Minimal viem ABIs for the calls the client encodes (full surface in contracts.ts).
const ERC20_MIN = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const CHAMBER_MIN = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'reserve', type: 'address' }, { name: 'ownerCommitment', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'asset', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'handleZkp', stateMutability: 'nonpayable', inputs: [{ name: 'proof', type: 'uint256[8]' }, { name: 'input', type: 'uint256[14]' }, { name: 'auditorCommitments', type: 'uint256[]' }], outputs: [] },
  { type: 'function', name: 'registerReserve', stateMutability: 'nonpayable', inputs: [{ name: 'reserveManager', type: 'address' }, { name: 'keyHash', type: 'uint256' }, { name: 'keyInputPoint', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'setVerifier', stateMutability: 'nonpayable', inputs: [{ name: 'verifier', type: 'address' }], outputs: [] },
] as const;

const RESERVE_MIN = [
  { type: 'function', name: 'registerUser', stateMutability: 'nonpayable', inputs: [{ name: 'data', type: 'bytes' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'setRegisterUserCallback', stateMutability: 'nonpayable', inputs: [{ name: 'target', type: 'address' }, { name: 'entrypoint', type: 'bytes4' }], outputs: [] },
  { type: 'function', name: 'updateAuditorKey', stateMutability: 'nonpayable', inputs: [{ name: 'keyHash', type: 'uint256' }, { name: 'keyInputPoint', type: 'uint256' }], outputs: [] },
] as const;
