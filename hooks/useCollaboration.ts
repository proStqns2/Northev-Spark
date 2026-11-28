'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitDoc } from '@/lib/engine/types';

/** État caméra/micro d'un participant (visio d'atelier). */
export interface LiveMedia {
  live: boolean;
  mic: boolean;
  cam: boolean;
  session?: string;
}

export interface LiveCursor {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  x: number;
  y: number;
  hover?: string | null;
  tool?: string | null;
  idle: boolean;
  fresh?: boolean;
  /** fenêtre visible du pair, en cellules de grille */
  vx?: number | null;
  vy?: number | null;
  vw?: number | null;
  vh?: number | null;
  /** clic en cours (le pair trace, déplace…) */
  pressed?: boolean;
  /** dipôle sélectionné chez le pair */
  selection?: string | null;
  /** style de pointeur annoncé */
  pointer?: string | null;
  /** âge de la dernière mise à jour, en millisecondes */
  ageMs?: number;
  /** visio du pair, si elle est ouverte */
  media?: LiveMedia | null;
}

/** Message de signalisation WebRTC relayé par le serveur d'atelier. */
export interface LiveSignal {
  id: string;
  from: string;
  fromName: string;
  kind: 'hello' | 'offer' | 'answer' | 'ice' | 'bye';
  payload: unknown;
  at: number;
}

export interface LiveParticipant {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  activity?: string;
  idle?: boolean;
  cursor?: { x: number; y: number; tool?: string; hover?: string | null };
  media?: LiveMedia;
}

export interface LiveMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: string;
  reactions?: Record<string, string[]>;
}

/** Verrou souple posé sur un dipôle par un collaborateur. */
export interface LiveLock {
  componentId: string;
  userId: string;
  name: string;
  color: string;
  since: number;
  ttlMs: number;
}

export interface LiveConflict {
  /** `suppression` | `dipôle` | champ de document */
  field: string;
  componentId?: string;
  message: string;
  at: number;
  author?: string;
}

export interface LiveVersion {
  revision: number;
  at: string;
  authorName: string;
  summary: string;
}

export interface DocPushResult {
  ok: boolean;
  revision: number;
  merged: boolean;
  stats?: { added: number; removed: number; updated: number; docFields: number };
  conflicts: LiveConflict[];
  error?: string;
}

const EMPTY_STATS = { added: 0, removed: 0, updated: 0, docFields: 0 };

/**
 * Présence temps réel et **écriture sans écrasement** d'un atelier.
 *
 * - flux SSE (`presence`, `cursors`, `revision`, `chat`, `locks`, `typing`) ;
 * - publication du curseur locale ~10 Hz ;
 * - `pushDoc` envoie la **base** (révision connue) et laisse le serveur faire
 *   une fusion à trois branches : deux personnes peuvent modifier le même
 *   montage sans que l'une perde le travail de l'autre ;
 * - verrous souples par dipôle, renouvelés par battement, relâchés au départ ;
 * - repli par interrogation si le flux tombe.
 */
