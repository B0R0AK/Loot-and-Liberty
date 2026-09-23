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

test('Titel aus Questlog-ähnlichem HTML (Reihenfolge, Apostroph, Entities)', async () => {
  const { extractPreview, cleanTitle } = await import('../src/item.js');
  const html = `<html><head><title>Lucent - Throne and Liberty Datenbank | Questlog</title>
    <meta content="https://cdn.questlog.gg/x.webp" property="og:image">
    <meta data-hid="og:title" property="og:title" content="Calanthia&#39;s Aegis - Throne and Liberty | Questlog">
    <meta name='description' content='Ein Schild'></head></html>`;
  assert.deepEqual(extractPreview(html), {
    title: "Calanthia's Aegis",
    image: 'https://cdn.questlog.gg/x.webp',
    description: 'Ein Schild',
  });
  assert.equal(extractPreview('<title>Lucent | Questlog</title>').title, 'Lucent');
  assert.equal(extractPreview("<meta property=\"og:title\" content=\"Calanthia's Aegis of Doom\">").title, "Calanthia's Aegis of Doom");
  assert.equal(cleanTitle('Questlog | Throne and Liberty Database'), null);
  assert.equal(cleanTitle('Sword-Of-Dawn | Questlog'), 'Sword-Of-Dawn');
});
