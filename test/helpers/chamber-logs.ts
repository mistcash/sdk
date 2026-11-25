// Chamber logs as the contract emits them, for the receipts mock chains return.

import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { chamberAbi } from '../../src/abis.generated.js';
import type { Hex } from '../../src/types.js';

export type Log = { address: Hex; topics: Hex[]; data: Hex };

/** `NoteAppended(index, note, root)`: one per leaf the Chamber appends. */
export function noteAppendedLog(chamber: Hex, index: bigint, note: bigint): Log {
  return {
    address: chamber,
    topics: encodeEventTopics({ abi: chamberAbi, eventName: 'NoteAppended', args: { index, note } }) as Hex[],
    data: encodeAbiParameters([{ type: 'uint256' }], [999n]),
  };
}

/** `DepositQueued`: a screened deposit's note waiting on the screener. */
export function depositQueuedLog(
  chamber: Hex,
  e: { depositId: bigint; noteHash: bigint; reserve: Hex; depositor: Hex; asset: Hex; amount: bigint },
): Log {
  return {
    address: chamber,
    topics: encodeEventTopics({
      abi: chamberAbi,
      eventName: 'DepositQueued',
      args: { depositId: e.depositId, reserve: e.reserve, depositor: e.depositor },
    }) as Hex[],
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }], [e.noteHash, e.asset, e.amount]),
  };
}
