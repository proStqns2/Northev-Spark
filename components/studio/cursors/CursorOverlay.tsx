'use client';

import { memo, useMemo } from 'react';
import { InterpolatedCursor } from './PerfectCursor';
import type { LiveCursor } from '@/hooks/useCollaboration';

/**
 * Dessine les curseurs distants au-dessus de la grille.
 * `toPx` convertit une coordonnée de grille (cellules) en pixels écran.
 */
export function CursorOverlay({
  cursors,
  toPx,
  localCursor,
}: {
  cursors: LiveCursor[];
  toPx: (cell: { x: number; y: number }) => { x: number; y: number };
  localCursor?: { x: number; y: number } | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {cursors.map((cursor) => {
        const position = toPx({ x: cursor.x, y: cursor.y });
        return (
          <InterpolatedCursor key={cursor.id} point={[position.x, position.y]}>
            <CursorGlyph
              name={cursor.name}
              color={cursor.color}
              tool={cursor.tool}
              idle={cursor.idle}
              label={cursor.hover}
            />
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
          <CursorGlyph name="Vous" color="#e9f0fc" tool="local" idle={false} you />
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
  you,
}: {
  name: string;
  color: string;
  tool?: string | null;
  idle: boolean;
  label?: string | null;
  you?: boolean;
}) {
  const { emoji, caption } = useMemo(() => {
    const map: Record<string, { emoji: string; caption: string }> = {
      place: { emoji: '✏️', caption: 'trace' },
      erase: { emoji: '🧽', caption: 'efface' },
      terminal: { emoji: '🎯', caption: 'borne' },
      ground: { emoji: '⏚', caption: 'masse' },
      select: { emoji: '', caption: '' },
      local: { emoji: '', caption: '' },
    };
    return map[tool ?? 'select'] ?? { emoji: '', caption: '' };
  }, [tool]);

  return (
    <div
      className="relative select-none"
      style={{
        opacity: idle ? 0.45 : 1,
        transition: 'opacity .3s ease',
      }}
    >
      {/* flèche du curseur */}
      <svg width="22" height="26" viewBox="0 0 22 26" style={{ filter: `drop-shadow(0 2px 6px ${color}66)` }}>
        <path
          d="M2 1.5 L19.5 13.2 L11.6 14.6 L7.9 22.5 L2 1.5 Z"
          fill={color}
          stroke="rgba(3,10,18,.75)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>

      {/* étiquette : nom + activité */}
      <div
        className="absolute left-[17px] top-[18px] flex max-w-[190px] items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none shadow-lg"
        style={{
          background: color,
          color: '#04121a',
          boxShadow: `0 4px 14px -4px ${color}aa`,
        }}
      >
        {you ? 'Vous' : name}
        {emoji ? <span className="text-[10px]">{emoji}</span> : null}
        {caption && !you ? <span className="opacity-70"> {caption}</span> : null}
        {label ? (
          <span className="max-w-[86px] overflow-hidden text-ellipsis opacity-75">· {label}</span>
        ) : null}
      </div>
    </div>
  );
});

/** Pastilles empilées des participants (façon Canva en haut du canvas) */
export function PresencePills({
  cursors,
  participants,
  localId,
}: {
  cursors: LiveCursor[];
  participants: Array<{ id: string; name: string; color: string; activity?: string; idle?: boolean }>;
  localId: string;
}) {
  const list: Array<{ id: string; name: string; color: string; activity?: string; idle?: boolean }> =
    participants.length
      ? participants
      : cursors.map((c) => ({ id: c.id, name: c.name, color: c.color, idle: c.idle }));

  return (
    <div className="flex items-center">
      {list.slice(0, 6).map((participant, index) => (
        <div
          key={participant.id}
          className="group relative flex h-7 items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium backdrop-blur transition hover:z-20"
          style={{
            marginLeft: index === 0 ? 0 : -9,
            zIndex: 10 - index,
            borderColor: `${participant.color}88`,
            background: `${participant.color}1f`,
            color: participant.color,
          }}
        >
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
            style={{ background: participant.color, color: '#04121a' }}
          >
            {participant.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="max-w-[74px] truncate">{participant.id === localId ? 'Vous' : participant.name}</span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: participant.idle ? '#64748b' : participant.color,
              boxShadow: participant.idle ? 'none' : `0 0 6px ${participant.color}`,
            }}
          />
          {participant.activity ? (
            <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line/70 bg-ink-950/95 px-2 py-1 text-[9.5px] font-normal text-fg-soft shadow-panel group-hover:block">
              {participant.activity}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
