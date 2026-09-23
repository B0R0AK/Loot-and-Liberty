import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LootSession, Status, rollDie } from '../src/session.js';

const make = (ids = ['a', 'b', 'c']) =>
  new LootSession({ id: 's1', ownerId: 'owner', item: { name: 'Schwert' }, eligibleIds: ids, names: { a: 'Anna' } });

test('rollDie bleibt im Bereich 1-100', () => {
  for (let i = 0; i < 5000; i++) {
    const v = rollDie();
    assert.ok(v >= 1 && v <= 100 && Number.isInteger(v));
  }
});

test('nur berechtigte Spieler dürfen würfeln, jeder nur einmal', () => {
  const s = make();
  assert.equal(s.roll('x', 'bis').reason, 'not-eligible');
  assert.equal(s.roll('a', 'nope').reason, 'bad-purpose');
  assert.equal(s.roll('a', 'bis', () => 42).value, 42);
  assert.equal(s.roll('a', 'sell', () => 99).reason, 'already');
  assert.deepEqual({ ...s.participants.get('a'), at: 0 }, { status: Status.ROLLED, roll: 42, purpose: 'bis', at: 0 });
});

test('Würfe nach Grund gruppiert, dann nach Wurf sortiert', () => {
  const s = make(['a', 'b', 'c', 'd', 'e']);
  s.roll('a', 'sell', () => 99);
  s.roll('b', 'bis', () => 10);
  s.roll('c', 'bis', () => 70);
  s.roll('d', 'potential', () => 50);
  s.pass('e');
  assert.deepEqual(s.rolls().map((r) => r.userId), ['c', 'b', 'a', 'd']);
  assert.deepEqual(s.withStatus(Status.PASSED), ['e']);
  assert.equal(s.allDecided, true);
});

test('Gewinner wählen: nur wer gewürfelt hat', () => {
  const s = make();
  s.roll('a', 'bis', () => 5);
  s.pass('b');
  assert.equal(s.chooseWinner('b').reason, 'not-rolled');
  assert.equal(s.chooseWinner('c').reason, 'not-rolled');
  assert.equal(s.chooseWinner('a').ok, true);
  assert.equal(s.winnerId, 'a');
  assert.equal(s.closed, true);
  assert.equal(s.roll('c', 'bis').reason, 'closed');
  assert.equal(s.chooseWinner('a').reason, 'closed');
});

test('Speichern und Laden', () => {
  const s = make();
  s.roll('a', 'litho', () => 33);
  s.threadId = 't1';
  const copy = LootSession.fromJSON(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.threadId, 't1');
  assert.equal(copy.nameOf('a'), 'Anna');
  assert.equal(copy.participants.get('a').roll, 33);
  assert.equal(copy.participants.get('b').status, Status.PENDING);
  assert.equal(copy.roll('b', 'bis', () => 1).ok, true);
});

test('doppelte Teilnehmer werden zusammengeführt', () => {
  assert.equal(make(['a', 'a', 'b']).participants.size, 2);
  assert.throws(() => make([]));
});

test('Leader setzt eine Entscheidung zurück', () => {
  const s = make();
  s.roll('a', 'bis', () => 50);
  s.pass('b');
  assert.equal(s.reset('c').reason, 'still-pending');
  assert.equal(s.reset('x').reason, 'not-eligible');
  assert.deepEqual(s.decided().map((d) => d.userId), ['a', 'b']);
  assert.equal(s.reset('b').ok, true);
  assert.equal(s.participants.get('b').status, Status.PENDING);
  assert.equal(s.roll('b', 'sell', () => 7).value, 7);
  assert.equal(s.reset('a').ok, true);
  assert.deepEqual(s.rolls().map((r) => r.userId), ['b']);
});

