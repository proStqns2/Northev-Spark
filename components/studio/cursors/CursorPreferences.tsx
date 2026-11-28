'use client';

import { useEffect, useRef, useState } from 'react';
// import explicite : les tests de rendu (tsx) n'appliquent pas le JSX automatique
import React from 'react';
import { Eye, MousePointerClick, Settings2, Video, Wind } from 'lucide-react';
import { useCursorPreferences, type CursorStyle } from '@/hooks/useCursorPreferences';

/**
 * Réglages d'affichage des curseurs distants (persistés par navigateur).
 * Volontairement compact : quatre interrupteurs et une taille.
 */

const STYLES: Array<{ id: CursorStyle; label: string }> = [
  { id: 'pointer', label: 'flèche' },
  { id: 'dot', label: 'point' },
  { id: 'halo', label: 'halo' },
];

export function CursorPreferencesButton({ className }: { className?: string }) {
  const { prefs, update, reset } = useCursorPreferences();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-7 w-7 items-center justify-center rounded-md border bg-ink-900/90 backdrop-blur transition ${
          open
            ? 'border-spark-cyan/70 text-spark-cyan'
            : 'border-line/70 text-fg-soft hover:border-spark-cyan/60 hover:text-fg'
        } ${className ?? ''}`}
        title="Réglage des curseurs"
        aria-label="Réglage des curseurs"
        aria-expanded={open}
      >
        <Settings2 size={13} />
      </button>

      {open ? (
        <div className="absolute right-0 top-8 z-40 w-[240px] rounded-xl border border-line/70 bg-ink-950/97 p-2.5 text-[10.5px] shadow-panel backdrop-blur">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-fg-mute">
            <MousePointerClick size={10} /> curseurs des pairs
          </p>

          <div className="mb-2">
            <p className="mb-1 text-fg-mute">forme</p>
            <div className="flex gap-1">
              {STYLES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => update({ style: entry.id })}
                  className={`flex-1 rounded-md border px-1 py-1 text-[10px] transition ${
                    prefs.style === entry.id
                      ? 'border-spark-cyan/70 bg-spark-cyan/15 text-spark-cyan'
                      : 'border-line/70 text-fg-soft hover:border-line'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <p className="mb-1 flex items-center justify-between text-fg-mute">
              <span>taille</span>
              <span className="text-fg-soft">{Math.round(prefs.scale * 100)} %</span>
            </p>
            <input
              type="range"
              min={80}
              max={140}
              step={5}
              value={Math.round(prefs.scale * 100)}
              onChange={(event) => update({ scale: Number(event.target.value) / 100 })}
              className="w-full accent-spark-cyan"
              aria-label="Taille des curseurs"
            />
          </div>

          <div className="space-y-1">
            <Toggle
              icon={<Wind size={10} />}
              label="sillage du mouvement"
              checked={prefs.trails}
              onChange={(value) => update({ trails: value })}
            />
            <Toggle
              icon={<Eye size={10} />}
              label="fenêtre de chaque pair"
              checked={prefs.viewports}
              onChange={(value) => update({ viewports: value })}
            />
            <Toggle
              icon={<MousePointerClick size={10} />}
              label="étiquettes nom + outil"
              checked={prefs.labels}
              onChange={(value) => update({ labels: value })}
            />
            <Toggle
              icon={<Video size={10} />}
              label="micro / caméra"
              checked={prefs.call}
              onChange={(value) => update({ call: value })}
            />
          </div>

          <button
            type="button"
            onClick={reset}
            className="mt-2 w-full rounded-md border border-line/70 px-1.5 py-1 text-[9.5px] text-fg-mute transition hover:text-fg"
          >
            réinitialiser
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-fg-soft transition hover:bg-ink-900/70"
    >
      <span className="text-fg-mute">{icon}</span>
      <span className="flex-1">{label}</span>
      <span
        className={`relative h-3 w-6 rounded-full transition ${
          checked ? 'bg-spark-cyan/70' : 'bg-line/80'
        }`}
      >
        <span
          className={`absolute top-[2px] h-2 w-2 rounded-full bg-ink-950 transition-all ${
            checked ? 'left-[13px]' : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  );
}
