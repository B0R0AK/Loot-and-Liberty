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
