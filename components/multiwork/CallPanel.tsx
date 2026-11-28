'use client';

import { useEffect, useRef, useState } from 'react';
// import explicite : les tests de rendu (tsx) n'appliquent pas le JSX automatique
import React from 'react';
import {
  CircleAlert,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  ShieldCheck,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { callStatusLabel } from '@/lib/collab/media';
import type { CallApi, CallPeer } from '@/hooks/useMediaCall';

/**
 * Mosaïque de visio de l'atelier : caméra + micro, pair-à-pair.
 *
 * Deux présentations : dans la colonne de l'atelier (`variant="sidebar"`) et en
 * vignette flottante au-dessus du plan (`variant="float"`), pour que la visio
 * reste accessible même quand la colonne latérale est masquée.
 */

function attachStream(element: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!element) return;
  if (element.srcObject !== stream) element.srcObject = stream;
  if (stream) {
    const play = element.play();
    if (play && typeof play.catch === 'function') play.catch(() => undefined);
  }
}

function LocalTile({ call, compact }: { call: CallApi; compact: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    attachStream(ref.current, call.localStream);
  }, [call.localStream]);
  const camOff = !call.camOn || !call.localStream;

  return (
    <div
      className="relative aspect-video overflow-hidden rounded-xl border bg-ink-950"
      style={{
        borderColor: call.localSpeaking ? 'rgba(70,230,160,.85)' : 'rgba(148,163,184,.25)',
        boxShadow: call.localSpeaking
          ? '0 0 0 1px rgba(70,230,160,.6), 0 8px 24px -12px rgba(0,0,0,.8)'
          : undefined,
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="h-full w-full scale-x-[-1] object-cover"
        style={{ display: camOff ? 'none' : 'block' }}
      />
      {camOff ? (
        <div className="flex h-full w-full items-center justify-center bg-ink-900/80">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-spark-cyan/15 text-[11px] font-bold text-spark-cyan">
            VOUS
          </span>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-ink-950/90 to-transparent px-2 pb-1.5 pt-4 text-[10px]">
        <span className="truncate font-semibold text-fg-soft">Vous</span>
        <span className="flex items-center gap-1">
          {call.micOn ? <Mic size={9} /> : <MicOff size={9} className="text-spark-coral" />}
          {call.camOn ? <Video size={9} /> : <VideoOff size={9} className="text-spark-coral" />}
        </span>
      </div>
      {compact ? null : (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-ink-950/70 px-1.5 py-0.5 text-[8.5px] uppercase tracking-wide text-fg-mute">
          local
        </span>
      )}
    </div>
  );
}

function RemoteTile({ peer, compact }: { peer: CallPeer; compact: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    attachStream(ref.current, peer.stream);
  }, [peer.stream]);
  const camOff = !peer.cam || !peer.stream;

  return (
    <div
      className="relative aspect-video overflow-hidden rounded-xl border bg-ink-950"
      style={{
        borderColor: peer.speaking ? peer.color : `${peer.color}44`,
        boxShadow: peer.speaking ? `0 0 0 1px ${peer.color}, 0 8px 24px -12px ${peer.color}99` : undefined,
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        style={{ display: camOff ? 'none' : 'block' }}
      />
      {camOff ? (
        <div className="flex h-full w-full items-center justify-center bg-ink-900/80">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: `${peer.color}22`, color: peer.color, border: `1px solid ${peer.color}66` }}
          >
            {peer.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-ink-950/90 to-transparent px-2 pb-1.5 pt-4 text-[10px]">
        <span className="truncate font-semibold" style={{ color: peer.color }}>
          {peer.name}
        </span>
        <span className="flex items-center gap-1 text-fg-soft">
          {peer.mic ? <Mic size={9} /> : <MicOff size={9} className="text-spark-coral" />}
          {peer.cam ? <Video size={9} /> : <VideoOff size={9} className="text-spark-coral" />}
        </span>
      </div>
      {peer.speaking ? (
        <span
          className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold"
          style={{ background: peer.color, color: '#04121a' }}
        >
          parole
        </span>
      ) : peer.state !== 'connected' && !compact ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-ink-950/70 px-1.5 py-0.5 text-[8.5px] text-fg-mute">
          {peer.state === 'connecting' || peer.state === 'idle' ? 'connexion…' : peer.state}
        </span>
      ) : null}
    </div>
  );
}

export function CallPanel({
  call,
  variant = 'sidebar',
  className,
}: {
  call: CallApi;
  variant?: 'sidebar' | 'float';
  className?: string;
}) {
  const [open, setOpen] = useState(variant === 'sidebar');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (variant === 'sidebar') setOpen(true);
  }, [variant]);

  const isFloat = variant === 'float';
  const visible = isFloat ? open : true;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`pointer-events-auto flex items-center gap-1.5 rounded-full border border-spark-cyan/40 bg-ink-950/90 px-2.5 py-1.5 text-[10.5px] font-semibold text-spark-cyan shadow-panel backdrop-blur transition hover:border-spark-cyan/70 ${className ?? ''}`}
      >
        <Video size={12} />
        {call.joined ? `visio · ${call.peerCount}` : 'visio'}
        {call.joined && call.localSpeaking ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-spark-green" />
        ) : null}
      </button>
    );
  }

  return (
    <div
      className={[
        isFloat
          ? 'pointer-events-auto w-[300px] max-w-[92vw] rounded-2xl border border-line/70 bg-ink-950/95 p-2.5 shadow-panel backdrop-blur'
          : 'space-y-2',
        expanded ? 'sm:w-[420px]' : '',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold">
          <Video size={12} className="text-spark-cyan" />
          Visio d’atelier
          <span className="rounded-full border border-line/70 px-1.5 text-[9px] font-normal text-fg-mute">
            P2P
          </span>
        </p>
        <div className="flex items-center gap-0.5">
          {isFloat ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-md p-1 text-fg-mute transition hover:text-fg"
              title={expanded ? 'Réduire' : 'Agrandir'}
              aria-label={expanded ? 'Réduire la visio' : 'Agrandir la visio'}
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          ) : null}
          {isFloat ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-fg-mute transition hover:text-fg"
              title="Masquer"
              aria-label="Masquer la visio"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {call.error ? (
        <div className="flex items-start gap-1.5 rounded-lg border border-spark-coral/40 bg-spark-coral/10 p-2 text-[10px] text-spark-coral">
          <CircleAlert size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1">{call.error}</span>
          <button
            type="button"
            onClick={call.dismissError}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Fermer l’avertissement"
          >
            <X size={11} />
          </button>
        </div>
      ) : null}

      {!call.joined ? (
        <div className="space-y-2">
          <p className="text-[10.5px] leading-relaxed text-fg-mute">
            Voyez le montage <span className="text-fg-soft">et</span> le visage de votre binôme, micro ouvert.
            Le flux passe directement entre vos deux navigateurs : aucun serveur vidéo, aucune image enregistrée.
          </p>
          <button
            type="button"
            onClick={() => void call.join()}
            disabled={call.busy}
            className="btn btn-sm btn-primary w-full justify-center gap-1.5 text-[11px] disabled:opacity-60"
          >
            {call.busy ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />}
            {call.busy ? 'Ouverture de la caméra…' : 'Rejoindre la visio'}
          </button>
          <p className="flex items-center gap-1 text-[9.5px] text-fg-mute">
            <ShieldCheck size={10} className="text-spark-green" />
            micro et caméra coupés dès que vous quittez l’atelier
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className={`grid gap-1.5 ${call.peers.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            <LocalTile call={call} compact={isFloat && !expanded} />
            {call.peers.map((peer) => (
              <RemoteTile key={peer.id} peer={peer} compact={isFloat && !expanded} />
            ))}
          </div>

          {call.peers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line/70 px-2 py-1.5 text-[10px] text-fg-mute">
              En attente : votre binôme doit cliquer « Rejoindre la visio » de son côté.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={call.toggleMic}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  call.micOn
                    ? 'border-line/80 bg-ink-900 text-fg-soft hover:border-spark-cyan/60'
                    : 'border-spark-coral/60 bg-spark-coral/15 text-spark-coral'
                }`}
                title={call.micOn ? 'Couper le micro' : 'Rouvrir le micro'}
                aria-label={call.micOn ? 'Couper le micro' : 'Rouvrir le micro'}
              >
                {call.micOn ? <Mic size={13} /> : <MicOff size={13} />}
              </button>
              <button
                type="button"
                onClick={call.toggleCam}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  call.camOn
                    ? 'border-line/80 bg-ink-900 text-fg-soft hover:border-spark-cyan/60'
                    : 'border-spark-coral/60 bg-spark-coral/15 text-spark-coral'
                }`}
                title={call.camOn ? 'Couper la caméra' : 'Rouvrir la caméra'}
                aria-label={call.camOn ? 'Couper la caméra' : 'Rouvrir la caméra'}
              >
                {call.camOn ? <Video size={13} /> : <VideoOff size={13} />}
              </button>
              <button
                type="button"
                onClick={() => void call.retry()}
                className="flex h-7 items-center justify-center rounded-full border border-line/80 bg-ink-900 px-2 text-[9.5px] text-fg-mute transition hover:text-fg"
                title="Relancer la connexion"
              >
                relancer
              </button>
            </div>
            <button
              type="button"
              onClick={() => void call.leave()}
              className="flex h-7 items-center gap-1 rounded-full border border-spark-coral/50 bg-spark-coral/10 px-2.5 text-[10px] font-semibold text-spark-coral transition hover:bg-spark-coral/20"
            >
              <PhoneOff size={11} />
              quitter
            </button>
          </div>

          <p className="text-[9.5px] text-fg-mute">{callStatusLabel(call.peerCount, call.joined)}</p>
        </div>
      )}
    </div>
  );
}
