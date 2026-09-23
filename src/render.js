import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Status } from './session.js';

const COLORS = { open: 0xf1c40f, won: 0x2ecc71, none: 0x95a5a6 };
const DESC_LIMIT = 4000;

const CLOSE_TEXT = {
  complete: 'Alle haben entschieden',
  timeout: 'Zeit abgelaufen',
  ended: 'Vom Leader beendet',
  cancelled: 'Abgebrochen',
};

function line(p) {
  if (p.status === Status.ROLLED) return `🎲 **${p.roll}** — <@${p.userId}>`;
  if (p.status === Status.PASSED) return `🚫 ~~gepasst~~ — <@${p.userId}>`;
  return `⏳ offen — <@${p.userId}>`;
}

function participantList(session) {
  const lines = session.standings().map(line);
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : lines[i];
    if (next.length > DESC_LIMIT - 40) return `${out}\n… und ${lines.length - i} weitere`;
    out = next;
  }
  return out;
}

export function lootEmbed(session) {
  const { item } = session;
  const c = session.counts();
  const embed = new EmbedBuilder()
    .setTitle(`💰 ${item.name}`)
    .setDescription(participantList(session));

  if (item.url) embed.setURL(item.url);
  if (item.image) embed.setImage(item.image);
  else if (item.thumbnail) embed.setThumbnail(item.thumbnail);

  embed.addFields({ name: 'Würfel', value: `1–${session.rollMax}`, inline: true });
  embed.addFields({
    name: 'Stand',
    value: `🎲 ${c.rolled} · 🚫 ${c.passed} · ⏳ ${c.pending} / ${c.total}`,
    inline: true,
  });

  if (!session.closed) {
    embed.setColor(COLORS.open);
    if (session.endsAt) {
      embed.addFields({ name: 'Endet', value: `<t:${Math.floor(session.endsAt / 1000)}:R>`, inline: true });
    }
    embed.setFooter({ text: 'Klicke auf „Würfeln“ oder „Passen“. Jeder hat genau eine Entscheidung.' });
    return embed;
  }

  const { top, winners, tie } = session.result();
  if (!winners.length) {
    embed.setColor(COLORS.none);
    embed.addFields({ name: 'Ergebnis', value: 'Niemand hat gewürfelt – das Item bleibt übrig.' });
  } else if (tie) {
    embed.setColor(COLORS.open);
    embed.addFields({
      name: 'Ergebnis',
      value: `⚖️ Gleichstand mit **${top}**: ${winners.map((id) => `<@${id}>`).join(', ')}\nDer Leader kann ein Stechen starten.`,
    });
  } else {
    embed.setColor(COLORS.won);
    embed.addFields({ name: 'Gewinner', value: `🏆 <@${winners[0]}> mit **${top}**` });
  }
  embed.setFooter({ text: `Beendet: ${CLOSE_TEXT[session.closeReason] ?? session.closeReason}` });
  return embed;
}

export function lootComponents(session) {
  if (session.closed) {
    if (!session.result().tie || session.tiebreakStarted) return [];
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`loot:tiebreak:${session.id}`)
          .setLabel('Stechen starten')
          .setEmoji('⚖️')
          .setStyle(ButtonStyle.Primary),
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`loot:roll:${session.id}`).setLabel('Würfeln').setEmoji('🎲').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`loot:pass:${session.id}`).setLabel('Passen').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`loot:end:${session.id}`).setLabel('Beenden').setEmoji('🛑').setStyle(ButtonStyle.Danger),
    ),
  ];
}

/** Ping-Text: ausgewählte Rollen und Einzelspieler erwähnen. */
export function mentionContent(session, prefix = '') {
  const parts = [
    ...session.mentionRoleIds.map((id) => `<@&${id}>`),
    ...session.mentionUserIds.map((id) => `<@${id}>`),
  ];
  const text = `${prefix}${parts.join(' ')}`.trim();
  return text.length > 1900 ? `${text.slice(0, 1900)} …` : text;
}

export function messagePayload(session) {
  return { embeds: [lootEmbed(session)], components: lootComponents(session) };
}
