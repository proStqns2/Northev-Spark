/**
 * Tests de la logique de visio : aucune de ces fonctions ne touche au réseau,
 * elles décident seulement qui propose une connexion et ce qu'on accepte.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CALL_PEERS,
  acceptsPeer,
  callStatusLabel,
  describeMedia,
  isSpeaking,
  mediaBadges,
  parseMediaSignal,
  shouldInitiate,
} from './media';
import type { RoomMedia } from '@/lib/db/store';

const media = (patch: Partial<RoomMedia> = {}): RoomMedia => ({
  live: true,
  mic: true,
  cam: true,
  session: 'abc',
  at: Date.now(),
  ...patch,
});

describe('qui propose la connexion', () => {
  it('le plus petit identifiant propose, et lui seul', () => {
    assert.equal(shouldInitiate('u_a', 'u_b'), true);
    assert.equal(shouldInitiate('u_b', 'u_a'), false);
  });

  it('jamais d’offre envers soi-même ou sans identifiant', () => {
    assert.equal(shouldInitiate('u_a', 'u_a'), false);
    assert.equal(shouldInitiate('', 'u_b'), false);
    assert.equal(shouldInitiate('u_a', ''), false);
  });

  it('la relation est antisymétrique : un seul des deux côtés propose', () => {
    for (const [x, y] of [
      ['u_1', 'u_2'],
      ['alpha', 'beta'],
      ['u_zz', 'u_a'],
    ]) {
      assert.notEqual(shouldInitiate(x, y), shouldInitiate(y, x));
    }
  });

  it('le maillage est borné', () => {
    assert.equal(acceptsPeer(0), true);
    assert.equal(acceptsPeer(MAX_CALL_PEERS - 1), true);
    assert.equal(acceptsPeer(MAX_CALL_PEERS), false);
    assert.equal(acceptsPeer(MAX_CALL_PEERS + 3), false);
  });
});

describe('validation des signaux reçus', () => {
  const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n';

  it('accepte une offre valide', () => {
    const parsed = parseMediaSignal('offer', {
      session: 's1',
      description: { type: 'offer', sdp },
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.signal.kind, 'offer');
  });

  it('refuse une description dont le type ne correspond pas', () => {
    const parsed = parseMediaSignal('offer', {
      description: { type: 'answer', sdp },
    });
    assert.equal(parsed.ok, false);
  });

  it('refuse un SDP vide, absent ou démesuré', () => {
    assert.equal(parseMediaSignal('answer', { description: { type: 'answer', sdp: '' } }).ok, false);
    assert.equal(parseMediaSignal('answer', {}).ok, false);
    assert.equal(
      parseMediaSignal('answer', { description: { type: 'answer', sdp: 'x'.repeat(30_000) } }).ok,
      false,
    );
  });

  it('accepte un candidat ICE et un candidat nul (fin de collecte)', () => {
    const withCandidate = parseMediaSignal('ice', {
      candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5000 typ host', sdpMid: '0' },
    });
    assert.equal(withCandidate.ok, true);
    const endOfCandidates = parseMediaSignal('ice', { candidate: null });
    assert.equal(endOfCandidates.ok, true);
    if (endOfCandidates.ok) {
      assert.equal(endOfCandidates.signal.kind, 'ice');
      assert.equal(
        endOfCandidates.signal.kind === 'ice' ? endOfCandidates.signal.payload.candidate : 'x',
        null,
      );
    }
  });

  it('refuse un candidat ICE illisible', () => {
    assert.equal(parseMediaSignal('ice', { candidate: { candidate: 42 } }).ok, false);
  });

  it('accepte hello et bye, refuse un type inconnu', () => {
    assert.equal(parseMediaSignal('hello', { session: 's2', cam: false }).ok, true);
    assert.equal(parseMediaSignal('hello', {}).ok, false);
    assert.equal(parseMediaSignal('bye', null).ok, true);
    // un type venu d'un client bricolé ne doit pas casser la négociation
    assert.equal(parseMediaSignal('pause' as never, {}).ok, false);
  });
});

describe('description de l’état visio', () => {
  it('résume caméra et micro', () => {
    assert.equal(describeMedia(media()), 'caméra + micro');
    assert.equal(describeMedia(media({ mic: false })), 'caméra, micro coupé');
    assert.equal(describeMedia(media({ cam: false })), 'micro seul');
    assert.equal(describeMedia(media({ cam: false, mic: false })), 'caméra et micro coupés');
    assert.equal(describeMedia(undefined), 'hors visio');
    assert.equal(describeMedia({ live: false, mic: false, cam: false }), 'hors visio');
  });

  it('ne montre de pastille que pour les flux réellement ouverts', () => {
    assert.deepEqual(mediaBadges(media()), ['cam', 'mic']);
    assert.deepEqual(mediaBadges(media({ mic: false })), ['cam']);
    assert.deepEqual(mediaBadges({ live: false, mic: true, cam: true }), []);
  });

  it('détecte la parole au-dessus du seuil', () => {
    assert.equal(isSpeaking(0.001), false);
    assert.equal(isSpeaking(0.2), true);
    assert.equal(isSpeaking(Number.NaN), false);
    assert.equal(isSpeaking(0.05, 0.06), false);
  });

  it('compte les pairs connectés', () => {
    assert.equal(callStatusLabel(0, false), 'visio fermée');
    assert.equal(callStatusLabel(0, true), 'en attente d’un pair');
    assert.equal(callStatusLabel(1, true), '1 pair connecté · pair-à-pair');
    assert.equal(callStatusLabel(3, true), '3 pairs connectés · pair-à-pair');
  });
});
