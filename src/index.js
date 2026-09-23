import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { createLootBot } from './bot.js';
import { SessionStore } from './store.js';

const BOT_NAME = process.env.BOT_NAME || 'Loot and Liberty';
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN fehlt (siehe .env.example).');
  process.exit(1);
}

const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const lootChannelIds = list(process.env.LOOT_CHANNEL_IDS);
if (!lootChannelIds.length) {
  console.error('LOOT_CHANNEL_IDS fehlt – in welchem Kanal soll der Bot Loot erkennen?');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Mitglieder einer Rolle auflösen
    GatewayIntentBits.GuildMessages, // Posts im Loot-Kanal sehen
    GatewayIntentBits.MessageContent, // Screenshots, Links und @Erwähnungen lesen
  ],
  partials: [Partials.Channel],
});

const store = new SessionStore(process.env.DATA_FILE || 'data/sessions.json').load();
const bot = createLootBot({
  client,
  store,
  lootChannelIds,
  leaderRoleIds: list(process.env.LOOT_LEADER_ROLE_IDS),
  managerIds: list(process.env.LOOT_MANAGER_IDS),
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Eingeloggt als ${c.user.tag} · Loot-Kanäle: ${lootChannelIds.join(', ')} · ${store.sessions.size} offene Verlosung(en)`);
  if (c.user.username !== BOT_NAME) {
    await c.user.setUsername(BOT_NAME).catch((err) => console.warn(`Name nicht geändert: ${err.message}`));
  }
});
client.on(Events.MessageCreate, bot.onMessage);
client.on(Events.InteractionCreate, bot.onInteraction);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    client.destroy();
    process.exit(0);
  });
}

client.login(token);
