import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { PURPOSES, Status, purposeById } from './session.js';

export const MAX_SELECT = 25;
const COLORS = { prompt: 0x5865f2, open: 0xe8b04a, locked: 0xe67e22, won: 0x2ecc71, none: 0x80848e };
const ITEM_ICON = '🎁';

/** Fortschrittsbalken, z. B. ▰▰▰▰▰▰▱▱▱▱ */
export function progressBar(done, total, width = 10) {
  const filled = total ? Math.round((done / total) * width) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

const ts = (ms, style) => `<t:${Math.floor(ms / 1000)}:${style}>`;

/** Auswahl für die Rollzeit (Stunden). */
export const ROLL_HOUR_CHOICES = [1, 2, 4, 6, 12, 24, 48, 72];
export const hoursLabel = (h) => (h === 1 ? '1 Stunde' : `${h} Stunden`);

function hourOptions(selected) {
  const hours = [...new Set([...ROLL_HOUR_CHOICES, selected])].filter(Boolean).sort((a, b) => a - b);
  return hours.map((h) => ({ label: hoursLabel(h), value: String(h), emoji: '⏰', default: h === selected }));
}
const FIELD_LIMIT = 1024;

/** Liste von Zeilen/Erwähnungen so kürzen, dass sie in ein Feld passt. */
function fit(items, sep, limit = FIELD_LIMIT) {
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const next = out ? `${out}${sep}${items[i]}` : items[i];
    if (next.length > limit - 30) return `${out}${sep}… und ${items.length - i} weitere`;
    out = next;
  }
  return out || '–';
}

function itemEmbed(item, color, { image = true } = {}) {
  const embed = new EmbedBuilder().setTitle(`${ITEM_ICON} ${item.name}`).setColor(color);
  if (item.url) embed.setURL(item.url);
  if (image && item.image) embed.setImage(item.image);
  return embed;
}

// ---------- Leader-Kanal: "Wer darf rollen?" ----------

/** Erwähnungen für { users, roles } – Rollen zuerst. */
const mentionList = ({ users = [], roles = [] }) => [...roles.map((id) => `<@&${id}>`), ...users.map((id) => `<@${id}>`)];

/** Ersteller + gewählte Verwalter als Erwähnungen. */
export function managerMentions(ownerId, managers) {
  return mentionList({ roles: managers.roles, users: [ownerId, ...managers.users.filter((id) => id !== ownerId)] });
}

export function promptView(draft) {
  const picked = mentionList(draft.selection);
  const embed = itemEmbed(draft.item, COLORS.prompt, { image: false })
    .setDescription(
      '### 👥 Wer darf rollen?\n' +
        'Wähle unten Spieler oder Rollen aus – oder schreib `@Name` / `@Rolle` hier in den Kanal.\n' +
        `-# Danach landet das Item in <#${draft.lootChannelId}> und alle Ausgewählten werden gepingt.`,
    )
    .addFields(
      { name: `🎲 Darf rollen${picked.length ? ` (${picked.length})` : ''}`, value: picked.length ? fit(picked, ' ') : '*noch niemand*' },
      { name: '👑 Verwaltet von', value: fit(managerMentions(draft.authorId, draft.managers), ' '), inline: true },
      { name: '⏰ Rollzeit', value: hoursLabel(draft.rollHours), inline: true },
    );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`draft:select:${draft.id}`)
          .setPlaceholder('🎲 Wer darf rollen? Spieler oder Rollen …')
          .setMinValues(1)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`draft:managers:${draft.id}`)
          .setPlaceholder('👑 Wer verwaltet? Leader oder Leader-Rollen (optional) …')
          .setMinValues(0)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`draft:hours:${draft.id}`)
          .setPlaceholder('⏰ Rollzeit …')
          .addOptions(hourOptions(draft.rollHours)),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`draft:start:${draft.id}`)
          .setLabel('Posten & Spieler pingen')
          .setEmoji('📣')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!picked.length),
        new ButtonBuilder().setCustomId(`draft:rename:${draft.id}`).setLabel('Namen ändern').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`draft:cancel:${draft.id}`).setLabel('Abbrechen').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ---------- Leader-Kanal: Verwaltungs-Panel ----------

