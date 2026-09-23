import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LootSession } from './session.js';

const emptyGuild = () => ({ leaderChannelId: null, lootChannelId: null, leaders: { users: [], roles: [] } });

/**
 * Speichert offene Verlosungen und die Server-Einstellungen (Kanäle, Leader)
 * in einer JSON-Datei, damit sie einen Neustart des Bots überleben.
 */
export class SessionStore {
  constructor(file, { defaults = {} } = {}) {
    this.file = file;
    this.defaults = defaults;
    this.sessions = new Map();
    this.guilds = new Map();
    this.timer = null;
  }

  load() {
    if (!this.file) return this;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const raw of data.sessions ?? []) this.sessions.set(raw.id, LootSession.fromJSON(raw));
      for (const [id, cfg] of Object.entries(data.guilds ?? {})) this.guilds.set(id, { ...emptyGuild(), ...cfg });
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Konnte gespeicherte Daten nicht laden:', err.message);
    }
    return this;
  }

  // ---------- Verlosungen ----------

  get(id) {
    return this.sessions.get(id);
  }

  set(session) {
    this.sessions.set(session.id, session);
    this.save();
  }

  delete(id) {
    this.sessions.delete(id);
    this.save();
  }

  // ---------- Server-Einstellungen ----------

  /** Einstellungen eines Servers; nicht gesetzte Kanäle fallen auf die .env-Werte zurück. */
  guild(guildId) {
    const cfg = this.guilds.get(guildId) ?? emptyGuild();
    return {
      ...cfg,
      leaderChannelId: cfg.leaderChannelId ?? this.defaults.leaderChannelId ?? null,
      lootChannelId: cfg.lootChannelId ?? this.defaults.lootChannelId ?? null,
    };
  }

  updateGuild(guildId, fn) {
    const cfg = structuredClone(this.guilds.get(guildId) ?? emptyGuild());
    fn(cfg);
    this.guilds.set(guildId, cfg);
    this.save();
    return this.guild(guildId);
  }

  /** Leader (Nutzer oder Rolle) hinzufügen/entfernen. Gibt true zurück, wenn sich etwas geändert hat. */
  setLeader(guildId, kind, id, isLeader) {
    let changed = false;
    this.updateGuild(guildId, (cfg) => {
      const list = cfg.leaders[kind];
      const has = list.includes(id);
      if (isLeader && !has) list.push(id);
      if (!isLeader && has) list.splice(list.indexOf(id), 1);
      changed = has !== isLeader;
    });
    return changed;
  }

  // ---------- Datei ----------

  /** Verzögert und gebündelt schreiben. */
  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 500);
  }

  flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const data = { sessions: [...this.sessions.values()], guilds: Object.fromEntries(this.guilds) };
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }
}
