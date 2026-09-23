import { SlashCommandBuilder } from 'discord.js';

export const lootCommand = new SlashCommandBuilder()
  .setName('loot')
  .setDescription('Ein Item zur Verlosung posten')
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName('item')
      .setDescription('Item-Name und/oder Questlog-Link')
      .setRequired(true)
      .setMaxLength(300),
  )
  .addAttachmentOption((o) => o.setName('bild').setDescription('Screenshot des Items (optional)'))
  .addIntegerOption((o) =>
    o.setName('dauer').setDescription('Dauer in Minuten (Standard: 10)').setMinValue(1).setMaxValue(1440),
  );

export const commands = [lootCommand];
