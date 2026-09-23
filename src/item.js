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

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2]) : null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Holt Titel/Bild/Beschreibung aus den OpenGraph-Tags eines Links (z. B. Questlog).
 * Schlägt still fehl – dann wird einfach der Link angezeigt.
 */
export async function fetchLinkPreview(url, { timeoutMs = 4000 } = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LootAndLibertyBot/0.1)' },
    });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) return {};
    const html = (await res.text()).slice(0, 200_000);
    const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
    return {
      title: title?.replace(/\s*[-|–]\s*(Questlog|Throne and Liberty).*$/i, '').trim() || null,
      image: metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'),
      description: metaContent(html, 'og:description'),
    };
  } catch {
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
