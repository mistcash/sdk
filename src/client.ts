// MistClient: stateful gateway for the playground flows (`app.js` `flows`,
// `spendNotes`, `join`, `openPayload`), decoupled from viem clients and DOM.
// Transport (`ChainAdapter`), proving (`ProverAdapter`), and observation
// (`MistCallbacks`) are all injected — set `sendTransaction` to route MIST
// spends through a relayer while public spends go direct.

import { decodeEventLog, encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters } from 'viem';
import { account, isMist, ownerOf, rand } from './identity.js';
import { plan, total, unspent } from './notes.js';
import { buildSpendRequest, pickUnusedKeyIndex, proveSpend, randomKeyIndex, type ProverAdapter, type SpendRequest } from './proving.js';
import { deriveUkx, encapsulate } from './pq.js';
import { SCREENING_ABI, type AddressBook } from './contracts.js';
import type { ChainAdapter, DepositStatus, Hex, MistCallbacks, Note, PendingDeposit, StorageAdapter, TxReceipt } from './types.js';

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
  /** Explicit key index (else CSPRNG unused index). */
  keyIndex?: number;
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
  /** Used key indices per ukx, for CSPRNG selection. */
  usedKeyIndices: Map<string, Set<number>> = new Map();

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

  private async ownerFor(id: string): Promise<string> {
    if (isMist(id)) return ownerOf(id, { secret: this.secretOf(id), hash2: this.prover.hash2 });
    return BigInt(this.addressOf(account(id))).toString();
  }

  // ── Deposit ──────────────────────────────────────────────────────────────

  /**
   * Approve + deposit into a reserve vault. Returns the new local note. At a
   * screened reserve the note comes back `screening: 'pending'` with its
   * `depositId`, and is spendable only after `refreshScreening` sees it
   * approved.
   */
  async deposit(opts: DepositOpts): Promise<Note> {
    const { reserve, id, amount, blinding } = opts;
    if (amount <= 0n) throw new Error('Enter a whole amount above zero.');
    const owner = await this.ownerFor(id);
    const commitment = await this.prover.hash2(blinding, owner);
    const screened = await this.isScreened(reserve);
    this.progress('Approving');
    await this.write(
      this.book.token,
      encodeFunctionData({ abi: ERC20_MIN, functionName: 'approve', args: [reserve, amount] }),
      'approve',
    );
    this.progress('Depositing');
    const { receipt, result } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: CHAMBER_MIN, functionName: 'deposit', args: [reserve, BigInt(commitment), amount, this.book.token] }),
      'deposit',
    );
    const note: Note = { reserve, id, blinding, amount, hash: String(result ?? ''), kind: 'deposit' };
    if (screened) {
      const queued = this.queuedFrom(receipt);
      if (!queued) throw new Error('MistClient: screened deposit sent, but its receipt has no DepositQueued log');
      Object.assign(note, { hash: queued.noteHash, screening: 'pending', depositId: queued.depositId });
    }
    this.notes.push(note);
    return note;
  }

  // ── Deposit screening ────────────────────────────────────────────────────

  /**
   * Whether deposits into `reserve` wait for its screener. False on a
   * Chamber that predates screening (the read reverts).
   */
  async isScreened(reserve: Hex): Promise<boolean> {
    try {
      const screener = (await this.chain.readContract(this.book.chamber, 'reserveScreeners', [reserve])) as Hex;
      return BigInt(screener ?? 0) !== 0n;
    } catch {
      return false;
    }
  }

  /** One queue entry by deposit id; `status: 'none'` once settled or unknown. */
  async pendingDeposit(depositId: string | bigint): Promise<PendingDeposit> {
    const [depositor, status, reserve, asset, amount, noteHash] = (await this.chain.readContract(this.book.chamber, 'pendingDeposits', [
      BigInt(depositId),
    ])) as [Hex, number | bigint, Hex, Hex, bigint, bigint];
    return {
      depositId: String(depositId),
      depositor,
      status: DEPOSIT_STATUS[Number(status)] ?? 'none',
      reserve,
      asset,
      amount: BigInt(amount),
      noteHash: String(noteHash),
    };
  }

  /**
   * Re-read every local screened note: approved ones (their note is in the
   * tx tree) become spendable, rejected ones are marked so, and pending ones
   * that left the queue without entering the tree were reclaimed.
   */
  async refreshScreening(notes: Note[] = this.notes): Promise<Note[]> {
    const open = notes.filter((x) => x.depositId && (x.screening === 'pending' || x.screening === 'rejected'));
    if (!open.length) return [];
    const inTree = new Set(((await this.chain.readContract(this.book.chamber, 'getTxArray')) as bigint[]).map(String));
    for (const note of open) {
      const { status } = await this.pendingDeposit(note.depositId!);
      if (status !== 'none') note.screening = status;
      else if (inTree.has(String(note.hash))) delete note.screening;
      else note.screening = 'reclaimed';
    }
    return open;
  }

  /** Take back a pending or rejected deposit (depositor only). */
  async reclaimDeposit(depositId: string | bigint): Promise<TxReceipt> {
    const { receipt } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: SCREENING, functionName: 'reclaimDeposit', args: [BigInt(depositId)] }),
      'reclaimDeposit',
    );
    for (const note of this.notes) if (note.depositId === String(depositId)) note.screening = 'reclaimed';
    return receipt;
  }

  /** The `DepositQueued` the Chamber emitted in `receipt`, if any. */
  private queuedFrom(receipt: TxReceipt): { depositId: string; noteHash: string } | undefined {
    for (const log of receipt.logs ?? []) {
      if (log.address.toLowerCase() !== this.book.chamber.toLowerCase()) continue;
      try {
        const { eventName, args } = decodeEventLog({ abi: SCREENING, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
        if (eventName === 'DepositQueued') return { depositId: String(args.depositId), noteHash: String(args.noteHash) };
      } catch {
        // Not a screening event.
      }
    }
    return undefined;
  }

  // ── Spend (send / withdraw) ──────────────────────────────────────────────

  /** Unified ZK spend. Sends when `to` is set, withdraws when `withdraw > 0`. */
  async spend(opts: SpendOpts): Promise<{ receipt: TxReceipt; secs: number; commitments: string[] }> {
    const notes = opts.notes ?? this.notes;
    const reserve = opts.reserve ?? this.defaultReserve();
    const amount = opts.amount + (opts.withdraw ?? 0n);
    if ((opts.withdraw ?? 0n) > 0n && !opts.withdrawTo) throw new Error('withdrawTo is required for withdrawals');
    const st = opts.state ?? (await this.spendState(reserve, opts.id));
    const p = plan({ id: opts.id, amount, reserve, reserveUsers: st.reserveUsers, isMember: await this.isMember(reserve, opts.id), notes });
    if ('error' in p) throw new Error(p.error);

    const owner = await this.ownerFor(opts.id);
    const ukx = st.ukx ?? this.ukx[`${reserve}:${owner}`] ?? '0';
    const keyIndex = opts.keyIndex ?? (ukx === '0' ? randomKeyIndex() : pickUnusedKeyIndex(this.getUsedIndices(ukx)));
    const out: SpendRequest['Out'] = [
      { id: opts.to ?? null, Owner: opts.to ? await this.ownerFor(opts.to) : '0', Blinding: opts.blindingA ?? rand(), Amount: opts.amount },
      { id: opts.id, Owner: owner, Blinding: opts.blindingB ?? rand(), Amount: p.change },
    ];
    const req = buildSpendRequest({
      chainId: this.chainId,
      chamber: this.book.chamber,
      reserve,
      token: this.book.token,
      reserveConfig: st.reserveConfig,
      owner,
      ownerSecret: isMist(opts.id) ? this.secretOf(opts.id) : '',
      userKeyExchange: ukx,
      keyIndex,
      inputs: p.notes.map((nn) => ({ Blinding: nn.blinding, Amount: nn.amount })),
      outputs: out,
      withdraw: opts.withdraw ?? 0n,
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
        args: [
          res.proof.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          res.publicInputs.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          (res.commitments ?? []).map(BigInt),
        ],
      }),
      'handleZkp',
    );
    if (ukx !== '0' && (res.commitments?.length ?? 0) > 0) this.recordUsedIndex(ukx, keyIndex);
    p.notes.forEach((nn, i) => Object.assign(nn, { spent: true, nullifier: res.publicInputs[i] }));
    out.forEach((o, i) => {
      if (o.Amount > 0n && o.id) {
        this.notes.push({ reserve, id: o.id, blinding: o.Blinding, amount: o.Amount, hash: res.publicInputs[2 + i], kind: i ? 'change' : 'received' });
      }
    });
    return { receipt, secs, commitments: res.commitments ?? [] };
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
    managerSide: (args: { cipherText: Uint8Array; reserve: Hex; mistAddr: string }) => { ukx: string; signature: Hex };
  }): Promise<{ ukx: string }> {
    const { id, reserve } = opts;
    this.progress('Exchanging keys');
    const { cipherText, sharedSecret } = encapsulate(opts.managerPublicKey);
    const mistAddr = await this.ownerFor(id);
    const ukx = deriveUkx(sharedSecret, reserve, mistAddr);
    const { ukx: managerUkx, signature } = opts.managerSide({ cipherText, reserve, mistAddr });
    if (ukx !== managerUkx) throw new Error('Client and manager derived different ukx values');
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
  async openPayload(opts: { reserve: Hex; commitments: string[] }): Promise<{ owner: string; keyIndex: number; plaintext: string[] } | null> {
    if (!this.prover.decrypt) throw new Error('Prover predates decrypt: rebuild mist.wasm.');
    for (const [key, ukx] of Object.entries(this.ukx).filter(([k]) => k.startsWith(`${opts.reserve}:`))) {
      const hit = await this.prover.decrypt(ukx, opts.commitments);
      if (hit) return { owner: key.split(':')[1], keyIndex: hit.keyIndex, plaintext: hit.plaintext };
    }
    return null;
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

  async isMember(reserve: Hex, id: string): Promise<boolean> {
    try {
      return this.ukx[`${reserve}:${await this.ownerFor(id)}`] !== undefined;
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

  /** Get used key indices for a ukx, loading from store if available. */
  private getUsedIndices(ukx: string): Set<number> {
    let used = this.usedKeyIndices.get(ukx);
    if (!used) {
      used = new Set();
      this.usedKeyIndices.set(ukx, used);
    }
    return used;
  }

  /** Record a used key index after successful submit and persist. */
  private recordUsedIndex(ukx: string, keyIndex: number): void {
    this.getUsedIndices(ukx).add(keyIndex);
    this.persistKeyIndices();
  }

  private persistKeyIndices(): void {
    if (!this.store) return;
    const obj: Record<string, number[]> = {};
    for (const [ukx, used] of this.usedKeyIndices) {
      if (used.size > 0) obj[ukx] = [...used];
    }
    this.store.set('mist:keyIndices', JSON.stringify(obj));
  }

  /** Restore used key indices from store (call after construction). */
  async restoreKeyIndices(): Promise<void> {
    if (!this.store) return;
    const raw = await this.store.get('mist:keyIndices');
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, number[]>;
    for (const [ukx, indices] of Object.entries(obj)) {
      this.usedKeyIndices.set(ukx, new Set(indices));
    }
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
    const owner = await this.ownerFor(id).catch(() => '0');
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

const SCREENING = parseAbi(SCREENING_ABI);

const DEPOSIT_STATUS: DepositStatus[] = ['none', 'pending', 'rejected'];

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
