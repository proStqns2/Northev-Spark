'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircuitDoc } from '@/lib/engine/types';
import {
  openChannel,
  postMessage,
  type ActivityEntry,
  type CollabMessage,
  type LockInfo,
} from '@/lib/collab/channel';

export interface RemoteCursor {
  sender: string;
  name: string;
  color: string;
  x: number;
  y: number;
  at: number;
}

const PALETTE = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6', '#facc15'];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Synchronisation multi-onglets du montage (BroadcastChannel).
 *
 * - le document local est diffusé aux autres onglets dès qu'il change ;
 * - un document reçu d'un autre onglet est appliqué sans être rediffusé
 *   (garde-fou anti-boucle) ;
 * - verrous souples : éditer un composant le « verrouille » pour les autres ;
 * - journal d'activité : les actions sont racontées dans tous les onglets.
 */
export function useMultiTabSync(options: {
  doc: CircuitDoc;
  enabled: boolean;
  userName: string;
  onRemoteDoc?: (doc: CircuitDoc) => void;
}) {
  const { doc, enabled, userName, onRemoteDoc } = options;

  const senderId = useMemo(
    () => `tab_${Math.random().toString(36).slice(2, 10)}`,
    [],
  );
  const color = useMemo(() => colorFor(senderId), [senderId]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const applyingRemote = useRef(false);
  const onRemoteDocRef = useRef(onRemoteDoc);
  const lastBroadcast = useRef<string>('');

  const [locks, setLocks] = useState<Record<string, LockInfo>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [peerCount, setPeerCount] = useState(0);

  useEffect(() => {
    onRemoteDocRef.current = onRemoteDoc;
  }, [onRemoteDoc]);

  /* ---------------------------------------------------------- canal */
  useEffect(() => {
    if (!enabled) return;
    const channel = openChannel();
    channelRef.current = channel;
    if (!channel) return;

    const peers = new Set<string>();

    channel.onmessage = (event: MessageEvent<CollabMessage>) => {
      const msg = event.data;
      if (!msg || msg.sender === senderId) return;
      peers.add(msg.sender);
      setPeerCount(peers.size);

      switch (msg.kind) {
        case 'doc': {
          applyingRemote.current = true;
          onRemoteDocRef.current?.(msg.doc);
          // on laisse le temps à l'effet de diffusion de voir le drapeau
          setTimeout(() => {
            applyingRemote.current = false;
          }, 0);
          break;
        }
        case 'lock': {
          setLocks((prev) => {
            const next = { ...prev };
            if (msg.lock) next[msg.lock.componentId] = msg.lock;
            else {
              for (const key of Object.keys(next)) {
                if (next[key].userId === msg.sender) delete next[key];
              }
            }
            return next;
          });
          break;
        }
        case 'activity': {
          setActivity((prev) => [...prev.slice(-29), msg.entry]);
          break;
        }
        case 'cursor': {
          setRemoteCursors((prev) => {
            const others = prev.filter((c) => c.sender !== msg.sender);
            return [...others, { sender: msg.sender, name: msg.name, color: msg.color, x: msg.x, y: msg.y, at: Date.now() }];
          });
          break;
        }
        case 'bye': {
          peers.delete(msg.sender);
          setPeerCount(peers.size);
          setRemoteCursors((prev) => prev.filter((c) => c.sender !== msg.sender));
          setLocks((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key].userId === msg.sender) delete next[key];
            }
            return next;
          });
          break;
        }
      }
    };

    const heartbeat = setInterval(() => {
      // purge des curseurs périmés (> 4 s sans signal)
      setRemoteCursors((prev) => prev.filter((c) => Date.now() - c.at < 4000));
    }, 2000);

    const bye = () => postMessage(channel, { kind: 'bye', sender: senderId });
    window.addEventListener('beforeunload', bye);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', bye);
      bye();
      channel.close();
      channelRef.current = null;
    };
  }, [enabled, senderId]);

  /* ------------------------------------------- diffusion du document */
  useEffect(() => {
    if (!enabled || !channelRef.current) return;
    if (applyingRemote.current) return; // changement venu d'un autre onglet
    const fingerprint = JSON.stringify(doc);
    if (fingerprint === lastBroadcast.current) return;
    lastBroadcast.current = fingerprint;
    postMessage(channelRef.current, { kind: 'doc', doc, sender: senderId });
  }, [doc, enabled, senderId]);

  /* ------------------------------------------------------ verrou souple */
  const setLock = useCallback(
    (componentId: string | null) => {
      const lock: LockInfo | null = componentId
        ? { componentId, userId: senderId, userName, color }
        : null;
      postMessage(channelRef.current, { kind: 'lock', lock, sender: senderId });
      // on ne conserve que les verrous des autres onglets : le sien ne
      // s'affiche pas sur son propre canvas
      setLocks((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].userId === senderId) delete next[key];
        }
        return next;
      });
    },
    [senderId, userName, color],
  );

  /* ------------------------------------------------------ journal */
  const logActivity = useCallback(
    (text: string) => {
      const entry: ActivityEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userName,
        text,
        at: new Date().toISOString(),
      };
      postMessage(channelRef.current, { kind: 'activity', entry, sender: senderId });
      setActivity((prev) => [...prev.slice(-29), entry]);
    },
    [senderId, userName],
  );

  /* ------------------------------------------------------ curseur */
  const publishCursor = useCallback(
    (x: number, y: number) => {
      postMessage(channelRef.current, { kind: 'cursor', x, y, sender: senderId, name: userName, color });
    },
    [senderId, userName, color],
  );

  return {
    senderId,
    color,
    locks,
    activity,
    remoteCursors,
    peerCount,
    setLock,
    logActivity,
    publishCursor,
    available: typeof window !== 'undefined' && 'BroadcastChannel' in window,
  };
}
