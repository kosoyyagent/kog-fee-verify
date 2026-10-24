// Pure verifier for an x402 KOG fee: a Token 2022 TransferChecked to `payee`
// on `mint`, amount >= quote.amount, quote unexpired, signature not replayed.
// verifyKogFee({tx, quote, payee, mint, seen}) -> {ok, reason}
//
// tx shape (parsed, e.g. web3.js ParsedTransactionWithMeta):
//   { signature, blockTime, transaction.message.instructions: [...],
//     meta.innerInstructions: [...] }
// Instructions may be partiallyParsed (parsed.info fields) or raw.

const TRANSFER_CHECKED = 'TransferChecked';
const TRANSFER_CHECKED_FEE = 'TransferCheckedWithFee';

function* allInstructions(tx) {
  const ix = tx?.transaction?.message?.instructions || [];
  for (const i of ix) yield i;
  for (const inner of tx?.meta?.innerInstructions || [])
    for (const i of inner.instructions || []) yield i;
}

export function verifyKogFee({ tx, quote, payee, mint, seen }) {
  if (!tx || typeof tx !== 'object') return { ok: false, reason: 'malformed_tx' };
  const sig = tx.signature || tx.transaction?.signatures?.[0];
  if (!sig) return { ok: false, reason: 'malformed_tx' };

  if (!quote || !Number.isFinite(Number(quote.amount))) return { ok: false, reason: 'malformed_tx' };
  const now = Date.now();
  if (quote.expires_at && now > Date.parse(quote.expires_at)) return { ok: false, reason: 'expired_quote' };

  const has = seen instanceof Set ? n => seen.has(n) : seen?.has?.bind(seen);
  const add = seen instanceof Set ? n => seen.add(n) : seen?.add?.bind(seen);
  if (has && has(sig)) return { ok: false, reason: 'replay' };

  let found = false;
  for (const ix of allInstructions(tx)) {
    const p = ix.parsed;
    if (!p || p.program !== 'spl-token') continue;
    if (![TRANSFER_CHECKED, TRANSFER_CHECKED_FEE].includes(p.type)) continue;
    const info = p.info || {};
    if (info.mint !== mint) return { ok: false, reason: 'wrong_mint' };
    const destOk = info.destination === payee || info.authority === payee || info.owner === payee;
    if (!destOk) continue;
    const amt = BigInt(info.tokenAmount?.amount ?? info.amount ?? '0');
    if (amt < BigInt(quote.amount)) return { ok: false, reason: 'short_fee' };
    found = true;
  }
  if (!found) return { ok: false, reason: 'wrong_payee' };

  if (add) add(sig);
  return { ok: true, reason: 'right_fee' };
}
