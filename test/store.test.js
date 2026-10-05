import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LootSession } from '../src/session.js';
import { SessionStore } from '../src/store.js';

test('Leader und Kanäle werden gespeichert, .env-Werte sind Fallback', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'loot-')), 'data.json');
  const store = new SessionStore(file, { defaults: { lootChannelId: 'envLoot' } });

  assert.equal(store.guild('g').lootChannelId, 'envLoot');
  assert.equal(store.setLeader('g', 'users', 'u1', true), true);
  assert.equal(store.setLeader('g', 'users', 'u1', true), false);
  store.setLeader('g', 'roles', 'r1', true);
  store.updateGuild('g', (cfg) => (cfg.leaderChannelId = 'lead'));
  store.set(new LootSession({ id: 's1', ownerId: 'u1', item: { name: 'X' }, eligibleIds: ['a'] }));
  store.flush();
  clearTimeout(store.timer);

  const loaded = new SessionStore(file, { defaults: { lootChannelId: 'envLoot' } }).load();
  assert.deepEqual(loaded.guild('g').leaders, { users: ['u1'], roles: ['r1'] });
  assert.equal(loaded.guild('g').leaderChannelId, 'lead');
  assert.equal(loaded.guild('g').lootChannelId, 'envLoot');
  assert.equal(loaded.get('s1').item.name, 'X');

  assert.equal(loaded.setLeader('g', 'users', 'u1', false), true);
  assert.deepEqual(loaded.guild('g').leaders.users, []);
  clearTimeout(loaded.timer);
});

test('Rollzeit pro Server und offene Verlosungen', () => {
  const store = new SessionStore(null, { defaults: { rollHours: 12 } });
  assert.equal(store.guild('g').rollHours, 12);
  store.updateGuild('g', (cfg) => (cfg.rollHours = 48));
  assert.equal(store.guild('g').rollHours, 48);
  assert.equal(new SessionStore(null).guild('x').rollHours, 24);

  const mk = (id, guildId, createdAt) => new LootSession({ id, guildId, createdAt, ownerId: 'o', item: { name: id }, eligibleIds: ['a'] });
  const a = mk('a', 'g', 2);
  const b = mk('b', 'g', 1);
  const c = mk('c', 'other', 0);
  const d = mk('d', 'g', 3);
  d.close('no-winner');
  for (const s of [a, b, c, d]) store.set(s);
  assert.deepEqual(store.openSessions('g').map((s) => s.id), ['b', 'a']);
});

test('Tagesgruppe: speichern, laden, ablaufen, beenden', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'loot-')), 'data.json');
  const store = new SessionStore(file);
  const now = Date.now();
  store.setGroup({ guildId: 'g', leaderId: 'L', selection: { users: ['a'], roles: ['r'] }, managers: { users: [], roles: [] }, rollHours: 24, createdAt: now, expiresAt: now + 3600e3 });
  store.flush();
  clearTimeout(store.timer);

  const loaded = new SessionStore(file).load();
  assert.deepEqual(loaded.getGroup('g', 'L').selection, { users: ['a'], roles: ['r'] });
  assert.equal(loaded.getGroup('g', 'other'), null);
  assert.equal(loaded.getGroup('g', 'L', now + 3601e3), null, 'nach Ablauf weg');
  assert.equal(loaded.getGroup('g', 'L'), null);

  loaded.setGroup({ guildId: 'g', leaderId: 'L', expiresAt: now + 1000e3 });
  assert.equal(loaded.endGroup('g', 'L').leaderId, 'L');
  assert.equal(loaded.getGroup('g', 'L'), null);
  clearTimeout(loaded.timer);
});
