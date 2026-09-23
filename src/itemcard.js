import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

// Schrift mitliefern, damit das Bild auf jedem Server gleich aussieht (DejaVu, freie Lizenz).
const fontDir = join(dirname(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json')), 'ttf');
GlobalFonts.registerFromPath(join(fontDir, 'DejaVuSans.ttf'), 'Card');
GlobalFonts.registerFromPath(join(fontDir, 'DejaVuSans-Bold.ttf'), 'CardBold');

const CDN = 'https://cdn.questlog.gg/throne-and-liberty';

/** Seltenheit aus Questlogs "grade" (11 = Common, 31 = Rare …) – Zehnerstelle entscheidet. */
const GRADES = {
  1: { en: 'Common', de: 'Gewöhnlich', color: '#c9c9c9' },
  2: { en: 'Uncommon', de: 'Ungewöhnlich', color: '#7bd66b' },
  3: { en: 'Rare', de: 'Selten', color: '#5aa9ff' },
  4: { en: 'Epic', de: 'Episch', color: '#c07cff' },
  5: { en: 'Heroic', de: 'Heroisch', color: '#ff9f43' },
  6: { en: 'Legendary', de: 'Legendär', color: '#ffd257' },
};
export const gradeInfo = (grade) => GRADES[Math.floor((grade ?? 0) / 10)] ?? { en: '', de: '', color: '#c9c9c9' };

const TYPES = {
  sword: ['Sword', 'Schwert'],
  sword2h: ['Greatsword', 'Großschwert'],
  greatsword: ['Greatsword', 'Großschwert'],
  dagger: ['Dagger', 'Dolch'],
  bow: ['Longbow', 'Langbogen'],
  crossbow: ['Crossbow', 'Armbrust'],
  staff: ['Staff', 'Stab'],
  wand: ['Wand', 'Zauberstab'],
  spear: ['Spear', 'Speer'],
  orb: ['Orb', 'Kugel'],
};

/** Bekannte Stat-IDs → Name und Einheit. Unbekannte werden aus der ID lesbar gemacht. */
const STATS = {
  attack_power_main_hand: { en: 'Damage', de: 'Schaden' },
  attack_power_off_hand: { en: 'Off-Hand Damage', de: 'Nebenhand-Schaden' },
  damage_reduction: { en: 'Damage Reduction', de: 'Schadensreduktion' },
  armor: { en: 'Defense', de: 'Verteidigung' },
  shield_block_chance: { en: 'Block Chance', de: 'Blockchance', unit: 'percent' },
  attack_range_main_hand: { en: 'Range', de: 'Reichweite', unit: 'meter' },
  attack_speed_main_hand: { en: 'Attack Speed', de: 'Angriffstempo', unit: 'seconds' },
  hp_max: { en: 'Max Health', de: 'Max. Lebenspunkte' },
  mp_max: { en: 'Max Mana', de: 'Max. Mana' },
  perception: { en: 'Perception', de: 'Wahrnehmung' },
  str: { en: 'Strength', de: 'Stärke' },
  dex: { en: 'Dexterity', de: 'Geschicklichkeit' },
  int: { en: 'Wisdom', de: 'Weisheit' },
  per: { en: 'Perception', de: 'Wahrnehmung' },
  con: { en: 'Fortitude', de: 'Standhaftigkeit' },
};

const pretty = (id) =>
  id
    .replace(/_/g, ' ')
    .replace(/\b(main hand|off hand)\b/g, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function formatValue(id, value, lang) {
  const unit = STATS[id]?.unit ?? (/_chance$|_rate$/.test(id) ? 'percent' : null);
  const nf = (n, d = 0) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: d });
  if (unit === 'percent') return `${nf(value / 100, 1)}%`;
  if (unit === 'meter') return `${nf(value / 100, 1)}m`;
  if (unit === 'seconds') return `${nf(value / 1000, 2)}s`;
  return nf(value);
}

const label = (id, lang) => STATS[id]?.[lang === 'de' ? 'de' : 'en'] ?? pretty(id);

/** Kleinster Stufen-Schlüssel ("10", …) = Grundwerte des Items. */
const baseLevel = (obj) => (obj ? obj[Object.keys(obj).sort((a, b) => Number(a) - Number(b))[0]] : null);

/**
 * Macht aus den Questlog-Daten Zeilen für die Karte:
 * primary = große Werte (Schaden, Reduktion …), secondary = Tempo/Reichweite …, extra = Bonus-Stats.
 */
export function statLines(itemStats, lang = 'en') {
  const main = baseLevel(itemStats?.main) ?? {};
  const primary = [];
  for (const key of ['mainhand', 'offhand']) {
    const s = main[key];
    if (s?.statId) primary.push([label(s.statId, lang), `${formatValue(s.statId, s.min, lang)} ~ ${formatValue(s.statId, s.max, lang)}`]);
  }
  for (const key of ['shield', 'armor']) {
    const s = main[key];
    if (s?.statId) primary.push([label(s.statId, lang), formatValue(s.statId, s.value, lang)]);
  }
  const secondary = Object.entries(main.extra ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([id, v]) => [label(id, lang), formatValue(id, v, lang)]);
  const extra = Object.entries(baseLevel(itemStats?.extra) ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([id, v]) => [label(id, lang), formatValue(id, v, lang)]);
  return { primary, secondary, extra };
}

/** "/assets/Game/…/IT_P_Sword_00022.IT_P_Sword_00022" → CDN-Adresse als .webp */
export function iconUrl(icon) {
  if (!icon?.startsWith('/assets/')) return null;
  return `${CDN}${icon.replace(/\.[^/.]+$/, '')}.webp`;
}

async function loadIcon(icon) {
  const url = iconUrl(icon);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    console.warn(`Item-Symbol ${url} nicht geladen: ${err.message}`);
    return null;
  }
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const w of text.split(' ')) {
    const cur = lines.length ? `${lines[lines.length - 1]} ${w}` : w;
    if (lines.length && ctx.measureText(cur).width <= maxWidth) lines[lines.length - 1] = cur;
    else lines.push(w);
  }
  return lines;
}

