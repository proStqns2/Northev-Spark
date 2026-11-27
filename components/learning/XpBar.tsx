'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { levelProgress } from '@/lib/learning/xp';

/**
 * Barre d’XP animée : au montage, la barre part de 0 et rejoint la valeur
 * réelle, ce qui rend le gain visible à chaque retour sur la page.
 */
export function XpBar({
  xp,
  compact = false,
  className,
}: {
  xp: number;
  compact?: boolean;
  className?: string;
}) {
  const { level, next, ratio, missing } = levelProgress(xp);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(ratio * 100));
    return () => cancelAnimationFrame(frame);
  }, [ratio]);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold"
            style={{ background: `${level.color}22`, color: level.color, border: `1px solid ${level.color}55` }}
          >
            {level.index}
          </span>
          <div className="leading-tight">
            <p className="text-[12.5px] font-semibold" style={{ color: level.color }}>
              {level.title}
            </p>
            {!compact ? <p className="text-[10.5px] text-fg-mute">{level.blurb}</p> : null}
          </div>
        </div>
        <p className="text-[11px] text-fg-mute">
          <span className="font-semibold text-fg">{xp.toLocaleString('fr-FR')}</span> XP
          {next ? <span> · {missing} avant {next.title}</span> : <span> · niveau maximal</span>}
        </p>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800/80">
        <div
          className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${level.color}, ${next?.color ?? level.color})`,
            boxShadow: `0 0 12px ${level.color}66`,
          }}
        />
      </div>

      {!compact ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-fg-mute">
          <Zap size={10} className="text-spark-amber" />
          <span>
            {Object.keys({}).length === 0 ? 'Chaque leçon rapporte 40 XP, chaque quiz parfait 30 XP de plus.' : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Pastille compacte pour l’en-tête du site. */
export function LevelChip({ xp, className }: { xp: number; className?: string }) {
  const { level } = levelProgress(xp);
  return (
    <span
      className={cn('chip', className)}
      style={{ borderColor: `${level.color}55`, background: `${level.color}15`, color: level.color }}
      title={`${level.title} — ${xp} XP`}
    >
      <Zap size={11} /> Niv. {level.index} · {xp} XP
    </span>
  );
}
