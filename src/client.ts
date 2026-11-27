// MistClient: stateful gateway for the playground flows (`app.js` `flows`,
// `spendNotes`, `join`, `openPayload`), decoupled from viem clients and DOM.
// Transport (`ChainAdapter`), proving (`ProverAdapter`), and observation
// (`MistCallbacks`) are all injected — set `sendTransaction` to route MIST
// spends through a relayer while public spends go direct.

import { decodeEventLog, encodeFunctionData, isAddressEqual } from 'viem';
import { account, isMist, ownerOf, rand } from './identity.js';
import { plan, total, unspent } from './notes.js';
import { buildSpendRequest, pickUnusedKeyIndex, proveSpend, randomKeyIndex, type ProverAdapter, type SpendRequest } from './proving.js';
import { deriveUkx, encapsulate } from './pq.js';
import { RESERVE_ROLES, type AddressBook, type ReserveRole } from './contracts.js';
import { chamberAbi, erc20Abi, managerSigRegistrarAbi, reserveAbi } from './abis.generated.js';
import type { ChainAdapter, DepositStatus, Hex, MistCallbacks, Note, PendingDeposit, StorageAdapter, TxReceipt } from './types.js';

/** Where a deposit's note went: its hash, and its tx index or screening deposit id. */
type Placement = Pick<Note, 'hash' | 'txIndex' | 'screening' | 'depositId'>;

/** Single store key holding the per-ukx used key-index map. */
const KEY_INDICES_KEY = 'mist:keyIndices';

/**
 * Parse the stored key-index map. An unparsable or wrongly shaped value is
 * treated as empty (and overwritten by the next persist) rather than thrown:
 * throwing would make every later persist and restore fail on the same value.
 */
function parseKeyIndices(raw: string | null): Record<string, number[]> {
  if (!raw) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const out: Record<string, number[]> = {};
      for (const [ukx, v] of Object.entries(obj)) if (Array.isArray(v)) out[ukx] = v.filter(Number.isInteger);
      return out;
    }
  } catch {
    // Fall through to the warning below.
  }
  console.warn(`MistClient: ignoring unparsable ${KEY_INDICES_KEY} in store; it will be overwritten`);
  return {};
}

/**
 * Per-store persist queue. Keyed by the StorageAdapter rather than held per
 * client, so every client sharing one store in this realm serialises its
 * read-merge-write behind the others. (Separate tabs share no memory; this
 * cannot order their writes.)
 */
const persistQueues = new WeakMap<StorageAdapter, Promise<void>>();

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
  /**
   * Who a rejected screened deposit refunds (and who may then reclaim it);
   * defaults to the sender. A router depositing for a user names the user.
   */
  refundTo?: Hex;
}

/** What the reserve's half of `join` returns: the ukx it derived, and a registrar signature over the leaf. */
export interface ManagerApproval {
  ukx: string;
  /** The reserve's USERS holder that signed, as named in the digest; the registrar checks its permission. */
  signer: Hex;
  /** Last valid timestamp (seconds, inclusive) the signature was made for. */
  deadline: bigint;
  signature: Hex;
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
    /** Leaves of the one tx tree holding the input notes (`txTreeLeaves`). */
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