/**
 * Zeichnet eine Item-Karte im Stil des Spiel-Tooltips und gibt ein PNG zurück.
 * @param data  Antwort von Questlogs database.getItem
 * @param opts  { lang, icon } – icon ist optional ein bereits geladenes Bild (für Tests)
 */
export async function renderItemCard(data, { lang = data.language ?? 'en', icon } = {}) {
  const W = 560;
  const PAD = 24;
  const grade = gradeInfo(data.grade);
  const { primary, secondary, extra } = statLines(data.itemStats, lang);
  const typeName = TYPES[data.subCategory]?.[lang === 'de' ? 1 : 0] ?? (data.subCategory ? pretty(data.subCategory) : '');
  const img = icon === undefined ? await loadIcon(data.icon) : icon;

  const HEADER = 150;
  const lineH = { primary: 34, secondary: 28, extra: 28 };
  let bodyH = 0;
  if (primary.length) bodyH += primary.length * lineH.primary + 16;
  if (secondary.length) bodyH += secondary.length * lineH.secondary + 16;
  if (extra.length) bodyH += extra.length * lineH.extra + 16;
  const H = HEADER + Math.max(bodyH, 20) + 36;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Hintergrund + Rahmen in Seltenheitsfarbe
  roundRect(ctx, 0, 0, W, H, 14);
  ctx.fillStyle = '#1b1c20';
  ctx.fill();
  const head = ctx.createLinearGradient(0, 0, W, HEADER);
  head.addColorStop(0, `${grade.color}55`);
  head.addColorStop(1, '#1b1c2000');
  roundRect(ctx, 0, 0, W, HEADER, [14, 14, 0, 0]);
  ctx.fillStyle = head;
  ctx.fill();
  roundRect(ctx, 1, 1, W - 2, H - 2, 14);
  ctx.strokeStyle = `${grade.color}aa`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Symbol (nur wenn geladen – sonst bekommt der Name die volle Breite)
  const S = 104;
  const ix = W - PAD - S;
  const iy = 22;
  if (img) {
    roundRect(ctx, ix - 4, iy - 4, S + 8, S + 8, 10);
    ctx.fillStyle = '#00000066';
    ctx.fill();
    ctx.strokeStyle = grade.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(img, ix, iy, S, S);
  }

  // Name, Seltenheit | Typ
  const textW = (img ? ix - 16 : W - PAD) - PAD;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = grade.color;
  ctx.font = '26px CardBold';
  const lines = wrap(ctx, data.name, textW);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(fitText(ctx, l, textW), PAD, 50 + i * 32));
  const subY = lines.length > 1 ? 118 : 88;
  ctx.font = '19px Card';
  const gradeName = grade[lang === 'de' ? 'de' : 'en'];
  ctx.fillStyle = grade.color;
  ctx.fillText(gradeName, PAD, subY);
  const gw = ctx.measureText(gradeName).width;
  ctx.fillStyle = '#d6d6d6';
  if (typeName) ctx.fillText(`${gradeName ? '  |  ' : ''}${typeName}`, PAD + gw, subY);

  // Werte
  let y = HEADER;
  const divider = () => {
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(PAD, y, W - PAD * 2, 1);
  };
  // Werte stehen je Block in einer gemeinsamen Spalte hinter dem längsten Namen.
  const block = (rows, h, size, color, bullet) => {
    if (!rows.length) return;
    divider();
    y += 10;
    const x = PAD + (bullet ? 20 : 0);
    ctx.font = `${size}px Card`;
    const col = x + Math.max(...rows.map(([name]) => ctx.measureText(name).width)) + 18;
    for (const [name, value] of rows) {
      y += h;
      if (bullet) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(PAD + 6, y - size * 0.35, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `${size}px Card`;
      ctx.fillStyle = '#c8cad0';
      ctx.fillText(name, x, y);
      ctx.font = `${size}px CardBold`;
      ctx.fillStyle = bullet ? '#ffffff' : color;
      ctx.fillText(value, col, y);
    }
    y += 6;
  };
  block(primary, lineH.primary, 22, '#ffffff', false);
  block(secondary, lineH.secondary, 18, '#ffffff', false);
  block(extra, lineH.extra, 18, grade.color, true);

  // Fußzeile
  ctx.font = '13px Card';
  ctx.fillStyle = '#8a8d93';
  ctx.fillText('questlog.gg · Loot and Liberty', PAD, H - 14);

  return canvas.encode('png');
}
