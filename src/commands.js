import { ChannelType, SlashCommandBuilder } from 'discord.js';

/*
 * Befehle heißen intern englisch (/setup, /group …). Discord zeigt jedem Nutzer automatisch
 * die Übersetzung in seiner Discord-Sprache – auf Deutsch also /einrichten, /gruppe …
 */
const de = (name, description) => ({ name: { de: name }, description: { de: description } });

function localize(builder, { name, description }) {
  return builder.setNameLocalizations(name).setDescriptionLocalizations(description);
}

export const leaderCommand = localize(
  new SlashCommandBuilder().setName('leader').setDescription('Manage loot leaders (bot admins only)').setDMPermission(false),
  de('leader', 'Loot-Leader verwalten (nur Bot-Admins)'),
)
  .addSubcommand((s) =>
    localize(s.setName('add').setDescription('Make a player or role a loot leader'), de('hinzufügen', 'Spieler oder Rolle zum Loot-Leader machen'))
      .addMentionableOption((o) =>
        localize(o.setName('who').setDescription('Player or role').setRequired(true), de('wer', 'Spieler oder Rolle')),
      ),
  )
  .addSubcommand((s) =>
    localize(s.setName('remove').setDescription('Revoke loot leader rights'), de('entfernen', 'Loot-Leader-Rechte entziehen'))
      .addMentionableOption((o) =>
        localize(o.setName('who').setDescription('Player or role').setRequired(true), de('wer', 'Spieler oder Rolle')),
      ),
  )
  .addSubcommand((s) => localize(s.setName('list').setDescription('Show all loot leaders'), de('liste', 'Alle Loot-Leader anzeigen')));

export const setupCommand = localize(
  new SlashCommandBuilder().setName('setup').setDescription('Configure Loot and Liberty (bot admins only)').setDMPermission(false),
  de('einrichten', 'Loot and Liberty einrichten (nur Bot-Admins)'),
)
  .addChannelOption((o) =>
    localize(
      o.setName('leaderchannel').setDescription('Leaders post items here and choose who may roll').addChannelTypes(ChannelType.GuildText),
      de('leaderkanal', 'Hier posten Leader Items und wählen aus, wer rollen darf'),
    ),
  )
  .addChannelOption((o) =>
    localize(
      o.setName('lootchannel').setDescription('The bot posts the item with a thread for the players here').addChannelTypes(ChannelType.GuildText),
      de('lootkanal', 'Hierhin postet der Bot das Item mit Thread für die Spieler'),
    ),
  )
  .addIntegerOption((o) =>
    localize(
      o.setName('rolltime').setDescription('Default roll time in hours (1–168); changeable per item').setMinValue(1).setMaxValue(168),
      de('rollzeit', 'Standard-Rollzeit in Stunden (1–168); pro Item im Fenster änderbar'),
    ),
  )
  .addStringOption((o) =>
    localize(o.setName('language').setDescription('Language of the bot on this server'), de('sprache', 'Sprache des Bots auf diesem Server')).addChoices(
      { name: 'Deutsch', value: 'de' },
      { name: 'English', value: 'en' },
    ),
  );

export const lootCommand = localize(
  new SlashCommandBuilder().setName('loot').setDescription('Loot rolls of Loot and Liberty').setDMPermission(false),
  de('loot', 'Verlosungen von Loot and Liberty'),
).addSubcommand((s) => localize(s.setName('open').setDescription('Show all running loot rolls (leaders only)'), de('offen', 'Alle laufenden Verlosungen anzeigen (nur Leader)')));

export const groupCommand = localize(
  new SlashCommandBuilder()
    .setName('group')
    .setDescription("Set the day's participants – every screenshot is then raffled right away (leaders only)")
    .setDMPermission(false),
  de('gruppe', 'Teilnehmer für den Tag festlegen – jeder Screenshot wird dann sofort verlost (nur Leader)'),
)
  .addSubcommand((s) => localize(s.setName('start').setDescription("Set today's group (valid for max. 12 hours)"), de('start', 'Gruppe für heute festlegen (gilt max. 12 Stunden)')))
  .addSubcommand((s) => localize(s.setName('end').setDescription('End your group – back to choosing per item'), de('ende', 'Deine Gruppe beenden – danach wieder Auswahl pro Item')))
  .addSubcommand((s) => localize(s.setName('status').setDescription('Show your active group'), de('status', 'Deine aktive Gruppe anzeigen')));

export const helpCommand = localize(
  new SlashCommandBuilder().setName('help').setDescription('How does Loot and Liberty work?').setDMPermission(false),
  de('hilfe', 'Wie funktioniert Loot and Liberty?'),
);

export const commands = [leaderCommand, setupCommand, lootCommand, groupCommand, helpCommand];
