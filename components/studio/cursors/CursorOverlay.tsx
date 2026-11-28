'use client';

import { memo, useMemo, useRef } from 'react';
// import explicite : les tests de rendu (tsx) n'appliquent pas le JSX automatique
import React from 'react';
import { InterpolatedCursor } from './PerfectCursor';
import type { LiveCursor } from '@/hooks/useCollaboration';
import { useCursorPreferences, type CursorPreferences } from '@/hooks/useCursorPreferences';
import { useSpeaking } from '@/hooks/useSpeaking';
import { advanceTrail, trailPolyline, type TrailPoint } from '@/lib/collab/cursorTrails';

/**
 * Curseurs distants de l'atelier.
 *
 * Le mouvement est déjà lissé par une spline (`PerfectCursor`). Ce calque ajoute
 * ce qui manquait pour travailler vraiment à deux :
 *
 * - **sillage** : les dernières positions du pair, pour lire un geste rapide ;
 * - **clics** : un anneau part de la position au moment où l'autre appuie, donc
 *   on voit *où* il clique et pas seulement où il passe ;
 * - **fenêtre du pair** : le cadre de ce qu'il a sous les yeux (mini-carte) ;
 * - **visio** : micro/caméra et anneau de parole directement sur le curseur ;
 * - **suivi** : épingler un pair pour le garder en évidence.
 *
 * Tous ces calques se coupent depuis `CursorPreferences` (réglage persistant).
 */

const PING_MS = 1000;

const STYLE_SHEET = `
@keyframes northev-cursor-ping {
  0%   { transform: scale(.25); opacity: .95; }
  70%  { transform: scale(1.6);  opacity: .35; }
  100% { transform: scale(2.1);  opacity: 0; }
}
@keyframes northev-cursor-breathe {
  0%, 100% { transform: scale(1);    opacity: .55; }
  50%      { transform: scale(1.18); opacity: .2; }
}
.northev-cursor-ping {
  position: absolute;
  width: 26px; height: 26px;
  margin-left: -13px; margin-top: -13px;
  border-radius: 999px;
  border: 2px solid currentColor;
  animation: northev-cursor-ping .95s cubic-bezier(.2,.7,.3,1) forwards;
  will-change: transform, opacity;
}
.northev-cursor-breathe {
  animation: northev-cursor-breathe 1.15s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .northev-cursor-ping { animation-duration: .35s; }
  .northev-cursor-breathe { animation: none; }
}
`;

type ToolInfo = { emoji: string; caption: string };

function describeTool(tool?: string | null): ToolInfo {
  const map: Record<string, ToolInfo> = {
    place: { emoji: '✏️', caption: 'trace' },
    erase: { emoji: '🧽', caption: 'efface' },
    terminal: { emoji: '🎯', caption: 'borne' },
    ground: { emoji: '⏚', caption: 'masse' },
    pan: { emoji: '✋', caption: 'déplace la vue' },
    select: { emoji: '', caption: '' },
    idle: { emoji: '', caption: '' },
    local: { emoji: '', caption: '' },
  };
  return map[tool ?? 'select'] ?? { emoji: '', caption: '' };
}