export function panelView(session) {
  const embed = lootEmbed(session, { panel: true });
  if (session.closed) return { content: '', embeds: [embed], components: [] };

  const rows = [];
  const rolls = session.rolls().slice(0, MAX_SELECT);
  if (rolls.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:winner:${session.id}`)
          .setPlaceholder('👑 Gewinner auswählen …')
          .addOptions(
            rolls.map((r) => {
              const p = purposeById(r.purpose);
              return { label: `${session.nameOf(r.userId)} – ${r.roll}`.slice(0, 100), description: p.label, emoji: p.emoji, value: r.userId };
            }),
          ),
      ),
    );
  }
  if (session.rollingOpen) rows.push(
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`panel:add:${session.id}`)
        .setPlaceholder('➕ Spieler oder Rollen hinzufügen …')
        .setMinValues(1)
        .setMaxValues(MAX_SELECT),
    ),
  );
  const decided = session.decided().slice(0, MAX_SELECT);
  if (decided.length && session.rollingOpen) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:reset:${session.id}`)
          .setPlaceholder('↩️ Entscheidung zurücksetzen …')
          .addOptions(
            decided.map((d) => ({
              label: session.nameOf(d.userId).slice(0, 100),
              description: d.status === Status.ROLLED ? `${d.roll} · ${purposeById(d.purpose).label}` : d.roll === null ? 'gepasst' : `gepasst (hatte ${d.roll})`,
              emoji: d.status === Status.ROLLED ? '🎲' : '🚫',
              value: d.userId,
            })),
          ),
      ),
    );
  }
  if (session.rollingOpen) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:time:${session.id}`)
          .setPlaceholder('⏰ Rollzeit ändern …')
          .addOptions(ROLL_HOUR_CHOICES.map((h) => ({ label: `Endet in ${hoursLabel(h)}`, description: 'ab jetzt gerechnet', value: String(h), emoji: '⏰' }))),
      ),
    );
  }
  const buttons = [];
  if (session.rollingOpen) {
    buttons.push(
      new ButtonBuilder().setCustomId(`panel:lock:${session.id}`).setLabel('Rollen jetzt beenden').setEmoji('⏹️').setStyle(ButtonStyle.Primary),
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId(`panel:rename:${session.id}`).setLabel('Namen ändern').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel:close:${session.id}`).setLabel('Ohne Gewinner schließen').setStyle(ButtonStyle.Danger),
  );
  rows.push(new ActionRowBuilder().addComponents(buttons));
  return { content: '', embeds: [embed], components: rows };
}

// ---------- Thread: Roll-Liste ----------

/** Würfe nach Grund gruppiert; der höchste Wurf je Grund ist hervorgehoben. */
function rollLines(session) {
  const lines = [];
  let current = null;
  for (const r of session.rolls()) {
    const first = r.purpose !== current;
    if (first) {
      current = r.purpose;
      const p = purposeById(current);
      lines.push(`**${p.emoji} ${p.label}**`);
    }
    const num = `\`${String(r.roll).padStart(3, ' ')}\``;
    const crown = r.userId === session.winnerId ? ' 🏆' : '';
    lines.push(`> ${first ? `**${num}**` : num}  <@${r.userId}>${crown}`);
  }
  return lines;
}

/**
 * Roll-Liste – im Thread und im Leader-Panel (dort mit Link zum Thread).
 * Ohne Bild: Das Item steht jeweils direkt darüber.
 */
