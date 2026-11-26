'use client';

import { useState, useTransition } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES } from '@/lib/auth/config';
import { cn } from '@/lib/utils';

export function ThemeSwitcher({
  initial,
  persistToProfile = false,
  compact = false,
}: {
  initial: string;
  persistToProfile?: boolean;
  compact?: boolean;
}) {
  const [theme, setTheme] = useState(initial);
  const [, startTransition] = useTransition();

  function choose(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    document.cookie = `ns_theme=${id}; path=/; max-age=31536000; samesite=lax`;
    if (persistToProfile) {
      startTransition(() => {
        void fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: id }),
        });
      });
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => choose(t.id)}
            title={t.label}
            aria-label={`Thème ${t.label}`}
            aria-pressed={theme === t.id}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border transition',
              theme === t.id ? 'border-spark-cyan scale-110' : 'border-line/70 hover:scale-105',
            )}
            style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
          >
            {theme === t.id ? <Check size={11} className="text-black/70" /> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => choose(t.id)}
          aria-pressed={theme === t.id}
          className={cn(
            'group flex items-center gap-3 rounded-xl border p-3 text-left transition',
            theme === t.id
              ? 'border-spark-cyan/60 bg-spark-cyan/5 shadow-glow-sm'
              : 'border-line/60 bg-ink-850/60 hover:border-line hover:bg-ink-800/70',
          )}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10"
            style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
          >
            <Palette size={16} className="text-black/60" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t.label}</span>
            <span className="block truncate text-[11px] text-fg-mute">{t.description}</span>
          </span>
          {theme === t.id ? <Check size={16} className="text-spark-cyan" /> : null}
        </button>
      ))}
    </div>
  );
}
