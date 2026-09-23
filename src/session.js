import { randomInt } from 'node:crypto';

export const Status = Object.freeze({
  PENDING: 'pending',
  ROLLED: 'rolled',
  PASSED: 'passed',
});

/** Standard-Würfel: eine Zahl von 1 bis max (inklusive). */
export function rollDie(max = 100) {
  return randomInt(1, max + 1);
}

/**
 * Eine Verlosung für ein Item. Reine Logik ohne Discord-Abhängigkeiten,
 * damit sie sich einfach testen und später erweitern lässt
 * (z. B. mehrere Würfe oder anderer Zahlenbereich über `rollMax`).
 */
export class LootSession {
  constructor({ id, leaderId, item, eligibleIds, rollMax = 100, endsAt = null, mentionRoleIds = [], mentionUserIds = [] }) {
    if (!eligibleIds?.length) throw new Error('Mindestens ein Teilnehmer wird benötigt.');
    this.id = id;
    this.leaderId = leaderId;
    this.item = item;
    this.rollMax = rollMax;
    this.endsAt = endsAt;
    this.mentionRoleIds = mentionRoleIds;
    this.mentionUserIds = mentionUserIds;
    this.closed = false;
    this.closeReason = null;
    this.channelId = null;
    this.messageId = null;
    this.participants = new Map(
      [...new Set(eligibleIds)].map((uid) => [uid, { status: Status.PENDING, roll: null, at: null }]),
    );
  }

  isEligible(userId) {
    return this.participants.has(userId);
  }

  #decide(userId) {
    if (this.closed) return { ok: false, reason: 'closed' };
    const p = this.participants.get(userId);
    if (!p) return { ok: false, reason: 'not-eligible' };
    if (p.status !== Status.PENDING) return { ok: false, reason: 'already', participant: p };
    return { ok: true, participant: p };
  }

  roll(userId, rng = rollDie) {
    const res = this.#decide(userId);
    if (!res.ok) return res;
    res.participant.status = Status.ROLLED;
    res.participant.roll = rng(this.rollMax);
    res.participant.at = Date.now();
    return { ok: true, value: res.participant.roll };
  }

  pass(userId) {
    const res = this.#decide(userId);
    if (!res.ok) return res;
    res.participant.status = Status.PASSED;
    res.participant.at = Date.now();
    return { ok: true };
  }

  get allDecided() {
    return [...this.participants.values()].every((p) => p.status !== Status.PENDING);
  }

  close(reason) {
    if (this.closed) return false;
    this.closed = true;
    this.closeReason = reason;
    return true;
  }

  counts() {
    const c = { pending: 0, rolled: 0, passed: 0, total: this.participants.size };
    for (const p of this.participants.values()) c[p.status]++;
    return c;
  }

  /** Teilnehmer sortiert: Würfe absteigend, dann Gepasst, dann Offen. */
  standings() {
    const order = { [Status.ROLLED]: 0, [Status.PASSED]: 1, [Status.PENDING]: 2 };
    return [...this.participants.entries()]
      .map(([userId, p]) => ({ userId, ...p }))
      .sort((a, b) => order[a.status] - order[b.status] || (b.roll ?? 0) - (a.roll ?? 0) || (a.at ?? 0) - (b.at ?? 0));
  }

  /** Höchster Wurf und alle Spieler mit diesem Wurf (mehr als einer = Gleichstand). */
  result() {
    let top = null;
    let winners = [];
    for (const [userId, p] of this.participants) {
      if (p.status !== Status.ROLLED) continue;
      if (top === null || p.roll > top) {
        top = p.roll;
        winners = [userId];
      } else if (p.roll === top) {
        winners.push(userId);
      }
    }
    return { top, winners, tie: winners.length > 1 };
  }
}