export function useCollaboration(options: {
  code: string | null;
  enabled: boolean;
  localId: string;
  onRemoteDoc?: (doc: CircuitDoc, meta: { revision: number; author?: string }) => void;
  /** appelé après une fusion qui a dû réécrire le document local */
  onMerged?: (result: DocPushResult) => void;
}) {
  const { code, enabled, localId, onRemoteDoc, onMerged } = options;

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [revision, setRevision] = useState(0);
  const [transport, setTransport] = useState<'sse' | 'poll' | 'offline'>('offline');
  const [lastAuthor, setLastAuthor] = useState<string | undefined>(undefined);
  const [locks, setLocks] = useState<LiveLock[]>([]);
  const [typing, setTyping] = useState<Array<{ id: string; name: string }>>([]);
  const [conflicts, setConflicts] = useState<LiveConflict[]>([]);
  const [saving, setSaving] = useState(false);
  /** signaux WebRTC reçus, remis au consommateur puis consommés */
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const seenSignals = useRef<Set<string>>(new Set());
  const signalSince = useRef(0);

  const sourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorPayload = useRef<Record<string, unknown> | null>(null);
  const lastSent = useRef(0);
  const onRemoteDocRef = useRef(onRemoteDoc);
  const onMergedRef = useRef(onMerged);
  const revisionRef = useRef(0);
  /** document serveur connu : la base de la prochaine fusion */
  const baseDocRef = useRef<CircuitDoc | null>(null);
  /** écritures en vol : on ne double jamais une requête, on garde la dernière */
  const pushingRef = useRef(false);
  const queuedRef = useRef<CircuitDoc | null>(null);
  const typingSent = useRef(0);
  const lastTypingRef = useRef(false);
  /** rafales de curseurs mises en attente : on redessine au plus ~8 fois/s */
  const pendingCursors = useRef<LiveCursor[] | null>(null);
  const cursorFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPresence = useRef<LiveParticipant[] | null>(null);
  const presenceFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Les curseurs arrivent à ~9 Hz. Les appliquer tels quels force un rendu du
   * plan à chaque battement, ce qui rendait le glisser saccadé sur un montage
   * fourni. On regroupe les mises à jour : un seul rendu par fenêtre.
   */
  const pushCursors = useCallback((next: LiveCursor[]) => {
    pendingCursors.current = next;
    if (cursorFlushRef.current) return;
    cursorFlushRef.current = setTimeout(() => {
      cursorFlushRef.current = null;
      const value = pendingCursors.current;
      pendingCursors.current = null;
      if (value) setCursors(value);
    }, 120);
  }, []);

  const pushPresence = useCallback((next: LiveParticipant[]) => {
    pendingPresence.current = next;
    if (presenceFlushRef.current) return;
    presenceFlushRef.current = setTimeout(() => {
      presenceFlushRef.current = null;
      const value = pendingPresence.current;
      pendingPresence.current = null;
      if (value) setParticipants(value);
    }, 400);
  }, []);

  useEffect(() => {
    onRemoteDocRef.current = onRemoteDoc;
    onMergedRef.current = onMerged;
  }, [onRemoteDoc, onMerged]);

  /** Aligne la base localement (après un chargement de salle). */
  const setBaseline = useCallback((doc: CircuitDoc | null, rev: number) => {
    baseDocRef.current = doc;
    revisionRef.current = rev;
    setRevision(rev);
  }, []);

  const rememberLocks = useCallback((next: LiveLock[] | undefined) => {
    if (!next) return;
    setLocks(next);
  }, []);

  /* ------------------------------------------------------- publication curseur */
  const flushCursor = useCallback(async () => {
    if (!code || !cursorPayload.current) return;
    const payload = cursorPayload.current;
    cursorPayload.current = null;
    lastSent.current = Date.now();
    try {
      await fetch(`/api/rooms/${code}/cursor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      /* réseau momentanément indisponible : le prochain mouvement réessaiera */
    }
  }, [code]);

  const publishCursor = useCallback(
    (payload: Record<string, unknown>, options?: { immediate?: boolean }) => {
      if (!code) return;
      cursorPayload.current = { ...payload, at: Date.now() };
      const elapsed = Date.now() - lastSent.current;
      const interval = options?.immediate ? 0 : Math.max(0, 100 - elapsed);
      if (cursorTimer.current) {
        if (interval === 0) return; // une écriture est déjà programmée
        return;
      }
      cursorTimer.current = setTimeout(() => {
        cursorTimer.current = null;
        void flushCursor();
      }, interval);
    },
    [code, flushCursor],
  );

  /* ----------------------------------------------------- visio / signalisation */
  /** Dépose un message de signalisation WebRTC (offre, réponse, candidat ICE). */
  const sendSignal = useCallback(
    async (
      kind: LiveSignal['kind'],
      to: string | null,
      payload?: unknown,
    ): Promise<boolean> => {
      if (!code) return false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(`/api/rooms/${code}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, kind, payload: payload ?? null }),
            keepalive: kind === 'bye',
          });
          if (response.ok) return true;
          if (response.status !== 429 && response.status < 500) return false;
        } catch {
          /* on retente une fois : un aller-retour perdu bloque la négociation */
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    },
    [code],
  );

  /** Publie l'état caméra/micro (volatil : rien n'est enregistré). */
  const publishMedia = useCallback(
    async (media: { live: boolean; mic?: boolean; cam?: boolean; session?: string }) => {
      if (!code) return false;
      try {
        const response = await fetch(`/api/rooms/${code}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(media),
          keepalive: !media.live,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [code],
  );

  /** Marque les signaux comme lus (le consommateur les a traités). */
  const consumeSignals = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const done = new Set(ids);
    setSignals((current) => current.filter((signal) => !done.has(signal.id)));
  }, []);

  const rememberSignals = useCallback((incoming: LiveSignal[] | undefined) => {
    if (!incoming?.length) return;
    setSignals((current) => {
      const next = [...current];
      for (const signal of incoming) {
        if (seenSignals.current.has(signal.id)) continue;
        seenSignals.current.add(signal.id);
        next.push(signal);
        if (signal.at > signalSince.current) signalSince.current = signal.at;
      }
      // la file reste courte : un signal a quelques secondes de pertinence
      if (next.length > 120) return next.slice(-120);
      return next.length === current.length ? current : next;
    });
  }, []);

  /* ------------------------------------------------------------ réception SSE */
  useEffect(() => {
    if (!enabled || !code) {
      setConnected(false);
      setTransport('offline');
      return;
    }

    let disposed = false;
    // on ne rejoue pas les signaux d'une session précédente
    signalSince.current = Date.now() - 1500;
    seenSignals.current.clear();
    setSignals([]);

    const startPolling = () => {
      if (pollRef.current) return;
      setTransport('poll');
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/rooms/${code}?rev=${revisionRef.current}`, {
            cache: 'no-store',
          });
          if (!response.ok) return;
          const payload = await response.json();
          setConnected(true);
          pushPresence(payload.participants ?? []);
          rememberLocks(payload.locks);
          setTyping(payload.typing ?? []);
          if (payload.revision > revisionRef.current) {
            revisionRef.current = payload.revision;
            setRevision(payload.revision);
            if (payload.doc) {
              baseDocRef.current = payload.doc as CircuitDoc;
              onRemoteDocRef.current?.(payload.doc as CircuitDoc, { revision: payload.revision });
            }
          }
          if (payload.messages?.length) setMessages(payload.messages);
          const relay = await fetch(`/api/rooms/${code}/signal?since=${signalSince.current}`, {
            cache: 'no-store',
          });
          if (relay.ok) {
            const relayed = (await relay.json()) as { signals?: LiveSignal[] };
            rememberSignals(relayed.signals);
          }
        } catch {
          setConnected(false);
        }
      }, 2500);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const source = new EventSource(`/api/rooms/${code}/events`);
    sourceRef.current = source;

    source.addEventListener('ready', () => {
      if (disposed) return;
      setConnected(true);
      setTransport('sse');
      stopPolling();
    });

    source.addEventListener('presence', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { participants: LiveParticipant[] };
      pushPresence(data.participants ?? []);
      setConnected(true);
      setTransport((current) => (current === 'poll' ? current : 'sse'));
    });

    source.addEventListener('cursors', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { cursors: LiveCursor[] };
      pushCursors(data.cursors ?? []);
    });

    source.addEventListener('signal', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { signals?: LiveSignal[] };
      rememberSignals(data.signals);
    });

    source.addEventListener('locks', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { locks: LiveLock[] };
      rememberLocks(data.locks);
    });

    source.addEventListener('typing', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { typing: Array<{ id: string; name: string }> };
      setTyping(data.typing ?? []);
    });

    source.addEventListener('revision', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        revision: number;
        author?: string;
        doc?: CircuitDoc;
        locks?: LiveLock[];
      };
      rememberLocks(data.locks);
      if (data.revision === revisionRef.current) return;
      revisionRef.current = data.revision;
      setRevision(data.revision);
      setLastAuthor(data.author);
      if (data.doc) {
        baseDocRef.current = data.doc;
        onRemoteDocRef.current?.(data.doc, { revision: data.revision, author: data.author });
        return;
      }
      void (async () => {
        try {
          const response = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
          baseDocRef.current = payload.doc as CircuitDoc;
          onRemoteDocRef.current?.(payload.doc as CircuitDoc, {
            revision: data.revision,
            author: data.author,
          });
        } catch {
          /* la prochaine révision resynchronisera */
        }
      })();
    });

    source.addEventListener('chat', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        message: LiveMessage;
        messages: LiveMessage[];
      };
      setMessages(data.messages ?? []);
    });

    source.addEventListener('room-closed', () => {
      setConnected(false);
      setTransport('offline');
    });

    source.onerror = () => {
      if (disposed) return;
      setConnected(false);
      if (source.readyState === EventSource.CLOSED) {
        startPolling();
      }
    };

    return () => {
      disposed = true;
      source.close();
      sourceRef.current = null;
      stopPolling();
      if (cursorFlushRef.current) clearTimeout(cursorFlushRef.current);
      if (presenceFlushRef.current) clearTimeout(presenceFlushRef.current);
      cursorFlushRef.current = null;
      presenceFlushRef.current = null;
    };
  }, [code, enabled, rememberLocks, pushCursors, pushPresence]);

  /* ------------------------------------------------------------- chat / doc */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!code || !text.trim()) return;
      const response = await fetch(`/api/rooms/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.revision) {
        revisionRef.current = payload.revision;
        setRevision(payload.revision);
      }
    },
    [code],
  );

  /**
   * Publie une version du montage. Le serveur fusionne avec ce qu'il a entre
   * temps ; si le résultat diffère de ce qu'on croyait avoir, `onRemoteDoc`
   * réaligne l'éditeur et `onMerged` prévient l'utilisateur.
   */
  const pushDoc = useCallback(
    async (doc: CircuitDoc): Promise<DocPushResult> => {
      const empty: DocPushResult = { ok: false, revision: revisionRef.current, merged: false, conflicts: [], stats: EMPTY_STATS };
      if (!code) return empty;

      // une écriture à la fois ; les suivantes sont coalescées
      if (pushingRef.current) {
        queuedRef.current = doc;
        return { ...empty, ok: true };
      }
      pushingRef.current = true;
      setSaving(true);

      const send = async (payloadDoc: CircuitDoc, attempt: number): Promise<DocPushResult> => {
        const response = await fetch(`/api/rooms/${code}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc: payloadDoc,
            baseRevision: revisionRef.current,
          }),
        });
        if (response.status === 409 && attempt === 0) {
          // le serveur a refusé la base : on relit puis on retente une fois
          const fresh = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
          if (fresh.ok) {
            const room = await fresh.json();
            revisionRef.current = room.revision;
            baseDocRef.current = room.doc as CircuitDoc;
          }
          return send(payloadDoc, 1);
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          return { ...empty, error: (body as { error?: string }).error ?? 'Écriture refusée.' };
        }
        const body = await response.json();
        const result: DocPushResult = {
          ok: true,
          revision: body.revision ?? revisionRef.current,
          merged: Boolean(body.merged),
          stats: body.stats ?? EMPTY_STATS,
          conflicts: (body.conflicts ?? []).map((c: Omit<LiveConflict, 'at'>) => ({ ...c, at: Date.now() })),
        };
        revisionRef.current = result.revision;
        setRevision(result.revision);
        rememberLocks(body.locks);
        if (body.doc) baseDocRef.current = body.doc as CircuitDoc;
        if (result.conflicts.length) {
          setConflicts((current) => [...result.conflicts, ...current].slice(0, 12));
        }
        // le serveur a fusionné : l'éditeur local doit repartir du document réel
        if (result.merged && body.doc) {
          onRemoteDocRef.current?.(body.doc as CircuitDoc, { revision: result.revision });
        }
        if (result.merged || result.conflicts.length) onMergedRef.current?.(result);
        return result;
      };

      try {
        return await send(doc, 0);
      } catch {
        return { ...empty, error: 'Réseau indisponible.' };
      } finally {
        pushingRef.current = false;
        setSaving(false);
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued) void pushDoc(queued);
      }
    },
    // pushDoc se rappelle elle-même : la référence est stable par closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, rememberLocks],
  );

  /* ---------------------------------------------------------------- verrous */
  const acquireLock = useCallback(
    async (componentId: string): Promise<{ granted: boolean; holder?: string }> => {
      if (!code) return { granted: false };
      try {
        const response = await fetch(`/api/rooms/${code}/locks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentId, action: 'acquire' }),
        });
        const body = await response.json().catch(() => ({}));
        rememberLocks(body.locks);
        if (!response.ok) return { granted: false, holder: body.holder?.name };
        return { granted: true };
      } catch {
        return { granted: false };
      }
    },
    [code, rememberLocks],
  );

  const releaseLock = useCallback(
    async (componentId: string) => {
      if (!code) return;
      try {
        const response = await fetch(`/api/rooms/${code}/locks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentId, action: 'release' }),
          keepalive: true,
        });
        const body = await response.json().catch(() => ({}));
        rememberLocks(body.locks);
      } catch {
        /* le verrou expirera de lui-même en 15 s */
      }
    },
    [code, rememberLocks],
  );

  const releaseAllLocks = useCallback(async () => {
    if (!code) return;
    try {
      await fetch(`/api/rooms/${code}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentId: '_', action: 'release-all' }),
        keepalive: true,
      });
    } catch {
      /* expiration naturelle */
    }
  }, [code]);

  const myLocks = useMemo(() => locks.filter((lock) => lock.userId === localId), [locks, localId]);

  // battement : prolonge mes verrous tant que je les tiens
  useEffect(() => {
    if (!enabled || !code || myLocks.length === 0) return;
    const timer = setInterval(() => {
      void fetch(`/api/rooms/${code}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentId: '_', action: 'renew' }),
      }).catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [enabled, code, myLocks.length]);

  /** Verrou posé par quelqu'un d'autre sur ce dipôle. */
  const lockOf = useCallback(
    (componentId: string): LiveLock | undefined =>
      locks.find((lock) => lock.componentId === componentId && lock.userId !== localId),
    [locks, localId],
  );

  /* ---------------------------------------------------------------- saisie */
  const publishTyping = useCallback(
    (active: boolean) => {
      if (!code) return;
      const now = Date.now();
      if (active === lastTypingRef.current && now - typingSent.current < 1500) return;
      lastTypingRef.current = active;
      typingSent.current = now;
      void fetch(`/api/rooms/${code}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [code],
  );

  /* ------------------------------------------------------------- historique */
  const loadHistory = useCallback(async (): Promise<LiveVersion[]> => {
    if (!code) return [];
    try {
      const response = await fetch(`/api/rooms/${code}/history`, { cache: 'no-store' });
      if (!response.ok) return [];
      const body = await response.json();
      return (body.versions ?? []) as LiveVersion[];
    } catch {
      return [];
    }
  }, [code]);

  const restoreVersion = useCallback(
    async (target: number): Promise<boolean> => {
      if (!code) return false;
      try {
        const response = await fetch(`/api/rooms/${code}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: target }),
        });
        if (!response.ok) return false;
        const body = await response.json();
        if (body.doc) {
          revisionRef.current = body.revision;
          setRevision(body.revision);
          baseDocRef.current = body.doc as CircuitDoc;
          onRemoteDocRef.current?.(body.doc as CircuitDoc, { revision: body.revision });
        }
        return true;
      } catch {
        return false;
      }
    },
    [code],
  );

  const reactTo = useCallback(
    async (messageId: string, emoji: string) => {
      if (!code) return;
      try {
        const response = await fetch(`/api/rooms/${code}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, emoji }),
        });
        if (!response.ok) return;
        const body = await response.json();
        if (body.messages) setMessages(body.messages);
      } catch {
        /* réaction non essentielle */
      }
    },
    [code],
  );

  /* ------------------------------------------------- masquer le curseur si idle */
  useEffect(() => {
    if (!enabled || !code) return;
    let timeout: ReturnType<typeof setTimeout>;
    const hide = () => publishCursor({ idle: true, activity: 'inactif' }, { immediate: true });
    const arm = () => {
      clearTimeout(timeout);
      timeout = setTimeout(hide, 20000);
    };
    window.addEventListener('pointermove', arm, { passive: true });
    window.addEventListener('keydown', arm);
    arm();
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('keydown', arm);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = null;
    };
  }, [enabled, code, publishCursor]);

  /** On relâche nos verrous en quittant l'atelier. */
  useEffect(() => {
    if (!code) return;
    const leave = () => {
      void fetch(`/api/rooms/${code}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentId: '_', action: 'release-all' }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [code]);

  return useMemo(
    () => ({
      connected,
      transport,
      participants,
      cursors,
      messages,
      revision,
      lastAuthor,
      localId,
      locks,
      myLocks,
      typing,
      conflicts,
      saving,
      signals,
      publishCursor,
      sendSignal,
      publishMedia,
      consumeSignals,
      sendMessage,
      pushDoc,
      setBaseline,
      acquireLock,
      releaseLock,
      releaseAllLocks,
      lockOf,
      publishTyping,
      loadHistory,
      restoreVersion,
      reactTo,
      dismissConflicts: () => setConflicts([]),
      remoteCursors: cursors.filter((c) => c.id !== localId),
    }),
    [
      connected,
      transport,
      participants,
      cursors,
      messages,
      revision,
      lastAuthor,
      localId,
      locks,
      myLocks,
      typing,
      conflicts,
      saving,
      signals,
      publishCursor,
      sendSignal,
      publishMedia,
      consumeSignals,
      sendMessage,
      pushDoc,
      setBaseline,
      acquireLock,
      releaseLock,
      releaseAllLocks,
      lockOf,
      publishTyping,
      loadHistory,
      restoreVersion,
      reactTo,
    ],
  );
}
