import { TEMPLATES } from '@/lib/data/templates';
import { cachedEquivalent } from '@/lib/cache';
import { abs } from '@/lib/engine/complex';
import type { Challenge } from './types';

/**
 * Défis quotidiens.
 *
 * Le défi est **déterministe pour une date donnée** : tout le monde reçoit le
 * même montage le même jour, et le serveur peut vérifier une réponse sans
 * stocker quoi que ce soit d’autre que le résultat.
 *
 * La cible est calculée avec le vrai moteur, pas écrite à la main : si un
 * gabarit évolue, le défi suit automatiquement.
 */

const BRIEFS: Record<string, string[]> = {
  thevenin: [
    'Réduisez ce réseau à son modèle de Thévenin. Donnez la résistance équivalente vue des bornes A–B.',
    'Un élève affirme que la tension à vide vaut 3 V. Tranchez : quelle est la vraie f.é.m. équivalente ?',
  ],
  norton: [
    'Passez au modèle de Norton : quel courant de court-circuit circule entre les bornes ?',
    'Le modèle parallèle est souvent plus rapide ici. Quelle résistance de Norton trouvez-vous ?',
  ],
  ponts: [
    'Le pont est-il équilibré ? Mesurez la résistance de Thévenin vue entre les bornes de sortie.',
    'Ce pont sert de capteur : donnez la f.é.m. équivalente du déséquilibre.',
  ],
  impedances: [
    'En régime sinusoïdal, quelle est l’impédance équivalente vue des bornes ?',
    'Quel déphasage introduit ce montage ? Servez-vous du module de Z.',
  ],
  sources: [
    'Une source réelle se comporte comme un générateur de Thévenin. Quelle résistance interne ?',
    'Transformez les sources puis donnez le courant de court-circuit équivalent.',
  ],
  dipoles: [
    'Deux dipôles en série : quelle est l’impédance équivalente ?',
    'Quelle tension à vide voit-on aux bornes du montage ?',
  ],
  labo: [
    'Vérifiez ce montage de laboratoire : quelle résistance équivalente devez-vous trouver ?',
    'Le calcul rapide donne-t-il la même chose que le modèle équivalent ?',
  ],
  hub: [
    'Plusieurs branches convergent : utilisez Millman et donnez la résistance équivalente.',
    'Quelle est la f.é.m. du modèle de Thévenin de ce hub ?',
  ],
};

const REWARD = 60;

function hashDate(date: string): number {
  let hash = 2166136261;
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Défi du jour — même résultat pour tout le monde, à la date près. */
export function challengeFor(date: string): Challenge {
  const seed = hashDate(date);
  const template = TEMPLATES[seed % TEMPLATES.length];
  const doc = template.build();
  const equivalent = cachedEquivalent(doc);

  const askRth = seed % 2 === 0;
  const vth = abs(equivalent.vth);
  const rth = abs(equivalent.rth);
  const target = askRth ? rth : vth;
  const unit = askRth ? 'Ω' : 'V';
  const family = template.family as keyof typeof BRIEFS;
  const briefs = BRIEFS[family] ?? BRIEFS.thevenin;

  return {
    id: `defi-${date}`,
    date,
    title: askRth ? 'Résistance équivalente' : 'F.é.m. équivalente',
    brief: briefs[seed % briefs.length],
    template: template.slug,
    target: {
      label: askRth ? 'R_th' : 'E_th',
      value: Number(target.toPrecision(4)),
      unit,
      // 5 % de tolérance : suffisant pour un calcul à la main, impossible au hasard
      tolerance: Math.max(0.05, Number((target * 0.05).toPrecision(2))),
    },
    reward: REWARD,
    difficulty: equivalent.status === 'ok' ? 2 : 1,
  };
}

/** Vérifie une réponse numérique avec tolérance relative. */
export function checkChallengeAnswer(challenge: Challenge, answer: number): { ok: boolean; delta: number; score: number } {
  const target = challenge.target.value;
  const delta = Math.abs(answer - target);
  const tolerance = challenge.target.tolerance;
  const ok = delta <= tolerance;
  const relative = target === 0 ? (delta === 0 ? 0 : 1) : delta / Math.abs(target);
  const score = ok ? Math.max(60, Math.round(100 - relative * 200)) : 0;
  return { ok, delta, score };
}

/** Les cinq derniers défis (pour l’historique et les badges rétroactifs). */
export function recentChallenges(today: string, count = 5): Challenge[] {
  const list: Challenge[] = [];
  const base = new Date(`${today}T00:00:00.000Z`);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() - i);
    list.push(challengeFor(date.toISOString().slice(0, 10)));
  }
  return list;
}