  /** `write` for calls whose receipt is all the caller needs. */
  private async send(to: Hex, data: Hex, functionName: string): Promise<TxReceipt> {
    return (await this.write(to, data, functionName)).receipt;
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
   * approved. Refuses before approving while inflows are paused, or when the
   * reserve does not list `book.token` or `amount` is below its minimum.
   */
  async deposit(opts: DepositOpts): Promise<Note> {
    const { reserve, id, amount, blinding, refundTo } = opts;
    if (amount <= 0n) throw new Error('Enter a whole amount above zero.');
    const owner = await this.ownerFor(id);
    const commitment = BigInt(await this.prover.hash2(blinding, owner));
    await this.assertDepositable(reserve, amount);
    this.progress('Approving');
    const approved = await this.write(
      this.book.token,
      encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [reserve, amount] }),
      'approve',
    );
    // The deposit's note is read from its logs or result: stop while no funds have moved.
    if (!approved.receipt.logs && approved.result === undefined) {
      throw new Error('MistClient: deposit() needs sendTransaction to return receipt.logs (or the call result); nothing was deposited');
    }
    this.progress('Depositing');
    const args = [reserve, commitment, amount, this.book.token] as const;
    const { receipt, result } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: chamberAbi, functionName: 'deposit', args: refundTo ? [...args, refundTo] : args }),
      'deposit',
    );
    const placed = this.depositOutcome(reserve, receipt, result);
    if (!placed) {
      throw new Error(
        'MistClient: deposit sent, but its receipt has no NoteAppended or DepositQueued log and no (noteHash, depositId) result: return receipt.logs from sendTransaction',
      );
    }
    const note: Note = { reserve, id, blinding, amount, kind: 'deposit', ...placed };
    this.notes.push(note);
    return note;
  }

  /** Chamber.deposit's own checks, made before the approve is sent. */
  private async assertDepositable(reserve: Hex, amount: bigint): Promise<void> {
    const [paused, min] = await Promise.all([
      this.chain.readContract(this.book.chamber, 'inflowsPaused'),
      this.chain.readContract(this.book.chamber, 'reserveAssetMinDeposit', [reserve, this.book.token]),
    ]);
    if (paused) throw new Error('Deposits are paused.');
    const minDeposit = BigInt(min as bigint);
    if (minDeposit === 0n) throw new Error('This reserve does not accept this token.');
    if (amount < minDeposit) throw new Error(`The minimum deposit at this reserve is ${minDeposit}.`);
  }

  /**
   * Where a deposit's note went: into the tx tree (`NoteAppended`), or the
   * screening queue (`DepositQueued` at `reserve`). The call's
   * `(noteHash, depositId)` result, when the adapter returns it, picks this
   * deposit's event from a receipt that holds others, and stands in for
   * missing logs.
   */
  private depositOutcome(reserve: Hex, receipt: TxReceipt, result: unknown): Placement | undefined {
    const [hash, depositId] = Array.isArray(result) && result.length === 2 ? result.map(String) : [];
    const found: Placement[] = [];
    for (const { eventName, args } of this.chamberEvents(receipt)) {
      if (eventName === 'DepositQueued' && isAddressEqual(args.reserve, reserve)) {
        found.push({ hash: String(args.noteHash), screening: 'pending', depositId: String(args.depositId) });
      }
      if (eventName === 'NoteAppended') found.push({ hash: String(args.note), txIndex: Number(args.index) });
    }
    const mine = hash ? found.filter((o) => o.hash === hash) : found;
    if (mine.length > 1) {
      throw new Error("MistClient: the deposit's receipt holds several Chamber notes: return the call's (noteHash, depositId) result to pick this one");
    }
    if (mine.length) return mine[0];
    if (!hash) return undefined;
    return depositId === '0' ? { hash } : { hash, screening: 'pending', depositId };
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
   * Re-read every local screened note: approved ones (their note is in a
   * tx tree) become spendable, rejected ones are marked so, and pending ones
   * that left the queue without entering a tree were reclaimed.
   */
  async refreshScreening(notes: Note[] = this.notes): Promise<Note[]> {
    const open = notes.filter((x) => x.depositId && (x.screening === 'pending' || x.screening === 'rejected'));
    await Promise.all(
      open.map(async (note) => {
        const { status } = await this.pendingDeposit(note.depositId!);
        if (status !== 'none') note.screening = status;
        // Rejection is final: a rejected deposit leaves the queue only by reclaim.
        else if (note.screening !== 'rejected' && (await this.locate(note))) delete note.screening;
        else note.screening = 'reclaimed';
      }),
    );
    return open;
  }

  /**
   * Take back a queued deposit. A pending one returns to its depositor, who
   * alone may call; a rejected one pays its `refundTo`, and the depositor or
   * the `refundTo` may call.
   */
  async reclaimDeposit(depositId: string | bigint): Promise<TxReceipt> {
    const { receipt } = await this.write(
      this.book.chamber,
      encodeFunctionData({ abi: chamberAbi, functionName: 'reclaimDeposit', args: [BigInt(depositId)] }),
      'reclaimDeposit',
    );
    for (const note of this.notes) if (note.depositId === String(depositId)) note.screening = 'reclaimed';
    return receipt;
  }

  /** Change a pending deposit's `refundTo`, who is paid if it is rejected. Depositor only. */
  async setDepositRefundTo(depositId: string | bigint, refundTo: Hex): Promise<TxReceipt> {
    return this.send(this.book.chamber, encodeFunctionData({ abi: chamberAbi, functionName: 'setDepositRefundTo', args: [BigInt(depositId), refundTo] }), 'setDepositRefundTo');
  }

  /**
   * Name (or clear, with the zero address) a reserve's screener
   * (`Reserve.setScreener`, which pushes it to the Chamber). Needs the
   * reserve's SCREENING permission.
   */
  async setReserveScreener(reserve: Hex, screener: Hex): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'setScreener', args: [screener] }), 'setScreener');
  }

  /**
   * Deposits still waiting on a screener (pending only), oldest first, from
   * `DepositQueued` events checked against the live queue. Needs
   * `ChainAdapter.getEvents`.
   */
  async queuedDeposits(reserve?: Hex, fromBlock = 0n): Promise<PendingDeposit[]> {
    if (!this.chain.getEvents) throw new Error('MistClient: queuedDeposits needs ChainAdapter.getEvents');
    const events = await this.chain.getEvents(this.book.chamber, 'DepositQueued', fromBlock);
    const ids = events
      .filter((e) => !reserve || String(e.args['reserve']).toLowerCase() === reserve.toLowerCase())
      .map((e) => String(e.args['depositId']));
    const live = await Promise.all(ids.map((id) => this.pendingDeposit(id)));
    return live.filter((d) => d.status === 'pending');
  }

  /**
   * Screener: approve queued deposits into the tx tree. `evidence` is a
   * bytes32 commitment to the off-chain screening record. Ids no longer
   * pending are skipped, and a note already in a tx tree is rejected
   * (`DepositDuplicateRejected`), so a mined batch does not mean every id
   * was approved: `refreshScreening` reads the outcome.
   */
  async approveDeposits(depositIds: Array<string | bigint>, evidence: Hex): Promise<TxReceipt> {
    return this.decide('approveDeposits', depositIds, evidence);
  }

  /** Screener: reject queued deposits (final; they can still be reclaimed). Ids no longer pending are skipped. */
  async rejectDeposits(depositIds: Array<string | bigint>, evidence: Hex): Promise<TxReceipt> {
    return this.decide('rejectDeposits', depositIds, evidence);
  }

  private async decide(
    functionName: 'approveDeposits' | 'rejectDeposits',
    depositIds: Array<string | bigint>,
    evidence: Hex,
  ): Promise<TxReceipt> {
    return this.send(this.book.chamber, encodeFunctionData({ abi: chamberAbi, functionName, args: [depositIds.map(BigInt), evidence] }), functionName);
  }

  /** The Chamber events in `receipt`, in log order. */
  private chamberEvents(receipt: TxReceipt) {
    const events = [];
    for (const log of receipt.logs ?? []) {
      if (!isAddressEqual(log.address, this.book.chamber)) continue;
      try {
        events.push(decodeEventLog({ abi: chamberAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }));
      } catch {
        // Not a Chamber event this ABI knows.
      }
    }
    return events;
  }

  // ── Spend (send / withdraw) ──────────────────────────────────────────────

  /** Unified ZK spend. Sends when `to` is set, withdraws when `withdraw > 0`. */
  async spend(opts: SpendOpts): Promise<{ receipt: TxReceipt; secs: number; commitments: string[] }> {
    const notes = opts.notes ?? this.notes;
    const reserve = opts.reserve ?? this.defaultReserve();
    const amount = opts.amount + (opts.withdraw ?? 0n);
    if ((opts.withdraw ?? 0n) > 0n && !opts.withdrawTo) throw new Error('withdrawTo is required for withdrawals');
    if (await this.chain.readContract(this.book.chamber, 'spendsPaused')) throw new Error('Spends are paused.');
    // Fetched state proves against the selected notes' own tx tree, so it
    // needs each note's index; injected state brings its own leaves.
    const fetched = !opts.state;
    const [txTreeCapacity, st] = await Promise.all([
      fetched ? this.txTreeCapacity() : undefined,
      opts.state ?? this.spendState(reserve, opts.id),
      fetched && Promise.all(unspent(notes, reserve, opts.id).map((n) => this.locate(n))),
    ]);
    const isMember = await this.isMember(reserve, opts.id);
    const p = plan({ id: opts.id, amount, reserve, reserveUsers: st.reserveUsers, isMember, notes, txTreeCapacity });
    if ('error' in p) throw new Error(p.error);
    // registeredUsersCount counts every slot, removed users included.
    if (st.reserveUsers > 0n && BigInt(st.userLeaves.length) !== st.reserveUsers) {
      throw new Error(
        `MistClient: read ${st.userLeaves.length} of the reserve's ${st.reserveUsers} user leaves: ChainAdapter.getEvents must serve every UserRegistered and UserRemoved`,
      );
    }
    const txLeaves = opts.state?.txLeaves ?? (await this.txTreeLeaves(p.txTree!));

    const owner = await this.ownerFor(opts.id);
    const ukx = st.ukx ?? this.ukx[`${reserve}:${owner}`] ?? '0';
    // At a reserve with members the prover needs this member's leaf, which
    // Reserve.removeUser zeroes.
    if (ukx !== '0' && st.userLeaves.length && !st.userLeaves.includes(String(await this.prover.hash2(owner, ukx)))) {
      throw new Error('This reserve no longer lists you as a member: join it again.');
    }
    // Re-read the store before drawing: another live client sharing it may have
    // used an index since our last restore. A failed read falls back to memory.
    if (opts.keyIndex === undefined && ukx !== '0') await this.restoreKeyIndices().catch(() => {});
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
      txLeaves,
      stateLeaves: st.stateLeaves,
      userLeaves: st.userLeaves,
    });
    this.progress('Proving in your browser');
    const { res, secs } = await proveSpend(this.prover, req);
    this.callbacks.onProof?.({ kind: 'spend', secs });
    // A superseded zkState root is accepted for ZK_STATE_ROOT_GRACE only.
    if (!(await this.chain.readContract(this.book.chamber, 'isValidZkStateRoot', [BigInt(res.publicInputs[5])]))) {
      throw new Error('The reserve state changed while proving: spend again.');
    }
    this.progress(p.submitter === 'relayer' ? 'Relayer submitting' : 'Submitting');
    const { receipt } = await this.write(
      this.book.chamber,
      encodeFunctionData({
        abi: chamberAbi,
        functionName: 'handleZkp',
        args: [
          res.proof.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          res.publicInputs.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          (res.commitments ?? []).map(BigInt),
        ],
      }),
      'handleZkp',
    );
    // `commitments` is the load-bearing half of this guard, so it is worth stating
