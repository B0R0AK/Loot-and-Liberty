/**
 * Alle Texte des Bots auf Deutsch und Englisch.
 * Die Sprache gilt pro Server (`/setup language:` bzw. `/einrichten sprache:`), Standard: Deutsch.
 * Werte sind Texte oder Funktionen (für Texte mit Platzhaltern).
 */

export const LANGUAGES = ['de', 'en'];
export const DEFAULT_LANGUAGE = 'de';
export const normalizeLang = (lang) => (LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE);

const de = {
  // Allgemein
  hours: (h) => (h === 1 ? '1 Stunde' : `${h} Stunden`),
  andMore: (n) => `… und ${n} weitere`,
  nobodyYet: '*noch niemand*',
  cancel: 'Abbrechen',
  rename: 'Namen ändern',
  expired: '⌛ Abgelaufen – poste das Item einfach neu.',
  notActive: 'Diese Verlosung ist nicht mehr aktiv.',
  onlyManagers: 'Diese Verlosung verwalten nur die dafür ausgewählten Leader.',
  onlyLeaders: 'Nur Loot-Leader können das.',
  onlyAdmins: 'Nur Bot-Admins (Server-Besitzer oder Administratoren) können das.',
  noMembers: '⚠️ In der Auswahl sind keine (menschlichen) Mitglieder.',
  genericError: '❌ Da ist etwas schiefgelaufen. Hat der Bot die nötigen Rechte (Threads, Nachrichten, Dateien)?',

  // Fenster „Wer darf rollen?“
  whoMayRoll: '### 👥 Wer darf rollen?',
  promptHint: 'Wähle unten Spieler oder Rollen aus – oder schreib `@Name` / `@Rolle` hier in den Kanal.',
  promptAfter: (lootChannelId) => `-# Danach landet das Item in <#${lootChannelId}> und alle Ausgewählten werden gepingt.`,
  fieldMayRoll: (n) => `🎲 Darf rollen${n ? ` (${n})` : ''}`,
  fieldManagedBy: '👑 Verwaltet von',
  fieldRollTime: '⏰ Rollzeit',
  fieldRollTimeEach: '⏰ Rollzeit je Item',
  phMayRoll: '🎲 Wer darf rollen? Spieler oder Rollen …',
  phManagers: '👑 Wer verwaltet? Leader oder Leader-Rollen (optional) …',
  phRollTime: '⏰ Rollzeit …',
  btnPost: 'Posten & Spieler pingen',
  cancelled: (name) => `Abgebrochen: **${name}**`,
  onlyAuthor: (id) => `Das kann nur <@${id}> auswählen.`,
  onlyAuthorRename: (id) => `Das kann nur <@${id}> ändern.`,
  notLeaderPost: 'Nur Loot-Leader können Items verlosen. Ein Bot-Admin kann dich mit `/leader hinzufügen` freischalten.',
  noLootChannel: 'Es ist noch kein Loot-Kanal eingerichtet. Ein Bot-Admin kann das mit `/einrichten lootkanal:#kanal` tun.',

  // Tagesgruppe
  groupTitle: '📋 Gruppe für heute',
  groupIntro: 'Wähle, **wer heute rollen darf** – z. B. alle, die beim Gildenboss dabei waren.',
  groupAfter:
    '-# Danach wird jeder Screenshot, den du im Leader-Kanal postest, sofort mit dieser Gruppe verlost – auch mehrere Bilder in einer Nachricht.',
  phMayRollToday: '🎲 Wer darf heute rollen? Spieler oder Rollen …',
  btnStartGroup: 'Gruppe starten',
  groupActive: (until, rel) => `📋 **Gruppe aktiv** – gilt bis ${until} (${rel}) oder \`/gruppe ende\``,
  groupMayRoll: '🎲 **Darf rollen:**',
  groupManagedBy: '👑 **Verwaltet von:**',
  groupRollTime: '⏰ **Rollzeit:**',
  groupCount: (n) => `🗂️ **Bisher verlost:** ${n} Item(s)`,
  groupPostNow: '-# Poste jetzt Screenshots oder Questlog-Links im Leader-Kanal – jeder wird sofort verlost.',
  groupResolved: (n) => `-# ${n} Spieler aufgelöst.`,
  groupOnlyLeaders: 'Nur Loot-Leader können Gruppen anlegen.',
  groupNone: 'Du hast gerade keine aktive Gruppe. Starte eine mit `/gruppe start`.',
  groupNoneShort: 'Du hast gerade keine aktive Gruppe.',
  groupEnded: (n) => `✅ Gruppe beendet (${n} Item(s) verlost). Ab jetzt wählst du wieder pro Item aus, wer rollen darf.`,
  groupNeedsSetup: 'Erst Leader- und Loot-Kanal einrichten: `/einrichten`.',
  groupCancelled: 'Abgebrochen – keine Gruppe gestartet.',
  groupExpired: '⌛ Abgelaufen – starte nochmal mit `/gruppe start`.',
  groupEmpty: '⚠️ In deiner Gruppe sind keine (menschlichen) Mitglieder. Starte sie mit `/gruppe start` neu.',
  beingRaffled: (name) => `⏳ **${name}** wird verlost …`,

  // Leader-Panel
  phWinner: '👑 Gewinner auswählen …',
  phAdd: '➕ Spieler oder Rollen hinzufügen …',
  phChangeTime: '⏰ Rollzeit ändern …',
  endsIn: (h) => `Endet in ${h}`,
  fromNow: 'ab jetzt gerechnet',
  btnLock: 'Rollen jetzt beenden',
  btnManage: 'Spieler verwalten',
  btnCloseNoWinner: 'Ohne Gewinner schließen',

  // Roll-Liste
  wins: (id) => `### 🏆 <@${id}> gewinnt`,
  withRoll: (roll, purpose) => `mit **${roll}** · ${purpose}`,
  closedNoWinner: '### ✖️ Ohne Gewinner geschlossen',
  rollTimeOverHead: '### ⏹️ Rollzeit vorbei',
  leaderPicksNow: 'Der Leader wählt jetzt den Gewinner.',
  rollTimeEnds: (rel) => `⏰ Rollzeit endet **${rel}**`,
  decided: (d, total) => `**${d}**/${total} entschieden`,
  noRollsYet: '*Noch keine Würfe – wähle unten, wofür du rollst.*',
  fieldPassed: (n) => `🚫 Gepasst · ${n}`,
  fieldPending: (n) => `⏳ Noch offen · ${n}`,
  footerDone: 'Verlosung abgeschlossen',
  footerLocked: (rolled, passed, pending) => `${rolled} gewürfelt · ${passed} gepasst${pending ? ` · ${pending} ohne Entscheidung` : ''}`,
  footerPanel: 'Rollzeit endet',
  footerThread: (max) => `🎲 1–${max} · nur ausgewählte Spieler · Rollzeit endet`,
  phRollFor: '🎲 Würfeln für …',
  btnPass: 'Passen',

  // Item-Nachricht im Loot-Kanal
  starterWon: (id, roll, purpose) => `🏆 **Vergeben an <@${id}>** · ${roll} · ${purpose}`,
  starterClosed: '✖️ **Ohne Gewinner geschlossen**',
  starterLocked: '⏹️ **Rollzeit vorbei** · der Leader wählt den Gewinner',
  starterRunning: (end, rel) => `🎲 **Verlosung läuft** · endet ${end} (${rel})`,
  starterInfo: (n, link) => `-# 👥 ${n} Spieler${link} · Würfeln & Passen im Thread ↓`,

  // Ergebnis-Karte
  summaryWinner: (id, roll, purpose) => `🏆 **Gewinner:** <@${id}>\n🎲 **${roll}** · ${purpose}`,
  summaryLocked: '⏹️ **Rollzeit vorbei**\nDer Gewinner wird gerade gewählt.',
  summaryStats: (rolled, passed) => `${rolled} gewürfelt · ${passed} gepasst`,

  // Pop-ups
  manageTitle: (name) => `Spieler verwalten – ${name}`,
  managePlayers: 'Spieler',
  managePlayersHint: 'Einen oder mehrere auswählen',
  manageSearch: 'Spieler suchen …',
  manageAction: 'Aktion',
  actRemove: 'Aus Verlosung entfernen',
  actRemoveHint: 'Wurf fällt weg, kann nicht mehr würfeln',
  actReset: 'Entscheidung zurücksetzen',
  actResetHint: 'Spieler kann neu würfeln oder passen',
  renameTitle: 'Item-Namen ändern',
  renameLabel: 'Name des Items',
  renameEmpty: 'Der Name darf nicht leer sein.',

  // /loot offen
  openWinnerPending: '⏹️ Gewinner offen',
  openEnds: (rel) => `⏰ endet ${rel}`,
  openNone: 'Gerade läuft keine Verlosung.',
  openTitle: (n) => `**Laufende Verlosungen (${n})**`,

  // Spieler-Aktionen
  rolled: (roll, purpose) => `🎲 Du hast **${roll}** gewürfelt (${purpose}).`,
  passedDropped: (roll) => `🚫 Du hast gepasst – dein Wurf **${roll}** zählt nicht mehr. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.`,
  passed: '🚫 Du hast gepasst. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.',
  alreadyRolled: (roll, purpose) => `Du hast bereits gewürfelt: **${roll}** (${purpose}). Du kannst noch passen.`,
  alreadyPassed: 'Du hast bereits gepasst. Neu würfeln geht nur, wenn der Leader dich zurücksetzt.',
  reason: {
    closed: 'Diese Verlosung ist bereits beendet.',
    locked: 'Die Rollzeit ist vorbei.',
    'not-eligible': 'Du wurdest für dieses Item nicht ausgewählt und kannst nicht würfeln.',
    'bad-purpose': 'Unbekannte Auswahl.',
    'not-rolled': 'Dieser Spieler hat nicht gewürfelt.',
    'still-pending': 'Dieser Spieler hat noch nichts entschieden.',
  },
  reasonFallback: 'Das geht gerade nicht.',

  // Thread- und Hinweis-Nachrichten
  ping: (name) => `🔔 **${name}** – ihr seid dran! Wählt oben, wofür ihr rollt, oder passt. `,
  pingAdded: (name) => `➕ Nachträglich dabei bei **${name}**: `,
  lockTimeout: '⏰ **Die Rollzeit ist vorbei.**',
  lockLeader: '⏹️ **Der Leader hat das Rollen beendet.**',
  lockTail: ' Der Leader wählt jetzt den Gewinner. 🔒 Der Thread wird geschlossen – das Ergebnis steht danach hier und an der Item-Nachricht.',
  noticeLocked: (name) => `⏹️ **${name}**: Rollen beendet – bitte Gewinner auswählen.`,
  noticeAllDecided: (name) => `✅ **${name}**: Alle haben entschieden – der Gewinner kann ausgewählt werden.`,
  congrats: (id, name, roll, purpose) => `🏆 Glückwunsch <@${id}>! **${name}** gehört dir (Roll **${roll}** · ${purpose}).`,
  closedThread: 'Verlosung ohne Gewinner geschlossen.',
  timeChanged: (rel) => `⏰ **Rollzeit geändert:** endet jetzt ${rel}.`,
  allAlreadyIn: 'Alle Ausgewählten sind schon dabei (oder die Rollzeit ist vorbei).',
  wasReset: (id) => `↩️ <@${id}>, deine Entscheidung wurde vom Leader zurückgesetzt – du kannst neu wählen.`,
  wasRemoved: (id) => `➖ <@${id}> wurde vom Leader aus der Verlosung entfernt.`,

  // /leader
  leadersList: (list) => `**Loot-Leader:** ${list || '*noch keine*'}`,
  leadersAdminsNote: '*Bot-Admins (Server-Besitzer und Administratoren) haben immer Leader-Rechte.*',
  leadersOnlyAdmins: 'Nur Bot-Admins (Server-Besitzer oder Administratoren) können Leader festlegen.',
  leaderNoBots: 'Bots können keine Leader sein.',
  leaderNoEveryone: '@everyone kann kein Leader sein.',
  leaderAdded: (l) => `✅ ${l} ist jetzt Loot-Leader.`,
  leaderAlready: (l) => `${l} ist bereits Loot-Leader.`,
  leaderRemoved: (l) => `✅ ${l} ist kein Loot-Leader mehr.`,
  leaderWasNot: (l) => `${l} war kein Loot-Leader.`,

  // /einrichten
  notSet: '*nicht gesetzt*',
  setupInfo: (leader, loot, hours, lang) =>
    `**Leader-Kanal:** ${leader} – hier posten Leader Items\n` +
    `**Loot-Kanal:** ${loot} – hier landen Item + Thread für die Spieler\n` +
    `**Standard-Rollzeit:** ${hours} – pro Item im Fenster änderbar\n` +
    `**Sprache:** ${lang}`,
  languageName: 'Deutsch',

  // /hilfe
  help: (purposes) =>
    [
      '## 🎁 Loot and Liberty',
      '**So läuft eine Verlosung**',
      '1. Leader posten einen Screenshot oder Questlog-Link im **Leader-Kanal**.',
      '2. Im Fenster darunter wählen sie, **wer rollen darf**, **wer verwaltet** und die **Rollzeit**.',
      '3. Der Bot postet das Item im **Loot-Kanal** mit Thread und pingt die Spieler an.',
      `4. Spieler wählen im Thread, wofür sie würfeln (${purposes}), oder passen – auch noch nach dem Würfeln. Neu würfeln geht nur, wenn der Leader sie zurücksetzt.`,
      '5. Die Verwalter wählen im **Leader-Panel** den Gewinner. Dort können sie auch Spieler hinzufügen, zurücksetzen oder entfernen und die Rollzeit ändern.',
      '',
      '**Befehle**',
      '`/gruppe start` · `/gruppe ende` · `/gruppe status` – Teilnehmer für den Tag festlegen, dann jeden Screenshot sofort verlosen (Leader)',
      '`/loot offen` – laufende Verlosungen (Leader)',
      '`/leader liste` – alle Loot-Leader',
      '`/leader hinzufügen` · `/leader entfernen` – Leader festlegen (Bot-Admins)',
      '`/einrichten` – Kanäle, Standard-Rollzeit und Sprache (Bot-Admins)',
      '`/hilfe` – diese Übersicht',
    ].join('\n'),

  // Gründe
  purposes: {
    bis: 'BiS-Item',
    potential: 'Potential',
    watermark: 'Watermark Upgrade',
    inherit: 'Vererbung',
    pvp: 'PvP',
    offspec: 'Offspec',
    litho: 'Lithografie',
    sell: 'Verkauf',
  },
};

