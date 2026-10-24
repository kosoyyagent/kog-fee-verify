import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyKogFee } from './index.mjs';

const MINT = 'KOGmint1111111111111111111111111111111';
const PAYEE = 'Payee11111111111111111111111111111111';
const QUOTE = { amount: '1000000', expires_at: '2999-01-01T00:00:00Z' };

const mkTx = (over = {}) => ({
  signature: over.sig || 'sig-' + Math.random(),
  transaction: { message: { instructions: [{
    program: 'spl-token',
    parsed: { program: 'spl-token', type: 'TransferChecked', info: {
      mint: over.mint || MINT,
      destination: over.dest || PAYEE,
      tokenAmount: { amount: over.amount || '1000000', decimals: 6 },
    } },
  }] } },
  meta: { innerInstructions: [] },
});

test('right fee verifies', () => {
  const r = verifyKogFee({ tx: mkTx(), quote: QUOTE, payee: PAYEE, mint: MINT, seen: new Set() });
  assert.deepEqual(r, { ok: true, reason: 'right_fee' });
});

test('short fee refused', () => {
  const r = verifyKogFee({ tx: mkTx({ amount: '999999' }), quote: QUOTE, payee: PAYEE, mint: MINT, seen: new Set() });
  assert.equal(r.reason, 'short_fee');
});

test('wrong mint refused', () => {
  const r = verifyKogFee({ tx: mkTx({ mint: 'OTHERmint' }), quote: QUOTE, payee: PAYEE, mint: MINT, seen: new Set() });
  assert.equal(r.reason, 'wrong_mint');
});

test('wrong payee refused', () => {
  const r = verifyKogFee({ tx: mkTx({ dest: 'SomewhereElse' }), quote: QUOTE, payee: PAYEE, mint: MINT, seen: new Set() });
  assert.equal(r.reason, 'wrong_payee');
});

test('expired quote refused', () => {
  const r = verifyKogFee({ tx: mkTx(), quote: { ...QUOTE, expires_at: '2000-01-01' }, payee: PAYEE, mint: MINT, seen: new Set() });
  assert.equal(r.reason, 'expired_quote');
});

test('replayed signature refused', () => {
  const seen = new Set();
  const tx = mkTx({ sig: 'fixed-sig-1' });
  assert.equal(verifyKogFee({ tx, quote: QUOTE, payee: PAYEE, mint: MINT, seen }).ok, true);
  const r = verifyKogFee({ tx, quote: QUOTE, payee: PAYEE, mint: MINT, seen });
  assert.equal(r.reason, 'replay');
});

test('inner instructions are walked too', () => {
  const tx = { signature: 's', transaction: { message: { instructions: [] } },
    meta: { innerInstructions: [{ instructions: [{ program: 'spl-token',
      parsed: { program: 'spl-token', type: 'TransferCheckedWithFee', info: {
        mint: MINT, destination: PAYEE, tokenAmount: { amount: '1000000' } } } }] }] } };
  assert.equal(verifyKogFee({ tx, quote: QUOTE, payee: PAYEE, mint: MINT, seen: new Set() }).ok, true);
});

test('malformed inputs refused', () => {
  assert.equal(verifyKogFee({ tx: null, quote: QUOTE, payee: PAYEE, mint: MINT }).reason, 'malformed_tx');
  assert.equal(verifyKogFee({ tx: {}, quote: QUOTE, payee: PAYEE, mint: MINT }).reason, 'malformed_tx');
});
