import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LootSession } from './session.js';

/**
 * Speichert offene Verlosungen in einer JSON-Datei, damit sie einen
 * Neustart des Bots überleben.
 */
export class SessionStore {
  constructor(file) {
    this.file = file;
    this.sessions = new Map();
    this.timer = null;
  }

  load() {
    if (!this.file) return this;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const raw of data.sessions ?? []) this.sessions.set(raw.id, LootSession.fromJSON(raw));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Konnte gespeicherte Verlosungen nicht laden:', err.message);
    }
    return this;
  }

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
    writeFileSync(tmp, JSON.stringify({ sessions: [...this.sessions.values()] }, null, 2));
    renameSync(tmp, this.file);
  }
}
