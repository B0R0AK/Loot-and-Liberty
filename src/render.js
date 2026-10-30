import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MentionableSelectMenuBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { t } from './i18n.js';
import { PURPOSES, Status, purposeById, purposeLabel } from './session.js';

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
export const hoursLabel = (h, lang = 'de') => t(lang, 'hours', h);

/** "⭐ BiS-Item" in der Sprache der Verlosung. */
export const purposeText = (id, lang = 'de') => `${purposeById(id)?.emoji ?? ''} ${purposeLabel(id, lang)}`.trim();

function hourOptions(selected, lang) {
  const hours = [...new Set([...ROLL_HOUR_CHOICES, selected])].filter(Boolean).sort((a, b) => a - b);
  return hours.map((h) => ({ label: hoursLabel(h, lang), value: String(h), emoji: '⏰', default: h === selected }));
}
const FIELD_LIMIT = 1024;

/** Liste von Zeilen/Erwähnungen so kürzen, dass sie in ein Feld passt. */
function fit(items, sep, limit = FIELD_LIMIT, lang = 'de') {
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const next = out ? `${out}${sep}${items[i]}` : items[i];
    if (next.length > limit - 30) return `${out}${sep}${t(lang, 'andMore', items.length - i)}`;
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
  const L = draft.lang;
  const picked = mentionList(draft.selection);
  const embed = itemEmbed(draft.item, COLORS.prompt, { image: false })
    .setDescription(`${t(L, 'whoMayRoll')}\n${t(L, 'promptHint')}\n${t(L, 'promptAfter', draft.lootChannelId)}`)
    .addFields(
      { name: t(L, 'fieldMayRoll', picked.length), value: picked.length ? fit(picked, ' ', FIELD_LIMIT, L) : t(L, 'nobodyYet') },
      { name: t(L, 'fieldManagedBy'), value: fit(managerMentions(draft.authorId, draft.managers), ' ', FIELD_LIMIT, L), inline: true },
      { name: t(L, 'fieldRollTime'), value: hoursLabel(draft.rollHours, L), inline: true },
    );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`draft:select:${draft.id}`)
          .setPlaceholder(t(L, 'phMayRoll'))
          .setMinValues(1)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`draft:managers:${draft.id}`)
          .setPlaceholder(t(L, 'phManagers'))
          .setMinValues(0)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`draft:hours:${draft.id}`)
          .setPlaceholder(t(L, 'phRollTime'))
          .addOptions(hourOptions(draft.rollHours, L)),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`draft:start:${draft.id}`)
          .setLabel(t(L, 'btnPost'))
          .setEmoji('📣')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!picked.length),
        new ButtonBuilder().setCustomId(`draft:rename:${draft.id}`).setLabel(t(L, 'rename')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`draft:cancel:${draft.id}`).setLabel(t(L, 'cancel')).setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// ---------- Tagesgruppe (/gruppe start) ----------

/** Fenster (nur für den Leader sichtbar): wer heute rollen darf, wer verwaltet, Rollzeit. */
export function groupDraftView(gd) {
  const L = gd.lang;
  const picked = mentionList(gd.selection);
  const embed = new EmbedBuilder()
    .setColor(COLORS.prompt)
    .setTitle(t(L, 'groupTitle'))
    .setDescription(`${t(L, 'groupIntro')}\n${t(L, 'groupAfter')}`)
    .addFields(
      { name: t(L, 'fieldMayRoll', picked.length), value: picked.length ? fit(picked, ' ', FIELD_LIMIT, L) : t(L, 'nobodyYet') },
      { name: t(L, 'fieldManagedBy'), value: fit(managerMentions(gd.leaderId, gd.managers), ' ', FIELD_LIMIT, L), inline: true },
      { name: t(L, 'fieldRollTimeEach'), value: hoursLabel(gd.rollHours, L), inline: true },
    );
  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`group:select:${gd.id}`)
          .setPlaceholder(t(L, 'phMayRollToday'))
          .setMinValues(1)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new MentionableSelectMenuBuilder()
          .setCustomId(`group:managers:${gd.id}`)
          .setPlaceholder(t(L, 'phManagers'))
          .setMinValues(0)
          .setMaxValues(MAX_SELECT),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`group:hours:${gd.id}`).setPlaceholder(t(L, 'phRollTime')).addOptions(hourOptions(gd.rollHours, L)),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`group:start:${gd.id}`)
          .setLabel(t(L, 'btnStartGroup'))
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!picked.length),
        new ButtonBuilder().setCustomId(`group:cancel:${gd.id}`).setLabel(t(L, 'cancel')).setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

