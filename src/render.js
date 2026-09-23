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

function itemEmbed(item, color) {
  const embed = new EmbedBuilder().setTitle(`💰 ${item.name}`).setColor(color);
  if (item.url) embed.setURL(item.url);
  if (item.image) embed.setImage(item.image);
  return embed;
}

// ---------- Kanal: "Wer darf rollen?" ----------

export function promptView(draft) {
  const { users, roles } = draft.selection;
  const picked = [...roles.map((id) => `<@&${id}>`), ...users.map((id) => `<@${id}>`)];
  const embed = itemEmbed(draft.item, COLORS.prompt)
    .setDescription(
      `<@${draft.authorId}>, **wer darf rollen?**\n` +
        'Wähle Spieler oder Rollen aus der Liste oder schreib sie mit `@Name` / `@Rolle` hier in den Kanal.',
    )
    .addFields({ name: 'Ausgewählt', value: fit(picked, ', ') });

  return {
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

/** Kanal-Nachricht, nachdem der Thread erstellt wurde. */
export function promptDoneView(session) {
  const embed = new EmbedBuilder().setTitle(`💰 ${session.item.name}`);
  if (session.item.url) embed.setURL(session.item.url);
  const thread = `<#${session.threadId}>`;
  if (session.winnerId) {
    const p = session.participants.get(session.winnerId);
    embed
      .setColor(COLORS.won)
      .setDescription(`🏆 Vergeben an <@${session.winnerId}> (**${p.roll}**, ${purposeById(p.purpose)?.label}) · ${thread}`);
  } else if (session.closed) {
    embed.setColor(COLORS.none).setDescription(`Ohne Gewinner geschlossen · ${thread}`);
  } else {
    const c = session.counts();
    embed.setColor(COLORS.open).setDescription(`🎲 Rollen läuft in ${thread} · ${c.total - c.pending}/${c.total} haben entschieden`);
  }
  return { content: '', embeds: [embed], components: [] };
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

export function lootEmbed(session) {
  const c = session.counts();
  const color = !session.closed ? COLORS.open : session.winnerId ? COLORS.won : COLORS.none;
  const lines = rollLines(session);
  const embed = itemEmbed(session.item, color).setDescription(
    lines.length ? fit(lines, '\n', 4000) : '*Noch keine Würfe.*',
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
  } else {
    embed.setFooter({
      text: `Würfel 1–${session.rollMax} · ${c.total - c.pending}/${c.total} entschieden · Nur ausgewählte Spieler können würfeln oder passen.`,
    });
  }
  return embed;
}

export function lootComponents(session) {
  if (session.closed) return [];
  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`loot:roll:${session.id}`)
        .setPlaceholder('🎲 Würfeln für …')
        .addOptions(PURPOSES.map((p) => ({ label: p.label, value: p.id, emoji: p.emoji }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`loot:pass:${session.id}`).setLabel('Passen').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`loot:close:${session.id}`)
        .setLabel('Ohne Gewinner schließen')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
  const rolls = session.rolls().slice(0, MAX_SELECT);
  if (rolls.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`loot:winner:${session.id}`)
          .setPlaceholder('👑 Gewinner auswählen (nur Ersteller)')
          .addOptions(
            rolls.map((r) => {
              const p = purposeById(r.purpose);
              return {
                label: `${session.nameOf(r.userId)} – ${r.roll}`.slice(0, 100),
                description: p.label,
                emoji: p.emoji,
                value: r.userId,
              };
            }),
          ),
      ),
    );
  }
  return rows;
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