export function CursorOverlay({
  cursors,
  toPx,
  localCursor,
  prefs,
  speaking,
  followId = null,
  onFollow,
}: {
  cursors: LiveCursor[];
  toPx: (cell: { x: number; y: number }) => { x: number; y: number };
  localCursor?: { x: number; y: number } | null;
  prefs?: CursorPreferences;
  speaking?: Record<string, boolean>;
  followId?: string | null;
  onFollow?: (id: string | null) => void;
}) {
  const stored = useCursorPreferences();
  const speakingStore = useSpeaking();
  const active = prefs ?? stored.prefs;
  const voices = speaking ?? speakingStore;

  const trails = useRef(new Map<string, TrailPoint[]>());
  const pressed = useRef(new Map<string, boolean>());
  const pings = useRef(new Map<string, { x: number; y: number; t: number; color: string }>());

  // calcul des traces et des clics (léger : quelques dizaines de points)
  const { trailPaths, pingList } = useMemo(() => {
    const now = Date.now();
    const paths: Array<{ id: string; color: string; points: string }> = [];

    for (const cursor of cursors) {
      if (cursor.pressed && !pressed.current.get(cursor.id)) {
        pings.current.set(`${cursor.id}:${now}`, {
          x: cursor.x,
          y: cursor.y,
          t: now,
          color: cursor.color,
        });
      }
      pressed.current.set(cursor.id, Boolean(cursor.pressed));

      const kept = advanceTrail(trails.current.get(cursor.id), cursor, now);
      trails.current.set(cursor.id, kept);

      if (active.trails) {
        const points = trailPolyline(kept, toPx);
        if (points) paths.push({ id: cursor.id, color: cursor.color, points });
      }
    }

    for (const [key, ping] of pings.current) {
      if (now - ping.t > PING_MS) pings.current.delete(key);
    }

    return { trailPaths: paths, pingList: [...pings.current.values()] };
  }, [cursors, active.trails, toPx]);

  const hasFollow = Boolean(followId);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <style>{STYLE_SHEET}</style>

      {/* fenêtres visibles des pairs */}
      {active.viewports && cursors.length ? (
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {cursors.map((cursor) => {
            if (cursor.idle || hasFollow) return null;
            const { vx, vy, vw, vh } = cursor;
            if (
              typeof vx !== 'number' ||
              typeof vy !== 'number' ||
              typeof vw !== 'number' ||
              typeof vh !== 'number' ||
              vw <= 0 ||
              vh <= 0
            ) {
              return null;
            }
            const start = toPx({ x: vx, y: vy });
            const end = toPx({ x: vx + vw, y: vy + vh });
            const width = end.x - start.x;
            const height = end.y - start.y;
            if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
            // une vue plus large que l'écran n'apprend rien : on l'omet
            if (width < 20 || height < 20 || width > 4000 || height > 4000) return null;
            return (
              <g key={`view-${cursor.id}`} opacity={cursor.fresh ? 0.55 : 0.28}>
                <rect
                  x={start.x}
                  y={start.y}
                  width={width}
                  height={height}
                  rx={10}
                  fill="none"
                  stroke={cursor.color}
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
                {[
                  [start.x, start.y, 1, 1],
                  [end.x, start.y, -1, 1],
                  [start.x, end.y, 1, -1],
                  [end.x, end.y, -1, -1],
                ].map(([x, y, dx, dy], index) => (
                  <path
                    key={index}
                    d={`M ${x} ${y} l ${dx * 10} 0 M ${x} ${y} l 0 ${dy * 10}`}
                    stroke={cursor.color}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      ) : null}

      {/* sillages */}
      {trailPaths.length ? (
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {trailPaths.map((path) => (
            <g key={`trail-${path.id}`} opacity={hasFollow && followId !== path.id ? 0.15 : 0.45}>
              <polyline
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.35}
              />
              <polyline
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth={1}
                strokeLinecap="round"
                strokeDasharray="1 4"
                strokeOpacity={0.6}
              />
            </g>
          ))}
        </svg>
      ) : null}

      {/* clics */}
      {pingList.map((ping) => {
        const pixel = toPx({ x: ping.x, y: ping.y });
        return (
          <span
            key={`ping-${ping.x}-${ping.y}-${ping.t}`}
            className="northev-cursor-ping"
            style={{ left: pixel.x, top: pixel.y, color: ping.color }}
          />
        );
      })}

      {/* curseurs */}
      {cursors.map((cursor) => {
        const position = toPx({ x: cursor.x, y: cursor.y });
        const isFollowed = followId === cursor.id;
        const dimmed = hasFollow && !isFollowed;
        return (
          <InterpolatedCursor key={cursor.id} point={[position.x, position.y]}>
            <div
              style={{
                opacity: dimmed ? 0.4 : cursor.idle ? 0.5 : 1,
                transform: `scale(${(isFollowed ? active.scale * 1.15 : active.scale).toFixed(2)})`,
                transformOrigin: 'top left',
                transition: 'opacity .25s ease, transform .2s ease',
                filter: isFollowed ? `drop-shadow(0 0 10px ${cursor.color}aa)` : undefined,
              }}
            >
              <CursorGlyph
                name={cursor.name}
                color={cursor.color}
                tool={cursor.tool}
                idle={cursor.idle}
                label={cursor.hover}
                selection={cursor.selection}
                style={active.style}
                showLabel={active.labels}
                pressed={Boolean(cursor.pressed)}
                call={
                  active.call && cursor.media?.live
                    ? { mic: cursor.media.mic, cam: cursor.media.cam }
                    : null
                }
                speaking={Boolean(voices[cursor.id])}
                followed={isFollowed}
                onFollow={onFollow ? () => onFollow(isFollowed ? null : cursor.id) : undefined}
              />
            </div>
          </InterpolatedCursor>
        );
      })}

      {localCursor ? (
        <div
          className="absolute z-30"
          style={{
            left: localCursor.x,
            top: localCursor.y,
            transform: 'translate(-2px, -2px)',
            transition: 'opacity .15s',
          }}
        >
          <CursorGlyph
            name="Vous"
            color="#e9f0fc"
            tool="local"
            idle={false}
            style={active.style}
            showLabel={active.labels}
            you
          />
        </div>
      ) : null}
    </div>
  );
}

const CursorGlyph = memo(function CursorGlyph({
  name,
  color,
  tool,
  idle,
  label,
  selection,
  style = 'pointer',
  showLabel = true,
  pressed,
  call,
  speaking,
  followed,
  you,
  onFollow,
}: {
  name: string;
  color: string;
  tool?: string | null;
  idle: boolean;
  label?: string | null;
  selection?: string | null;
  style?: CursorPreferences['style'];
  showLabel?: boolean;
  pressed?: boolean;
  call?: { mic: boolean; cam: boolean } | null;
  speaking?: boolean;
  followed?: boolean;
  you?: boolean;
  onFollow?: () => void;
}) {
  const { emoji, caption } = describeTool(tool);

  return (
    <div
      className="relative select-none"
      style={{
        opacity: idle ? 0.45 : 1,
        transition: 'opacity .3s ease',
      }}
    >
      {/* halo de suivi + parole, sous le curseur */}
      {followed ? (
        <span
          className="northev-cursor-breathe absolute -left-3 -top-3 block h-12 w-12 rounded-full"
          style={{ boxShadow: `0 0 0 2px ${color}88, 0 0 26px 4px ${color}55` }}
        />
      ) : null}
      {speaking ? (
        <span
          className="northev-cursor-breathe absolute -left-2 -top-2 block h-9 w-9 rounded-full"
          style={{ boxShadow: '0 0 0 1px rgba(70,230,160,.8), 0 0 18px 2px rgba(70,230,160,.45)' }}
        />
      ) : null}

      {style === 'pointer' ? (
        <svg
          width="22"
          height="26"
          viewBox="0 0 22 26"
          style={{
            filter: `drop-shadow(0 2px 6px ${color}66)`,
            transform: pressed ? 'scale(.88)' : 'none',
            transformOrigin: '4px 4px',
            transition: 'transform .12s ease',
          }}
        >
          <path
            d="M2 1.5 L19.5 13.2 L11.6 14.6 L7.9 22.5 L2 1.5 Z"
            fill={color}
            stroke="rgba(3,10,18,.75)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      ) : style === 'dot' ? (
        <span
          className="block rounded-full"
          style={{
            width: 11,
            height: 11,
            background: color,
            border: '1.5px solid rgba(3,10,18,.8)',
            boxShadow: `0 0 0 ${pressed ? 4 : 2}px ${color}33, 0 2px 8px ${color}66`,
            transition: 'box-shadow .15s ease',
          }}
        />
      ) : (
        <span className="relative block h-3 w-3">
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px 2px ${color}aa` }}
          />
          <span
            className="northev-cursor-breathe absolute -inset-2 rounded-full"
            style={{ border: `1px solid ${color}88` }}
          />
        </span>
      )}

      {showLabel ? (
        <div
          className="absolute left-[17px] top-[18px] flex max-w-[210px] items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none shadow-lg"
          style={{
            background: color,
            color: '#04121a',
            boxShadow: `0 4px 14px -4px ${color}aa`,
            borderBottomLeftRadius: 3,
          }}
        >
          <span className="max-w-[96px] truncate">{you ? 'Vous' : name}</span>
          {emoji ? <span className="text-[10px]">{emoji}</span> : null}
          {caption && !you ? <span className="opacity-70">{caption}</span> : null}
          {selection ? (
            <span className="max-w-[64px] overflow-hidden text-ellipsis rounded bg-ink-950/20 px-1 text-[9px] font-bold">
              {selection}
            </span>
          ) : null}
          {call ? (
            <span className="flex items-center gap-[2px] text-[9px]">
              <span title={call.cam ? 'caméra active' : 'caméra coupée'} className="opacity-80">
                {call.cam ? '▣' : '▢'}
              </span>
              <span title={call.mic ? 'micro ouvert' : 'micro coupé'} className="opacity-80">
                {call.mic ? '◉' : '⊘'}
              </span>
            </span>
          ) : null}
          {speaking ? (
            <span className="flex items-end gap-[1px]" title="parle">
              <span className="h-1 w-[2px] animate-pulse rounded-sm bg-ink-950/70" />
              <span className="h-2 w-[2px] animate-pulse rounded-sm bg-ink-950/70" />
              <span className="h-1.5 w-[2px] animate-pulse rounded-sm bg-ink-950/70" />
            </span>
          ) : null}
          {label ? (
            <span className="max-w-[74px] overflow-hidden text-ellipsis opacity-75">· {label}</span>
          ) : null}
          {onFollow ? (
            <button
              type="button"
              onClick={onFollow}
              className="pointer-events-auto ml-0.5 rounded-full bg-ink-950/25 px-1 text-[9px] font-bold leading-[14px] transition hover:bg-ink-950/45"
              title={followed ? 'Ne plus suivre' : 'Suivre ce curseur'}
            >
              {followed ? '✕' : '◎'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

/** Pastilles empilées des participants (façon Canva en haut du canvas) */
export function PresencePills({
  cursors,
  participants,
  localId,
  speaking,
  onFollow,
  followId,
}: {
  cursors: LiveCursor[];
  participants: Array<{
    id: string;
    name: string;
    color: string;
    activity?: string;
    idle?: boolean;
    media?: { live: boolean; mic: boolean; cam: boolean } | null;
  }>;
  localId: string;
  speaking?: Record<string, boolean>;
  onFollow?: (id: string | null) => void;
  followId?: string | null;
}) {
  const store = useSpeaking();
  const voices = speaking ?? store;

  const list: Array<{
    id: string;
    name: string;
    color: string;
    activity?: string;
    idle?: boolean;
    media?: { live: boolean; mic: boolean; cam: boolean } | null;
  }> = participants.length
    ? participants
    : cursors.map((c) => ({ id: c.id, name: c.name, color: c.color, idle: c.idle }));

  return (
    <div className="flex items-center">
      {list.slice(0, 6).map((participant, index) => {
        const isSelf = participant.id === localId;
        const talking = Boolean(voices[participant.id]);
        const followed = followId === participant.id;
        const Wrapper = onFollow && !isSelf ? 'button' : 'div';
        return (
          <Wrapper
            key={participant.id}
            {...(onFollow && !isSelf
              ? {
                  type: 'button' as const,
                  onClick: () => onFollow(followed ? null : participant.id),
                  title: followed ? 'Ne plus suivre' : `Suivre ${participant.name}`,
                }
              : {})}
            className="group relative flex h-7 items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium backdrop-blur transition hover:z-20"
            style={{
              marginLeft: index === 0 ? 0 : -9,
              zIndex: followed ? 15 : 10 - index,
              borderColor: talking ? 'rgba(70,230,160,.9)' : followed ? participant.color : `${participant.color}88`,
              background: followed ? `${participant.color}33` : `${participant.color}1f`,
              color: participant.color,
              boxShadow: talking ? '0 0 0 1px rgba(70,230,160,.55), 0 0 16px -2px rgba(70,230,160,.6)' : undefined,
            }}
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
              style={{ background: participant.color, color: '#04121a' }}
            >
              {participant.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="max-w-[74px] truncate">{isSelf ? 'Vous' : participant.name}</span>
            {participant.media?.live ? (
              <span className="flex items-center gap-[1px] text-[8px] opacity-80">
                <span title={participant.media.cam ? 'caméra' : 'caméra coupée'}>
                  {participant.media.cam ? '▣' : '▢'}
                </span>
                <span title={participant.media.mic ? 'micro' : 'micro coupé'}>
                  {participant.media.mic ? '◉' : '⊘'}
                </span>
              </span>
            ) : null}
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: talking
                  ? 'rgb(70,230,160)'
                  : participant.idle
                    ? '#64748b'
                    : participant.color,
                boxShadow: talking
                  ? '0 0 8px rgba(70,230,160,.9)'
                  : participant.idle
                    ? 'none'
                    : `0 0 6px ${participant.color}`,
              }}
            />
            {participant.activity ? (
              <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line/70 bg-ink-950/95 px-2 py-1 text-[9.5px] font-normal text-fg-soft shadow-panel group-hover:block">
                {participant.activity}
                {talking ? ' · parle' : ''}
              </span>
            ) : null}
          </Wrapper>
        );
      })}
    </div>
  );
}
