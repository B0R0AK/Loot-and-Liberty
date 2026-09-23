import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectItem, findQuestlogUrl } from '../src/item.js';

const QL = 'https://questlog.gg/throne-and-liberty/de/db/item/sword2h_aa_t1_nomal_001';

test('Questlog-Link in <> wird erkannt', () => {
  assert.equal(findQuestlogUrl('Schwert <https://questlog.gg/x/item/abc>'), 'https://questlog.gg/x/item/abc');
});

test('findQuestlogUrl erkennt nur Questlog', () => {
  assert.equal(findQuestlogUrl(`schau mal ${QL}`), QL);
  assert.equal(findQuestlogUrl('https://example.com/item/1'), null);
});

test('detectItem: Screenshot', () => {
  const r = detectItem({ content: 'Drop vom Boss', attachments: [{ url: 'https://cdn/x.png', contentType: 'image/png' }] });
  assert.deepEqual(r, { name: 'Drop vom Boss', nameFromInput: true, url: null, image: 'https://cdn/x.png' });
});

test('detectItem: Questlog-Link mit Erwähnungen', () => {
  const r = detectItem({ content: `${QL} <@123> <@&456>` });
  assert.equal(r.url, QL);
  assert.equal(r.name, 'Sword2h Aa T1 Nomal 001');
  assert.equal(r.nameFromInput, false);
});

test('detectItem: kein Item', () => {
  assert.equal(detectItem({ content: 'hallo <@1>' }), null);
  assert.equal(detectItem({ content: 'x', attachments: [{ url: 'a.txt', contentType: 'text/plain' }] }), null);
});
