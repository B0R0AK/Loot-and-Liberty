import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { commands } from './commands.js';
import { detectItems, fetchLinkPreview } from './item.js';
import { t } from './i18n.js';
import { renderItemCard } from './itemcard.js';
import {
  helpText,
  groupDraftView,
  groupStatusText,
  hoursLabel,
  lootPayload,
  manageModal,
  purposeText,
  openSessionLine,
  panelView,
  pingChunks,
  promptView,
  renameModal,
  starterContent,
  summaryEmbed,
} from './render.js';
import { LootSession } from './session.js';

const DRAFT_TTL_MS = 30 * 60_000;
const GROUP_MAX_HOURS = 12;
const HOUR = 3_600_000;

/**
 * Ablauf:
 *  1. Leader postet Screenshot/Questlog-Link im Leader-Kanal → darunter „Wer darf rollen?“
 *  2. Leader wählt aus → Bot postet das Item mit Bild im Loot-Kanal, Thread mit Roll-Liste, Pings
 *  3. Spieler würfeln/passen – bis die Rollzeit (24 h) abläuft oder der Leader früher beendet
 *  4. Leader wählt im Panel (Leader-Kanal) den Gewinner
 */
export function createLootBot({ client, store, botAdminIds = [] }) {
  /** Gepostete Items, für die noch ausgewählt wird, wer rollen darf. Key = ID des Leader-Posts (+ "-n" bei mehreren Bildern). */
  const drafts = new Map();
  /** Offene /gruppe-start-Fenster. Key = Interaction-ID. */
  const groupDrafts = new Map();
  /** Serialisierte Edits pro Nachricht, damit immer der neueste Stand zuletzt ankommt. */
  const editChains = new Map();
  /** Timer für das Ende der Rollzeit. */
  const timers = new Map();

  const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  /** Sprache des Servers (/einrichten sprache:). */
  const langOf = (guildId) => store.guild(guildId).language;

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

    const items = detectItems({
      content: message.content,
      attachments: [...message.attachments.values()].map((a) => ({ url: a.url, contentType: a.contentType })),
    });
    if (!items.length) return addMentionsToDraft(message);

    if (!isLeader(whoWrote(message))) {
      return message.reply({ content: t(cfg.language, 'notLeaderPost'), allowedMentions: { parse: [] } });
    }
    if (!cfg.lootChannelId) {
      return message.reply(t(cfg.language, 'noLootChannel'));
    }

    const multi = items.length > 1;
    const prepared = [];
    for (const [index, item] of items.entries()) {
      prepared.push({ index, item, file: await prepareItem(item) });
    }

    const group = store.getGroup(message.guild.id, message.author.id);
    if (group) return autoLoot(message, cfg, group, prepared, multi);

    for (const p of prepared) await createDraft(message, cfg, p, multi);
  }

  /** Name/Bild aus dem Questlog-Link holen; ohne Screenshot die Item-Karte zeichnen. */
  async function prepareItem(item) {
    if (!item.url || (item.nameFromInput && item.image)) return null;
    const preview = await fetchLinkPreview(item.url);
    if (!item.nameFromInput && preview.title) item.name = preview.title.slice(0, 90);
    item.image ??= preview.image ?? null;
    if (item.image || !preview.questlog) return null;
    try {
      return { attachment: await renderItemCard(preview.questlog), name: 'item.png' };
    } catch (err) {
      console.error('Item-Karte konnte nicht erzeugt werden:', err.message);
      return null;
    }
  }

  const draftId = (message, index) => (index === 0 ? message.id : `${message.id}-${index}`);

  /** Bei mehreren Bildern in einer Nachricht bekommt jedes Fenster/Panel sein Bild, damit klar ist, welches gemeint ist. */
  const panelFiles = (p, multi) => (p.file ? [p.file] : multi && p.item.image ? [imageFile(p.item.image)] : []);

  async function createDraft(message, cfg, p, multi) {
    const draft = {
      id: draftId(message, p.index),
      sourceMessageId: message.id,
      authorId: message.author.id,
      lootChannelId: cfg.lootChannelId,
      item: p.item,
      selection: mentionsOf(message),
      managers: { users: [], roles: [] },
      rollHours: cfg.rollHours,
      lang: cfg.language,
      imageFile: p.file,
      prompt: null,
    };
    drafts.set(draft.id, draft);
    draft.prompt = await message.reply({ ...promptView(draft), files: panelFiles(p, multi), allowedMentions: { parse: [] } });

    setTimeout(async () => {
      if (drafts.get(draft.id) !== draft) return;
      drafts.delete(draft.id);
      await draft.prompt.edit({ content: t(draft.lang, 'expired'), embeds: [], components: [], attachments: [] }).catch(() => {});
    }, DRAFT_TTL_MS).unref();
  }

  /** Aktive Tagesgruppe: jedes Item sofort mit der Gruppe verlosen – ohne Rückfrage. */
  async function autoLoot(message, cfg, group, prepared, multi) {
    const members = await resolveMembers(message.guild, group.selection);
    if (!members.size) {
      return message.reply({ content: t(cfg.language, 'groupEmpty'), allowedMentions: { parse: [] } });
    }
    let started = 0;
    for (const p of prepared) {
      try {
        const panel = await message.reply({
          content: t(cfg.language, 'beingRaffled', p.item.name),
          files: panelFiles(p, multi),
          allowedMentions: { parse: [] },
        });
        const draft = {
          id: draftId(message, p.index),
          sourceMessageId: message.id,
          authorId: message.author.id,
          lootChannelId: cfg.lootChannelId,
          item: p.item,
          managers: group.managers,
          rollHours: group.rollHours,
          lang: cfg.language,
          imageFile: p.file,
        };
        await startLoot({ guild: message.guild, draft, members, panelMessage: panel });
        started++;
      } catch (err) {
        console.error(`Gruppe: ${p.item.name} konnte nicht verlost werden:`, err);
      }
    }
    group.count = (group.count ?? 0) + started;
    store.setGroup(group);
    await message.react('📋').catch(() => {});
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
      return interaction.update({ content: t(langOf(interaction.guildId), 'expired'), embeds: [], components: [] });
    }
    if (interaction.user.id !== draft.authorId && !isBotAdmin(whoInteracts(interaction))) {
      return interaction.reply(ephemeral(t(draft.lang, 'onlyAuthor', draft.authorId)));
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
      return interaction.showModal(renameModal('draft', id, draft.item.name, draft.lang));
    }

    if (action === 'hours') {
      draft.rollHours = Number(interaction.values[0]);
      return interaction.update(promptView(draft));
    }

    if (action === 'cancel') {
      drafts.delete(id);
      return interaction.update({ content: t(draft.lang, 'cancelled', draft.item.name), embeds: [], components: [], attachments: [] });
    }

    if (action === 'start') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, draft.selection);
      if (!members.size) return interaction.followUp(ephemeral(t(draft.lang, 'noMembers')));
      drafts.delete(id);
      await startLoot({ guild: interaction.guild, draft, members, panelMessage: interaction.message });
    }
  }

  // ---------- 3. Item im Loot-Kanal posten, Thread, Pings ----------

  function imageFile(url) {
    const ext = url.split('?')[0].match(/\.(png|jpe?g|gif|webp)$/i)?.[1] ?? 'png';
    return { attachment: url, name: `item.${ext.toLowerCase()}` };
  }

  /** Item im Loot-Kanal posten, Thread + Roll-Liste, Spieler pingen; panelMessage wird zum Leader-Panel. */
  async function startLoot({ guild, draft, members, panelMessage }) {
    const lootChannel = await channel(draft.lootChannelId);
    const session = new LootSession({
      id: draft.id,
      ownerId: draft.authorId,
      item: draft.item,
      eligibleIds: [...members.keys()],
      names: namesOf(members),
      managers: draft.managers,
      guildId: guild.id,
      channelId: lootChannel.id,
      panelChannelId: panelMessage.channelId,
      panelMessageId: panelMessage.id,
      sourceMessageId: draft.sourceMessageId ?? draft.id,
      lang: draft.lang,
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

    await pingPlayers(thread, [...members.keys()], t(session.lang, 'ping', session.item.name));
    await panelMessage.edit({ ...panelView(session), allowedMentions: { parse: [] } });
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
      t(session.lang, reason === 'timeout' ? 'lockTimeout' : 'lockLeader') + t(session.lang, 'lockTail'),
    );
    await closeThread(thread);
    await notifyManagers(session, t(session.lang, 'noticeLocked', session.item.name));
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

    // Den Leader-Post erst löschen, wenn alle Items daraus (mehrere Bilder) abgeschlossen sind.
    const sourceStillUsed = [...store.sessions.values()].some((s) => s.id !== session.id && s.sourceMessageId === session.sourceMessageId);
    const toDelete = [session.panelMessageId, ...session.noticeIds, ...(sourceStillUsed ? [] : [session.sourceMessageId])];
    for (const id of toDelete) {
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
      queueEdit(`thread:${session.id}`, async () => {
        try {
          await (await channel(session.threadId)).messages.edit(session.messageId, lootPayload(session));
        } catch (err) {
          // 50083 = Thread ist archiviert (nach der Rollzeit). Die Liste wird beim Abschluss aktualisiert.
          if (err.code !== 50083) throw err;
        }
      }),
      queueEdit(`panel:${session.id}`, async () => (await channel(session.panelChannelId)).messages.edit(session.panelMessageId, panelView(session))),
    ];
    if (starter) jobs.push(queueEdit(`starter:${session.id}`, () => editStarter(session)));
    return Promise.all(jobs);
  }

  /** Fehlertext zu einem Ergebnis aus LootSession (z. B. { ok: false, reason: 'locked' }). */
  function failText(res, lang) {
    if (res.reason !== 'already') return t(lang, 'reason')[res.reason] ?? t(lang, 'reasonFallback');
    const p = res.participant;
    return p.status === 'rolled' ? t(lang, 'alreadyRolled', p.roll, purposeText(p.purpose, lang)) : t(lang, 'alreadyPassed');
  }

  // ---------- 4. Spieler: Würfeln und Passen (Thread) ----------

  async function afterDecision(session) {
    store.save();
    await render(session);
    if (session.allDecided) {
      await notifyManagers(session, t(session.lang, 'noticeAllDecided', session.item.name));
    }
  }

  async function handleLoot(interaction, action, id) {
    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral(t(langOf(interaction.guildId), 'notActive')));

    if (action === 'roll') {
      const purpose = interaction.values[0];
      const res = session.roll(interaction.user.id, purpose);
      if (!res.ok) return interaction.reply(ephemeral(failText(res, session.lang)));
      await interaction.reply(ephemeral(t(session.lang, 'rolled', res.value, purposeText(purpose, session.lang))));
      return afterDecision(session);
    }

    if (action === 'pass') {
      const res = session.pass(interaction.user.id);
      if (!res.ok) return interaction.reply(ephemeral(failText(res, session.lang)));
      await interaction.reply(
        ephemeral(
          res.droppedRoll !== null ? t(session.lang, 'passedDropped', res.droppedRoll) : t(session.lang, 'passed'),
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
        content: t(session.lang, 'congrats', session.winnerId, session.item.name, p.roll, purposeText(p.purpose, session.lang)),
        allowedMentions: { users: [session.winnerId] },
      });
    } else {
      await thread.send(t(session.lang, 'closedThread'));
    }
    await closeThread(thread);
    await postSummaryAndCleanup(session);
  }

  async function handlePanel(interaction, action, id) {
    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral(t(langOf(interaction.guildId), 'notActive')));
    if (!mayManage(interaction, session)) {
      return interaction.reply(ephemeral(t(session.lang, 'onlyManagers')));
    }

    if (action === 'winner') {
      const res = session.chooseWinner(interaction.values[0]);
      if (!res.ok) return interaction.reply(ephemeral(failText(res, session.lang)));
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
      return interaction.showModal(renameModal('panel', id, session.item.name, session.lang));
    }

    if (action === 'time') {
      const hours = Number(interaction.values[0]);
      if (!session.setDeadline(Date.now() + hours * HOUR)) return interaction.reply(ephemeral(REASON_TEXT.locked));
      await interaction.deferUpdate();
      store.save();
      scheduleLock(session);
      await render(session, { starter: true });
      const thread = await channel(session.threadId);
      await thread.send(t(session.lang, 'timeChanged', `<t:${Math.floor(session.endsAt / 1000)}:R>`));
      return;
    }

    if (action === 'manage') return interaction.showModal(manageModal(session));
    // Alte Panels hatten statt des Knopfs eine Spieler-Auswahl – dann mit diesem Spieler vorbelegen.
    if (action === 'member') return interaction.showModal(manageModal(session, interaction.values));

    // Alte Panels (vor „Spieler verwalten“) haben noch das Zurücksetzen-Menü.
    if (action === 'reset') {
      await interaction.deferUpdate();
      const res = await resetMember(session, interaction.values[0]);
      if (!res.ok) await interaction.followUp(ephemeral(failText(res, session.lang)));
      return;
    }

    if (action === 'add') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, {
        users: [...interaction.users.keys()],
        roles: [...interaction.roles.keys()],
      });
      const added = session.addParticipants([...members.keys()], namesOf(members));
      if (!added.length) return interaction.followUp(ephemeral(t(session.lang, 'allAlreadyIn')));
      store.save();
      await render(session);
      await pingPlayers(await channel(session.threadId), added, t(session.lang, 'pingAdded', session.item.name));
    }
  }

  // ---------- Spieler verwalten: zurücksetzen / entfernen ----------

  async function resetMember(session, userId, { redraw = true } = {}) {
    const res = session.reset(userId);
    if (!res.ok) return res;
    store.save();
    if (redraw) await render(session);
    const thread = await channel(session.threadId);
    await thread.send({
      content: t(session.lang, 'wasReset', userId),
      allowedMentions: { users: [userId] },
    });
    return res;
  }

  async function removeMember(session, userId, { redraw = true } = {}) {
    const res = session.removeParticipant(userId);
    if (!res.ok) return res;
    store.save();
    if (redraw) await render(session);
    const thread = await channel(session.threadId);
    if (!thread.archived) {
      await thread.send({ content: t(session.lang, 'wasRemoved', userId), allowedMentions: { parse: [] } });
    }
    return res;
  }

  /**
   * Pop-up „Spieler verwalten“ bestätigt: Aktion auf alle gewählten Spieler anwenden.
   * Bewusst ohne Antwort-Nachricht – nur das Panel aktualisiert sich an seiner Stelle.
   */
  async function handleManage(interaction, sessionId) {
    const session = store.get(sessionId);
    if (!session) return interaction.reply(ephemeral(t(langOf(interaction.guildId), 'notActive')));
    if (!mayManage(interaction, session)) {
      return interaction.reply(ephemeral(t(session.lang, 'onlyManagers')));
    }
    const userIds = [...interaction.fields.getSelectedUsers('users', true).keys()];
    const action = interaction.fields.getStringSelectValues('action')[0];
    await interaction.deferUpdate();

    const failed = [];
    for (const userId of userIds) {
      const opts = { redraw: false }; // Panel und Liste nur einmal am Ende neu zeichnen
      const res = action === 'reset' ? await resetMember(session, userId, opts) : await removeMember(session, userId, opts);
      if (!res.ok) failed.push(`<@${userId}>: ${failText(res, session.lang)}`);
    }
    if (failed.length < userIds.length) await render(session);
    // Nur wenn gar nichts geklappt hat, ein kurzer Hinweis (sonst sieht man das Ergebnis im Panel).
    if (failed.length === userIds.length) await interaction.followUp(ephemeral(`⚠️ ${failed.join('\n')}`));
  }

  // ---------- Tagesgruppe: /group start | end | status (DE: /gruppe start | ende | status) ----------

  async function handleGroupCommand(interaction) {
    const L = langOf(interaction.guildId);
    if (!isLeader(whoInteracts(interaction))) return interaction.reply(ephemeral(t(L, 'groupOnlyLeaders')));
    const sub = interaction.options.getSubcommand();
    const current = store.getGroup(interaction.guildId, interaction.user.id);

    if (sub === 'status') {
      return interaction.reply(ephemeral(current ? groupStatusText({ ...current, lang: L }) : t(L, 'groupNone')));
    }
    if (sub === 'end') {
      const ended = store.endGroup(interaction.guildId, interaction.user.id);
      return interaction.reply(ephemeral(ended ? t(L, 'groupEnded', ended.count ?? 0) : t(L, 'groupNoneShort')));
    }

    const cfg = store.guild(interaction.guildId);
    if (!cfg.leaderChannelId || !cfg.lootChannelId) return interaction.reply(ephemeral(t(L, 'groupNeedsSetup')));
    const gd = {
      id: interaction.id,
      guildId: interaction.guildId,
      leaderId: interaction.user.id,
      lang: L,
      selection: current?.selection ?? { users: [], roles: [] },
      managers: current?.managers ?? { users: [], roles: [] },
      rollHours: current?.rollHours ?? cfg.rollHours,
    };
    groupDrafts.set(gd.id, gd);
    setTimeout(() => groupDrafts.delete(gd.id), DRAFT_TTL_MS).unref();
    return interaction.reply({ ...groupDraftView(gd), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }

  async function handleGroupDraft(interaction, action, id) {
    const gd = groupDrafts.get(id);
    if (!gd) return interaction.update({ content: t(langOf(interaction.guildId), 'groupExpired'), embeds: [], components: [] });
    const L = gd.lang;

    if (action === 'select') {
      gd.selection = { roles: [...interaction.roles.keys()], users: [...interaction.users.keys()] };
      return interaction.update(groupDraftView(gd));
    }
    if (action === 'managers') {
      gd.managers = {
        roles: [...interaction.roles.keys()].filter((r) => r !== interaction.guildId),
        users: [...interaction.users.values()].filter((u) => !u.bot && u.id !== gd.leaderId).map((u) => u.id),
      };
      return interaction.update(groupDraftView(gd));
    }
    if (action === 'hours') {
      gd.rollHours = Number(interaction.values[0]);
      return interaction.update(groupDraftView(gd));
    }
    if (action === 'cancel') {
      groupDrafts.delete(id);
      return interaction.update({ content: t(L, 'groupCancelled'), embeds: [], components: [] });
    }
    if (action === 'start') {
      await interaction.deferUpdate();
      const members = await resolveMembers(interaction.guild, gd.selection);
      if (!members.size) return interaction.followUp(ephemeral(t(L, 'noMembers')));
      groupDrafts.delete(id);
      const now = Date.now();
      const group = store.setGroup({
        guildId: gd.guildId,
        leaderId: gd.leaderId,
        selection: gd.selection,
        managers: gd.managers,
        rollHours: gd.rollHours,
        createdAt: now,
        expiresAt: now + GROUP_MAX_HOURS * HOUR,
        count: 0,
      });
      return interaction.editReply({
        content: `${groupStatusText({ ...group, lang: L })}\n${t(L, 'groupResolved', members.size)}`,
        embeds: [],
        components: [],
        allowedMentions: { parse: [] },
      });
    }
  }

  // ---------- Item umbenennen (Eingabefenster) ----------

  async function handleRename(interaction, scope, id) {
    const L = langOf(interaction.guildId);
    const name = interaction.fields.getTextInputValue('name').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!name) return interaction.reply(ephemeral(t(L, 'renameEmpty')));

    if (scope === 'draft') {
      const draft = drafts.get(id);
      if (!draft) return interaction.reply(ephemeral(t(L, 'expired')));
      if (interaction.user.id !== draft.authorId && !isBotAdmin(whoInteracts(interaction))) {
        return interaction.reply(ephemeral(t(L, 'onlyAuthorRename', draft.authorId)));
      }
      draft.item.name = name;
      return interaction.update(promptView(draft));
    }

    const session = store.get(id);
    if (!session) return interaction.reply(ephemeral(t(L, 'notActive')));
    if (!mayManage(interaction, session)) {
      return interaction.reply(ephemeral(t(session.lang, 'onlyManagers')));
    }
    session.item.name = name;
    store.save();
    await interaction.deferUpdate();
    await render(session, { starter: true });
    const thread = await channel(session.threadId);
    if (!thread.archived) await thread.setName(`🎲 ${name}`.slice(0, 100)).catch((err) => console.error('Thread umbenennen fehlgeschlagen:', err.message));
  }

  // ---------- Slash-Commands: /leader, /setup (/einrichten), /loot ----------
  // Die Befehle heißen intern englisch; deutsche Namen sind Discord-Übersetzungen (siehe commands.js).

  async function handleLeaderCommand(interaction) {
    const L = langOf(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const { leaders } = store.guild(guildId);
      const list = [...leaders.roles.map((id) => `<@&${id}>`), ...leaders.users.map((id) => `<@${id}>`)];
      return interaction.reply(ephemeral(`${t(L, 'leadersList', list.join(', '))}\n${t(L, 'leadersAdminsNote')}`));
    }

    if (!isBotAdmin(whoInteracts(interaction))) return interaction.reply(ephemeral(t(L, 'leadersOnlyAdmins')));

    const opt = interaction.options.get('who', true);
    const kind = opt.role ? 'roles' : 'users';
    const targetId = opt.role?.id ?? opt.user?.id;
    const label = opt.role ? `<@&${targetId}>` : `<@${targetId}>`;
    if (opt.user?.bot) return interaction.reply(ephemeral(t(L, 'leaderNoBots')));
    if (targetId === interaction.guildId) return interaction.reply(ephemeral(t(L, 'leaderNoEveryone')));

    const add = sub === 'add';
    const changed = store.setLeader(guildId, kind, targetId, add);
    const key = add ? (changed ? 'leaderAdded' : 'leaderAlready') : changed ? 'leaderRemoved' : 'leaderWasNot';
    return interaction.reply(ephemeral(t(L, key, label)));
  }

  async function handleSetupCommand(interaction) {
    if (!isBotAdmin(whoInteracts(interaction))) return interaction.reply(ephemeral(t(langOf(interaction.guildId), 'onlyAdmins')));
    const leaderChannel = interaction.options.getChannel('leaderchannel');
    const lootChannel = interaction.options.getChannel('lootchannel');
    const hours = interaction.options.getInteger('rolltime');
    const language = interaction.options.getString('language');
    const cfg =
      leaderChannel || lootChannel || hours || language
        ? store.updateGuild(interaction.guildId, (c) => {
            if (leaderChannel) c.leaderChannelId = leaderChannel.id;
            if (lootChannel) c.lootChannelId = lootChannel.id;
            if (hours) c.rollHours = hours;
            if (language) c.language = language;
          })
        : store.guild(interaction.guildId);
    const L = cfg.language;
    const show = (id) => (id ? `<#${id}>` : t(L, 'notSet'));
    return interaction.reply(
      ephemeral(t(L, 'setupInfo', show(cfg.leaderChannelId), show(cfg.lootChannelId), hoursLabel(cfg.rollHours, L), t(L, 'languageName'))),
    );
  }

  async function handleLootCommand(interaction) {
    const L = langOf(interaction.guildId);
    if (!isLeader(whoInteracts(interaction))) return interaction.reply(ephemeral(t(L, 'onlyLeaders')));
    const open = store.openSessions(interaction.guildId);
    if (!open.length) return interaction.reply(ephemeral(t(L, 'openNone')));
    const lines = open.slice(0, 20).map(openSessionLine);
    if (open.length > 20) lines.push(t(L, 'andMore', open.length - 20));
    return interaction.reply(ephemeral(`${t(L, 'openTitle', open.length)}\n${lines.join('\n')}`));
  }

  async function registerCommands(guild) {
    await guild.commands.set(commands.map((c) => c.toJSON())).catch((err) => console.error(`Commands für ${guild.name} fehlgeschlagen:`, err.message));
  }

  // ---------- Routing ----------

  async function onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'leader') return await handleLeaderCommand(interaction);
        if (interaction.commandName === 'setup') return await handleSetupCommand(interaction);
        if (interaction.commandName === 'loot') return await handleLootCommand(interaction);
        if (interaction.commandName === 'group') return await handleGroupCommand(interaction);
        if (interaction.commandName === 'help') return await interaction.reply(ephemeral(helpText(langOf(interaction.guildId))));
        return;
      }
      if (interaction.isModalSubmit()) {
        const [kind, scope, id] = interaction.customId.split(':');
        if (kind === 'rename') return await handleRename(interaction, scope, id);
        if (kind === 'manage') return await handleManage(interaction, scope);
        return;
      }
      if (!interaction.isMessageComponent()) return;
      const [scope, action, id] = interaction.customId.split(':');
      if (scope === 'draft') return await handleDraft(interaction, action, id);
      if (scope === 'group') return await handleGroupDraft(interaction, action, id);
      if (scope === 'loot') return await handleLoot(interaction, action, id);
      if (scope === 'panel') return await handlePanel(interaction, action, id);
    } catch (err) {
      console.error('Fehler bei Interaction:', err);
      const msg = ephemeral(t(interaction.guildId ? langOf(interaction.guildId) : 'de', 'genericError'));
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
