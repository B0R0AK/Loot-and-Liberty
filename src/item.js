const URL_RE_ALL = /<?https?:\/\/[^\s<>]+>?/gi;
const MENTION_RE = /<@[!&]?\d+>|@everyone|@here/g;
const QUESTLOG_RE = /<?(https?:\/\/(?:www\.)?questlog\.gg\/[^\s<>]+)>?/i;

/** Macht aus einem URL-Slug wie "sword2h_aa_t1_nomal_001" einen lesbaren Namen. */
function nameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const words = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
    return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  } catch {
    return null;
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Alle <meta>-Tags als { "og:title": "…", … } – Attribut-Reihenfolge und Anführungszeichen egal. */
export function parseMeta(html) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
    }
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = attrs.content.trim();
  }
  return meta;
}

const SITE_WORDS = /questlog|throne\s*(and|&)\s*liberty|datenbank|database|\bdb\b|^tl$/i;

/** "Lucent - Throne and Liberty Datenbank | Questlog" → "Lucent" */
export function cleanTitle(raw) {
  if (!raw) return null;
  const parts = decodeEntities(raw)
    .split(/\s+[|–—-]\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.find((p) => !SITE_WORDS.test(p)) ?? null;
}

/** Titel/Bild/Beschreibung aus einer HTML-Seite (z. B. Questlog). */
export function extractPreview(html) {
  const meta = parseMeta(html);
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title =
    cleanTitle(meta['og:title']) ?? cleanTitle(meta['twitter:title']) ?? cleanTitle(meta.title) ?? cleanTitle(titleTag);
  return {
    title,
    image: meta['og:image'] ?? meta['twitter:image'] ?? null,
    description: meta['og:description'] ?? meta.description ?? null,
  };
}

/**
 * Holt Titel/Bild/Beschreibung eines Links (z. B. Questlog).
 * Schlägt still fehl – dann wird der Name aus dem Link genommen. Gründe landen im Log.
 */
export async function fetchLinkPreview(url, { timeoutMs = 6000 } = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        accept: 'text/html',
      },
    });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) {
      console.warn(`Link-Vorschau: ${url} → HTTP ${res.status} (${res.headers.get('content-type')})`);
      return {};
    }
    const preview = extractPreview((await res.text()).slice(0, 500_000));
    console.log(`Link-Vorschau: ${url} → Titel: ${preview.title ?? '(keiner)'} · Bild: ${preview.image ? 'ja' : 'nein'}`);
    return preview;
  } catch (err) {
    console.warn(`Link-Vorschau: ${url} → ${err.message}`);
    return {};
  }
}

export function findQuestlogUrl(text = '') {
  return text.match(QUESTLOG_RE)?.[1].replace(/[)\]]+$/, '') ?? null;
}

/**
 * Erkennt ein Item in einer Nachricht aus dem Loot-Kanal:
 * ein Bild-Anhang (Screenshot) und/oder ein Questlog-Link.
 * Gibt `null` zurück, wenn die Nachricht kein Item enthält.
 */
export function detectItem({ content = '', attachments = [] }) {
  const image = attachments.find((a) => a.contentType?.startsWith('image/'));
  const url = findQuestlogUrl(content);
  if (!image && !url) return null;
  const text = content.replace(URL_RE_ALL, ' ').replace(MENTION_RE, ' ').replace(/\s+/g, ' ').trim();
  return {
    name: (text || (url && nameFromUrl(url)) || 'Loot').slice(0, 90),
    nameFromInput: Boolean(text),
    url,
    image: image?.url ?? null,
  };
}