/** Kurzinfo zu einer aktiven Gruppe. */
export function groupStatusText(group) {
  const L = group.lang;
  const picked = mentionList(group.selection);
  return [
    t(L, 'groupActive', ts(group.expiresAt, 't'), ts(group.expiresAt, 'R')),
    `${t(L, 'groupMayRoll')} ${fit(picked, ' ', 1500, L)}`,
    `${t(L, 'groupManagedBy')} ${managerMentions(group.leaderId, group.managers).join(' ')} · ${t(L, 'groupRollTime')} ${hoursLabel(group.rollHours, L)}`,
    t(L, 'groupCount', group.count ?? 0),
    t(L, 'groupPostNow'),
  ].join('\n');
}

// ---------- Leader-Kanal: Verwaltungs-Panel ----------

export function panelView(session) {
  const L = session.lang;
  const embed = lootEmbed(session, { panel: true });
  if (session.closed) return { content: '', embeds: [embed], components: [] };

  const rows = [];
  const rolls = session.rolls().slice(0, MAX_SELECT);
  if (rolls.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:winner:${session.id}`)
          .setPlaceholder(t(L, 'phWinner'))
          .addOptions(
            rolls.map((r) => ({
              label: `${session.nameOf(r.userId)} – ${r.roll}`.slice(0, 100),
              description: purposeLabel(r.purpose, L),
              emoji: purposeById(r.purpose).emoji,
              value: r.userId,
            })),
          ),
      ),
    );
  }
  if (session.rollingOpen) rows.push(
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`panel:add:${session.id}`)
        .setPlaceholder(t(L, 'phAdd'))
        .setMinValues(1)
        .setMaxValues(MAX_SELECT),
    ),
  );
  if (session.rollingOpen) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panel:time:${session.id}`)
          .setPlaceholder(t(L, 'phChangeTime'))
          .addOptions(
            ROLL_HOUR_CHOICES.map((h) => ({ label: t(L, 'endsIn', hoursLabel(h, L)), description: t(L, 'fromNow'), value: String(h), emoji: '⏰' })),
          ),
      ),
    );
  }
  const buttons = [];
  if (session.rollingOpen) {
    buttons.push(
      new ButtonBuilder().setCustomId(`panel:lock:${session.id}`).setLabel(t(L, 'btnLock')).setEmoji('⏹️').setStyle(ButtonStyle.Primary),
    );
  }
  buttons.push(
    // Öffnet ein Pop-up statt einer Nachricht – im vollen Leader-Kanal springt so nichts.
    new ButtonBuilder().setCustomId(`panel:manage:${session.id}`).setLabel(t(L, 'btnManage')).setEmoji('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel:rename:${session.id}`).setLabel(t(L, 'rename')).setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel:close:${session.id}`).setLabel(t(L, 'btnCloseNoWinner')).setStyle(ButtonStyle.Danger),
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
      lines.push(`**${purposeText(current, session.lang)}**`);
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
  const L = session.lang;
  const c = session.counts();
  const decided = c.total - c.pending;
  const color = session.winnerId ? COLORS.won : session.closed ? COLORS.none : session.rollsLocked ? COLORS.locked : COLORS.open;

  const head = [];
  if (panel) head.push(`🧵 <#${session.threadId}> · 👑 ${managerMentions(session.ownerId, session.managers).join(' ')}`);
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    head.push(t(L, 'wins', session.winnerId), t(L, 'withRoll', w.roll, purposeText(w.purpose, L)));
  } else if (session.closed) {
    head.push(t(L, 'closedNoWinner'));
  } else if (session.rollsLocked) {
    head.push(t(L, 'rollTimeOverHead'), t(L, 'leaderPicksNow'));
  } else {
    if (session.endsAt) head.push(t(L, 'rollTimeEnds', ts(session.endsAt, 'R')));
    head.push(`\`${progressBar(decided, c.total)}\` ${t(L, 'decided', decided, c.total)}`);
  }

  const lines = rollLines(session);
  const body = lines.length ? fit(lines, '\n', 3600, L) : t(L, 'noRollsYet');
  const embed = itemEmbed(session.item, color, { image: false }).setDescription(`${head.join('\n')}\n\n${body}`);

  // Wer nach dem Würfeln gepasst hat, behält seinen (verworfenen) Wurf durchgestrichen.
  const passed = session.withStatus(Status.PASSED).map((id) => {
    const roll = session.participants.get(id).roll;
    return roll === null ? `<@${id}>` : `<@${id}> ~~${roll}~~`;
  });
  const pending = session.withStatus(Status.PENDING).map((id) => `<@${id}>`);
  if (passed.length) embed.addFields({ name: t(L, 'fieldPassed', passed.length), value: fit(passed, ' ', FIELD_LIMIT, L), inline: true });
  if (pending.length && session.rollingOpen) {
    embed.addFields({ name: t(L, 'fieldPending', pending.length), value: fit(pending, ' ', FIELD_LIMIT, L), inline: true });
  }

  if (session.closed) {
    embed.setFooter({ text: t(L, 'footerDone') });
  } else if (session.rollsLocked) {
    embed.setFooter({ text: t(L, 'footerLocked', c.rolled, c.passed, c.pending) });
  } else {
    embed.setFooter({ text: panel ? t(L, 'footerPanel') : t(L, 'footerThread', session.rollMax) });
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
        .setPlaceholder(t(session.lang, 'phRollFor'))
        .addOptions(PURPOSES.map((p) => ({ label: purposeLabel(p.id, session.lang), value: p.id, emoji: p.emoji }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`loot:pass:${session.id}`).setLabel(t(session.lang, 'btnPass')).setEmoji('🚫').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/** Text der Item-Nachricht im Loot-Kanal (das Bild hängt als Datei daran). */
export function starterContent(session) {
  const L = session.lang;
  const { item } = session;
  const c = session.counts();
  const link = item.url ? ` · [Questlog](<${item.url}>)` : '';
  let status;
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    status = t(L, 'starterWon', session.winnerId, w.roll, purposeText(w.purpose, L));
  } else if (session.closed) status = t(L, 'starterClosed');
  else if (session.rollsLocked) status = t(L, 'starterLocked');
  else status = t(L, 'starterRunning', ts(session.endsAt, 'f'), ts(session.endsAt, 'R'));
  return `## ${ITEM_ICON} ${item.name}\n${status}\n${t(L, 'starterInfo', c.total, link)}`;
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

  const L = session.lang;
  let result;
  if (session.winnerId) {
    const w = session.participants.get(session.winnerId);
    result = t(L, 'summaryWinner', session.winnerId, w.roll, purposeText(w.purpose, L));
  } else if (session.closed) {
    result = t(L, 'starterClosed');
  } else {
    result = t(L, 'summaryLocked');
  }
  // Im Loot-Kanal hängt der Thread direkt darunter – dort reicht die Statistik.
  const extra = forLootChannel ? '' : ` · 🧵 <#${session.threadId}> · 👑 <@${session.ownerId}>`;
  embed.setDescription(`${result}\n-# ${t(L, 'summaryStats', c.rolled, c.passed)}${extra}`);
  if (session.closed) embed.setTimestamp();
  return embed;
}

/**
 * Pop-up „Spieler verwalten“: einen oder mehrere Spieler wählen und entfernen bzw. zurücksetzen.
 * Ein Pop-up statt einer Antwort im Kanal – sonst springt Discord im vollen Leader-Kanal hin und her.
 */
export function manageModal(session, preselected = []) {
  const L = session.lang;
  const users = new UserSelectMenuBuilder().setCustomId('users').setMinValues(1).setMaxValues(MAX_SELECT).setPlaceholder(t(L, 'manageSearch'));
  if (preselected.length) users.setDefaultUsers(preselected.slice(0, MAX_SELECT));
  const actions = [{ label: t(L, 'actRemove'), value: 'remove', emoji: '➖', description: t(L, 'actRemoveHint'), default: true }];
  if (session.rollingOpen) {
    actions.push({ label: t(L, 'actReset'), value: 'reset', emoji: '↩️', description: t(L, 'actResetHint') });
  }
  return new ModalBuilder()
    .setCustomId(`manage:${session.id}`)
    .setTitle(t(L, 'manageTitle', session.item.name).slice(0, 45))
    .addLabelComponents(
      new LabelBuilder().setLabel(t(L, 'managePlayers')).setDescription(t(L, 'managePlayersHint')).setUserSelectMenuComponent(users),
      new LabelBuilder()
        .setLabel(t(L, 'manageAction'))
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('action').setMinValues(1).setMaxValues(1).addOptions(actions)),
    );
}

/** Eingabefenster zum Umbenennen eines Items (scope: 'draft' oder 'panel'). */
export function renameModal(scope, id, currentName, lang = 'de') {
  return new ModalBuilder()
    .setCustomId(`rename:${scope}:${id}`)
    .setTitle(t(lang, 'renameTitle'))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(t(lang, 'renameLabel'))
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
  const state = session.rollsLocked ? t(session.lang, 'openWinnerPending') : t(session.lang, 'openEnds', ts(session.endsAt, 'R'));
  const panel = `https://discord.com/channels/${session.guildId}/${session.panelChannelId}/${session.panelMessageId}`;
  return `${ITEM_ICON} **${session.item.name}** · ${state} · 🎲 ${c.total - c.pending}/${c.total} · <#${session.threadId}> · [Panel](${panel})`;
}

/** Text für /hilfe bzw. /help. */
export const helpText = (lang = 'de') => t(lang, 'help', PURPOSES.map((p) => purposeText(p.id, lang)).join(' · '));

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
