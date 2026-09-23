import { randomInt } from 'node:crypto';

export const Status = Object.freeze({
  PENDING: 'pending',
  ROLLED: 'rolled',
  PASSED: 'passed',
});

/** Wofür gewürfelt wird – in dieser Reihenfolge wird auch die Liste gruppiert. */
export const PURPOSES = Object.freeze([
  { id: 'bis', label: 'BiS-Item', emoji: '⭐' },
  { id: 'watermark', label: 'Watermark Upgrade', emoji: '💧' },
  { id: 'litho', label: 'Lithografie', emoji: '📜' },
  { id: 'sell', label: 'Verkauf', emoji: '💰' },
  { id: 'potential', label: 'Potential', emoji: '✨' },
]);

export const purposeById = (id) => PURPOSES.find((p) => p.id === id);
const purposeRank = (id) => {
  const i = PURPOSES.findIndex((p) => p.id === id);
  return i === -1 ? PURPOSES.length : i;
};

/** Standard-Würfel: eine Zahl von 1 bis max (inklusive). */
export function rollDie(max = 100) {
  return randomInt(1, max + 1);
}

/**
 * Eine Verlosung für ein Item. Reine Logik ohne Discord-Abhängigkeiten.
 * `rollMax` ist für spätere Erweiterungen (anderer Zahlenbereich) schon vorbereitet.
 */
export class LootSession {
  constructor({ id, ownerId, item, eligibleIds, names = {}, rollMax = 100, ...rest }) {
    if (!eligibleIds?.length) throw new Error('Mindestens ein Teilnehmer wird benötigt.');
    this.id = id;
    this.ownerId = ownerId;
    this.item = item;
    this.names = names;
    this.rollMax = rollMax;
    this.guildId = rest.guildId ?? null;
    this.channelId = rest.channelId ?? null;
    this.threadId = rest.threadId ?? null;
    this.messageId = rest.messageId ?? null;
    this.panelChannelId = rest.panelChannelId ?? null;
    this.panelMessageId = rest.panelMessageId ?? null;
    this.sourceUrl = rest.sourceUrl ?? null;
    this.createdAt = rest.createdAt ?? Date.now();
    this.closed = false;
    this.closeReason = null;
    this.winnerId = null;
    this.participants = new Map(
      [...new Set(eligibleIds)].map((uid) => [uid, { status: Status.PENDING, roll: null, purpose: null, at: null }]),
    );
  }

  isEligible(userId) {
    return this.participants.has(userId);
  }

  nameOf(userId) {
    return this.names[userId] ?? userId;
  }

  #decide(userId) {
    if (this.closed) return { ok: false, reason: 'closed' };
    const p = this.participants.get(userId);
    if (!p) return { ok: false, reason: 'not-eligible' };
    if (p.status !== Status.PENDING) return { ok: false, reason: 'already', participant: p };
    return { ok: true, participant: p };
  }

  roll(userId, purpose, rng = rollDie) {
    if (!purposeById(purpose)) return { ok: false, reason: 'bad-purpose' };
    const res = this.#decide(userId);
    if (!res.ok) return res;
    Object.assign(res.participant, { status: Status.ROLLED, roll: rng(this.rollMax), purpose, at: Date.now() });
    return { ok: true, value: res.participant.roll };
  }

  pass(userId) {
    const res = this.#decide(userId);
    if (!res.ok) return res;
    Object.assign(res.participant, { status: Status.PASSED, at: Date.now() });
    return { ok: true };
  }

  /** Leader setzt eine Entscheidung zurück – der Spieler kann neu wählen. */
  reset(userId) {
    if (this.closed) return { ok: false, reason: 'closed' };
    const p = this.participants.get(userId);
    if (!p) return { ok: false, reason: 'not-eligible' };
    if (p.status === Status.PENDING) return { ok: false, reason: 'still-pending' };
    Object.assign(p, { status: Status.PENDING, roll: null, purpose: null, at: null });
    return { ok: true };
  }

  /** Nachträglich Spieler hinzufügen. Gibt die wirklich neuen IDs zurück. */
  addParticipants(ids, names = {}) {
    if (this.closed) return [];
    const added = ids.filter((id) => !this.participants.has(id));
    for (const id of added) this.participants.set(id, { status: Status.PENDING, roll: null, purpose: null, at: null });
    Object.assign(this.names, names);
    return added;
  }

  /** Alle, die schon gewürfelt oder gepasst haben (für „Zurücksetzen“). */
  decided() {
    return [...this.participants.entries()]
      .filter(([, p]) => p.status !== Status.PENDING)
      .map(([userId, p]) => ({ userId, ...p }));
  }

  get allDecided() {
    return [...this.participants.values()].every((p) => p.status !== Status.PENDING);
  }

  counts() {
    const c = { pending: 0, rolled: 0, passed: 0, total: this.participants.size };
    for (const p of this.participants.values()) c[p.status]++;
    return c;
  }

  /** Alle Würfe: nach Grund (BiS zuerst), innerhalb des Grunds nach Wurf absteigend. */
  rolls() {
    return [...this.participants.entries()]
      .filter(([, p]) => p.status === Status.ROLLED)
      .map(([userId, p]) => ({ userId, ...p }))
      .sort((a, b) => purposeRank(a.purpose) - purposeRank(b.purpose) || b.roll - a.roll || a.at - b.at);
  }

  withStatus(status) {
    return [...this.participants.entries()].filter(([, p]) => p.status === status).map(([id]) => id);
  }

  /** Der Ersteller bestimmt den Gewinner – nur Spieler, die gewürfelt haben. */
  chooseWinner(userId) {
    if (this.closed) return { ok: false, reason: 'closed' };
    if (this.participants.get(userId)?.status !== Status.ROLLED) return { ok: false, reason: 'not-rolled' };
    this.winnerId = userId;
    this.closed = true;
    this.closeReason = 'winner';
    return { ok: true, participant: this.participants.get(userId) };
  }

  close(reason) {
    if (this.closed) return false;
    this.closed = true;
    this.closeReason = reason;
    return true;
  }

  toJSON() {
    const { participants, ...rest } = this;
    return { ...rest, participants: Object.fromEntries(participants) };
  }

  static fromJSON(data) {
    const s = new LootSession({ ...data, eligibleIds: Object.keys(data.participants) });
    s.participants = new Map(Object.entries(data.participants));
    s.closed = data.closed;
    s.closeReason = data.closeReason;
    s.winnerId = data.winnerId;
    return s;
  }
}
