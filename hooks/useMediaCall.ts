'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveParticipant, LiveSignal } from './useCollaboration';
import {
  ICE_SERVERS,
  MAX_CALL_PEERS,
  acceptsPeer,
  callSessionId,
  isSpeaking,
  parseMediaSignal,
  shouldInitiate,
} from '@/lib/collab/media';
import { clearSpeaking, publishSpeaking } from '@/lib/collab/mediaBus';

/**
 * Visio d'atelier — caméra + micro, en pair-à-pair.
 *
 * Il n'y a **aucun serveur média** : les flux ne quittent jamais la
 * conversation directe entre les deux navigateurs (WebRTC). Le serveur d'atelier
 * ne relaie que la négociation (offre / réponse / candidats ICE) par le flux SSE
 * déjà utilisé par les curseurs, et ces messages vivent moins d'une minute en
 * mémoire. Rien n'est enregistré, ni sur disque, ni dans Supabase.
 *
 * Le maillage est volontairement borné (`MAX_CALL_PEERS`) : sur un atelier à deux
 * ou trois, chaque navigateur ouvre une connexion par pair, ce qui reste très
 * au-dessous de ce qu'un laptop encaisse.
 */

export interface CallPeer {
  id: string;
  name: string;
  color: string;
  stream: MediaStream | null;
  state: RTCPeerConnectionState | 'idle';
  mic: boolean;
  cam: boolean;
  speaking: boolean;
}

export interface CallApi {
  joined: boolean;
  busy: boolean;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  localSpeaking: boolean;
  localStream: MediaStream | null;
  peers: CallPeer[];
  peerCount: number;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  retry: () => Promise<void>;
  dismissError: () => void;
}

type PeerEntry = {
  pc: RTCPeerConnection;
  session: string;
  initiator: boolean;
  pendingIce: RTCIceCandidateInit[];
  retried: boolean;
};

