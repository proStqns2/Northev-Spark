import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LOCK_TTL_MS,
  acquireLock,
  blockingLocks,
  expireLocks,
  holderOf,
  lockSummary,
  releaseAll,
  releaseLock,
  renewLocks,
} from './locks';

const nora = { componentId: 'r1', userId: 'u-nora', name: 'Nora', color: '#38e1e6' };
const theo = { componentId: 'r1', userId: 'u-theo', name: 'Théo', color: '#ffc266' };

describe('verrous souples', () => {
  it('accorde un verrou libre', () => {
    const result = acquireLock({}, nora, 1_000);
    assert.equal(result.ok, true);
    assert.equal(result.locks.r1.userId, 'u-nora');
    assert.equal(result.locks.r1.expiresAt, 1_000 + LOCK_TTL_MS);
  });

  it('refuse un verrou tenu par un autre, avec le titulaire', () => {
    const first = acquireLock({}, nora, 1_000);
    const second = acquireLock(first.locks, theo, 2_000);
    assert.equal(second.ok, false);
    assert.equal(second.holder?.name, 'Nora');
    assert.equal(second.locks.r1.userId, 'u-nora');
  });

  it('est réentrant pour le même utilisateur et prolonge le TTL', () => {
    const first = acquireLock({}, nora, 1_000);
    const again = acquireLock(first.locks, { ...nora, color: '#fff' }, 5_000);
    assert.equal(again.ok, true);
    assert.equal(again.locks.r1.since, 1_000);
    assert.equal(again.locks.r1.expiresAt, 5_000 + LOCK_TTL_MS);
    assert.equal(again.locks.r1.color, '#38e1e6', 'la couleur d’origine est conservée');
  });

  it('libère après expiration, en signalant le vol', () => {
    const first = acquireLock({}, nora, 1_000);
    const late = acquireLock(first.locks, theo, 1_000 + LOCK_TTL_MS + 1);
    assert.equal(late.ok, true);
    assert.equal(late.stolen, true);
    assert.equal(late.locks.r1.userId, 'u-theo');
  });

  it('ne libère que par son détenteur', () => {
    const first = acquireLock({}, nora, 1_000);
    const attempt = releaseLock(first.locks, 'r1', 'u-theo');
    assert.equal(attempt.r1?.userId, 'u-nora');
    const released = releaseLock(first.locks, 'r1', 'u-nora');
    assert.equal(released.r1, undefined);
  });

  it('libère tous les verrous d’un utilisateur au départ', () => {
    let locks = acquireLock({}, nora, 1_000).locks;
    locks = acquireLock(locks, { ...nora, componentId: 'r2' }, 1_000).locks;
    locks = acquireLock(locks, { ...theo, componentId: 'r3' }, 1_000).locks;
    const after = releaseAll(locks, 'u-nora');
    assert.deepEqual(Object.keys(after), ['r3']);
    assert.equal(after.r3.userId, 'u-theo');
  });

  it('expire les verrous oubliés', () => {
    const locks = acquireLock({}, nora, 1_000).locks;
    assert.equal(Object.keys(expireLocks(locks, 2_000)).length, 1);
    assert.equal(Object.keys(expireLocks(locks, 1_000 + LOCK_TTL_MS + 1)).length, 0);
    assert.equal(holderOf(locks, 'r1', 1_000 + LOCK_TTL_MS + 1), null);
  });

  it('renouvelle les verrous du demandeur uniquement', () => {
    let locks = acquireLock({}, nora, 1_000).locks;
    locks = acquireLock(locks, theo, 1_000).locks; // refusé : theo ne l’a pas
    const renewed = renewLocks(locks, 'u-nora', 10_000);
    assert.equal(renewed.r1.expiresAt, 10_000 + LOCK_TTL_MS);
  });

  it('liste les verrous gênants pour une écriture', () => {
    const locks = acquireLock({}, nora, 1_000).locks;
    const blocked = blockingLocks(locks, ['r1', 'r2'], 'u-theo', 2_000);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].name, 'Nora');
    assert.equal(blockingLocks(locks, ['r1'], 'u-nora', 2_000).length, 0);
  });

  it('résume pour l’interface, du plus ancien au plus récent', () => {
    let locks = acquireLock({}, nora, 1_000).locks;
    locks = acquireLock(locks, { ...theo, componentId: 'r2' }, 2_000).locks;
    const summary = lockSummary(locks, 2_500);
    assert.equal(summary.length, 2);
    assert.deepEqual(summary.map((lock) => lock.componentId), ['r1', 'r2']);
    assert.ok(summary[0].ttlMs > 0 && summary[0].ttlMs <= LOCK_TTL_MS);
  });
});
