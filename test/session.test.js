import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LootSession, Status, rollDie } from '../src/session.js';

const make = (ids = ['a', 'b', 'c']) => new LootSession({ id: 's1', leaderId: 'lead', item: { name: 'Schwert' }, eligibleIds: ids });

test('rollDie bleibt im Bereich 1-100', () => {
  for (let i = 0; i < 5000; i++) {
    const v = rollDie();
    assert.ok(v >= 1 && v <= 100 && Number.isInteger(v));
  }
});

test('nur berechtigte Spieler dürfen würfeln, jeder nur einmal', () => {
  const s = make();
  assert.deepEqual(s.roll('x'), { ok: false, reason: 'not-eligible' });
  assert.equal(s.roll('a', () => 42).value, 42);
  assert.equal(s.roll('a', () => 99).reason, 'already');
  assert.equal(s.pass('a').reason, 'already');
  assert.equal(s.participants.get('a').roll, 42);
});

test('passen und Abschluss, wenn alle entschieden haben', () => {
  const s = make(['a', 'b']);
  s.pass('a');
  assert.equal(s.allDecided, false);
  s.roll('b', () => 7);
  assert.equal(s.allDecided, true);
  assert.deepEqual(s.counts(), { pending: 0, rolled: 1, passed: 1, total: 2 });
  assert.deepEqual(s.result(), { top: 7, winners: ['b'], tie: false });
});

test('Gleichstand wird erkannt', () => {
  const s = make();
  s.roll('a', () => 80);
  s.roll('b', () => 80);
  s.roll('c', () => 12);
  assert.deepEqual(s.result(), { top: 80, winners: ['a', 'b'], tie: true });
});

test('niemand würfelt -> kein Gewinner', () => {
  const s = make(['a']);
  s.pass('a');
  assert.deepEqual(s.result(), { top: null, winners: [], tie: false });
});

test('nach dem Schließen keine Entscheidungen mehr', () => {
  const s = make();
  assert.equal(s.close('ended'), true);
  assert.equal(s.close('timeout'), false);
  assert.equal(s.closeReason, 'ended');
  assert.equal(s.roll('a').reason, 'closed');
});

test('Rangliste: Würfe absteigend, dann gepasst, dann offen', () => {
  const s = make(['a', 'b', 'c', 'd']);
  s.pass('a');
  s.roll('b', () => 10);
  s.roll('c', () => 90);
  assert.deepEqual(
    s.standings().map((p) => [p.userId, p.status]),
    [['c', Status.ROLLED], ['b', Status.ROLLED], ['a', Status.PASSED], ['d', Status.PENDING]],
  );
});

test('doppelte Teilnehmer werden zusammengeführt', () => {
  assert.equal(make(['a', 'a', 'b']).participants.size, 2);
  assert.throws(() => make([]));
});
