'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookMarked, Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GLOSSARY, GLOSSARY_TAGS } from '@/lib/learning/glossary';

/**
 * Explorateur du glossaire : recherche instantanée, filtre par thème et
 * fiche dépliable. Tout se fait côté client (données déjà embarquées), donc la
 * recherche reste instantanée même sur mobile.
 */
export function GlossaryBrowser() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GLOSSARY.filter((entry) => {
      if (tag && !entry.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        entry.term.toLowerCase().includes(needle) ||
        entry.short.toLowerCase().includes(needle) ||
        entry.long.toLowerCase().includes(needle) ||
        entry.formula?.toLowerCase().includes(needle)
      );
    });
  }, [query, tag]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const entry of entries) {
      const letter = entry.term[0].toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2">
          <Search size={14} className="text-fg-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher un terme, une formule, une unité…"
            className="w-full bg-transparent text-[12.5px] outline-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Effacer" className="text-fg-mute hover:text-fg">
              <X size={13} />
            </button>
          ) : null}
        </label>
        <span className="chip">
          <BookMarked size={11} /> {entries.length} entrée{entries.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTag(null)}
          className={cn('chip shrink-0', !tag && 'border-spark-cyan/50 bg-spark-cyan/10 text-spark-cyan')}
        >
          <Filter size={10} /> tous
        </button>
        {GLOSSARY_TAGS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTag(tag === entry ? null : entry)}
            className={cn('chip shrink-0', tag === entry && 'border-spark-cyan/50 bg-spark-cyan/10 text-spark-cyan')}
          >
            {entry}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="panel mt-3 p-5 text-center text-[12.5px] text-fg-soft">
          Aucun terme pour « {query} ». Essayez « Thévenin », « impédance » ou « constante ».
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {groups.map(([letter, items]) => (
          <section key={letter}>
            <h2 className="sticky top-14 z-10 w-fit rounded-md bg-ink-950/90 px-1.5 text-[12px] font-bold uppercase text-spark-cyan backdrop-blur">
              {letter}
            </h2>
            <ul className="mt-1.5 space-y-1.5">
              {items.map((entry) => {
                const expanded = open === entry.term;
                return (
                  <li key={entry.term} className="panel overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : entry.term)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[13px] font-semibold">{entry.term}</span>
                          {entry.unit ? <span className="chip text-[9px]">{entry.unit}</span> : null}
                          {entry.tags.slice(0, 2).map((entryTag) => (
                            <span key={entryTag} className="text-[9.5px] text-fg-mute">
                              #{entryTag}
                            </span>
                          ))}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-fg-soft">{entry.short}</span>
                      </span>
                      <span className="mt-0.5 shrink-0 text-[10px] text-fg-mute">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded ? (
                      <div className="animate-slide-in border-t border-line/40 px-3 py-2.5">
                        <p className="text-[11.5px] leading-relaxed text-fg-soft">{entry.long}</p>
                        {entry.formula ? (
                          <p className="mt-2 rounded-lg border border-spark-cyan/30 bg-spark-cyan/[0.06] px-2.5 py-1.5 font-mono text-[12px] text-spark-cyan">
                            {entry.formula}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-fg-mute">Voir aussi :</span>
                          {entry.related.map((related) => (
                            <button
                              key={related}
                              type="button"
                              onClick={() => {
                                setQuery(related);
                                setOpen(null);
                              }}
                              className="chip text-[9.5px] hover:border-spark-cyan/50"
                            >
                              {related}
                            </button>
                          ))}
                          <Link href="/formules" className="ml-auto text-[10px] text-spark-cyan hover:underline">
                            formulaire
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
