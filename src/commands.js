import { ChannelType, SlashCommandBuilder } from 'discord.js';

export const leaderCommand = new SlashCommandBuilder()
  .setName('leader')
  .setDescription('Loot-Leader verwalten (nur Bot-Admins)')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('hinzufügen')
      .setDescription('Spieler oder Rolle zum Loot-Leader machen')
      .addMentionableOption((o) => o.setName('wer').setDescription('Spieler oder Rolle').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('entfernen')
      .setDescription('Loot-Leader-Rechte entziehen')
      .addMentionableOption((o) => o.setName('wer').setDescription('Spieler oder Rolle').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('liste').setDescription('Alle Loot-Leader anzeigen'));

export const setupCommand = new SlashCommandBuilder()
  .setName('einrichten')
  .setDescription('Kanäle für Loot and Liberty festlegen (nur Bot-Admins)')
  .setDMPermission(false)
  .addChannelOption((o) =>
    o
      .setName('leaderkanal')
      .setDescription('Hier posten Leader Items und wählen aus, wer rollen darf')
      .addChannelTypes(ChannelType.GuildText),
  )
  .addChannelOption((o) =>
    o
      .setName('lootkanal')
      .setDescription('Hierhin postet der Bot das Item mit Thread für die Spieler')
      .addChannelTypes(ChannelType.GuildText),
  )
  .addIntegerOption((o) =>
    o
      .setName('rollzeit')
      .setDescription('Standard-Rollzeit in Stunden (1–168); pro Item im Fenster änderbar')
      .setMinValue(1)
      .setMaxValue(168),
  );

export const lootCommand = new SlashCommandBuilder()
  .setName('loot')
  .setDescription('Verlosungen von Loot and Liberty')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('offen').setDescription('Alle laufenden Verlosungen anzeigen (nur Leader)'));

export const groupCommand = new SlashCommandBuilder()
  .setName('gruppe')
  .setDescription('Teilnehmer für den Tag festlegen – jeder Screenshot wird dann sofort verlost (nur Leader)')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('start').setDescription('Gruppe für heute festlegen (gilt max. 12 Stunden)'))
  .addSubcommand((s) => s.setName('ende').setDescription('Deine Gruppe beenden – danach wieder Auswahl pro Item'))
  .addSubcommand((s) => s.setName('status').setDescription('Deine aktive Gruppe anzeigen'));

export const helpCommand = new SlashCommandBuilder()
  .setName('hilfe')
  .setDescription('Wie funktioniert Loot and Liberty?')
  .setDMPermission(false);

export const commands = [leaderCommand, setupCommand, lootCommand, groupCommand, helpCommand];
