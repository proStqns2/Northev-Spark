'use client';

import { AtSign, Battery, CircuitBoard, Cpu, Magnet, Radio, Waves, Zap } from 'lucide-react';
import { cn, avatarGradient } from '@/lib/utils';

const ICONS = {
  circuit: CircuitBoard,
  bolt: Zap,
  oscillo: Radio,
  resistor: Battery,
  magnet: Magnet,
  chip: Cpu,
  photon: AtSign,
  wave: Waves,
} as const;

export const AVATAR_IDS = Object.keys(ICONS) as Array<keyof typeof ICONS>;
export type AvatarIconId = keyof typeof ICONS;

export function Avatar({
  name,
  avatar = 'circuit',
  size = 36,
  className,
  ring = false,
}: {
  name: string;
  avatar?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const Icon = ICONS[(avatar as AvatarIconId) in ICONS ? (avatar as AvatarIconId) : 'circuit'];
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br text-[#04121a]',
        avatarGradient(name),
        ring && 'ring-2 ring-spark-cyan/60 ring-offset-2 ring-offset-ink-950',
        className,
      )}
      style={{ width: size, height: size }}
      title={name}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
    </span>
  );
}

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {(Object.keys(ICONS) as AvatarIconId[]).map((id) => {
        const Icon = ICONS[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              'flex aspect-square items-center justify-center rounded-xl border transition',
              active
                ? 'border-spark-cyan bg-spark-cyan/15 text-spark-cyan shadow-glow-sm'
                : 'border-line/60 bg-ink-850/70 text-fg-soft hover:border-line hover:bg-ink-800',
            )}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </div>
  );
}
