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
  );

export const commands = [leaderCommand, setupCommand];
