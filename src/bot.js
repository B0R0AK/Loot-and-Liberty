import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { commands } from './commands.js';
import { detectItem, fetchLinkPreview } from './item.js';
import { renderItemCard } from './itemcard.js';
import { HELP_TEXT, hoursLabel, lootPayload, openSessionLine, panelView, pingChunks, promptView, renameModal, starterContent, summaryEmbed } from './render.js';
import { LootSession, purposeById } from './session.js';

const DRAFT_TTL_MS = 30 * 60_000;
const HOUR = 3_600_000;

/**
 * Ablauf:
 *  1. Leader postet Screenshot/Questlog-Link im Leader-Kanal → darunter „Wer darf rollen?“
 *  2. Leader wählt aus → Bot postet das Item mit Bild im Loot-Kanal, Thread mit Roll-Liste, Pings
 *  3. Spieler würfeln/passen – bis die Rollzeit (24 h) abläuft oder der Leader früher beendet
 *  4. Leader wählt im Panel (Leader-Kanal) den Gewinner
 */
export function createLootBot({ client, store, botAdminIds = [] }) {
  /** Gepostete Items, für die noch ausgewählt wird, wer rollen darf. Key = ID des Leader-Posts. */
  const drafts = new Map();
  /** Serialisierte Edits pro Nachricht, damit immer der neueste Stand zuletzt ankommt. */
  const editChains = new Map();
  /** Timer für das Ende der Rollzeit. */
  const timers = new Map();

  const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

  // ---------- Rechte ----------

  const roleIdsOf = (member) => {
    const roles = member?.roles;
    return Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
  };

  /** Bot-Admin: Server-Besitzer, Discord-Administrator oder in BOT_ADMIN_IDS. Darf Leader festlegen. */
  function isBotAdmin({ userId, guild, permissions }) {
    return botAdminIds.includes(userId) || guild?.ownerId === userId || Boolean(permissions?.has(PermissionFlagsBits.Administrator));
  }

  /** Leader: per /leader festgelegte Nutzer oder Rollen (plus Bot-Admins). */
  function isLeader({ userId, guild, permissions, member }) {
    if (isBotAdmin({ userId, guild, permissions })) return true;
    const { leaders } = store.guild(guild.id);
    return leaders.users.includes(userId) || roleIdsOf(member).some((id) => leaders.roles.includes(id));
  }

  /** Verwalter dieser Verlosung (Ersteller, gewählte Leader/Rollen) oder Bot-Admin. */
  function mayManage(interaction, session) {
    return session.isManager(interaction.user.id, roleIdsOf(interaction.member)) || isBotAdmin(whoInteracts(interaction));
  }

  const whoInteracts = (i) => ({ userId: i.user.id, guild: i.guild, permissions: i.memberPermissions, member: i.member });
  const whoWrote = (m) => ({ userId: m.author.id, guild: m.guild, permissions: m.member?.permissions, member: m.member });

  // ---------- Hilfen ----------

  function mentionsOf(message) {
    return {
      users: [...message.mentions.parsedUsers.values()].filter((u) => !u.bot).map((u) => u.id),
      roles: [...message.mentions.roles.keys()],
    };
  }

  const union = (a, b) => [...new Set([...a, ...b])].slice(0, 100);

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
  const channel = (id) => client.channels.fetch(id);

  // ---------- 1. Item im Leader-Kanal erkennen ----------

  async function onMessage(message) {
    if (message.author.bot || !message.guild) return;
    const cfg = store.guild(message.guild.id);
    if (!cfg.leaderChannelId || message.channelId !== cfg.leaderChannelId) return;

    const item = detectItem({
      content: message.content,
      attachments: [...message.attachments.values()].map((a) => ({ url: a.url, contentType: a.contentType })),
    });
    if (!item) return addMentionsToDraft(message);

    if (!isLeader(whoWrote(message))) {
      return message.reply({ content: 'Nur Loot-Leader können Items verlosen. Ein Bot-Admin kann dich mit `/leader hinzufügen` freischalten.', allowedMentions: { parse: [] } });
    }
    if (!cfg.lootChannelId) {
      return message.reply('Es ist noch kein Loot-Kanal eingerichtet. Ein Bot-Admin kann das mit `/einrichten lootkanal:#kanal` tun.');
    }

    let imageFile = null;
    if (item.url && (!item.nameFromInput || !item.image)) {
      const preview = await fetchLinkPreview(item.url);
      if (!item.nameFromInput && preview.title) item.name = preview.title.slice(0, 90);
      item.image ??= preview.image ?? null;
      // Nur Questlog-Link, kein Screenshot → Item-Karte mit Stats selbst zeichnen.
      if (!item.image && preview.questlog) {
        try {
          imageFile = { attachment: await renderItemCard(preview.questlog), name: 'item.png' };
        } catch (err) {
          console.error('Item-Karte konnte nicht erzeugt werden:', err.message);
        }
      }
    }

    const draft = {
      id: message.id,
      authorId: message.author.id,
      lootChannelId: cfg.lootChannelId,
      item,
      selection: mentionsOf(message),
      managers: { users: [], roles: [] },
      rollHours: cfg.rollHours,
      imageFile,
      prompt: null,
    };
    drafts.set(draft.id, draft);
    draft.prompt = await message.reply({
      ...promptView(draft),
      ...(imageFile ? { files: [imageFile] } : {}),
      allowedMentions: { parse: [] },
    });

    setTimeout(async () => {
      if (drafts.get(draft.id) !== draft) return;
      drafts.delete(draft.id);
      await draft.prompt.edit({ content: '⌛ Abgelaufen – poste das Item einfach neu.', embeds: [], components: [], attachments: [] }).catch(() => {});
    }, DRAFT_TTL_MS).unref();
  }

  /** Nachtrag „@Name @Rolle“ im Leader-Kanal für das offene Item desselben Leaders. */
  async function addMentionsToDraft(message) {
    const m = mentionsOf(message);
    if (!m.users.length && !m.roles.length) return;
    const draft = [...drafts.values()].reverse().find((d) => d.authorId === message.author.id && d.prompt?.channelId === message.channelId);
    if (!draft) return;
    draft.selection = { users: union(draft.selection.users, m.users), roles: union(draft.selection.roles, m.roles) };
    await draft.prompt.edit(promptView(draft)).catch((err) => console.error('Update fehlgeschlagen:', err.message));
    await message.react('✅').catch(() => {});
  }

  // ---------- 2. Auswahl, wer rollen darf ----------

  async function handleDraft(interaction, action, id) {
    const draft = drafts.get(id);
    if (!draft) {
      return interaction.update({ content: '⌛ Abgelaufen – poste das Item einfach neu.', embeds: [], components: [] });
    }
    if (interaction.user.id !== draft.authorId && !isBotAdmin(whoInteracts(interaction))) {
      return interaction.reply(ephemeral(`Das kann nur <@${draft.authorId}> auswählen.`));
    }

    if (action === 'select') {
      draft.selection = { roles: [...interaction.roles.keys()], users: [...interaction.users.keys()] };
      return interaction.update(promptView(draft));
    }

    if (action === 'managers') {
      draft.managers = {
        roles: [...interaction.roles.keys()].filter((id) => id !== interaction.guildId),
        users: [...interaction.users.values()].filter((u) => !u.bot && u.id !== draft.authorId).map((u) => u.id),
      };
      return interaction.update(promptView(draft));
    }

    if (action === 'rename') {
      return interaction.showModal(renameModal('draft', id, draft.item.name));
    }

    if (action === 'hours') {
      draft.rollHours = Number(interaction.values[0]);
      return interaction.update(promptView(draft));
    }

    if (action === 'cancel') {
      drafts.delete(id);
      return interaction.update({ content: `Abgebrochen: **${draft.item.name}**`, embeds: [], components: [], attachments: [] });
    }

    if (action === 'start') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, draft.selection);
      if (!members.size) return interaction.followUp(ephemeral('⚠️ In der Auswahl sind keine (menschlichen) Mitglieder.'));
      drafts.delete(id);
      await startLoot(interaction, draft, members);
    }
  }

  // ---------- 3. Item im Loot-Kanal posten, Thread, Pings ----------

  function imageFile(url) {
    const ext = url.split('?')[0].match(/\.(png|jpe?g|gif|webp)$/i)?.[1] ?? 'png';
    return { attachment: url, name: `item.${ext.toLowerCase()}` };
  }

  async function startLoot(interaction, draft, members) {
    const lootChannel = await channel(draft.lootChannelId);
    const session = new LootSession({
      id: draft.id,
      ownerId: draft.authorId,
      item: draft.item,
      eligibleIds: [...members.keys()],
      names: namesOf(members),
      managers: draft.managers,
      guildId: interaction.guildId,
      channelId: lootChannel.id,
      panelChannelId: interaction.channelId,
      panelMessageId: interaction.message.id,
      endsAt: Date.now() + draft.rollHours * HOUR,
    });

    // Das Bild wird neu hochgeladen, damit es dauerhaft sichtbar bleibt.
    const base = { content: starterContent(session), allowedMentions: { parse: [] } };
    const file = draft.imageFile ?? (draft.item.image ? imageFile(draft.item.image) : null);
    const starter = file
      ? await lootChannel.send({ ...base, files: [file] }).catch(() => lootChannel.send(base))
      : await lootChannel.send(base);
    const thread = await starter.startThread({ name: `🎲 ${draft.item.name}`.slice(0, 100), autoArchiveDuration: 4320 });

    session.starterMessageId = starter.id;
    session.threadId = thread.id;
    const main = await thread.send(lootPayload(session));
    session.messageId = main.id;
    store.set(session);
    scheduleLock(session);

    await pingPlayers(thread, [...members.keys()], `🔔 **${session.item.name}** – ihr seid dran! Wählt oben, wofür ihr rollt, oder passt. `);
    await interaction.editReply(panelView(session));
  }

  async function pingPlayers(thread, ids, prefix) {
    for (const content of pingChunks(ids, prefix)) {
      await thread.send({ content, allowedMentions: { users: ids } });
    }
  }

  // ---------- Rollzeit ----------

  function scheduleLock(session) {
    clearTimeout(timers.get(session.id));
    if (!session.rollingOpen || !session.endsAt) return;
    const delay = Math.max(0, session.endsAt - Date.now());
    timers.set(
      session.id,
      setTimeout(() => lockRolls(session, 'timeout').catch((err) => console.error('Rollzeit-Ende fehlgeschlagen:', err)), delay),
    );
  }

  /** Nach einem Neustart die Timer der offenen Verlosungen wieder starten. */
  function restoreTimers() {
    for (const session of store.sessions.values()) scheduleLock(session);
  }

  async function lockRolls(session, reason) {
    if (!session.lockRolls()) return;
    clearTimeout(timers.get(session.id));
    store.save();
    await render(session, { starter: true });
    const thread = await channel(session.threadId);
    await thread.send(
      (reason === 'timeout' ? '⏰ **Die Rollzeit ist vorbei.**' : '⏹️ **Der Leader hat das Rollen beendet.**') +
        ' Der Leader wählt jetzt den Gewinner. 🔒 Der Thread wird geschlossen – das Ergebnis steht danach hier und an der Item-Nachricht.',
    );
    await closeThread(thread);
    await notifyManagers(session, `⏹️ **${session.item.name}**: Rollen beendet – bitte Gewinner auswählen.`);
  }

  // ---------- Thread schließen/öffnen ----------
  // Nach dem Rollen wird der Thread gesperrt und archiviert: Er verschwindet aus der
  // Kanalliste und zählt nicht mehr zu den aktiven Threads. Für die Gewinner-Nachricht
  // öffnet der Bot ihn kurz wieder (braucht das Recht „Threads verwalten“).

  async function closeThread(thread) {
    await thread.setLocked(true).catch((err) => console.error('Thread sperren fehlgeschlagen:', err.message));
    await thread.setArchived(true).catch((err) => console.error('Thread archivieren fehlgeschlagen:', err.message));
  }

  async function reopenThread(session) {
    const thread = await channel(session.threadId);
    if (thread.archived) await thread.setArchived(false).catch((err) => console.error('Thread öffnen fehlgeschlagen:', err.message));
    return thread;
  }

  /** Hinweis im Leader-Kanal an alle Verwalter der Verlosung. */
  async function notifyManagers(session, text) {
    const panel = await channel(session.panelChannelId);
    const users = [session.ownerId, ...session.managers.users];
    const who = [...session.managers.roles.map((id) => `<@&${id}>`), ...[...new Set(users)].map((id) => `<@${id}>`)].join(' ');
    const msg = await panel.send({
      content: `${text} ${who}`,
      reply: { messageReference: session.panelMessageId, failIfNotExists: false },
      allowedMentions: { users, roles: session.managers.roles },
    });
    session.noticeIds.push(msg.id);
    store.save();
  }

  /**
   * Nach dem Abschluss den Leader-Kanal aufräumen: Item-Post des Leaders, Panel und
   * Hinweise löschen und durch eine kompakte Ergebnis-Karte ersetzen.
   * Das Bild kommt von der Item-Nachricht im Loot-Kanal (dauerhaft hochgeladen) und
   * wird als kleines Vorschaubild neu angehängt. Den Leader-Post zu löschen braucht
   * „Nachrichten verwalten“ im Leader-Kanal – fehlt das Recht, bleibt er stehen.
   */
  async function postSummaryAndCleanup(session) {
    const leaderChannel = await channel(session.panelChannelId);
    const starter = await channel(session.channelId)
      .then((c) => c.messages.fetch(session.starterMessageId))
      .catch(() => null);
    const att = starter?.attachments.find((a) => a.contentType?.startsWith('image/'));
    const file = att ? { attachment: att.url, name: att.name || 'item.png' } : null;

    const base = { embeds: [summaryEmbed(session, file?.name)], allowedMentions: { parse: [] } };
    const sent = file
      ? await leaderChannel.send({ ...base, files: [file] }).catch(() => null)
      : null;
    if (!sent) {
      await leaderChannel.send({ embeds: [summaryEmbed(session)], allowedMentions: { parse: [] } }).catch((err) => {
        console.error('Ergebnis-Karte fehlgeschlagen:', err.message);
      });
    }

    for (const id of [session.panelMessageId, ...session.noticeIds, session.id]) {
      await leaderChannel.messages.delete(id).catch((err) => console.warn(`Aufräumen: Nachricht ${id} nicht gelöscht (${err.message})`));
    }
  }

  // ---------- Darstellung ----------

  function queueEdit(key, fn) {
    const next = (editChains.get(key) ?? Promise.resolve())
      .then(fn)
      .catch((err) => console.error(`Aktualisierung fehlgeschlagen (${key}):`, err.message));
    editChains.set(key, next);
    return next;
  }

  /**
   * Item-Nachricht im Loot-Kanal: Solange gerollt wird, groß mit Bild und Status.
   * Danach schrumpft sie auf eine kleine Karte (Vorschaubild + Ergebnis). Das Bild wird
   * dafür neu angehängt und das große entfernt; der Thread bleibt an der Nachricht hängen.
   */
  async function editStarter(session) {
    const ch = await channel(session.channelId);
    if (session.rollingOpen) {
      return ch.messages.edit(session.starterMessageId, { content: starterContent(session), allowedMentions: { parse: [] } });
    }
    const msg = await ch.messages.fetch(session.starterMessageId);
    const att = msg.attachments.find((a) => a.contentType?.startsWith('image/'));
    const file = att ? { attachment: att.url, name: att.name || 'item.png' } : null;
    const compact = (withImage) => ({
      content: '',
      embeds: [summaryEmbed(session, withImage ? file.name : null, { forLootChannel: true })],
      allowedMentions: { parse: [] },
      ...(withImage ? { files: [file], attachments: [] } : {}),
    });
    try {
      await msg.edit(compact(Boolean(file)));
    } catch (err) {
      // Bild konnte nicht neu angehängt werden → Karte ohne Vorschaubild, großes Bild bleibt.
      console.warn('Item-Nachricht verkleinern: Bild nicht übernommen –', err.message);
      await msg.edit(compact(false));
    }
  }

  /** Roll-Liste im Thread, Leader-Panel und (bei Statuswechsel) die Item-Nachricht neu zeichnen. */
  function render(session, { starter = false } = {}) {
    const jobs = [
      queueEdit(`thread:${session.id}`, async () => (await channel(session.threadId)).messages.edit(session.messageId, lootPayload(session))),
      queueEdit(`panel:${session.id}`, async () => (await channel(session.panelChannelId)).messages.edit(session.panelMessageId, panelView(session))),
    ];
    if (starter) jobs.push(queueEdit(`starter:${session.id}`, () => editStarter(session)));
    return Promise.all(jobs);
  }

  const REASON_TEXT = {
    closed: 'Diese Verlosung ist bereits beendet.',
    locked: 'Die Rollzeit ist vorbei.',
    'not-eligible': 'Du wurdest für dieses Item nicht ausgewählt und kannst nicht würfeln.',
    'bad-purpose': 'Unbekannte Auswahl.',
    'not-rolled': 'Dieser Spieler hat nicht gewürfelt.',
    'still-pending': 'Dieser Spieler hat noch nichts entschieden.',
  };

  function failText(res) {
    if (res.reason !== 'already') return REASON_TEXT[res.reason] ?? 'Das geht gerade nicht.';
    const p = res.participant;
    return p.status === 'rolled'
      ? `Du hast bereits gewürfelt: **${p.roll}** (${purposeById(p.purpose)?.label}). Du kannst noch passen.`
      : 'Du hast bereits gepasst. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.';
  }

  // ---------- 4. Spieler: Würfeln und Passen (Thread) ----------

  async function afterDecision(session) {
    store.save();
    await render(session);
    if (session.allDecided) {
      await notifyManagers(session, `✅ **${session.item.name}**: Alle haben entschieden – der Gewinner kann ausgewählt werden.`);
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
      await interaction.reply(
        ephemeral(
          res.droppedRoll !== null
            ? `🚫 Du hast gepasst – dein Wurf **${res.droppedRoll}** zählt nicht mehr. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.`
            : '🚫 Du hast gepasst. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.',
        ),
      );
      return afterDecision(session);
    }
  }

  // ---------- 5. Leader-Panel ----------

  async function finish(interaction, session) {
    clearTimeout(timers.get(session.id));
    store.delete(session.id);
    await interaction.deferUpdate();
    const thread = await reopenThread(session);
    await render(session, { starter: true });
    if (session.winnerId) {
      const p = session.participants.get(session.winnerId);
      await thread.send({
        content: `🏆 Glückwunsch <@${session.winnerId}>! **${session.item.name}** gehört dir (Roll **${p.roll}** · ${purposeById(p.purpose)?.emoji} ${purposeById(p.purpose)?.label}).`,
        allowedMentions: { users: [session.winnerId] },
      });
    } else {
      await thread.send('Verlosung ohne Gewinner geschlossen.');
    }
    await closeThread(thread);
    await postSummaryAndCleanup(session);
  }

  async function handlePanel(interaction, action, id) {
    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral('Diese Verlosung ist nicht mehr aktiv.'));
    if (!mayManage(interaction, session)) {
      return interaction.reply(ephemeral('Diese Verlosung verwalten nur die dafür ausgewählten Leader.'));
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

    if (action === 'lock') {
      await interaction.deferUpdate();
      return lockRolls(session, 'leader');
    }

    if (action === 'rename') {
      return interaction.showModal(renameModal('panel', id, session.item.name));
    }

    if (action === 'time') {
      const hours = Number(interaction.values[0]);
      if (!session.setDeadline(Date.now() + hours * HOUR)) return interaction.reply(ephemeral(REASON_TEXT.locked));
      await interaction.deferUpdate();
      store.save();
      scheduleLock(session);
      await render(session, { starter: true });
      const thread = await channel(session.threadId);
      await thread.send(`⏰ **Rollzeit geändert:** endet jetzt <t:${Math.floor(session.endsAt / 1000)}:R>.`);
      return;
    }

    if (action === 'reset') {
      const userId = interaction.values[0];
      const res = session.reset(userId);
      if (!res.ok) return interaction.reply(ephemeral(failText(res)));
      await interaction.deferUpdate();
      store.save();
      await render(session);
      const thread = await channel(session.threadId);
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
      if (!added.length) return interaction.followUp(ephemeral('Alle Ausgewählten sind schon dabei (oder die Rollzeit ist vorbei).'));
      store.save();
      await render(session);
      await pingPlayers(await channel(session.threadId), added, `➕ Nachträglich dabei bei **${session.item.name}**: `);
    }
  }

  // ---------- Item umbenennen (Eingabefenster) ----------

  async function handleRename(interaction, scope, id) {
    const name = interaction.fields.getTextInputValue('name').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!name) return interaction.reply(ephemeral('Der Name darf nicht leer sein.'));

    if (scope === 'draft') {
      const draft = drafts.get(id);
      if (!draft) return interaction.reply(ephemeral('⌛ Abgelaufen – poste das Item einfach neu.'));
      if (interaction.user.id !== draft.authorId && !isBotAdmin(whoInteracts(interaction))) {
        return interaction.reply(ephemeral(`Das kann nur <@${draft.authorId}> ändern.`));
      }
      draft.item.name = name;
      return interaction.update(promptView(draft));
    }

    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral('Diese Verlosung ist nicht mehr aktiv.'));
    if (!mayManage(interaction, session)) {
      return interaction.reply(ephemeral('Diese Verlosung verwalten nur die dafür ausgewählten Leader.'));
    }
    session.item.name = name;
    store.save();
    await interaction.deferUpdate();
    await render(session, { starter: true });
    const thread = await channel(session.threadId);
    if (!thread.archived) await thread.setName(`🎲 ${name}`.slice(0, 100)).catch((err) => console.error('Thread umbenennen fehlgeschlagen:', err.message));
  }

  // ---------- Slash-Commands: /leader, /einrichten ----------

  async function handleLeaderCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'liste') {
      const { leaders } = store.guild(guildId);
      const list = [...leaders.roles.map((id) => `<@&${id}>`), ...leaders.users.map((id) => `<@${id}>`)];
      return interaction.reply(
        ephemeral(
          `**Loot-Leader:** ${list.length ? list.join(', ') : '*noch keine*'}\n` +
            '*Bot-Admins (Server-Besitzer und Administratoren) haben immer Leader-Rechte.*',
        ),
      );
    }

    if (!isBotAdmin(whoInteracts(interaction))) {
      return interaction.reply(ephemeral('Nur Bot-Admins (Server-Besitzer oder Administratoren) können Leader festlegen.'));
    }

    const opt = interaction.options.get('wer', true);
    const kind = opt.role ? 'roles' : 'users';
    const targetId = opt.role?.id ?? opt.user?.id;
    const label = opt.role ? `<@&${targetId}>` : `<@${targetId}>`;
    if (opt.user?.bot) return interaction.reply(ephemeral('Bots können keine Leader sein.'));
    if (targetId === interaction.guildId) return interaction.reply(ephemeral('@everyone kann kein Leader sein.'));

    const add = sub === 'hinzufügen';
    const changed = store.setLeader(guildId, kind, targetId, add);
    const text = add
      ? changed ? `✅ ${label} ist jetzt Loot-Leader.` : `${label} ist bereits Loot-Leader.`
      : changed ? `✅ ${label} ist kein Loot-Leader mehr.` : `${label} war kein Loot-Leader.`;
    return interaction.reply(ephemeral(text));
  }

  async function handleSetupCommand(interaction) {
    if (!isBotAdmin(whoInteracts(interaction))) {
      return interaction.reply(ephemeral('Nur Bot-Admins (Server-Besitzer oder Administratoren) können das.'));
    }
    const leaderChannel = interaction.options.getChannel('leaderkanal');
    const lootChannel = interaction.options.getChannel('lootkanal');
    const hours = interaction.options.getInteger('rollzeit');
    const cfg =
      leaderChannel || lootChannel || hours
        ? store.updateGuild(interaction.guildId, (c) => {
            if (leaderChannel) c.leaderChannelId = leaderChannel.id;
            if (lootChannel) c.lootChannelId = lootChannel.id;
            if (hours) c.rollHours = hours;
          })
        : store.guild(interaction.guildId);
    const show = (id) => (id ? `<#${id}>` : '*nicht gesetzt*');
    return interaction.reply(
      ephemeral(
        `**Leader-Kanal:** ${show(cfg.leaderChannelId)} – hier posten Leader Items\n` +
          `**Loot-Kanal:** ${show(cfg.lootChannelId)} – hier landen Item + Thread für die Spieler\n` +
          `**Standard-Rollzeit:** ${hoursLabel(cfg.rollHours)} – pro Item im Fenster änderbar`,
      ),
    );
  }

  async function handleLootCommand(interaction) {
    if (!isLeader(whoInteracts(interaction))) return interaction.reply(ephemeral('Nur Loot-Leader können das.'));
    const open = store.openSessions(interaction.guildId);
    if (!open.length) return interaction.reply(ephemeral('Gerade läuft keine Verlosung.'));
    const lines = open.slice(0, 20).map(openSessionLine);
    if (open.length > 20) lines.push(`… und ${open.length - 20} weitere`);
    return interaction.reply(ephemeral(`**Laufende Verlosungen (${open.length})**\n${lines.join('\n')}`));
  }

  async function registerCommands(guild) {
    await guild.commands.set(commands.map((c) => c.toJSON())).catch((err) => console.error(`Commands für ${guild.name} fehlgeschlagen:`, err.message));
  }

  // ---------- Routing ----------

  async function onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'leader') return await handleLeaderCommand(interaction);
        if (interaction.commandName === 'einrichten') return await handleSetupCommand(interaction);
        if (interaction.commandName === 'loot') return await handleLootCommand(interaction);
        if (interaction.commandName === 'hilfe') return await interaction.reply(ephemeral(HELP_TEXT));
        return;
      }
      if (interaction.isModalSubmit()) {
        const [kind, scope, id] = interaction.customId.split(':');
        if (kind === 'rename') return await handleRename(interaction, scope, id);
        return;
      }
      if (!interaction.isMessageComponent()) return;
      const [scope, action, id] = interaction.customId.split(':');
      if (scope === 'draft') return await handleDraft(interaction, action, id);
      if (scope === 'loot') return await handleLoot(interaction, action, id);
      if (scope === 'panel') return await handlePanel(interaction, action, id);
    } catch (err) {
      console.error('Fehler bei Interaction:', err);
      const msg = ephemeral('❌ Da ist etwas schiefgelaufen. Hat der Bot die nötigen Rechte (Threads, Nachrichten, Dateien)?');
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

  return { onMessage: safeOnMessage, onInteraction, registerCommands, restoreTimers, drafts };
}