test('Spieler nachträglich hinzufügen', () => {
  const s = make(['a']);
  s.roll('a', 'bis', () => 10);
  assert.deepEqual(s.addParticipants(['a', 'd', 'e'], { d: 'Dora' }), ['d', 'e']);
  assert.equal(s.participants.get('a').roll, 10);
  assert.equal(s.nameOf('d'), 'Dora');
  assert.equal(s.allDecided, false);
  assert.equal(s.roll('d', 'litho', () => 3).ok, true);
  s.close('no-winner');
  assert.deepEqual(s.addParticipants(['f']), []);
  assert.equal(s.reset('a').reason, 'closed');
});

test('Rollzeit beenden: keine Würfe mehr, Gewinner wählbar', () => {
  const s = make();
  s.roll('a', 'bis', () => 60);
  assert.equal(s.rollingOpen, true);
  assert.equal(s.lockRolls(), true);
  assert.equal(s.lockRolls(), false);
  assert.equal(s.rollingOpen, false);
  assert.equal(s.roll('b', 'bis').reason, 'locked');
  assert.equal(s.pass('b').reason, 'locked');
  assert.equal(s.reset('a').reason, 'locked');
  assert.deepEqual(s.addParticipants(['z']), []);
  assert.equal(s.chooseWinner('a').ok, true);
});

test('Rollzeit wird gespeichert', () => {
  const s = make();
  s.endsAt = 123;
  s.lockRolls();
  const copy = LootSession.fromJSON(JSON.parse(JSON.stringify(s)));
  assert.equal(copy.endsAt, 123);
  assert.equal(copy.rollsLocked, true);
});

test('Fortschrittsbalken', async () => {
  const { progressBar } = await import('../src/render.js');
  assert.equal(progressBar(0, 7), '▱▱▱▱▱▱▱▱▱▱');
  assert.equal(progressBar(6, 7), '▰▰▰▰▰▰▰▰▰▱');
  assert.equal(progressBar(7, 7), '▰▰▰▰▰▰▰▰▰▰');
  assert.equal(progressBar(0, 0), '▱▱▱▱▱▱▱▱▱▱');
});

test('Verwalter: Ersteller, gewählte Leader und Leader-Rollen', () => {
  const s = new LootSession({
    id: 's', ownerId: 'owner', item: { name: 'X' }, eligibleIds: ['a'],
    managers: { users: ['lead2'], roles: ['offiziere', 'raidlead'] },
  });
  assert.equal(s.isManager('owner'), true);
  assert.equal(s.isManager('lead2'), true);
  assert.equal(s.isManager('x', ['member', 'raidlead']), true);
  assert.equal(s.isManager('x', ['member']), false);
  const copy = LootSession.fromJSON(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(copy.managers, { users: ['lead2'], roles: ['offiziere', 'raidlead'] });
  assert.equal(new LootSession({ id: 't', ownerId: 'o', item: {}, eligibleIds: ['a'] }).isManager('x', ['r']), false);
});

test('Rollzeit ändern nur, solange gerollt werden kann', () => {
  const s = make();
  s.endsAt = 1000;
  assert.equal(s.setDeadline(5000), true);
  assert.equal(s.endsAt, 5000);
  s.lockRolls();
  assert.equal(s.setDeadline(9000), false);
  assert.equal(s.endsAt, 5000);
});

test('Nach dem Würfeln passen: Wurf zählt nicht mehr, erneut würfeln erst nach Zurücksetzen', () => {
  const s = make();
  s.roll('a', 'bis', () => 80);
  s.roll('b', 'bis', () => 20);
  assert.deepEqual(s.pass('a'), { ok: true, droppedRoll: 80 });
  assert.equal(s.participants.get('a').status, Status.PASSED);
  assert.deepEqual(s.rolls().map((r) => r.userId), ['b']);
  assert.equal(s.chooseWinner('a').reason, 'not-rolled');
  assert.equal(s.pass('a').reason, 'already');
  assert.equal(s.roll('a', 'bis', () => 99).reason, 'already');
  assert.equal(s.reset('a').ok, true);
  assert.equal(s.roll('a', 'sell', () => 55).value, 55);
  assert.deepEqual(s.pass('c'), { ok: true, droppedRoll: null });
  s.lockRolls();
  assert.equal(s.pass('b').reason, 'locked');
});
