'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitDoc } from '@/lib/engine/types';

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
}

export interface LiveParticipant {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  activity?: string;
  idle?: boolean;
  cursor?: { x: number; y: number; tool?: string; hover?: string | null };
}

export interface LiveMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: string;
}

/**
 * Présence temps réel d'un atelier.
 * - flux SSE pour recevoir curseurs, présence, révisions et chat ;
 * - publication du curseur local throttle à ~10 Hz (le serveur ne garde rien) ;
 * - repli automatique par interrogation si le flux tombe.
 */
export function useCollaboration(options: {
  code: string | null;
  enabled: boolean;
  localId: string;
  onRemoteDoc?: (doc: CircuitDoc, meta: { revision: number; author?: string }) => void;
}) {
  const { code, enabled, localId, onRemoteDoc } = options;

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [revision, setRevision] = useState(0);
  const [transport, setTransport] = useState<'sse' | 'poll' | 'offline'>('offline');
  const [lastAuthor, setLastAuthor] = useState<string | undefined>(undefined);

  const sourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorPayload = useRef<Record<string, unknown> | null>(null);
  const lastSent = useRef(0);
  const onRemoteDocRef = useRef(onRemoteDoc);
  const revisionRef = useRef(0);

  useEffect(() => {
    onRemoteDocRef.current = onRemoteDoc;
  }, [onRemoteDoc]);

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

  /* ------------------------------------------------------------ réception SSE */
  useEffect(() => {
    if (!enabled || !code) {
      setConnected(false);
      setTransport('offline');
      return;
    }

    let disposed = false;

    const startPolling = () => {
      if (pollRef.current) return;
      setTransport('poll');
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
          setConnected(true);
          setParticipants(payload.participants ?? []);
          if (payload.revision > revisionRef.current) {
            revisionRef.current = payload.revision;
            setRevision(payload.revision);
            onRemoteDocRef.current?.(payload.doc as CircuitDoc, { revision: payload.revision });
          }
          if (payload.messages?.length) setMessages(payload.messages);
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
      setParticipants(data.participants ?? []);
      setConnected(true);
      setTransport((current) => (current === 'poll' ? current : 'sse'));
    });

    source.addEventListener('cursors', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { cursors: LiveCursor[] };
      setCursors(data.cursors ?? []);
    });

    source.addEventListener('revision', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        revision: number;
        author?: string;
      };
      if (data.revision === revisionRef.current) return;
      revisionRef.current = data.revision;
      setRevision(data.revision);
      setLastAuthor(data.author);
      void (async () => {
        try {
          const response = await fetch(`/api/rooms/${code}`, { cache: 'no-store' });
          if (!response.ok) return;
          const payload = await response.json();
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
    };
  }, [code, enabled]);

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

  const pushDoc = useCallback(
    async (doc: CircuitDoc) => {
      if (!code) return;
      try {
        const response = await fetch(`/api/rooms/${code}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc }),
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.revision) {
          revisionRef.current = payload.revision;
          setRevision(payload.revision);
        }
      } catch {
        /* sera réessayé au prochain changement */
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
      publishCursor,
      sendMessage,
      pushDoc,
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
      publishCursor,
      sendMessage,
      pushDoc,
    ],
  );
}
