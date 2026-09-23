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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Mitglieder einer Rolle auflösen
    GatewayIntentBits.GuildMessages, // Posts im Leader-Kanal sehen
    GatewayIntentBits.MessageContent, // Screenshots, Links und @Erwähnungen lesen
  ],
  partials: [Partials.Channel],
});

// Kanäle können per /einrichten gesetzt werden; die .env-Werte gelten als Vorgabe.
const store = new SessionStore(process.env.DATA_FILE || 'data/sessions.json', {
  defaults: {
    leaderChannelId: process.env.LOOT_LEADER_CHANNEL_ID?.trim() || null,
    lootChannelId: process.env.LOOT_CHANNEL_ID?.trim() || null,
    rollHours: Number(process.env.LOOT_ROLL_HOURS) || 24,
  },
}).load();

const bot = createLootBot({
  client,
  store,
  botAdminIds: list(process.env.BOT_ADMIN_IDS),
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Eingeloggt als ${c.user.tag} · ${store.sessions.size} offene Verlosung(en)`);
  bot.restoreTimers();
  for (const guild of c.guilds.cache.values()) await bot.registerCommands(guild);
  if (c.user.username !== BOT_NAME) {
    await c.user.setUsername(BOT_NAME).catch((err) => console.warn(`Name nicht geändert: ${err.message}`));
  }
});
client.on(Events.GuildCreate, (guild) => bot.registerCommands(guild));
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
