import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { fetchLinkPreview, parseItemInput } from './item.js';
import { messagePayload, mentionContent } from './render.js';
import { LootSession } from './session.js';

const DRAFT_TTL_MS = 15 * 60_000;
const KEEP_CLOSED_MS = 60 * 60_000;
const MAX_SELECT = 25;

export function createLootBot({ leaderRoleIds = [], defaultMinutes = 10 } = {}) {
  /** Entwürfe aus /loot, bis der Leader Teilnehmer gewählt und gepostet hat. */
  const drafts = new Map();
  /** Laufende (und kürzlich beendete) Verlosungen. */
  const sessions = new Map();

  function isLeader(interaction) {
    if (leaderRoleIds.length) {
      const roles = interaction.member?.roles;
      const ids = Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
      if (ids.some((id) => leaderRoleIds.includes(id))) return true;
    }
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    return !leaderRoleIds.length && Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages));
  }

  const ephemeral = (content, extra = {}) => ({ content, flags: MessageFlags.Ephemeral, ...extra });

  // ---------- Setup: /loot ----------

  function setupView(draft) {
    const { users, roles } = draft.selection;
    const picked = [...roles.map((id) => `<@&${id}>`), ...users.map((id) => `<@${id}>`)];
    const embed = new EmbedBuilder()
      .setTitle(`💰 ${draft.item.name}`)
      .setColor(0x5865f2)
      .setDescription(
        picked.length
          ? `**Berechtigt:** ${picked.join(', ')}`
          : 'Wähle unten Spieler und/oder Rollen aus, die auf das Item würfeln dürfen.',
      )
      .addFields({ name: 'Dauer', value: `${draft.minutes} Min.`, inline: true });
    if (draft.item.url) embed.setURL(draft.item.url);
    if (draft.item.image) embed.setImage(draft.item.image);

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new MentionableSelectMenuBuilder()
            .setCustomId(`setup:select:${draft.id}`)
            .setPlaceholder('Spieler oder Rollen auswählen …')
            .setMinValues(1)
            .setMaxValues(MAX_SELECT),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`setup:post:${draft.id}`)
            .setLabel('Posten')
            .setEmoji('📣')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!picked.length),
          new ButtonBuilder().setCustomId(`setup:cancel:${draft.id}`).setLabel('Abbrechen').setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
  }

  async function handleLootCommand(interaction) {
    if (!isLeader(interaction)) {
      return interaction.reply(ephemeral('Nur Leader dürfen Loot verteilen.'));
    }
    const attachment = interaction.options.getAttachment('bild');
    if (attachment && !attachment.contentType?.startsWith('image/')) {
      return interaction.reply(ephemeral('Der Anhang muss ein Bild sein (Screenshot des Items).'));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parsed = parseItemInput(interaction.options.getString('item', true));
    const preview = parsed.url ? await fetchLinkPreview(parsed.url) : {};
    const item = {
      name: (parsed.nameFromInput ? parsed.name : preview.title || parsed.name).slice(0, 200),
      url: parsed.url,
      image: attachment?.url ?? preview.image ?? null,
    };

    const draft = {
      id: interaction.id,
      leaderId: interaction.user.id,
      channelId: interaction.channelId,
      item,
      minutes: interaction.options.getInteger('dauer') ?? defaultMinutes,
      selection: { users: [], roles: [] },
    };
    drafts.set(draft.id, draft);
    setTimeout(() => drafts.delete(draft.id), DRAFT_TTL_MS).unref();

    await interaction.editReply(setupView(draft));
  }

  function getDraft(interaction, id) {
    const draft = drafts.get(id);
    if (!draft || draft.leaderId !== interaction.user.id) return null;
    return draft;
  }

  async function handleSetupSelect(interaction, id) {
    const draft = getDraft(interaction, id);
    if (!draft) return interaction.update({ content: 'Dieser Entwurf ist abgelaufen. Starte neu mit `/loot`.', embeds: [], components: [] });
    draft.selection = {
      roles: [...interaction.roles.keys()],
      users: [...interaction.users.keys()],
    };
    await interaction.update(setupView(draft));
  }

  async function resolveEligible(guild, { users, roles }) {
    const ids = new Set();
    if (roles.length) {
      const members = await guild.members.fetch();
      for (const m of members.values()) {
        if (m.user.bot) continue;
        if (roles.includes(guild.id) || roles.some((r) => m.roles.cache.has(r))) ids.add(m.id);
      }
    }
    if (users.length) {
      const members = await guild.members.fetch({ user: users });
      for (const m of members.values()) if (!m.user.bot) ids.add(m.id);
    }
    return [...ids];
  }

  async function handleSetupPost(interaction, id) {
    const draft = getDraft(interaction, id);
    if (!draft) return interaction.update({ content: 'Dieser Entwurf ist abgelaufen. Starte neu mit `/loot`.', embeds: [], components: [] });
    await interaction.deferUpdate();

    const eligible = await resolveEligible(interaction.guild, draft.selection);
    if (!eligible.length) {
      return interaction.editReply({ content: '⚠️ Die Auswahl enthält keine (menschlichen) Mitglieder.', ...setupView(draft) });
    }
    drafts.delete(id);

    const session = await startSession({
      channel: interaction.channel ?? (await interaction.client.channels.fetch(draft.channelId)),
      leaderId: draft.leaderId,
      item: draft.item,
      eligibleIds: eligible,
      minutes: draft.minutes,
      mentionRoleIds: draft.selection.roles,
      mentionUserIds: draft.selection.users,
    });
    await interaction.editReply({
      content: `✅ Verlosung gepostet: ${session.url} (${eligible.length} Teilnehmer)`,
      embeds: [],
      components: [],
    });
  }

  async function handleSetupCancel(interaction, id) {
    drafts.delete(id);
    await interaction.update({ content: 'Abgebrochen.', embeds: [], components: [] });
  }

  // ---------- Laufende Verlosung ----------

  async function startSession({ channel, leaderId, item, eligibleIds, minutes, mentionRoleIds, mentionUserIds, prefix = '' }) {
    const session = new LootSession({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      leaderId,
      item,
      eligibleIds,
      endsAt: Date.now() + minutes * 60_000,
      mentionRoleIds,
      mentionUserIds,
    });
    session.minutes = minutes;
    session.channel = channel;
    session.renderChain = Promise.resolve();

    const message = await channel.send({
      content: mentionContent(session, prefix),
      allowedMentions: { roles: mentionRoleIds.filter((r) => r !== channel.guild.id), users: mentionUserIds, parse: mentionRoleIds.includes(channel.guild.id) ? ['everyone'] : [] },
      ...messagePayload(session),
    });
    session.messageId = message.id;
    session.url = message.url;
    sessions.set(session.id, session);
    session.timer = setTimeout(() => finish(session, 'timeout').catch(console.error), minutes * 60_000);
    return session;
  }

  /** Nachricht neu rendern – serialisiert, damit immer der neueste Stand zuletzt ankommt. */
  function render(session) {
    session.renderChain = session.renderChain
      .then(() => session.channel.messages.edit(session.messageId, messagePayload(session)))
      .catch((err) => console.error(`Konnte Verlosung ${session.id} nicht aktualisieren:`, err.message));
    return session.renderChain;
  }

  async function finish(session, reason) {
    if (!session.close(reason)) return;
    clearTimeout(session.timer);
    await render(session);

    const { top, winners, tie } = session.result();
    if (winners.length && !tie) {
      await session.channel
        .send({
          content: `🏆 <@${winners[0]}> gewinnt **${session.item.name}** mit einer **${top}**!`,
          reply: { messageReference: session.messageId, failIfNotExists: false },
          allowedMentions: { users: [winners[0]] },
        })
        .catch((err) => console.error('Gewinner-Nachricht fehlgeschlagen:', err.message));
    }
    setTimeout(() => sessions.delete(session.id), tie ? KEEP_CLOSED_MS : 0).unref();
  }

  const REASON_TEXT = {
    closed: 'Diese Verlosung ist bereits beendet.',
    'not-eligible': 'Du bist für dieses Item nicht eingetragen.',
  };

  async function handleDecision(interaction, session, action) {
    const res = action === 'roll' ? session.roll(interaction.user.id) : session.pass(interaction.user.id);
    if (!res.ok) {
      const text =
        res.reason === 'already'
          ? res.participant.status === 'rolled'
            ? `Du hast bereits gewürfelt: **${res.participant.roll}**.`
            : 'Du hast bereits gepasst.'
          : REASON_TEXT[res.reason];
      return interaction.reply(ephemeral(text));
    }
    await interaction.deferUpdate();
    if (session.allDecided) await finish(session, 'complete');
    else await render(session);
  }

  async function handleLootButton(interaction, action, id) {
    const session = sessions.get(id);
    if (!session) {
      return interaction.reply(ephemeral('Diese Verlosung ist nicht mehr aktiv (beendet oder Bot wurde neu gestartet).'));
    }

    if (action === 'roll' || action === 'pass') return handleDecision(interaction, session, action);

    if (interaction.user.id !== session.leaderId && !isLeader(interaction)) {
      return interaction.reply(ephemeral('Nur der Leader kann das.'));
    }

    if (action === 'end') {
      await interaction.deferUpdate();
      return finish(session, 'ended');
    }

    if (action === 'tiebreak') {
      const { winners, tie } = session.result();
      if (!tie || session.tiebreakStarted) return interaction.reply(ephemeral('Hier gibt es kein offenes Stechen.'));
      session.tiebreakStarted = true;
      sessions.delete(session.id);
      await interaction.deferUpdate();
      await render(session);
      await startSession({
        channel: session.channel,
        leaderId: session.leaderId,
        item: session.item,
        eligibleIds: winners,
        minutes: session.minutes,
        mentionRoleIds: [],
        mentionUserIds: winners,
        prefix: '⚖️ **Stechen!** ',
      });
    }
  }

  // ---------- Routing ----------

  async function onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'loot') {
        return await handleLootCommand(interaction);
      }
      if (!interaction.isMessageComponent()) return;
      const [scope, action, id] = interaction.customId.split(':');
      if (scope === 'setup') {
        if (action === 'select' && interaction.isMentionableSelectMenu()) return await handleSetupSelect(interaction, id);
        if (action === 'post') return await handleSetupPost(interaction, id);
        if (action === 'cancel') return await handleSetupCancel(interaction, id);
      }
      if (scope === 'loot') return await handleLootButton(interaction, action, id);
    } catch (err) {
      console.error('Fehler bei Interaction:', err);
      const msg = ephemeral('❌ Da ist etwas schiefgelaufen. Prüfe, ob der Bot in diesem Kanal schreiben darf.');
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  }

  return { onInteraction, sessions, drafts };
}
