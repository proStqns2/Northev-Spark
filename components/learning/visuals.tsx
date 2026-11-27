'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BADGE_TIERS } from '@/lib/learning/badges';
import { todayIso, dayBefore } from '@/lib/learning/xp';
import type { Badge } from '@/lib/learning/types';

/* ────────────────────────────── anneau de progression ───────────────────── */

export function ProgressRing({
  value,
  size = 84,
  stroke = 8,
  color = '#38e1e6',
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sub?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffset(circumference * (1 - Math.min(1, Math.max(0, value)))));
    return () => cancelAnimationFrame(frame);
  }, [value, circumference]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms ease-out', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-semibold">{label ?? `${Math.round(value * 100)} %`}</span>
        {sub ? <span className="text-[9.5px] text-fg-mute">{sub}</span> : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── calendrier de série ──────────────────────── */

export function StreakCalendar({
  days,
  weeks = 9,
}: {
  days: string[];
  weeks?: number;
}) {
  const set = useMemo(() => new Set(days), [days]);
  const today = todayIso();
  const cells = useMemo(() => {
    const total = weeks * 7;
    const list: Array<{ date: string; active: boolean; future: boolean }> = [];
    let cursor = today;
    for (let i = 0; i < total; i += 1) {
      list.unshift({ date: cursor, active: set.has(cursor), future: false });
      cursor = dayBefore(cursor);
    }
    return list;
  }, [set, today, weeks]);

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {cells.map((cell) => (
          <span
            key={cell.date}
            title={cell.date}
            className={cn('h-3 w-3 rounded-[3px] transition', cell.active ? 'bg-spark-green/80 shadow-[0_0_6px] shadow-spark-green/50' : 'bg-ink-800/80')}
          />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10.5px] text-fg-mute">
        <Flame size={11} className="text-spark-amber" />
        {days.length} jour{days.length > 1 ? 's' : ''} d’activité enregistré{days.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}

/* ────────────────────────────── radar de maîtrise ────────────────────────── */

export function MasteryRadar({
  data,
  size = 260,
}: {
  data: Array<{ module: string; label: string; ratio: number }>;
  size?: number;
}) {
  const center = size / 2;
  const radius = center - 34;
  const count = Math.max(3, data.length);

  const point = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio] as const;
  };

  const polygon = data.map((item, index) => point(index, Math.max(0.04, item.ratio)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} className="overflow-visible">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={data.map((_, index) => point(index, ring).join(',')).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={1}
        />
      ))}
      {data.map((item, index) => {
        const [x, y] = point(index, 1);
        return <line key={item.module} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" />;
      })}
      <polygon points={polygon} fill="rgba(56,225,230,0.16)" stroke="#38e1e6" strokeWidth={1.6} />
      {data.map((item, index) => {
        const [x, y] = point(index, Math.max(0.04, item.ratio));
        return <circle key={`${item.module}-dot`} cx={x} cy={y} r={2.6} fill="#38e1e6" />;
      })}
      {data.map((item, index) => {
        const [x, y] = point(index, 1.22);
        return (
          <text
            key={`${item.module}-label`}
            x={x}
            y={y}
            textAnchor={x > center + 4 ? 'start' : x < center - 4 ? 'end' : 'middle'}
            dominantBaseline="middle"
            fontSize={9.5}
            fill="rgba(255,255,255,0.55)"
          >
            {item.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ────────────────────────────── badge ────────────────────────────────────── */

const ICONS: Record<string, string> = {
  bolt: '⚡',
  flame: '🔥',
  trophy: '🏆',
  graduation: '🎓',
  compass: '🧭',
  atom: '⚛️',
  wave: '〰️',
  gauge: '🎛️',
  shield: '🛡️',
  crown: '👑',
  sparkles: '✨',
  target: '🎯',
};

export function BadgeTile({
  badge,
  earnedAt,
  locked,
}: {
  badge: Badge;
  earnedAt?: string;
  locked?: boolean;
}) {
  const tier = BADGE_TIERS[badge.tier] ?? BADGE_TIERS.bronze;
  const owned = Boolean(earnedAt);
  return (
    <div
      className={cn(
        'panel group relative flex flex-col items-center gap-1.5 p-3 text-center transition',
        owned ? 'card-hover' : 'opacity-70',
      )}
      style={owned ? { borderColor: tier.ring, boxShadow: `inset 0 0 32px ${tier.ring}` } : undefined}
      title={badge.hint}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[19px]"
        style={{
          background: owned ? `${tier.color}1f` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${owned ? tier.ring : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        {locked && !owned ? <Lock size={15} className="text-fg-mute" /> : ICONS[badge.icon] ?? '✨'}
      </span>
      <p className="text-[11px] font-semibold leading-tight">{badge.title}</p>
      <p className="text-[9.5px] leading-tight text-fg-mute">{owned ? tier.label : badge.hint}</p>
      {owned ? (
        <span className="text-[9px] text-spark-green">{new Date(earnedAt as string).toLocaleDateString('fr-FR')}</span>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── confettis ────────────────────────────────── */

/**
 * Petite pluie de confettis en DOM (aucune dépendance) : déclenchée quand un
 * badge tombe ou qu’un quiz est parfait. Les particules se nettoient seules.
 */
export function Confetti({ fire, colors = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff79c6'] }: { fire: number; colors?: string[] }) {
  const [bursts, setBursts] = useState<Array<{ id: number; parts: Array<{ left: number; delay: number; color: string; rotate: number }> }>>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (!fire) return;
    counter.current += 1;
    const id = counter.current;
    const parts = Array.from({ length: 26 }, (_, index) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      color: colors[index % colors.length],
      rotate: Math.random() * 360,
    }));
    setBursts((previous) => [...previous, { id, parts }].slice(-3));
    const timer = setTimeout(() => setBursts((previous) => previous.filter((burst) => burst.id !== id)), 2200);
    return () => clearTimeout(timer);
  }, [fire, colors]);

  if (!bursts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bursts.map((burst) =>
        burst.parts.map((part, index) => (
          <span
            key={`${burst.id}-${index}`}
            className="absolute top-[-12px] block h-2 w-2 rounded-[2px]"
            style={{
              left: `${part.left}%`,
              background: part.color,
              animation: `confetti-fall 1.9s cubic-bezier(0.2,0.6,0.4,1) ${part.delay}s forwards`,
              transform: `rotate(${part.rotate}deg)`,
            }}
          />
        )),
      )}
    </div>
  );
}

/* ────────────────────────────── divers ───────────────────────────────────── */

export function StatCard({
  label,
  value,
  sub,
  accent = '#38e1e6',
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="panel flex items-center gap-3 p-3.5" style={{ borderColor: `${accent}33` }}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: `${accent}18`, color: accent }}
      >
        {icon ?? <Sparkles size={15} />}
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wide text-fg-mute">{label}</p>
        <p className="text-[17px] font-semibold leading-tight">{value}</p>
        {sub ? <p className="truncate text-[10px] text-fg-mute">{sub}</p> : null}
      </div>
    </div>
  );
}
