import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { detectItem, fetchLinkPreview } from './item.js';
import { lootPayload, pingChunks, promptDoneView, promptView } from './render.js';
import { LootSession, purposeById } from './session.js';

const DRAFT_TTL_MS = 30 * 60_000;

export function createLootBot({ client, store, lootChannelIds = [], leaderRoleIds = [], managerIds = [] }) {
  /** Gepostete Items, für die noch ausgewählt wird, wer rollen darf. Key = ID der Item-Nachricht. */
  const drafts = new Map();
  /** Serialisierte Edits pro Verlosung, damit immer der neueste Stand zuletzt ankommt. */
  const renderChains = new Map();

  const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

  function isLootChannel(channel) {
    return channel?.type === ChannelType.GuildText && lootChannelIds.includes(channel.id);
  }

  /** Darf dieses Mitglied Loot posten? Ohne konfigurierte Rollen: jeder im Loot-Kanal. */
  function mayPostLoot(member) {
    if (!leaderRoleIds.length) return true;
    if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    return leaderRoleIds.some((id) => member?.roles?.cache?.has(id));
  }

  /**
   * Ersteller der Verlosung oder explizit freigegebene Nutzer/Rollen (LOOT_MANAGER_IDS).
   * Discord-Berechtigungen wie „Nachrichten verwalten“ oder Admin zählen bewusst nicht.
   */
  function mayManage(interaction, ownerId) {
    if (interaction.user.id === ownerId || managerIds.includes(interaction.user.id)) return true;
    const roles = interaction.member?.roles;
    const roleIds = Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
    return roleIds.some((id) => managerIds.includes(id));
  }

  function mentionsOf(message) {
    return {
      users: [...message.mentions.parsedUsers.values()].filter((u) => !u.bot).map((u) => u.id),
      roles: [...message.mentions.roles.keys()],
    };
  }

  const union = (a, b) => [...new Set([...a, ...b])].slice(0, 100);

  // ---------- 1. Item im Loot-Kanal erkennen ----------

  async function onMessage(message) {
    if (message.author.bot || !isLootChannel(message.channel)) return;

    const item = detectItem({
      content: message.content,
      attachments: [...message.attachments.values()].map((a) => ({ url: a.url, contentType: a.contentType })),
    });

    if (!item) {
      // Nachtrag: "@Name @Rolle" für ein gerade gepostetes Item desselben Users.
      const draft = [...drafts.values()].reverse().find((d) => d.authorId === message.author.id && d.channelId === message.channelId);
      const m = mentionsOf(message);
      if (!draft || (!m.users.length && !m.roles.length)) return;
      draft.selection = { users: union(draft.selection.users, m.users), roles: union(draft.selection.roles, m.roles) };
      await updatePrompt(draft);
      await message.react('✅').catch(() => {});
      return;
    }

    if (!mayPostLoot(message.member)) {
      const r = await message.reply('Nur Leader dürfen hier Loot posten.');
      setTimeout(() => r.delete().catch(() => {}), 10_000);
      return;
    }

    if (item.url && (!item.nameFromInput || !item.image)) {
      const preview = await fetchLinkPreview(item.url);
      if (!item.nameFromInput && preview.title) item.name = preview.title.slice(0, 90);
      item.image ??= preview.image ?? null;
    }

    const draft = {
      id: message.id,
      authorId: message.author.id,
      channelId: message.channelId,
      item,
      selection: mentionsOf(message),
      prompt: null,
    };
    drafts.set(draft.id, draft);
    draft.prompt = await message.reply({ ...promptView(draft), allowedMentions: { users: [draft.authorId] } });

    setTimeout(async () => {
      if (drafts.get(draft.id) !== draft) return;
      drafts.delete(draft.id);
      await draft.prompt.edit({ content: '⌛ Abgelaufen – poste das Item einfach neu.', embeds: [], components: [] }).catch(() => {});
    }, DRAFT_TTL_MS).unref();
  }

  function updatePrompt(draft) {
    return draft.prompt.edit(promptView(draft)).catch((err) => console.error('Prompt-Update fehlgeschlagen:', err.message));
  }

  // ---------- 2. Auswahl, wer rollen darf ----------

  async function getDraft(interaction, id) {
    const draft = drafts.get(id);
    if (!draft) {
      await interaction.update({ content: '⌛ Abgelaufen – poste das Item einfach neu.', embeds: [], components: [] });
      return null;
    }
    if (!mayManage(interaction, draft.authorId)) {
      await interaction.reply(ephemeral(`Nur <@${draft.authorId}> kann das auswählen.`));
      return null;
    }
    return draft;
  }

  async function resolveEligible(guild, { users, roles }) {
    const members = new Map();
    if (roles.length) {
      for (const m of (await guild.members.fetch()).values()) {
        if (!m.user.bot && (roles.includes(guild.id) || roles.some((r) => m.roles.cache.has(r)))) members.set(m.id, m);
      }
    }
    if (users.length) {
      for (const m of (await guild.members.fetch({ user: users })).values()) if (!m.user.bot) members.set(m.id, m);
    }
    return members;
  }

  async function handleDraft(interaction, action, id) {
    const draft = await getDraft(interaction, id);
    if (!draft) return;

    if (action === 'select') {
      draft.selection = { roles: [...interaction.roles.keys()], users: [...interaction.users.keys()] };
      return interaction.update(promptView(draft));
    }

    if (action === 'cancel') {
      drafts.delete(id);
      await interaction.deferUpdate();
      return interaction.message.delete().catch(() => {});
    }

    if (action === 'start') {
      await interaction.deferUpdate();
      const members = await resolveEligible(interaction.guild, draft.selection);
      if (!members.size) return interaction.followUp(ephemeral('⚠️ In der Auswahl sind keine (menschlichen) Mitglieder.'));
      drafts.delete(id);
      await startLoot(interaction, draft, members);
    }
  }

  // ---------- 3. Thread erstellen und anpingen ----------

  async function startLoot(interaction, draft, members) {
    const source = await interaction.channel.messages.fetch(draft.id).catch(() => null);
    if (!source) {
      return interaction.editReply({ content: '⚠️ Die Item-Nachricht wurde gelöscht.', embeds: [], components: [] });
    }
    const thread = source.hasThread
      ? source.thread
      : await source.startThread({ name: `🎲 ${draft.item.name}`.slice(0, 100), autoArchiveDuration: 1440 });

    const session = new LootSession({
      id: draft.id,
      ownerId: draft.authorId,
      item: draft.item,
      eligibleIds: [...members.keys()],
      names: Object.fromEntries([...members.values()].map((m) => [m.id, m.displayName])),
      guildId: interaction.guildId,
      channelId: draft.channelId,
      threadId: thread.id,
      promptMessageId: draft.prompt?.id ?? interaction.message.id,
    });

    const main = await thread.send(lootPayload(session));
    session.messageId = main.id;
    store.set(session);

    const ids = [...members.keys()];
    for (const content of pingChunks(ids, `🎲 **${session.item.name}** – ihr dürft rollen! `)) {
      await thread.send({ content, allowedMentions: { users: ids } });
    }
    await interaction.editReply(promptDoneView(session));
  }

  // ---------- 4. Rollen, Passen, Gewinner ----------

  function render(session) {
    const prev = renderChains.get(session.id) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        const thread = await client.channels.fetch(session.threadId);
        await thread.messages.edit(session.messageId, lootPayload(session));
      })
      .catch((err) => console.error(`Konnte Verlosung ${session.id} nicht aktualisieren:`, err.message));
    renderChains.set(session.id, next);
    return next;
  }

  async function updateChannelPrompt(session) {
    try {
      const channel = await client.channels.fetch(session.channelId);
      await channel.messages.edit(session.promptMessageId, promptDoneView(session));
    } catch (err) {
      console.error('Kanal-Nachricht nicht aktualisiert:', err.message);
    }
  }

  const REASON_TEXT = {
    closed: 'Diese Verlosung ist bereits beendet.',
    'not-eligible': 'Du bist für dieses Item nicht eingetragen.',
    'bad-purpose': 'Unbekannte Auswahl.',
    'not-rolled': 'Dieser Spieler hat nicht gewürfelt.',
  };

  function failText(res) {
    if (res.reason !== 'already') return REASON_TEXT[res.reason] ?? 'Das geht gerade nicht.';
    const p = res.participant;
    return p.status === 'rolled'
      ? `Du hast bereits gewürfelt: **${p.roll}** (${purposeById(p.purpose)?.label}).`
      : 'Du hast bereits gepasst.';
  }

  async function afterDecision(session) {
    store.save();
    await render(session);
    if (session.allDecided) {
      const thread = await client.channels.fetch(session.threadId);
      await thread.send({
        content: `✅ Alle haben entschieden. <@${session.ownerId}>, bitte wähle den Gewinner aus.`,
        allowedMentions: { users: [session.ownerId] },
      });
    }
  }

  async function finish(interaction, session) {
    store.delete(session.id);
    await interaction.deferUpdate();
    await render(session);
    const thread = await client.channels.fetch(session.threadId);
    if (session.winnerId) {
      const p = session.participants.get(session.winnerId);
      await thread.send({
        content: `🏆 <@${session.winnerId}> bekommt **${session.item.name}** (Roll **${p.roll}**, ${purposeById(p.purpose)?.label}).`,
        allowedMentions: { users: [session.winnerId] },
      });
    } else {
      await thread.send('Verlosung ohne Gewinner geschlossen.');
    }
    await updateChannelPrompt(session);
  }

  async function handleLoot(interaction, action, id) {
    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral('Diese Verlosung ist nicht mehr aktiv.'));

    if (action === 'roll') {
      const purpose = interaction.values[0];
      const res = session.roll(interaction.user.id, purpose);
      if (!res.ok) return interaction.reply(ephemeral(failText(res)));
      await interaction.reply(ephemeral(`🎲 Du hast **${res.value}** gewürfelt (${purposeById(purpose).label}).`));
      return afterDecision(session);
    }

    if (action === 'pass') {
      const res = session.pass(interaction.user.id);
      if (!res.ok) return interaction.reply(ephemeral(failText(res)));
      await interaction.reply(ephemeral('🚫 Du hast gepasst.'));
      return afterDecision(session);
    }

    if (!mayManage(interaction, session.ownerId)) {
      return interaction.reply(ephemeral(`Nur <@${session.ownerId}> kann das.`));
    }

    if (action === 'winner') {
      const res = session.chooseWinner(interaction.values[0]);
      if (!res.ok) return interaction.reply(ephemeral(failText(res)));
      return finish(interaction, session);
    }

    if (action === 'close') {
      session.close('no-winner');
      return finish(interaction, session);
    }
  }

  // ---------- Routing ----------

  async function onInteraction(interaction) {
    if (!interaction.isMessageComponent()) return;
    try {
      const [scope, action, id] = interaction.customId.split(':');
      if (scope === 'draft') return await handleDraft(interaction, action, id);
      if (scope === 'loot') return await handleLoot(interaction, action, id);
    } catch (err) {
      console.error('Fehler bei Interaction:', err);
      const msg = ephemeral('❌ Da ist etwas schiefgelaufen. Hat der Bot die Rechte für Threads in diesem Kanal?');
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  }

  async function safeOnMessage(message) {
    try {
      await onMessage(message);
    } catch (err) {
      console.error('Fehler bei Nachricht:', err);
    }
  }

  return { onMessage: safeOnMessage, onInteraction, drafts };
}
