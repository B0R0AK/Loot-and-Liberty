import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseItemInput } from '../src/item.js';

test('nur Name', () => {
  assert.deepEqual(parseItemInput('  Schwert  des  Drachen '), { name: 'Schwert des Drachen', nameFromInput: true, url: null });
});

test('nur Questlog-Link -> Name aus Slug', () => {
  const r = parseItemInput('https://questlog.gg/throne-and-liberty/de/db/item/sword2h_aa_t1_nomal_001');
  assert.equal(r.url, 'https://questlog.gg/throne-and-liberty/de/db/item/sword2h_aa_t1_nomal_001');
  assert.equal(r.name, 'Sword2h Aa T1 Nomal 001');
  assert.equal(r.nameFromInput, false);
});

test('Name und Link', () => {
  const r = parseItemInput('Morokais Großschwert <https://questlog.gg/x/item/abc>');
  assert.equal(r.url, 'https://questlog.gg/x/item/abc');
  assert.equal(r.name, 'Morokais Großschwert');
});