// why. The prover returns them only when the sender is a registered member
// (`if userLeaf != nil` in core-deploy/builders/wasm/main.go), and the private
// tx key Chamber files the spend under is that array's first element — derived
// from `UserEncryptionKey(ukx, KeyIndex)`. No member, no commitments, no
// private tx key, so nothing to remember. The circuit pins AuditorCommitments
// to 0 when the reserve has no users, which is why the prover cannot return a
// non-empty set for an unregistered sender. Gating on `ukx !== '0'` alone
// would over-record, not under-record.
if (ukx !== '0' && (res.commitments?.length ?? 0) > 0) await this.recordUsedIndex(ukx, keyIndex);
    p.notes.forEach((nn, i) => Object.assign(nn, { spent: true, nullifier: res.publicInputs[i] }));
    const appended = new Map<string, number>();
    for (const { eventName, args } of this.chamberEvents(receipt)) {
      if (eventName === 'NoteAppended') appended.set(String(args.note), Number(args.index));
    }
    out.forEach((o, i) => {
      if (o.Amount > 0n && o.id) {
        const hash = res.publicInputs[2 + i];
        this.notes.push({ reserve, id: o.id, blinding: o.Blinding, amount: o.Amount, hash, txIndex: appended.get(hash), kind: i ? 'change' : 'received' });
      }
    });
    return { receipt, secs, commitments: res.commitments ?? [] };
  }

  // ── Membership (X-Wing join) ─────────────────────────────────────────────

  /**
   * Join a reserve through an X-Wing key exchange, then register the
   * membership leaf `H2(mistAddr, ukx)` through `book.registrar`
   * (`ManagerSigRegistrar.registerUser(reserve, leaf, deadline, signer,
   * signature)`, which calls `Reserve.addUser`).
   *
   * `managerSide` runs the reserve's half wherever the host provides it (this
   * tab plays both sides in the playground): decapsulate `cipherText`, derive
   * the same ukx, compute `leaf = H2(mistAddr, ukx)`, and have a holder of the
   * reserve's USERS permission sign the EIP-712 digest
   * `registrar.registerUserDigest(reserve, leaf, signer, deadline)` (65-byte
   * `r ++ s ++ v`, or an ERC-1271 signature from a contract wallet). The
   * digest binds the leaf's nonce, its revocation count and the signer's
   * USERS epoch, so read it just before signing. The ukx never goes
   * on-chain: only the leaf does.
   */
  async join(opts: {
    id: string;
    reserve: Hex;
    managerPublicKey: Uint8Array;
    /** The reserve's half; usually a request to the reserve's service. */
    managerSide: (args: { cipherText: Uint8Array; reserve: Hex; mistAddr: string }) => ManagerApproval | Promise<ManagerApproval>;
  }): Promise<{ ukx: string }> {
    const { id, reserve } = opts;
    this.progress('Exchanging keys');
    const { cipherText, sharedSecret } = encapsulate(opts.managerPublicKey);
    const mistAddr = await this.ownerFor(id);
    const ukx = deriveUkx(sharedSecret, reserve, mistAddr);
    const { ukx: managerUkx, signer, deadline, signature } = await opts.managerSide({ cipherText, reserve, mistAddr });
    if (ukx !== managerUkx) throw new Error('Client and manager derived different ukx values');
    this.progress('Registering');
    const leaf = BigInt(await this.prover.hash2(mistAddr, ukx));
    await this.write(
      this.book.registrar,
      encodeFunctionData({
        abi: managerSigRegistrarAbi,
        functionName: 'registerUser',
        args: [reserve, leaf, deadline, signer, signature],
      }),
      'registerUser',
    );
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

  // ── Chamber owner ────────────────────────────────────────────────────────

  /** Deploy and register a reserve with its admin (Chamber owner only). */
  async registerReserve(admin: Hex, keyHash: bigint, keyInputPoint: bigint): Promise<TxReceipt> {
    return this.send(this.book.chamber, encodeFunctionData({ abi: chamberAbi, functionName: 'registerReserve', args: [admin, keyHash, keyInputPoint] }), 'registerReserve');
  }

  // ── Reserve admin and permissions ────────────────────────────────────────

  /** Whether `account` holds `role` on `reserve` (the admin holds them all). */
  async hasPermission(reserve: Hex, role: ReserveRole, account: Hex): Promise<boolean> {
    return Boolean(await this.chain.readContract(reserve, 'hasPermission', [RESERVE_ROLES[role], account]));
  }

  /** Give `account` a permission on `reserve`. Admin only. */
  async grantPermission(reserve: Hex, role: ReserveRole, account: Hex): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'grantPermission', args: [RESERVE_ROLES[role], account] }), 'grantPermission');
  }

  /** Take a granted permission back (never the admin's own). Admin only. */
  async revokePermission(reserve: Hex, role: ReserveRole, account: Hex): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'revokePermission', args: [RESERVE_ROLES[role], account] }), 'revokePermission');
  }

  /**
   * Nominate `newAdmin`, who takes over with `acceptAdmin`; the zero address
   * cancels. Admin only. Grants survive the handover.
   */
  async transferAdmin(reserve: Hex, newAdmin: Hex): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'transferAdmin', args: [newAdmin] }), 'transferAdmin');
  }

  /** Become the reserve's admin. Only the nominated pending admin. */
  async acceptAdmin(reserve: Hex): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'acceptAdmin' }), 'acceptAdmin');
  }

  /**
   * List `asset` at `reserve` with a minimum deposit; zero delists it. Needs
   * ASSETS. Nothing is depositable until listed.
   */
  async setAssetMinDeposit(reserve: Hex, asset: Hex, minDeposit: bigint): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'setAssetMinDeposit', args: [asset, minDeposit] }), 'setAssetMinDeposit');
  }

  /**
   * Zero the user at `index` (from `UserRegistered`; see
   * `registeredUserLeaves`). Needs USERS. Takes full effect within the
   * Chamber's 10-minute zkState root grace; removing the last user reverts.
   */
  async removeUser(reserve: Hex, index: bigint): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'removeUser', args: [index] }), 'removeUser');
  }

  /** Rotate the auditor key. Needs METADATA. */
  async updateAuditorKey(reserve: Hex, keyHash: bigint, keyInputPoint: bigint): Promise<TxReceipt> {
    return this.send(reserve, encodeFunctionData({ abi: reserveAbi, functionName: 'updateAuditorKey', args: [keyHash, keyInputPoint] }), 'updateAuditorKey');
  }

  /**
   * Revoke every outstanding registrar signature, by any signer, for `leaf`
   * at `reserve`. Needs USERS on `reserve`.
   */
  async revokeRegistration(reserve: Hex, leaf: bigint): Promise<TxReceipt> {
    return this.send(this.book.registrar, encodeFunctionData({ abi: managerSigRegistrarAbi, functionName: 'revoke', args: [reserve, leaf] }), 'revoke');
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

  /**
   * Get used key indices for a ukx.
   *
   * In-memory only. This does not read the store, because `store.get` may be
   * async and the caller needs the set synchronously; `spend()` merges the
   * store in via `restoreKeyIndices()` just before drawing, so an index another
   * client sharing the store already used is not drawn again.
   */
  private getUsedIndices(ukx: string): Set<number> {
    let used = this.usedKeyIndices.get(ukx);
    if (!used) {
      used = new Set();
      this.usedKeyIndices.set(ukx, used);
    }
    return used;
  }

  /** Record a used key index after successful submit and persist. */
  async recordUsedIndex(ukx: string, keyIndex: number): Promise<void> {
    this.getUsedIndices(ukx).add(keyIndex);
    await this.persistKeyIndices();
  }

  /**
   * Merge this client's used indices into the store.
   *
   * Read-merge-write rather than a blind overwrite: the whole map lives under
   * one key, so two clients (or two browser tabs) sharing a StorageAdapter
   * would otherwise erase each other's indices on every spend. Losing an index
   * means the same private-tx key can be drawn twice, and Chamber rejects a
   * reused one. Writes are chained per store (see `persistQueues`) so two
   * concurrent persists, from this client or another, cannot interleave a read
   * and a write around each other.
   */
  private persistKeyIndices(): Promise<void> {
    const store = this.store;
    if (!store) return Promise.resolve();
    const next = (persistQueues.get(store) ?? Promise.resolve()).then(async () => {
      const merged = parseKeyIndices(await store.get(KEY_INDICES_KEY));
      for (const [ukx, used] of this.usedKeyIndices) {
        if (used.size === 0) continue;
        merged[ukx] = [...new Set([...(merged[ukx] ?? []), ...used])];
      }
      await store.set(KEY_INDICES_KEY, JSON.stringify(merged));
    }).catch(() => {
      // A store that throws must not fail an otherwise successful spend; the
      // in-memory set still guards this session.
    });
    persistQueues.set(store, next);
    return next;
  }

  /**
   * Merge used key indices from the store into memory. Union, never replace,
   * so indices this client recorded are kept. `spend()` calls this before
   * drawing an index; calling it after construction is still useful to load
   * the set early.
   */
  async restoreKeyIndices(): Promise<void> {
    if (!this.store) return;
    const obj = parseKeyIndices(await this.store.get(KEY_INDICES_KEY));
    for (const [ukx, indices] of Object.entries(obj)) {
      const used = this.getUsedIndices(ukx);
      for (const i of indices) used.add(i);
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
  ): Promise<Omit<NonNullable<SpendOpts['state']>, 'txLeaves'>> {
    const [stateLeaves, reserveCfg, users, userLeaves] = await Promise.all([
      this.zkStateLeaves(),
      this.chain.readContract(this.book.chamber, 'reserveConfigs', [reserve]),
      this.chain.readContract(reserve, 'registeredUsersCount'),
      this.registeredUserLeaves(reserve),
    ]);
    const owner = await this.ownerFor(id).catch(() => '0');
    return {
      stateLeaves,
      userLeaves,
      reserveConfig: String((reserveCfg as [bigint, bigint, bigint])[1] ?? reserveCfg),
      reserveUsers: BigInt(String(users)),
      ukx: this.ukx[`${reserve}:${owner}`] ?? '0',
    };
  }

  private capacity?: number;

  /** Chamber's tx tree capacity (4^10 in production); kept once read. */
  private async txTreeCapacity(): Promise<number> {
    return (this.capacity ??= Number(await this.chain.readContract(this.book.chamber, 'txTreeCapacity')));
  }

  /**
   * Set `note.txIndex` from its hash (`Chamber.noteIndexPlusOne`) when
   * unknown. False when the note is in no tx tree.
   */
  private async locate(note: Note): Promise<boolean> {
    if (note.txIndex === undefined && note.hash) {
      const plusOne = BigInt((await this.chain.readContract(this.book.chamber, 'noteIndexPlusOne', [BigInt(note.hash)])) as bigint);
      if (plusOne > 0n) note.txIndex = Number(plusOne - 1n);
    }
    return note.txIndex !== undefined;
  }

  /**
   * Every leaf of tx tree `treeId`, the `txLeaves` a spend of its notes
   * proves against, read through `getTxArray(offset, limit)` in pages of
   * `TX_PAGE`, `TX_READS` at a time.
   */
  async txTreeLeaves(treeId: number): Promise<string[]> {
    const [capacity, count] = await Promise.all([
      this.txTreeCapacity(),
      this.chain.readContract(this.book.chamber, 'txCount').then((n) => BigInt(n as bigint)),
    ]);
    const start = BigInt(treeId) * BigInt(capacity);
    const treeEnd = start + BigInt(capacity);
    const end = count < treeEnd ? count : treeEnd;
    const pages: Array<[bigint, bigint]> = [];
    for (let at = start; at < end; at += TX_PAGE) pages.push([at, end - at < TX_PAGE ? end - at : TX_PAGE]);
    const leaves: string[] = [];
    for (let i = 0; i < pages.length; i += TX_READS) {
      const batch = await Promise.all(
        pages.slice(i, i + TX_READS).map((args) => this.chain.readContract(this.book.chamber, 'getTxArray', args) as Promise<bigint[]>),
      );
      for (const page of batch) leaves.push(...page.map(String));
    }
    return leaves;
  }

  /**
   * The reserve's registered-users leaves by index, with removed users zeroed
   * as `Reserve.removeUser` leaves them: the `userLeaves` a spend proves
   * against. Built from `UserRegistered` and `UserRemoved`, so it needs
   * `ChainAdapter.getEvents` (empty without it); throws on a missing
   * registration.
   */
  async registeredUserLeaves(reserve: Hex): Promise<string[]> {
    if (!this.chain.getEvents) return [];
    const [added, removed] = await Promise.all([
      this.chain.getEvents(reserve, 'UserRegistered', 0n),
      this.chain.getEvents(reserve, 'UserRemoved', 0n),
    ]);
    const leaves: string[] = [];
    for (const { args } of added) leaves[Number(args['index'])] = String(args['leaf']);
    for (const { args } of removed) leaves[Number(args['index'])] = '0';
    if (Object.keys(leaves).length !== leaves.length) throw new Error(`MistClient: UserRegistered events are missing for reserve ${reserve}`);
    return leaves;
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

const DEPOSIT_STATUS: DepositStatus[] = ['none', 'pending', 'rejected'];

/** Leaves per `getTxArray` read: about 2.3M gas of storage reads, under common eth_call caps. */
const TX_PAGE = 1024n;

/** `getTxArray` reads in flight at once. */
const TX_READS = 8;
