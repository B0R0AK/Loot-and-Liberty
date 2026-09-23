import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { detectItem, fetchLinkPreview } from './item.js';
import { lootPayload, panelView, pingChunks, promptView } from './render.js';
import { LootSession, purposeById } from './session.js';

const DRAFT_TTL_MS = 30 * 60_000;

/**
 * Ablauf:
 *  1. Item-Post im Loot-Kanal  →  Panel „Wer darf rollen?“ im Leader-Kanal
 *  2. Leader wählt aus          →  Thread am Item-Post mit Roll-Liste + Pings
 *  3. Spieler würfeln/passen    →  Liste im Thread und Panel aktualisieren sich
 *  4. Leader im Panel: Gewinner wählen, zurücksetzen, hinzufügen, schließen
 */
export function createLootBot({ client, store, lootChannelIds = [], leaderChannelId = null, leaderRoleIds = [], managerIds = [] }) {
  /** Gepostete Items, für die noch ausgewählt wird, wer rollen darf. Key = ID der Item-Nachricht. */
  const drafts = new Map();
  /** Serialisierte Edits pro Nachricht, damit immer der neueste Stand zuletzt ankommt. */
  const editChains = new Map();

  const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

  const isLootChannel = (channel) => channel?.type === ChannelType.GuildText && lootChannelIds.includes(channel.id);
  const isPanelChannel = (channel) => (leaderChannelId ? channel?.id === leaderChannelId : isLootChannel(channel));

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

  async function panelChannelFor(message) {
    if (!leaderChannelId) return message.channel;
    return client.channels.fetch(leaderChannelId);
  }

  // ---------- 1. Item im Loot-Kanal erkennen ----------

  async function onMessage(message) {
    if (message.author.bot) return;
    const inLoot = isLootChannel(message.channel);
    if (!inLoot && !isPanelChannel(message.channel)) return;

    const item = inLoot
      ? detectItem({
          content: message.content,
          attachments: [...message.attachments.values()].map((a) => ({ url: a.url, contentType: a.contentType })),
        })
      : null;

    if (!item) return addMentionsToDraft(message);

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
      sourceUrl: message.url,
      item,
      selection: mentionsOf(message),
      prompt: null,
    };
    drafts.set(draft.id, draft);

    const panelChannel = await panelChannelFor(message);
    draft.prompt = await panelChannel.send({ ...promptView(draft), allowedMentions: { users: [draft.authorId] } });
    await message.react('⏳').catch(() => {});

    setTimeout(async () => {
      if (drafts.get(draft.id) !== draft) return;
      drafts.delete(draft.id);
      await draft.prompt.edit({ content: '⌛ Abgelaufen – poste das Item einfach neu.', embeds: [], components: [] }).catch(() => {});
      await message.reactions.cache.get('⏳')?.users.remove(client.user.id).catch(() => {});
    }, DRAFT_TTL_MS).unref();
  }

  /** Nachtrag „@Name @Rolle“ im Leader-Kanal (oder Loot-Kanal) für das offene Item desselben Users. */
  async function addMentionsToDraft(message) {
    const m = mentionsOf(message);
    if (!m.users.length && !m.roles.length) return;
    const draft = [...drafts.values()].reverse().find((d) => d.authorId === message.author.id && d.prompt?.channelId === message.channelId);
    if (!draft) return;
    draft.selection = { users: union(draft.selection.users, m.users), roles: union(draft.selection.roles, m.roles) };
    await draft.prompt.edit(promptView(draft)).catch((err) => console.error('Panel-Update fehlgeschlagen:', err.message));
    await message.react('✅').catch(() => {});
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

  async function resolveMembers(guild, { users, roles }) {
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

  const namesOf = (members) => Object.fromEntries([...members.values()].map((m) => [m.id, m.displayName]));

  async function handleDraft(interaction, action, id) {
    const draft = await getDraft(interaction, id);
    if (!draft) return;

    if (action === 'select') {
      draft.selection = { roles: [...interaction.roles.keys()], users: [...interaction.users.keys()] };
      return interaction.update(promptView(draft));
    }

    if (action === 'cancel') {
      drafts.delete(id);
      await interaction.update({ content: `Abgebrochen: **${draft.item.name}**`, embeds: [], components: [] });
      const source = await fetchSource(draft);
      await source?.reactions.cache.get('⏳')?.users.remove(client.user.id).catch(() => {});
      return;
    }

    if (action === 'start') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, draft.selection);
      if (!members.size) return interaction.followUp(ephemeral('⚠️ In der Auswahl sind keine (menschlichen) Mitglieder.'));
      drafts.delete(id);
      await startLoot(interaction, draft, members);
    }
  }

  async function fetchSource(draft) {
    const channel = await client.channels.fetch(draft.channelId).catch(() => null);
    return channel?.messages.fetch(draft.id).catch(() => null);
  }

  // ---------- 3. Thread erstellen und anpingen ----------

  async function startLoot(interaction, draft, members) {
    const source = await fetchSource(draft);
    if (!source) {
      return interaction.editReply({ content: '⚠️ Der Item-Post wurde gelöscht.', embeds: [], components: [] });
    }
    const thread = source.hasThread
      ? source.thread
      : await source.startThread({ name: `🎲 ${draft.item.name}`.slice(0, 100), autoArchiveDuration: 1440 });

    const session = new LootSession({
      id: draft.id,
      ownerId: draft.authorId,
      item: draft.item,
      eligibleIds: [...members.keys()],
      names: namesOf(members),
      guildId: interaction.guildId,
      channelId: draft.channelId,
      threadId: thread.id,
      panelChannelId: interaction.channelId,
      panelMessageId: interaction.message.id,
      sourceUrl: draft.sourceUrl,
    });

    const main = await thread.send(lootPayload(session));
    session.messageId = main.id;
    store.set(session);

    await pingPlayers(thread, session, [...members.keys()], `🎲 **${session.item.name}** – ihr dürft rollen! `);
    await interaction.editReply(panelView(session));
    await source.reactions.cache.get('⏳')?.users.remove(client.user.id).catch(() => {});
    await source.react('🎲').catch(() => {});
  }

  async function pingPlayers(thread, session, ids, prefix) {
    for (const content of pingChunks(ids, prefix)) {
      await thread.send({ content, allowedMentions: { users: ids } });
    }
  }

  // ---------- 4. Spieler: Würfeln und Passen (Thread) ----------

  function queueEdit(key, fn) {
    const next = (editChains.get(key) ?? Promise.resolve())
      .then(fn)
      .catch((err) => console.error(`Aktualisierung fehlgeschlagen (${key}):`, err.message));
    editChains.set(key, next);
    return next;
  }

  /** Thread-Liste und Leader-Panel neu zeichnen. */
  function render(session) {
    return Promise.all([
      queueEdit(`thread:${session.id}`, async () => {
        const thread = await client.channels.fetch(session.threadId);
        await thread.messages.edit(session.messageId, lootPayload(session));
      }),
      queueEdit(`panel:${session.id}`, async () => {
        const channel = await client.channels.fetch(session.panelChannelId);
        await channel.messages.edit(session.panelMessageId, panelView(session));
      }),
    ]);
  }

  const REASON_TEXT = {
    closed: 'Diese Verlosung ist bereits beendet.',
    'not-eligible': 'Du wurdest für dieses Item nicht ausgewählt und kannst nicht würfeln.',
    'bad-purpose': 'Unbekannte Auswahl.',
    'not-rolled': 'Dieser Spieler hat nicht gewürfelt.',
    'still-pending': 'Dieser Spieler hat noch nichts entschieden.',
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
      const channel = await client.channels.fetch(session.panelChannelId);
      await channel.send({
        content: `✅ **${session.item.name}**: Alle haben entschieden. <@${session.ownerId}>, bitte wähle den Gewinner aus.`,
        reply: { messageReference: session.panelMessageId, failIfNotExists: false },
        allowedMentions: { users: [session.ownerId] },
      });
    }
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
  }

  // ---------- 5. Leader-Panel ----------

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
    const source = await fetchSource({ channelId: session.channelId, id: session.id });
    await source?.react(session.winnerId ? '🏆' : '✖️').catch(() => {});
  }

  async function handlePanel(interaction, action, id) {
    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral('Diese Verlosung ist nicht mehr aktiv.'));
    if (!mayManage(interaction, session.ownerId)) {
      return interaction.reply(ephemeral(`Nur <@${session.ownerId}> kann diese Verlosung verwalten.`));
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

    if (action === 'reset') {
      const userId = interaction.values[0];
      const res = session.reset(userId);
      if (!res.ok) return interaction.reply(ephemeral(failText(res)));
      await interaction.deferUpdate();
      store.save();
      await render(session);
      const thread = await client.channels.fetch(session.threadId);
      await thread.send({
        content: `↩️ <@${userId}>, deine Entscheidung wurde vom Leader zurückgesetzt – du kannst neu wählen.`,
        allowedMentions: { users: [userId] },
      });
      return;
    }

    if (action === 'add') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, {
        users: [...interaction.users.keys()],
        roles: [...interaction.roles.keys()],
      });
      const added = session.addParticipants([...members.keys()], namesOf(members));
      if (!added.length) return interaction.followUp(ephemeral('Alle Ausgewählten sind schon dabei.'));
      store.save();
      await render(session);
      const thread = await client.channels.fetch(session.threadId);
      await pingPlayers(thread, session, added, `➕ Nachträglich dabei bei **${session.item.name}**: `);
    }
  }

  // ---------- Routing ----------

  async function onInteraction(interaction) {
    if (!interaction.isMessageComponent()) return;
    try {
      const [scope, action, id] = interaction.customId.split(':');
      if (scope === 'draft') return await handleDraft(interaction, action, id);
      if (scope === 'loot') return await handleLoot(interaction, action, id);
      if (scope === 'panel') return await handlePanel(interaction, action, id);
    } catch (err) {
      console.error('Fehler bei Interaction:', err);
      const msg = ephemeral('❌ Da ist etwas schiefgelaufen. Hat der Bot die nötigen Rechte (Threads, Nachrichten)?');
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
