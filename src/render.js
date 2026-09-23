import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { PURPOSES, Status, purposeById } from './session.js';

export const MAX_SELECT = 25;
const COLORS = { prompt: 0x5865f2, open: 0xf1c40f, won: 0x2ecc71, none: 0x95a5a6 };
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
  const embed = new EmbedBuilder().setTitle(`💰 ${item.name}`).setColor(color);
  if (item.url) embed.setURL(item.url);
  if (image && item.image) embed.setImage(item.image);
  return embed;
}

// ---------- Leader-Kanal: "Wer darf rollen?" ----------

export function promptView(draft) {
  const { users, roles } = draft.selection;
  const picked = [...roles.map((id) => `<@&${id}>`), ...users.map((id) => `<@${id}>`)];
  const embed = itemEmbed(draft.item, COLORS.prompt)
    .setDescription(
      `<@${draft.authorId}> hat ein Item gepostet${draft.sourceUrl ? ` ([zum Post](${draft.sourceUrl}))` : ''}.\n` +
        '**Wer darf rollen?** Wähle Spieler oder Rollen aus der Liste oder schreib sie mit `@Name` / `@Rolle` hier in den Kanal.',
    )
    .addFields({ name: 'Ausgewählt', value: fit(picked, ', ') });

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`draft:select:${draft.id}`)
          .setPlaceholder('Spieler oder Rollen auswählen …')
          .setMinValues(1)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`draft:start:${draft.id}`)
          .setLabel('Thread erstellen')
          .setEmoji('🧵')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!picked.length),
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
  rows.push(
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`panel:add:${session.id}`)
        .setPlaceholder('➕ Spieler oder Rollen hinzufügen …')
        .setMinValues(1)
        .setMaxValues(MAX_SELECT),
    ),
  );
  const decided = session.decided().slice(0, MAX_SELECT);
  if (decided.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:reset:${session.id}`)
          .setPlaceholder('↩️ Entscheidung zurücksetzen …')
          .addOptions(
            decided.map((d) => ({
              label: session.nameOf(d.userId).slice(0, 100),
              description: d.status === Status.ROLLED ? `${d.roll} · ${purposeById(d.purpose).label}` : 'gepasst',
              emoji: d.status === Status.ROLLED ? '🎲' : '🚫',
              value: d.userId,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`panel:close:${session.id}`).setLabel('Ohne Gewinner schließen').setStyle(ButtonStyle.Danger),
    ),
  );
  return { content: '', embeds: [embed], components: rows };
}

// ---------- Thread: Roll-Liste ----------

function rollLines(session) {
  const lines = [];
  let current = null;
  for (const r of session.rolls()) {
    if (r.purpose !== current) {
      current = r.purpose;
      const p = purposeById(current);
      lines.push(`${lines.length ? '\n' : ''}**${p.emoji} ${p.label}**`);
    }
    const crown = r.userId === session.winnerId ? ' 🏆' : '';
    lines.push(`\`${String(r.roll).padStart(3, ' ')}\` <@${r.userId}>${crown}`);
  }
  return lines;
}

/**
 * Roll-Liste. Im Thread ohne Bild (der Item-Post steht direkt darüber),
 * im Leader-Panel mit Bild und Link zum Thread.
 */
export function lootEmbed(session, { panel = false } = {}) {
  const c = session.counts();
  const color = !session.closed ? COLORS.open : session.winnerId ? COLORS.won : COLORS.none;
  const lines = rollLines(session);
  const head = panel ? `🧵 <#${session.threadId}> · von <@${session.ownerId}>\n\n` : '';
  const embed = itemEmbed(session.item, color, { image: panel }).setDescription(
    head + (lines.length ? fit(lines, '\n', 3900) : '*Noch keine Würfe.*'),
  );

  const passed = session.withStatus(Status.PASSED).map((id) => `<@${id}>`);
  const pending = session.withStatus(Status.PENDING).map((id) => `<@${id}>`);
  if (passed.length) embed.addFields({ name: `🚫 Gepasst (${passed.length})`, value: fit(passed, ' ') });
  if (pending.length && !session.closed) embed.addFields({ name: `⏳ Offen (${pending.length})`, value: fit(pending, ' ') });

  if (session.winnerId) {
    embed.addFields({ name: 'Gewinner', value: `🏆 <@${session.winnerId}>` });
    embed.setFooter({ text: 'Verlosung abgeschlossen' });
  } else if (session.closed) {
    embed.setFooter({ text: 'Ohne Gewinner geschlossen' });
  } else if (panel) {
    embed.setFooter({ text: `${c.total - c.pending}/${c.total} entschieden` });
  } else {
    embed.setFooter({
      text: `Würfel 1–${session.rollMax} · ${c.total - c.pending}/${c.total} entschieden · Nur ausgewählte Spieler können würfeln oder passen.`,
    });
  }
  return embed;
}

/** Spieler-Bedienung im Thread: nur Würfeln und Passen. */
export function lootComponents(session) {
  if (session.closed) return [];
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