export function useMediaCall(options: {
  enabled: boolean;
  localId: string;
  localName: string;
  participants: LiveParticipant[];
  signals: LiveSignal[];
  sendSignal: (
    kind: LiveSignal['kind'],
    to: string | null,
    payload?: unknown,
  ) => Promise<boolean>;
  publishMedia: (media: {
    live: boolean;
    mic?: boolean;
    cam?: boolean;
    session?: string;
  }) => Promise<boolean>;
  consumeSignals: (ids: string[]) => void;
}): CallApi {
  const {
    enabled,
    localId,
    localName,
    participants,
    signals,
    sendSignal,
    publishMedia,
    consumeSignals,
  } = options;

  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [peers, setPeers] = useState<Record<string, CallPeer>>({});

  const joinedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<string>('');
  const entries = useRef<Map<string, PeerEntry>>(new Map());
  const processed = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);
  const analysers = useRef<Map<string, AnalyserNode>>(new Map());
  const levels = useRef<Map<string, number>>(new Map());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const nameRef = useRef(localName);
  const colorRef = useRef('#38e1e6');

  useEffect(() => {
    nameRef.current = localName || 'Invité';
  }, [localName]);

  const patchPeer = useCallback((id: string, patch: Partial<CallPeer>) => {
    setPeers((current) => {
      const existing = current[id];
      if (!existing) return current;
      return { ...current, [id]: { ...existing, ...patch } };
    });
  }, []);

  /* ----------------------------------------------------------- mesure du son */
  const ensureAudio = useCallback(() => {
    if (audioCtx.current) return audioCtx.current;
    const Ctor =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    try {
      audioCtx.current = new Ctor();
      return audioCtx.current;
    } catch {
      return null;
    }
  }, []);

  const watchStream = useCallback(
    (id: string, stream: MediaStream | null) => {
      const ctx = stream ? ensureAudio() : null;
      if (!ctx || !stream || !stream.getAudioTracks().length) {
        analysers.current.delete(id);
        levels.current.delete(id);
        publishSpeaking(id, false);
        return;
      }
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analysers.current.set(id, analyser);
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      } catch {
        /* un flux sans piste audio ne doit pas empêcher la vidéo */
      }
    },
    [ensureAudio],
  );

  useEffect(() => {
    if (!joined) {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
      return;
    }
    const buffer = new Uint8Array(256);
    const alive = new Set<string>();
    // publie un état de parole par participant, au plus 5 fois par seconde
    tick.current = setInterval(() => {
      const ctx = audioCtx.current;
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      for (const [id, analyser] of analysers.current) {
        alive.add(id);
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          const value = (buffer[index] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / buffer.length);
        levels.current.set(id, rms);
        const speaking = isSpeaking(rms);
        publishSpeaking(id, speaking);
        if (id === localId) setLocalSpeaking(speaking);
        else patchPeer(id, { speaking });
      }
      // les flux disparus ne doivent pas rester « en train de parler »
      for (const id of [...analysers.current.keys()]) {
        if (alive.has(id)) continue;
        analysers.current.delete(id);
        levels.current.delete(id);
        publishSpeaking(id, false);
      }
    }, 200);

    return () => {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    };
  }, [joined, localId, patchPeer]);

  /* ------------------------------------------------------ connexions par pair */
  const dropPeer = useCallback(
    (id: string) => {
      const entry = entries.current.get(id);
      if (entry) {
        try {
          entry.pc.ontrack = null;
          entry.pc.onicecandidate = null;
          entry.pc.onconnectionstatechange = null;
          entry.pc.close();
        } catch {
          /* déjà fermée */
        }
        entries.current.delete(id);
      }
      watchStream(id, null);
      publishSpeaking(id, false);
      setPeers((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [watchStream],
  );

  const flushIce = useCallback(async (id: string, pc: RTCPeerConnection) => {
    const entry = entries.current.get(id);
    if (!entry) return;
    const queued = entry.pendingIce.splice(0, entry.pendingIce.length);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* candidat obsolète : la négociation courante n'en a plus besoin */
      }
    }
  }, []);

  const ensurePeer = useCallback(
    (id: string, initiator: boolean): PeerEntry | null => {
      const existing = entries.current.get(id);
      if (existing) return existing;
      const stream = streamRef.current;
      if (!stream) return null;

      const known = participants.find((p) => p.id === id);
      colorRef.current = known?.color ?? colorRef.current;
      setPeers((current) => {
        if (current[id]) return current;
        return {
          ...current,
          [id]: {
            id,
            name: known?.name ?? 'Invité',
            color: known?.color ?? '#38e1e6',
            stream: null,
            state: 'idle',
            mic: known?.media?.mic ?? true,
            cam: known?.media?.cam ?? true,
            speaking: false,
          },
        };
      });

      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 2,
          bundlePolicy: 'max-bundle',
        });
      } catch {
        setError('Ce navigateur ne prend pas en charge la visio pair-à-pair.');
        return null;
      }

      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const entry: PeerEntry = {
        pc,
        session: sessionRef.current,
        initiator,
        pendingIce: [],
        retried: false,
      };
      entries.current.set(id, entry);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal('ice', id, {
          session: sessionRef.current,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        });
      };

      pc.ontrack = (event) => {
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        patchPeer(id, { stream: remote });
        watchStream(id, remote);
        if (audioCtx.current?.state === 'suspended') void audioCtx.current.resume().catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        patchPeer(id, { state: pc.connectionState });
        if (pc.connectionState === 'failed') {
          // une seule tentative de reprise, côté proposeur uniquement
          if (initiator && !entry.retried && joinedRef.current) {
            entry.retried = true;
            entries.current.delete(id);
            setPeers((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
            watchStream(id, null);
            void sendSignal('hello', id, {
              session: sessionRef.current,
              cam: Boolean(streamRef.current?.getVideoTracks()[0]?.enabled),
              mic: Boolean(streamRef.current?.getAudioTracks()[0]?.enabled),
            });
          }
        }
      };

      return entry;
    },
    [participants, patchPeer, sendSignal, watchStream],
  );

  const offerTo = useCallback(
    async (id: string) => {
      const entry = ensurePeer(id, true);
      if (!entry) return;
      try {
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        await sendSignal('offer', id, {
          session: sessionRef.current,
          description: entry.pc.localDescription
            ? { type: 'offer', sdp: entry.pc.localDescription.sdp }
            : { type: 'offer', sdp: offer.sdp },
        });
      } catch {
        dropPeer(id);
      }
    },
    [dropPeer, ensurePeer, sendSignal],
  );

  /* ------------------------------------------------------------- entrer/sortir */
  const join = useCallback(async () => {
    if (!enabled || joinedRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setLocalStream(stream);
      sessionRef.current = callSessionId();
      joinedRef.current = true;
      setJoined(true);
      setMicOn(true);
      setCamOn(true);
      watchStream(localId, stream);
      await publishMedia({
        live: true,
        mic: true,
        cam: true,
        session: sessionRef.current,
      });
      // on salue la salle : les pairs déjà en visio sauront qu'ils peuvent offrir
      await sendSignal('hello', null, {
        session: sessionRef.current,
        cam: true,
        mic: true,
      });
      // et on propose la connexion à ceux déjà en ligne (règle du plus petit id)
      for (const peer of participants) {
        if (!peer.media?.live || peer.id === localId) continue;
        if (!shouldInitiate(localId, peer.id)) continue;
        if (entries.current.size >= MAX_CALL_PEERS) break;
        void offerTo(peer.id);
      }
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Accès refusé : autorisez la caméra et le micro dans le navigateur.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('Aucune caméra ou aucun micro détecté sur cet appareil.');
      } else if (name === 'NotReadableError') {
        setError('La caméra est déjà utilisée par une autre application.');
      } else if (cause instanceof Error && cause.message === 'unsupported') {
        setError('Ce navigateur ne fournit pas de flux caméra/micro.');
      } else {
        setError('La visio n’a pas pu démarrer. Vérifiez les autorisations.');
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLocalStream(null);
      joinedRef.current = false;
      setJoined(false);
    } finally {
      setBusy(false);
    }
  }, [busy, enabled, localId, offerTo, participants, publishMedia, sendSignal, watchStream]);

  const leave = useCallback(async () => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    setJoined(false);
    for (const id of [...entries.current.keys()]) {
      void sendSignal('bye', id, { session: sessionRef.current });
      dropPeer(id);
    }
    analysers.current.clear();
    levels.current.clear();
    clearSpeaking();
    setLocalSpeaking(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLocalStream(null);
    setPeers({});
    await publishMedia({ live: false, mic: false, cam: false, session: sessionRef.current });
  }, [dropPeer, publishMedia, sendSignal]);

  const retry = useCallback(async () => {
    await leave();
    setError(null);
    await join();
  }, [join, leave]);

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      setError('Aucun micro disponible : la visio reste en image seule.');
      return;
    }
    const next = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
    if (!next) publishSpeaking(localId, false);
    void publishMedia({
      live: true,
      mic: next,
      cam: Boolean(stream.getVideoTracks()[0]?.enabled),
      session: sessionRef.current,
    });
  }, [localId, publishMedia]);

  const toggleCam = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (!tracks.length) {
      setError('Aucune caméra disponible : la visio reste en audio seul.');
      return;
    }
    const next = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setCamOn(next);
    void publishMedia({
      live: true,
      mic: Boolean(stream.getAudioTracks()[0]?.enabled),
      cam: next,
      session: sessionRef.current,
    });
  }, [publishMedia]);

  /* ---------------------------------------------------- recevoir les signaux */
  useEffect(() => {
    if (!signals.length) return;
    const handled: string[] = [];

    const run = async () => {
      for (const signal of signals) {
        if (processed.current.has(signal.id)) {
          handled.push(signal.id);
          continue;
        }
        if (signal.from === localId) {
          processed.current.add(signal.id);
          handled.push(signal.id);
          continue;
        }
        processed.current.add(signal.id);
        handled.push(signal.id);
        const parsed = parseMediaSignal(signal.kind, signal.payload);
        if (!parsed.ok) continue;
        const message = parsed.signal;

        if (message.kind === 'bye') {
          dropPeer(signal.from);
          continue;
        }
        if (!joinedRef.current || !streamRef.current) continue;

        if (message.kind === 'hello') {
          if (!shouldInitiate(localId, signal.from)) continue;
          if (entries.current.size >= MAX_CALL_PEERS) continue;
          const existing = entries.current.get(signal.from);
          if (existing && existing.session === message.payload.session) continue;
          if (existing) dropPeer(signal.from);
          await offerTo(signal.from);
          continue;
        }

        if (message.kind === 'offer') {
          // seul le plus petit identifiant propose : sinon on repart de zéro
          let entry = entries.current.get(signal.from);
          if (entry && entry.pc.signalingState !== 'stable') {
            dropPeer(signal.from);
            entry = undefined;
          }
          const created = entry ?? ensurePeer(signal.from, false);
          if (!created) continue;
          try {
            await created.pc.setRemoteDescription(
              new RTCSessionDescription({
                type: 'offer',
                sdp: message.payload.description.sdp,
              }),
            );
            await flushIce(signal.from, created.pc);
            const answer = await created.pc.createAnswer();
            await created.pc.setLocalDescription(answer);
            await sendSignal('answer', signal.from, {
              session: sessionRef.current,
              description: {
                type: 'answer',
                sdp: created.pc.localDescription?.sdp ?? answer.sdp ?? '',
              },
            });
          } catch {
            dropPeer(signal.from);
          }
          continue;
        }

        if (message.kind === 'answer') {
          const entry = entries.current.get(signal.from);
          if (!entry || entry.pc.signalingState !== 'have-local-offer') continue;
          try {
            await entry.pc.setRemoteDescription(
              new RTCSessionDescription({
                type: 'answer',
                sdp: message.payload.description.sdp,
              }),
            );
            await flushIce(signal.from, entry.pc);
          } catch {
            dropPeer(signal.from);
          }
          continue;
        }

        if (message.kind === 'ice') {
          const entry = entries.current.get(signal.from);
          if (!entry) continue;
          const candidate = message.payload.candidate;
          if (!candidate) continue;
          if (!entry.pc.remoteDescription) {
            entry.pendingIce.push(candidate);
            continue;
          }
          try {
            await entry.pc.addIceCandidate(candidate);
          } catch {
            /* candidat tardif : sans effet sur la connexion */
          }
        }
      }
    };

    void run().finally(() => {
      if (handled.length) consumeSignals(handled);
    });
  }, [
    consumeSignals,
    dropPeer,
    ensurePeer,
    flushIce,
    localId,
    offerTo,
    sendSignal,
    signals,
  ]);

  /* ------------------------------------------------ suivre la présence des pairs */
  const livePeers = useMemo(
    () =>
      participants
        .filter((p) => p.id !== localId && p.media?.live)
        .map((p) => `${p.id}:${p.media?.session ?? ''}:${p.media?.cam ? 1 : 0}${p.media?.mic ? 1 : 0}`),
    [localId, participants],
  );

  useEffect(() => {
    const live = new Map<string, { cam: boolean; mic: boolean }>();
    for (const row of livePeers) {
      const [id, , flags] = row.split(':');
      live.set(id, { cam: flags.includes('1'), mic: flags.includes('1') });
    }
    // reflet des bascules micro/caméra des pairs (indépendant de la connexion)
    setPeers((current) => {
      let changed = false;
      const next = { ...current };
      for (const [id, peer] of Object.entries(current)) {
        const state = live.get(id);
        if (!state) continue;
        if (peer.cam !== state.cam || peer.mic !== state.mic) {
          next[id] = { ...peer, cam: state.cam, mic: state.mic };
          changed = true;
        }
      }
      return changed ? next : current;
    });

    if (!joinedRef.current) return;
    // un pair a quitté la visio
    for (const id of [...entries.current.keys()]) {
      if (!live.has(id)) dropPeer(id);
    }
    // un nouveau pair est en visio : le plus petit id propose
    for (const id of live.keys()) {
      if (entries.current.has(id)) continue;
      if (!shouldInitiate(localId, id)) continue;
      if (!acceptsPeer(entries.current.size)) continue;
      void offerTo(id);
    }
  }, [dropPeer, livePeers, localId, offerTo]);

  /* ---------------------------------------------------------------- nettoyage */
  useEffect(() => {
    return () => {
      // fermeture silencieuse : on ne laisse ni piste ni connexion ouvertes
      if (joinedRef.current) {
        joinedRef.current = false;
        for (const id of [...entries.current.keys()]) {
          void sendSignal('bye', id, { session: sessionRef.current });
          dropPeer(id);
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void publishMedia({ live: false, mic: false, cam: false, session: sessionRef.current });
      }
      analysers.current.clear();
      levels.current.clear();
      clearSpeaking();
      if (audioCtx.current) {
        void audioCtx.current.close().catch(() => undefined);
        audioCtx.current = null;
      }
    };
    // volontairement au démontage uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // si l'atelier se ferme ou qu'on perd la salle, on raccroche proprement
  useEffect(() => {
    if (!enabled && joinedRef.current) {
      void leave();
    }
  }, [enabled, leave]);

  const peerList = useMemo(
    () => Object.values(peers).sort((a, b) => a.name.localeCompare(b.name)),
    [peers],
  );

  return {
    joined,
    busy,
    error,
    micOn,
    camOn,
    localSpeaking,
    localStream,
    peers: peerList,
    peerCount: peerList.length,
    join,
    leave,
    toggleMic,
    toggleCam,
    retry,
    dismissError: () => setError(null),
  };
}