export function lootEmbed(session, { panel = false } = {}) {
  const c = session.counts();
  const decided = c.total - c.pending;
  const color = session.winnerId ? COLORS.won : session.closed ? COLORS.none : session.rollsLocked ? COLORS.locked : COLORS.open;

  const head = [];
  if (panel) head.push(`🧵 <#${session.threadId}> · 👑 ${managerMentions(session.ownerId, session.managers).join(' ')}`);
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    const p = purposeById(w.purpose);
    head.push(`### 🏆 <@${session.winnerId}> gewinnt`, `mit **${w.roll}** · ${p.emoji} ${p.label}`);
  } else if (session.closed) {
    head.push('### ✖️ Ohne Gewinner geschlossen');
  } else if (session.rollsLocked) {
    head.push('### ⏹️ Rollzeit vorbei', 'Der Leader wählt jetzt den Gewinner.');
  } else {
    if (session.endsAt) head.push(`⏰ Rollzeit endet **${ts(session.endsAt, 'R')}**`);
    head.push(`\`${progressBar(decided, c.total)}\` **${decided}**/${c.total} entschieden`);
  }

  const lines = rollLines(session);
  const body = lines.length ? fit(lines, '\n', 3600) : '*Noch keine Würfe – wähle unten, wofür du rollst.*';
  const embed = itemEmbed(session.item, color, { image: false }).setDescription(`${head.join('\n')}\n\n${body}`);

  // Wer nach dem Würfeln gepasst hat, behält seinen (verworfenen) Wurf durchgestrichen.
  const passed = session.withStatus(Status.PASSED).map((id) => {
    const roll = session.participants.get(id).roll;
    return roll === null ? `<@${id}>` : `<@${id}> ~~${roll}~~`;
  });
  const pending = session.withStatus(Status.PENDING).map((id) => `<@${id}>`);
  if (passed.length) embed.addFields({ name: `🚫 Gepasst · ${passed.length}`, value: fit(passed, ' '), inline: true });
  if (pending.length && session.rollingOpen) embed.addFields({ name: `⏳ Noch offen · ${pending.length}`, value: fit(pending, ' '), inline: true });

  if (session.closed) {
    embed.setFooter({ text: 'Verlosung abgeschlossen' });
  } else if (session.rollsLocked) {
    embed.setFooter({ text: `${c.rolled} gewürfelt · ${c.passed} gepasst${c.pending ? ` · ${c.pending} ohne Entscheidung` : ''}` });
  } else {
    embed.setFooter({ text: panel ? 'Rollzeit endet' : `🎲 1–${session.rollMax} · nur ausgewählte Spieler · Rollzeit endet` });
    if (session.endsAt) embed.setTimestamp(session.endsAt);
  }
  return embed;
}

/** Spieler-Bedienung im Thread: nur Würfeln und Passen. */
export function lootComponents(session) {
  if (!session.rollingOpen) return [];
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`loot:roll:${session.id}`)
        .setPlaceholder('🎲 Würfeln für …')
        .addOptions(PURPOSES.map((p) => ({ label: p.label, value: p.id, emoji: p.emoji }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`loot:pass:${session.id}`).setLabel('Passen').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Text der Item-Nachricht im Loot-Kanal (das Bild hängt als Datei daran). */
export function starterContent(session) {
  const { item } = session;
  const c = session.counts();
  const link = item.url ? ` · [Questlog](<${item.url}>)` : '';
  let status;
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    const p = purposeById(w.purpose);
    status = `🏆 **Vergeben an <@${session.winnerId}>** · ${w.roll} · ${p.emoji} ${p.label}`;
  } else if (session.closed) status = '✖️ **Ohne Gewinner geschlossen**';
  else if (session.rollsLocked) status = '⏹️ **Rollzeit vorbei** · der Leader wählt den Gewinner';
  else status = `🎲 **Verlosung läuft** · endet ${ts(session.endsAt, 'f')} (${ts(session.endsAt, 'R')})`;
  return `## ${ITEM_ICON} ${item.name}\n${status}\n-# 👥 ${c.total} Spieler${link} · Würfeln & Passen im Thread ↓`;
}

/**
 * Kompakte Ergebnis-Karte für den Leader-Kanal nach dem Abschluss:
 * kleines Item-Bild, Gewinner mit Wurf und Grund, Link zum Thread.
 */
export function summaryEmbed(session, imageName = null, { forLootChannel = false } = {}) {
  const c = session.counts();
  const color = session.winnerId ? COLORS.won : session.closed ? COLORS.none : COLORS.locked;
  const embed = new EmbedBuilder().setTitle(`${ITEM_ICON} ${session.item.name}`).setColor(color);
  if (session.item.url) embed.setURL(session.item.url);
  if (imageName) embed.setThumbnail(`attachment://${imageName}`);

  let result;
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    const p = purposeById(w.purpose);
    result = `🏆 **Gewinner:** <@${session.winnerId}>\n🎲 **${w.roll}** · ${p.emoji} ${p.label}`;
  } else if (session.closed) {
    result = '✖️ **Ohne Gewinner geschlossen**';
  } else {
    result = '⏹️ **Rollzeit vorbei**\nDer Gewinner wird gerade gewählt.';
  }
  // Im Loot-Kanal hängt der Thread direkt darunter – dort reicht die Statistik.
  const extra = forLootChannel ? '' : ` · 🧵 <#${session.threadId}> · 👑 <@${session.ownerId}>`;
  embed.setDescription(`${result}\n-# ${c.rolled} gewürfelt · ${c.passed} gepasst${extra}`);
  if (session.closed) embed.setTimestamp();
  return embed;
}