const en = {
  hours: (h) => (h === 1 ? '1 hour' : `${h} hours`),
  andMore: (n) => `… and ${n} more`,
  nobodyYet: '*nobody yet*',
  cancel: 'Cancel',
  rename: 'Rename',
  expired: '⌛ Expired – just post the item again.',
  notActive: 'This loot roll is no longer active.',
  onlyManagers: 'Only the leaders selected for this loot roll can manage it.',
  onlyLeaders: 'Only loot leaders can do that.',
  onlyAdmins: 'Only bot admins (server owner or administrators) can do that.',
  noMembers: '⚠️ The selection contains no (human) members.',
  genericError: '❌ Something went wrong. Does the bot have the required permissions (threads, messages, files)?',

  whoMayRoll: '### 👥 Who may roll?',
  promptHint: 'Pick players or roles below – or type `@name` / `@role` in this channel.',
  promptAfter: (lootChannelId) => `-# The item is then posted in <#${lootChannelId}> and everyone selected gets pinged.`,
  fieldMayRoll: (n) => `🎲 May roll${n ? ` (${n})` : ''}`,
  fieldManagedBy: '👑 Managed by',
  fieldRollTime: '⏰ Roll time',
  fieldRollTimeEach: '⏰ Roll time per item',
  phMayRoll: '🎲 Who may roll? Players or roles …',
  phManagers: '👑 Who manages? Leaders or leader roles (optional) …',
  phRollTime: '⏰ Roll time …',
  btnPost: 'Post & ping players',
  cancelled: (name) => `Cancelled: **${name}**`,
  onlyAuthor: (id) => `Only <@${id}> can choose this.`,
  onlyAuthorRename: (id) => `Only <@${id}> can change this.`,
  notLeaderPost: 'Only loot leaders can raffle items. A bot admin can unlock you with `/leader add`.',
  noLootChannel: 'No loot channel has been set up yet. A bot admin can do that with `/setup lootchannel:#channel`.',

  groupTitle: '📋 Group for today',
  groupIntro: 'Choose **who may roll today** – e.g. everyone who joined the guild boss.',
  groupAfter: '-# After that, every screenshot you post in the leader channel is raffled to this group right away – multiple images in one message too.',
  phMayRollToday: '🎲 Who may roll today? Players or roles …',
  btnStartGroup: 'Start group',
  groupActive: (until, rel) => `📋 **Group active** – valid until ${until} (${rel}) or \`/group end\``,
  groupMayRoll: '🎲 **May roll:**',
  groupManagedBy: '👑 **Managed by:**',
  groupRollTime: '⏰ **Roll time:**',
  groupCount: (n) => `🗂️ **Raffled so far:** ${n} item(s)`,
  groupPostNow: '-# Now post screenshots or Questlog links in the leader channel – each one is raffled right away.',
  groupResolved: (n) => `-# ${n} players resolved.`,
  groupOnlyLeaders: 'Only loot leaders can create groups.',
  groupNone: "You don't have an active group. Start one with `/group start`.",
  groupNoneShort: "You don't have an active group.",
  groupEnded: (n) => `✅ Group ended (${n} item(s) raffled). From now on you choose who may roll per item again.`,
  groupNeedsSetup: 'Set up the leader and loot channels first: `/setup`.',
  groupCancelled: 'Cancelled – no group started.',
  groupExpired: '⌛ Expired – run `/group start` again.',
  groupEmpty: '⚠️ Your group contains no (human) members. Restart it with `/group start`.',
  beingRaffled: (name) => `⏳ Raffling **${name}** …`,

  phWinner: '👑 Choose winner …',
  phAdd: '➕ Add players or roles …',
  phChangeTime: '⏰ Change roll time …',
  endsIn: (h) => `Ends in ${h}`,
  fromNow: 'counted from now',
  btnLock: 'End rolling now',
  btnManage: 'Manage players',
  btnCloseNoWinner: 'Close without winner',

  wins: (id) => `### 🏆 <@${id}> wins`,
  withRoll: (roll, purpose) => `with **${roll}** · ${purpose}`,
  closedNoWinner: '### ✖️ Closed without winner',
  rollTimeOverHead: '### ⏹️ Roll time over',
  leaderPicksNow: 'The leader is now choosing the winner.',
  rollTimeEnds: (rel) => `⏰ Roll time ends **${rel}**`,
  decided: (d, total) => `**${d}**/${total} decided`,
  noRollsYet: '*No rolls yet – choose below what you roll for.*',
  fieldPassed: (n) => `🚫 Passed · ${n}`,
  fieldPending: (n) => `⏳ Still open · ${n}`,
  footerDone: 'Loot roll finished',
  footerLocked: (rolled, passed, pending) => `${rolled} rolled · ${passed} passed${pending ? ` · ${pending} undecided` : ''}`,
  footerPanel: 'Roll time ends',
  footerThread: (max) => `🎲 1–${max} · selected players only · Roll time ends`,
  phRollFor: '🎲 Roll for …',
  btnPass: 'Pass',

  starterWon: (id, roll, purpose) => `🏆 **Awarded to <@${id}>** · ${roll} · ${purpose}`,
  starterClosed: '✖️ **Closed without winner**',
  starterLocked: '⏹️ **Roll time over** · the leader is choosing the winner',
  starterRunning: (end, rel) => `🎲 **Loot roll running** · ends ${end} (${rel})`,
  starterInfo: (n, link) => `-# 👥 ${n} players${link} · Roll & pass in the thread ↓`,

  summaryWinner: (id, roll, purpose) => `🏆 **Winner:** <@${id}>\n🎲 **${roll}** · ${purpose}`,
  summaryLocked: '⏹️ **Roll time over**\nThe winner is being chosen.',
  summaryStats: (rolled, passed) => `${rolled} rolled · ${passed} passed`,

  manageTitle: (name) => `Manage players – ${name}`,
  managePlayers: 'Players',
  managePlayersHint: 'Pick one or more',
  manageSearch: 'Search players …',
  manageAction: 'Action',
  actRemove: 'Remove from loot roll',
  actRemoveHint: 'Their roll is dropped, they can no longer roll',
  actReset: 'Reset decision',
  actResetHint: 'Player can roll or pass again',
  renameTitle: 'Rename item',
  renameLabel: 'Item name',
  renameEmpty: 'The name must not be empty.',

  openWinnerPending: '⏹️ Winner pending',
  openEnds: (rel) => `⏰ ends ${rel}`,
  openNone: 'No loot roll is running right now.',
  openTitle: (n) => `**Running loot rolls (${n})**`,

  rolled: (roll, purpose) => `🎲 You rolled **${roll}** (${purpose}).`,
  passedDropped: (roll) => `🚫 You passed – your roll **${roll}** no longer counts. You can only roll again if the leader resets you.`,
  passed: '🚫 You passed. You can only roll again if the leader resets you.',
  alreadyRolled: (roll, purpose) => `You already rolled: **${roll}** (${purpose}). You can still pass.`,
  alreadyPassed: 'You already passed. You can only roll again if the leader resets you.',
  reason: {
    closed: 'This loot roll has already ended.',
    locked: 'The roll time is over.',
    'not-eligible': "You weren't selected for this item and can't roll.",
    'bad-purpose': 'Unknown choice.',
    'not-rolled': "This player hasn't rolled.",
    'still-pending': "This player hasn't decided yet.",
  },
  reasonFallback: "That's not possible right now.",

  ping: (name) => `🔔 **${name}** – it's your turn! Choose above what you roll for, or pass. `,
  pingAdded: (name) => `➕ Added to **${name}**: `,
  lockTimeout: '⏰ **The roll time is over.**',
  lockLeader: '⏹️ **The leader ended the rolling.**',
  lockTail: ' The leader is now choosing the winner. 🔒 The thread is being closed – the result will show up here and on the item message.',
  noticeLocked: (name) => `⏹️ **${name}**: Rolling ended – please choose the winner.`,
  noticeAllDecided: (name) => `✅ **${name}**: Everyone has decided – the winner can be chosen.`,
  congrats: (id, name, roll, purpose) => `🏆 Congratulations <@${id}>! **${name}** is yours (roll **${roll}** · ${purpose}).`,
  closedThread: 'Loot roll closed without winner.',
  timeChanged: (rel) => `⏰ **Roll time changed:** now ends ${rel}.`,
  allAlreadyIn: 'Everyone selected is already in (or the roll time is over).',
  wasReset: (id) => `↩️ <@${id}>, the leader reset your decision – you can choose again.`,
  wasRemoved: (id) => `➖ <@${id}> was removed from the loot roll by the leader.`,

  leadersList: (list) => `**Loot leaders:** ${list || '*none yet*'}`,
  leadersAdminsNote: '*Bot admins (server owner and administrators) always have leader rights.*',
  leadersOnlyAdmins: 'Only bot admins (server owner or administrators) can set leaders.',
  leaderNoBots: "Bots can't be leaders.",
  leaderNoEveryone: "@everyone can't be a leader.",
  leaderAdded: (l) => `✅ ${l} is now a loot leader.`,
  leaderAlready: (l) => `${l} is already a loot leader.`,
  leaderRemoved: (l) => `✅ ${l} is no longer a loot leader.`,
  leaderWasNot: (l) => `${l} wasn't a loot leader.`,

  notSet: '*not set*',
  setupInfo: (leader, loot, hours, lang) =>
    `**Leader channel:** ${leader} – leaders post items here\n` +
    `**Loot channel:** ${loot} – item + thread for the players go here\n` +
    `**Default roll time:** ${hours} – can be changed per item in the window\n` +
    `**Language:** ${lang}`,
  languageName: 'English',

  help: (purposes) =>
    [
      '## 🎁 Loot and Liberty',
      '**How a loot roll works**',
      '1. Leaders post a screenshot or Questlog link in the **leader channel**.',
      '2. In the window below they choose **who may roll**, **who manages** and the **roll time**.',
      '3. The bot posts the item in the **loot channel** with a thread and pings the players.',
      `4. Players choose in the thread what they roll for (${purposes}), or pass – even after rolling. Rolling again only works if the leader resets them.`,
      '5. The managers choose the winner in the **leader panel**. There they can also add, reset or remove players and change the roll time.',
      '',
      '**Commands**',
      '`/group start` · `/group end` · `/group status` – set the participants for the day, then raffle every screenshot right away (leaders)',
      '`/loot open` – running loot rolls (leaders)',
      '`/leader list` – all loot leaders',
      '`/leader add` · `/leader remove` – set leaders (bot admins)',
      '`/setup` – channels, default roll time and language (bot admins)',
      '`/help` – this overview',
    ].join('\n'),

  purposes: {
    bis: 'BiS item',
    potential: 'Potential',
    watermark: 'Watermark upgrade',
    inherit: 'Inheritance',
    pvp: 'PvP',
    offspec: 'Offspec',
    litho: 'Lithograph',
    sell: 'Sell',
  },
};

export const STRINGS = { de, en };

/** Text in der gewünschten Sprache; Funktionen werden mit den Argumenten aufgerufen. */
export function t(lang, key, ...args) {
  const value = STRINGS[normalizeLang(lang)][key] ?? STRINGS[DEFAULT_LANGUAGE][key];
  if (value === undefined) throw new Error(`Unbekannter Text: ${key}`);
  return typeof value === 'function' ? value(...args) : value;
}
