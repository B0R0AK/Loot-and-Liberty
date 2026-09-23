import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createLootBot } from './bot.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN fehlt (siehe .env.example).');
  process.exit(1);
}

const bot = createLootBot({
  leaderRoleIds: (process.env.LOOT_LEADER_ROLE_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  defaultMinutes: Number(process.env.LOOT_DEFAULT_MINUTES) || 10,
});

// GuildMembers wird gebraucht, um alle Mitglieder einer Rolle aufzulösen.
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once(Events.ClientReady, (c) => console.log(`Eingeloggt als ${c.user.tag}`));
client.on(Events.InteractionCreate, bot.onInteraction);

client.login(token);
