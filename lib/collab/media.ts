/**
 * Visio d'atelier — logique pure de la signalisation WebRTC.
 *
 * Le mode Multiwork n'a pas de serveur temps réel dédié (Vercel Hobby) : la
 * négociation passe donc par le flux SSE déjà en place. Ce module ne touche ni
 * au DOM ni au réseau ; il décide **qui** propose, **ce qu'on accepte** comme
 * signal et **comment** le décrire à l'écran. Tout le reste (RTCPeerConnection,
 * getUserMedia) vit dans `hooks/useMediaCall.ts`.
 */

import type { RoomMedia, SignalKind } from '@/lib/db/store';

/** Au-delà, le maillage pair-à-pair coûte trop cher (une piste par pair). */
export const MAX_CALL_PEERS = 4;

/** Relais publics : suffisent pour deux navigateurs derrière du NAT simple. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface HelloPayload {
  session: string;
  cam: boolean;
  mic: boolean;
}

export interface DescriptionPayload {
  session?: string;
  description: { type: 'offer' | 'answer'; sdp: string };
}

export interface IcePayload {
  session?: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  } | null;
}

export type MediaSignal =
  | { kind: 'hello'; payload: HelloPayload }
  | { kind: 'offer'; payload: DescriptionPayload }
  | { kind: 'answer'; payload: DescriptionPayload }
  | { kind: 'ice'; payload: IcePayload }
  | { kind: 'bye'; payload: { session?: string } | null };

/**
 * Règle de non-collision : **le plus petit identifiant propose**. Les deux
 * côtés calculent la même réponse sans se concerter, donc jamais deux offres
 * simultanées (le « glare » classique de WebRTC).
 */
export function shouldInitiate(localId: string, remoteId: string): boolean {
  if (!localId || !remoteId || localId === remoteId) return false;
  return localId < remoteId;
}

/** Nombre de pairs qu'on accepte de servir, dans l'ordre d'arrivée. */
export function acceptsPeer(connected: number): boolean {
  return connected < MAX_CALL_PEERS;
}

export type ParsedSignal =
  | { ok: true; signal: MediaSignal }
  | { ok: false; reason: string };

const MAX_SDP = 24_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseHello(payload: unknown): ParsedSignal {
  const row = asRecord(payload);
  const session = typeof row?.session === 'string' ? row.session.slice(0, 40) : '';
  if (!session) return { ok: false, reason: 'session absente' };
  return {
    ok: true,
    signal: {
      kind: 'hello',
      payload: {
        session,
        cam: row?.cam !== false,
        mic: row?.mic !== false,
      },
    },
  };
}

function parseDescription(kind: 'offer' | 'answer', payload: unknown): ParsedSignal {
  const row = asRecord(payload);
  const description = asRecord(row?.description);
  const type = description?.type;
  const sdp = description?.sdp;
  if (type !== kind) return { ok: false, reason: `description ${String(type)} inattendue` };
  if (typeof sdp !== 'string' || !sdp || sdp.length > MAX_SDP) {
    return { ok: false, reason: 'SDP invalide' };
  }
  return {
    ok: true,
    signal: {
      kind,
      payload: {
        session: typeof row?.session === 'string' ? row.session.slice(0, 40) : undefined,
        description: { type: kind, sdp },
      },
    },
  };
}

function parseIce(payload: unknown): ParsedSignal {
  const row = asRecord(payload);
  const candidate = row?.candidate;
  if (candidate === null || candidate === undefined) {
    // fin de collecte : un candidat nul est parfaitement légitime
    return { ok: true, signal: { kind: 'ice', payload: { session: undefined, candidate: null } } };
  }
  const entry = asRecord(candidate);
  const value = typeof entry?.candidate === 'string' ? entry.candidate : '';
  if (!value || value.length > 2_000) return { ok: false, reason: 'candidat ICE invalide' };
  return {
    ok: true,
    signal: {
      kind: 'ice',
      payload: {
        session: typeof row?.session === 'string' ? row.session.slice(0, 40) : undefined,
        candidate: {
          candidate: value,
          sdpMid: typeof entry?.sdpMid === 'string' ? entry.sdpMid : null,
          sdpMLineIndex: typeof entry?.sdpMLineIndex === 'number' ? entry.sdpMLineIndex : null,
          usernameFragment:
            typeof entry?.usernameFragment === 'string' ? entry.usernameFragment : null,
        },
      },
    },
  };
}

/** Valide un message reçu avant de le donner à `RTCPeerConnection`. */
export function parseMediaSignal(kind: SignalKind, payload: unknown): ParsedSignal {
  switch (kind) {
    case 'hello':
      return parseHello(payload);
    case 'offer':
      return parseDescription('offer', payload);
    case 'answer':
      return parseDescription('answer', payload);
    case 'ice':
      return parseIce(payload);
    case 'bye':
      return { ok: true, signal: { kind: 'bye', payload: null } };
    default:
      return { ok: false, reason: 'type de signal inconnu' };
  }
}

/** Libellé court de l'état caméra/micro d'un pair. */
export function describeMedia(media?: RoomMedia | null): string {
  if (!media?.live) return 'hors visio';
  if (media.cam && media.mic) return 'caméra + micro';
  if (media.cam) return 'caméra, micro coupé';
  if (media.mic) return 'micro seul';
  return 'caméra et micro coupés';
}

/** Pastilles compactes (🎥 / 🎙) pour les pilules de présence. */
export function mediaBadges(media?: RoomMedia | null): string[] {
  if (!media?.live) return [];
  const badges: string[] = [];
  if (media.cam) badges.push('cam');
  if (media.mic) badges.push('mic');
  return badges;
}

/**
 * Détection de parole à partir du niveau RMS (0 → 1). Le seuil est bas : un
 * micro de laptop typique plafonne autour de 0,15 en parole normale.
 */
export const SPEAKING_THRESHOLD = 0.035;

export function isSpeaking(rms: number, threshold = SPEAKING_THRESHOLD): boolean {
  return Number.isFinite(rms) && rms > threshold;
}

/** Phrase d'état affichée sous la mosaïque. */
export function callStatusLabel(peers: number, joined: boolean): string {
  if (!joined) return 'visio fermée';
  if (peers <= 0) return 'en attente d’un pair';
  if (peers === 1) return '1 pair connecté · pair-à-pair';
  return `${peers} pairs connectés · pair-à-pair`;
}

/** Nom de fichier sûr pour un enregistrement local éventuel. */
export function callSessionId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return random.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}