/** Eingabefenster zum Umbenennen eines Items (scope: 'draft' oder 'panel'). */
export function renameModal(scope, id, currentName) {
  return new ModalBuilder()
    .setCustomId(`rename:${scope}:${id}`)
    .setTitle('Item-Namen ändern')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Name des Items')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(90)
          .setValue(currentName.slice(0, 90)),
      ),
    );
}

/** Eine Zeile für /loot offen. */
export function openSessionLine(session) {
  const c = session.counts();
  const state = session.rollsLocked ? '⏹️ Gewinner offen' : `⏰ endet ${ts(session.endsAt, 'R')}`;
  const panel = `https://discord.com/channels/${session.guildId}/${session.panelChannelId}/${session.panelMessageId}`;
  return `${ITEM_ICON} **${session.item.name}** · ${state} · 🎲 ${c.total - c.pending}/${c.total} · <#${session.threadId}> · [Panel](${panel})`;
}

export const HELP_TEXT = [
  '## 🎁 Loot and Liberty',
  '**So läuft eine Verlosung**',
  '1. Leader posten einen Screenshot oder Questlog-Link im **Leader-Kanal**.',
  '2. Im Fenster darunter wählen sie, **wer rollen darf**, **wer verwaltet** und die **Rollzeit**.',
  '3. Der Bot postet das Item im **Loot-Kanal** mit Thread und pingt die Spieler an.',
  '4. Spieler wählen im Thread, wofür sie würfeln (⭐ BiS · 💧 Watermark · 📜 Lithografie · 💰 Verkauf · ✨ Potential), oder passen – auch noch nach dem Würfeln. Neu würfeln geht nur, wenn der Leader sie zurücksetzt.',
  '5. Die Verwalter wählen im **Leader-Panel** den Gewinner. Dort können sie auch Spieler hinzufügen, Entscheidungen zurücksetzen und die Rollzeit ändern.',
  '',
  '**Befehle**',
  '`/loot offen` – laufende Verlosungen (Leader)',
  '`/leader liste` – alle Loot-Leader',
  '`/leader hinzufügen` · `/leader entfernen` – Leader festlegen (Bot-Admins)',
  '`/einrichten` – Kanäle und Standard-Rollzeit (Bot-Admins)',
  '`/hilfe` – diese Übersicht',
].join('\n');

export function lootPayload(session) {
  return { embeds: [lootEmbed(session)], components: lootComponents(session) };
}

/** Pings für alle Teilnehmer, aufgeteilt auf Nachrichten unter 2000 Zeichen. */
export function pingChunks(userIds, prefix = '') {
  const chunks = [];
  let cur = prefix;
  for (const id of userIds) {
    const m = `<@${id}>`;
    if (cur.length + m.length + 1 > 1900) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += `${m} `;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}
