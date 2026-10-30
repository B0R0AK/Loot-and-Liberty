import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRINGS, t } from '../src/i18n.js';
import { helpText, lootComponents, lootEmbed, panelView, starterContent, summaryEmbed } from '../src/render.js';
import { LootSession } from '../src/session.js';
import { SessionStore } from '../src/store.js';

const keysOf = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();

test('Deutsch und Englisch haben dieselben Texte', () => {
  assert.deepEqual(keysOf(STRINGS.en), keysOf(STRINGS.de));
});

test('t(): Platzhalter, unbekannte Sprache fällt auf Deutsch zurück', () => {
  assert.equal(t('en', 'hours', 1), '1 hour');
  assert.equal(t('de', 'hours', 24), '24 Stunden');
  assert.equal(t('fr', 'hours', 2), '2 Stunden');
  assert.throws(() => t('de', 'gibtEsNicht'));
});

test('Verlosung auf Englisch: Liste, Panel, Item-Nachricht, Ergebnis-Karte', () => {
  const s = new LootSession({
    id: 'x', ownerId: 'o', threadId: 't', lang: 'en', item: { name: 'Sword' }, eligibleIds: ['a', 'b', 'c'], endsAt: Date.now() + 3600e3,
  });
  s.roll('a', 'bis', () => 87);
  s.pass('b');
  const e = lootEmbed(s).toJSON();
  assert.match(e.description, /Roll time ends/);
  assert.match(e.description, /2\*\*\/3 decided/);
  assert.match(e.description, /⭐ BiS item/);
  assert.deepEqual(e.fields.map((f) => f.name), ['🚫 Passed · 1', '⏳ Still open · 1']);
  const roll = lootComponents(s)[0].toJSON().components[0];
  assert.equal(roll.placeholder, '🎲 Roll for …');
  assert.ok(roll.options.some((o) => o.label === 'Inheritance'));
  const buttons = panelView(s).components.at(-1).toJSON().components.map((b) => b.label);
  assert.deepEqual(buttons, ['End rolling now', 'Manage players', 'Rename', 'Close without winner']);
  assert.match(starterContent(s), /Loot roll running/);
  s.chooseWinner('a');
  assert.match(summaryEmbed(s).toJSON().description, /Winner:\*\* <@a>\n🎲 \*\*87\*\* · ⭐ BiS item/);
  assert.match(helpText('en'), /How a loot roll works/);
  assert.match(helpText('de'), /So läuft eine Verlosung/);
});

test('Ohne Sprachangabe bleibt alles Deutsch (alte Verlosungen)', () => {
  const s = LootSession.fromJSON(JSON.parse(JSON.stringify(new LootSession({ id: 'y', ownerId: 'o', item: { name: 'X' }, eligibleIds: ['a'] }))));
  assert.equal(s.lang, 'de');
  assert.match(lootEmbed(s).toJSON().description, /Noch keine Würfe/);
});

test('Sprache pro Server: Standard, .env-Vorgabe, /setup', () => {
  assert.equal(new SessionStore(null).guild('g').language, 'de');
  const store = new SessionStore(null, { defaults: { language: 'en' } });
  assert.equal(store.guild('g').language, 'en');
  store.updateGuild('g', (c) => (c.language = 'de'));
  assert.equal(store.guild('g').language, 'de');
  clearTimeout(store.timer);
});
