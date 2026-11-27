'use client';

import { useState } from 'react';
import { Activity, Calculator, Cog, Waves, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Oscilloscope } from './Oscilloscope';
import { BodeExplorer } from './BodeExplorer';
import { FilterDesigner } from './FilterDesigner';
import { PowerLab } from './PowerLab';

const TABS = [
  { id: 'scope', label: 'Oscilloscope', icon: Waves, hint: 'Échelon RC, sinus, redressement' },
  { id: 'bode', label: 'Bode', icon: Activity, hint: 'Gain et phase en direct' },
  { id: 'design', label: 'Dimensionnement', icon: Cog, hint: 'Couples R/C série E24' },
  { id: 'power', label: 'Puissances', icon: Zap, hint: 'P, Q, S et compensation' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Lab() {
  const [tab, setTab] = useState<TabId>('scope');
  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-left transition',
                tab === item.id
                  ? 'border-spark-cyan/50 bg-spark-cyan/10 text-fg'
                  : 'border-line/50 text-fg-soft hover:border-line hover:text-fg',
              )}
            >
              <Icon size={14} className={tab === item.id ? 'text-spark-cyan' : ''} />
              <span>
                <span className="block text-[12px] font-medium leading-tight">{item.label}</span>
                <span className="block text-[9.5px] leading-tight text-fg-mute">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {tab === 'scope' ? <Oscilloscope /> : null}
        {tab === 'bode' ? <BodeExplorer /> : null}
        {tab === 'design' ? <FilterDesigner /> : null}
        {tab === 'power' ? <PowerLab /> : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Note
          title="Tout est calculé côté client"
          body="Aucune image, aucune vidéo : chaque courbe est reconstruite à partir des équations à chaque mouvement de curseur."
        />
        <Note
          title="Cohérent avec le studio"
          body="Les mêmes composants et les mêmes lois servent au moteur de résolution : ce que vous voyez peut être vérifié d’un clic."
        />
        <Note
          title="Pensé pour le contrôle"
          body="Les valeurs au curseur suivent la théorie à la virgule ; utilisez-les comme référence pour vos calculs à la main."
        />
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-fg-mute">
        <Calculator size={11} /> Prochain ajout : générateur d’exercices numériques tirés des montages du studio.
      </p>
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel p-3">
      <p className="text-[11px] font-semibold">{title}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">{body}</p>
    </div>
  );
}
