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

test('Questlog-Link → Item-ID und Sprache', async () => {
  const { questlogItemRef } = await import('../src/item.js');
  assert.deepEqual(questlogItemRef('https://questlog.gg/throne-and-liberty/en/db/item/np_gem'), { language: 'en', id: 'np_gem' });
  assert.deepEqual(questlogItemRef('https://www.questlog.gg/throne-and-liberty/de/db/item/sword_a_t1_construct_001?x=1'), {
    language: 'de',
    id: 'sword_a_t1_construct_001',
  });
  assert.equal(questlogItemRef('https://questlog.gg/throne-and-liberty/en/db/skills'), null);
  assert.equal(questlogItemRef('https://example.com/item/1'), null);
});

test('Questlog-Name über die Daten-Schnittstelle (fetch gemockt)', async (t) => {
  const { fetchLinkPreview } = await import('../src/item.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ result: { data: { id: 'np_gem', name: 'Lucent', description: 'Währung' } } }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  t.mock.method(console, 'log', () => {});
  const preview = await fetchLinkPreview('https://questlog.gg/throne-and-liberty/en/db/item/np_gem');
  assert.equal(preview.title, 'Lucent');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://questlog.gg/throne-and-liberty/api/trpc/database.getItem?input='));
  assert.deepEqual(JSON.parse(decodeURIComponent(calls[0].split('input=')[1])), { language: 'en', id: 'np_gem' });
});

test('Questlog-Schnittstelle down → Fallback ohne Absturz', async (t) => {
  const { fetchLinkPreview } = await import('../src/item.js');
  t.mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }));
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(await fetchLinkPreview('https://questlog.gg/throne-and-liberty/en/db/item/np_gem'), {});
});

test('Item-Karte: Stats aus Questlog-Daten, Symbol-Adresse, PNG', async () => {
  const { statLines, iconUrl, renderItemCard, gradeInfo } = await import('../src/itemcard.js');
  const itemStats = {
    main: { 20: { mainhand: { min: 1, max: 2, statId: 'attack_power_main_hand' } },
      10: { armor: null, offhand: null, shield: { value: 38, statId: 'damage_reduction' },
        mainhand: { max: 97, min: 62, statId: 'attack_power_main_hand' },
        extra: { shield_block_chance: 1800, attack_range_main_hand: 350, attack_speed_main_hand: 550 } } },
    extra: { 10: { hp_max: 1275, some_new_stat: 5 } },
  };
  assert.deepEqual(statLines(itemStats, 'en'), {
    primary: [['Max Damage', '62 ~ 97'], ['Damage Reduction', '38']],
    secondary: [['Block Chance', '18%'], ['Range', '3.5m'], ['Attack Speed', '0.6s']],
    extra: [['Max Health', '1,275'], ['Some New Stat', '5']],
    itemLevel: 10,
    lockedEffects: 0,
  });
  assert.deepEqual(statLines(itemStats, 'de').secondary[1], ['Reichweite', '3,5m']);
  assert.deepEqual(statLines(undefined), { primary: [], secondary: [], extra: [], itemLevel: null, lockedEffects: 0 });
  assert.equal(
    iconUrl('/assets/Game/Image/Icon/Item_128/Equip/Weapon/IT_P_Sword_00022.IT_P_Sword_00022'),
    'https://cdn.questlog.gg/throne-and-liberty/assets/Game/Image/Icon/Item_128/Equip/Weapon/IT_P_Sword_00022.webp',
  );
  assert.equal(iconUrl('/common/fallback-db-image/litograph'), null);
  assert.equal(gradeInfo(31).en, 'Rare');
  assert.equal(gradeInfo(11).de, 'Gewöhnlich');

  const png = await renderItemCard({ name: 'Golem Shattering Sword', grade: 31, subCategory: 'sword', itemStats }, { icon: null });
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('Item-Karte: Werte wie im Spiel-Tooltip (Calanthias Aegis, echte Questlog-Daten)', async () => {
  const { statLines, gradeInfo } = await import('../src/itemcard.js');
  const itemStats = {
    main: { 75: { armor: null, offhand: null,
      extra: { shield_block_chance: 3600, attack_range_main_hand: 350, attack_speed_main_hand: 605 },
      shield: { value: 158, statId: 'damage_reduction' },
      mainhand: { max: 207, min: 115, statId: 'attack_power_main_hand' } } },
    extra: { 75: { per: 17, all_species_damage_amplification: 720 } },
    traits: { hp_max: [150, 300] },
    resonance: null,
    random_stat_group_1: [{ stat_id: 'str', base_value: 14 }],
    random_stat_group_2: [{ stat_id: 'dex', base_value: 14 }],
  };
  // Erwartung = Werte aus dem In-Game-Screenshot
  assert.deepEqual(statLines(itemStats, 'en'), {
    primary: [['Max Damage', '115 ~ 207'], ['Damage Reduction', '158']],
    secondary: [['Block Chance', '36%'], ['Range', '3.5m'], ['Attack Speed', '0.6s']],
    extra: [['Perception', '17'], ['Species Damage Boost', '72']],
    itemLevel: 75,
    lockedEffects: 2,
  });
  assert.equal(gradeInfo(51).en, 'Heroic');
});

test('detectItems: mehrere Screenshots in einer Nachricht = mehrere Items', async () => {
  const { detectItems } = await import('../src/item.js');
  const img = (n) => ({ url: `https://cdn/${n}.png`, contentType: 'image/png' });
  const five = detectItems({ content: 'Gildenboss <@1>', attachments: [img(1), img(2), img(3), img(4), img(5)] });
  assert.equal(five.length, 5);
  assert.deepEqual(five.map((i) => i.name), ['Gildenboss 1/5', 'Gildenboss 2/5', 'Gildenboss 3/5', 'Gildenboss 4/5', 'Gildenboss 5/5']);
  assert.equal(five[2].image, 'https://cdn/3.png');
  assert.deepEqual(detectItems({ attachments: [img(1), img(2)] }).map((i) => i.name), ['Loot 1/2', 'Loot 2/2']);
  assert.equal(detectItems({ content: 'Schwert', attachments: [img(1)] })[0].name, 'Schwert');
  assert.deepEqual(detectItems({ content: 'hallo' }), []);
  assert.equal(detectItems({ attachments: [img(1), { url: 'x.txt', contentType: 'text/plain' }] }).length, 1);
});
