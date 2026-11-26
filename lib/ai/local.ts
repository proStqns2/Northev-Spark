import { abs, argDeg } from '@/lib/engine/complex';
import { equivalentOf } from '@/lib/engine/equivalent';
import { reduceSeriesParallel } from '@/lib/engine/reduce';
import { formatSI, formatPhasor } from '@/lib/engine/format';
import { solveDocument } from '@/lib/engine/solver';
import { CircuitDoc } from '@/lib/engine/types';
import { AgentId } from './agents';

export interface AgentReply {
  agent: AgentId;
  task: string;
  provider: 'local' | 'openai' | 'gemini';
  headline: string;
  body: string;
  metrics: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' }>;
  checklist?: string[];
  followUp?: string;
  warning?: string;
}

const NO = (v: number) => v.toPrecision(4);

function topologyIssues(doc: CircuitDoc): string[] {
  const issues: string[] = [];
  const nodes = new Set<string>();
  doc.components.forEach((c) => {
    nodes.add(c.a);
    nodes.add(c.b);
  });
  if (!doc.ground) issues.push('Aucune masse définie : le potentiel de référence est choisi automatiquement.');
  if (!doc.terminals.a || !doc.terminals.b) issues.push('Bornes A/B incomplètes : impossible d’extraire un dipôle.');
  if (doc.terminals.a === doc.terminals.b) issues.push('Les bornes A et B sont identiques.');
  const ids = new Set<string>();
  doc.components.forEach((c) => {
    if (ids.has(c.id)) issues.push(`Référence dupliquée : ${c.id}.`);
    ids.add(c.id);
  });
  const degree = new Map<string, number>();
  doc.components.forEach((c) => {
    degree.set(c.a, (degree.get(c.a) ?? 0) + 1);
    degree.set(c.b, (degree.get(c.b) ?? 0) + 1);
  });
  for (const [node, d] of degree) {
    if (d === 1) issues.push(`Nœud « ${node} » connecté à une seule broche : dipôle isolé.`);
  }
  if (doc.regime === 'dc') {
    const caps = doc.components.filter((c) => c.kind === 'capacitor');
    caps.forEach((c) => {
      const other = [c.a, c.b].filter((n) => (degree.get(n) ?? 0) <= 2);
      if (other.length === 2) issues.push(`Condensateur ${c.id} en série en continu : branche ouverte.`);
    });
  }
  return issues;
}

function resonanceOf(doc: CircuitDoc): { f0: number; q: number } | null {
  const L = doc.components.filter((c) => c.kind === 'inductor').reduce((s, c) => s + c.value, 0);
  const C = doc.components
    .filter((c) => c.kind === 'capacitor')
    .reduce((s, c) => s + 1 / Math.max(c.value, 1e-15), 0);
  if (!L || !C) return null;
  const cEq = 1 / C;
  const f0 = 1 / (2 * Math.PI * Math.sqrt(L * cEq));
  const R = doc.components
    .filter((c) => ['resistor', 'lamp', 'potentiometer'].includes(c.kind))
    .reduce((s, c) => s + c.value, 0);
  const q = R > 0 ? (1 / R) * Math.sqrt(L / cEq) : Infinity;
  return { f0, q };
}

export function runLocalAgent(agent: AgentId, task: string, doc: CircuitDoc | undefined, question?: string): AgentReply {
  if (!doc) {
    return {
      agent,
      task,
      provider: 'local',
      headline: 'Aucun montage chargé',
      body:
        'Ouvrez un montage dans le studio (ou chargez un gabarit de la bibliothèque) : je pourrai alors raisonner sur votre circuit, nœud par nœud.',
      metrics: [],
      followUp: 'Astuce : la bibliothèque propose 15 montages prêts à analyser.',
    };
  }

  const eq = equivalentOf(doc);
  const solutions = solveDocument(doc, { sourcesOn: true });
  const issues = topologyIssues(doc);

  const baseMetrics = eq.ok
    ? [
        { label: 'U_th', value: formatPhasor(eq.vth, doc.regime === 'ac' ? 'V' : 'V'), tone: 'good' as const },
        { label: 'Z_th', value: `${formatSI(abs(eq.rth), 'Ω')} ${eq.rth.im !== 0 ? `∠ ${argDeg(eq.rth).toFixed(1)}°` : ''}` },
        {
          label: 'I_N',
          value: Number.isFinite(abs(eq.inorton)) ? formatSI(abs(eq.inorton), 'A') : '∞',
        },
      ]
    : [];

  if (!eq.ok) {
    return {
      agent,
      task,
      provider: 'local',
      headline: 'Le montage ne peut pas encore être résolu',
      body: eq.error ?? 'Erreur inconnue du solveur.',
      metrics: baseMetrics,
      checklist: issues.length ? issues : ['Vérifiez la masse et les bornes A/B.'],
      followUp: 'Corrigez la topologie puis relancez : je recalculerai immédiatement.',
      warning: eq.error,
    };
  }

  const vthText = formatPhasor(eq.vth);
  const rthText = `${formatSI(abs(eq.rth), 'Ω')}`;
  const nthText = Number.isFinite(abs(eq.inorton)) ? formatSI(abs(eq.inorton), 'A') : '∞';
  const verification = `écart de vérification croisée : ${eq.verificationErrorPct.toExponential(1)} %`;

  switch (agent) {
    case 'theo': {
      if (task === 'superposition' && eq.superposition.length) {
        const lines = eq.superposition
          .map((s) => `• ${s.label} : contribution ${formatPhasor(s.contribution)} (coefficient ${NO(abs(s.coefficient))} ${s.unit})`)
          .join('\n');
        return {
          agent,
          task,
          provider: 'local',
          headline: 'Décomposition par superposition',
          body: `Je coupe chaque source indépendante l’une après l’autre, puis je somme les contributions à la tension de sortie.\n\n${lines}\n\nLa somme doit redonner U_th = ${vthText}.`,
          metrics: baseMetrics,
          followUp: 'La superposition ne s’applique qu’aux circuits linéaires — vos sources liées restent actives.',
        };
      }
      if (task === 'diagnostic') {
        return {
          agent,
          task,
          provider: 'local',
          headline: issues.length ? `${issues.length} point(s) d’attention` : 'Topologie saine',
          body: issues.length
            ? `J’ai inspecté le réseau (${doc.components.length} dipôles, ${solutions.ok ? solutions.size.nodes : '?'} nœuds). Voici ce que je relève :\n\n${issues.map((i) => `• ${i}`).join('\n')}`
            : `Le réseau est complet : ${doc.components.length} dipôles, ${solutions.ok ? solutions.size.nodes : '?'} nœuds non référencés, bornes A/B valides. Le calcul est stable (${verification}).`,
          metrics: baseMetrics,
          checklist: issues.length ? issues : ['Masse définie', 'Bornes A/B valides', 'Aucun nœud flottant', 'Matrice non singulière'],
        };
      }
      return {
        agent,
        task,
        provider: 'local',
        headline: `Thévenin : E_th = ${vthText}, R_th = ${rthText}`,
        body: `J’ai résolu le réseau en analyse nodale modifiée (${solutions.ok ? solutions.size.nodes + solutions.size.branches : '—'} inconnues), puis posé les bornes A/B.\n\n1. À vide, la tension vaut ${vthText} → c’est votre f.é.m. de Thévenin.\n2. Sources éteintes et courant de test 1 A injecté, je lis une tension de ${rthText} → c’est Z_th.\n3. Le modèle série E_th + Z_th est valable pour toute charge linéaire branchée entre les bornes.\n\n${verification}.`,
        metrics: baseMetrics,
        checklist: [
          `Modèle série : ${vthText} en série avec ${rthText}`,
          `Vérification croisée ${eq.verificationErrorPct < 1 ? 'conforme' : 'à surveiller (écart > 1 %)'}`,
          doc.regime === 'ac' ? 'Régime sinusoïdal : les grandeurs sont des phaseurs' : 'Régime continu : grandeurs réelles',
        ],
        followUp: 'Comparez avec l’onglet Norton : I_N doit valoir U_th / R_th.',
      };
    }
    case 'nora': {
      if (task === 'conversion') {
        return {
          agent,
          task,
          provider: 'local',
          headline: 'Conversion Thévenin ⇄ Norton',
          body: `Les deux modèles sont extérieurement identiques :\n\n• Thévenin → Norton : I_N = U_th / Z_th = ${vthText} / ${rthText} = ${nthText}, en parallèle avec Z_N = Z_th.\n• Norton → Thévenin : E_th = I_N · Z_N = ${nthText} × ${rthText} = ${vthText}.\n\nJe vérifie la conversion par court-circuit réel entre A et B : ${eq.iscMeasured ? formatSI(abs(eq.isc), 'A') : 'non mesurable (bornes idéalement reliées)'}.`,
          metrics: baseMetrics,
          followUp: 'L’équivalence est stricte tant qu’aucune source liée n’est court-circuitée par les bornes.',
        };
      }
      if (task === 'optimisation') {
        const reduction = reduceSeriesParallel(doc);
        return {
          agent,
          task,
          provider: 'local',
          headline:
            reduction.reducedCount > 0
              ? `${reduction.reducedCount} simplification(s) possible(s)`
              : 'Aucune réduction triviale',
          body:
            reduction.reducedCount > 0
              ? `Je réduis les branches purement résistives avant de calculer :\n\n${reduction.steps
                  .filter((s) => s.rule !== 'stopped')
                  .map((s) => `${s.index}. ${s.rule} — ${s.formula} = ${s.result}`)
                  .join('\n')}\n\n${reduction.note} Résultat réduit : ${reduction.finalFormula}.`
              : `${reduction.note}\n\nLe réseau contient des sources multiples ou une topologie en pont : la réduction série/parallèle ne suffit pas, l’analyse nodale reste la méthode sûre.`,
          metrics: baseMetrics,
          followUp: 'Les simplifications ne changent jamais la caractéristique vue des bornes A-B.',
        };
      }
      return {
        agent,
        task,
        provider: 'local',
        headline: `Norton : I_N = ${nthText}, Z_N = ${rthText}`,
        body: `Je vise le modèle parallèle. Courant de court-circuit mesuré entre A et B : ${eq.iscMeasured ? formatSI(abs(eq.isc), 'A') : '—'}.\n\nLe modèle de Norton est I_N en parallèle avec Z_N = ${rthText}. J’obtiens I_N = ${nthText} et je contrôle la cohérence U_th = I_N · Z_N (${verification}).\n\n${eq.status === 'shorted' ? 'Attention : les bornes sont idéalement court-circuitées, I_N diverge — c’est une source de tension pure.' : 'La caractéristique externe est identique à celle du modèle de Thévenin.'}`,
        metrics: baseMetrics,
        checklist: [
          `Modèle parallèle : ${nthText} ∥ ${rthText}`,
          `U_th recalculé = I_N · Z_N = ${vthText}`,
          eq.status === 'shorted' ? 'Cas limite : bornes court-circuitées' : 'Cas nominal',
        ],
        followUp: 'En régime sinusoïdal, Norton est souvent plus simple : les admittances s’additionnent.',
      };
    }
    case 'impeda': {
      const resonance = resonanceOf(doc);
      if (task === 'reduction') {
        const reduction = reduceSeriesParallel(doc);
        return {
          agent,
          task,
          provider: 'local',
          headline: reduction.finalFormula,
          body: reduction.steps.map((s) => `${s.rule === 'stopped' ? '⏹' : '→'} ${s.rule} : ${s.formula} = ${s.result}`).join('\n'),
          metrics: baseMetrics,
          warning: reduction.reducedCount === 0 ? 'Pas de réduction simple : privilégiez les impédances complexes.' : undefined,
        };
      }
      if (task === 'diagnostic') {
        return {
          agent,
          task,
          provider: 'local',
          headline: resonance ? `Résonance à ${formatSI(resonance.f0, 'Hz')}` : 'Pas de couple L-C détecté',
          body: resonance
            ? `Vos bobines et condensateurs forment un réseau résonant.\n\n• Fréquence propre f0 = 1/(2π√(LC)) ≈ ${formatSI(resonance.f0, 'Hz')}.\n• Facteur de qualité Q ≈ ${Number.isFinite(resonance.q) ? resonance.q.toFixed(2) : '∞'} : plus Q est grand, plus la résonance est aiguë.\n• Fréquence d’étude actuelle : ${formatSI(doc.frequency, 'Hz')} — ${Math.abs(doc.frequency - resonance.f0) / Math.max(resonance.f0, 1e-9) < 0.05 ? 'vous êtes proche de la résonance.' : 'hors résonance.'}`
            : `Aucune bobine et aucun condensateur ne coexistent : le comportement est purement résistif, Z_th = R_th = ${rthText}.`,
          metrics: baseMetrics,
        };
      }
      return {
        agent,
        task,
        provider: 'local',
        headline: `Impédance complexe Z_th = ${formatSI(eq.rth.re, 'Ω')} ${eq.rth.im < 0 ? '−' : '+'} j${formatSI(Math.abs(eq.rth.im), 'Ω')}`,
        body: `En régime sinusoïdal établi, j’utilise les phaseurs à f = ${formatSI(doc.frequency, 'Hz')}.\n\n• Z_th = ${formatSI(abs(eq.rth), 'Ω')} ∠ ${argDeg(eq.rth).toFixed(2)}° (partie inductive si l’angle est positif).\n• U_th = ${vthText} → amplitude ${formatSI(abs(eq.vth), 'V')}, phase ${argDeg(eq.vth).toFixed(1)}°.\n• I_N = ${formatPhasor(eq.inorton, 'A')}.\n\n${resonance ? `Le montage contient un réseau L-C : résonance estimée à ${formatSI(resonance.f0, 'Hz')}.` : 'Pas de résonance L-C dans ce montage.'}`,
        metrics: baseMetrics,
        checklist: [
          'Phaseurs en amplitude/phase (pas en RMS)',
          'Impédances : R, jLω, 1/(jCω)',
          `Fréquence d’étude : ${formatSI(doc.frequency, 'Hz')}`,
        ],
      };
    }
    case 'volt': {
      const checks = [
        { label: 'Masse définie', ok: Boolean(doc.ground) },
        { label: 'Bornes A/B distinctes', ok: Boolean(doc.terminals.a && doc.terminals.b && doc.terminals.a !== doc.terminals.b) },
        { label: 'Résolution non singulière', ok: solutions.ok },
        { label: 'Vérification croisée < 1 %', ok: eq.verificationErrorPct < 1 },
        { label: 'Aucun nœud orphelin', ok: !issues.some((i) => i.includes('isolé')) },
        { label: 'Références uniques', ok: !issues.some((i) => i.includes('dupliquée')) },
      ];
      const passed = checks.filter((c) => c.ok).length;
      if (task === 'rapport') {
        return {
          agent,
          task,
          provider: 'local',
          headline: `${passed}/${checks.length} contrôles passés`,
          body: `Rapport de validation du montage « ${doc.name} »\n\n${checks
            .map((c) => `${c.ok ? '✔' : '✘'} ${c.label}`)
            .join('\n')}\n\nRésultat de référence : U_th = ${vthText}, Z_th = ${rthText}, I_N = ${nthText}.\n${eq.warnings.length ? `\nAvertissements du solveur :\n${eq.warnings.map((w) => `• ${w}`).join('\n')}` : '\nAucun avertissement du solveur.'}`,
          metrics: baseMetrics,
          checklist: checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.label}`),
        };
      }
      return {
        agent,
        task,
        provider: 'local',
        headline: issues.length ? `${issues.length} anomalie(s) détectée(s)` : 'Montage conforme',
        body: issues.length
          ? `Mon audit ne valide pas encore le montage :\n\n${issues.map((i) => `• ${i}`).join('\n')}\n\nCorrigez ces points avant d’exporter le rapport.`
          : `Le montage passe tous mes contrôles. ${checks.filter((c) => c.ok).length}/${checks.length} critères satisfaits.\n\nJe confirme les valeurs : U_th = ${vthText}, Z_th = ${rthText}.\n${eq.verificationErrorPct < 1 ? 'La vérification croisée (court-circuit) est cohérente.' : 'Attention : l’écart de vérification croisée dépasse 1 %.'}`,
        metrics: baseMetrics,
        checklist: checks.map((c) => `${c.ok ? '✔' : '✘'} ${c.label}`),
        warning: eq.warnings[0],
      };
    }
    case 'mentor':
    default: {
      if (task === 'quiz') {
        return {
          agent,
          task,
          provider: 'local',
          headline: 'Quiz — 3 questions sur ce montage',
          body: `1. Sans calcul, le modèle de Thévenin dépend-il de la charge branchée entre A et B ?\n   ✔ Réponse : non, seulement du réseau interne.\n\n2. Que vaut U_th si vous éteignez toutes les sources indépendantes ?\n   ✔ Réponse : 0 V (réseau passif), Z_th reste inchangée.\n\n3. Ici, I_N = ${nthText} et Z_N = ${rthText}. Quelle charge maximise la puissance transférée ?\n   ✔ Réponse : R_L = |Z_N| = ${rthText}.`,
          metrics: baseMetrics,
          followUp: 'Refaites le calcul à la main puis comparez avec le studio.',
        };
      }
      if (task === 'plan') {
        return {
          agent,
          task,
          provider: 'local',
          headline: 'Plan de résolution en 5 étapes',
          body: `1. Identifier les bornes A et B et choisir la masse (référence des potentiels).\n2. Réduire ce qui est réductible : résistances en série/parallèle (${reduceSeriesParallel(doc).reducedCount} réduction(s) possible(s) ici).\n3. Calculer U_th : tension à vide entre A et B, sources actives.\n4. Éteindre les sources indépendantes (E → fil, I → ouvert) et injecter un courant de test pour Z_th.\n5. En déduire I_N = U_th / Z_th et vérifier par un court-circuit.\n\nRésultat attendu : U_th ≈ ${vthText}, Z_th ≈ ${rthText}.`,
          metrics: baseMetrics,
          checklist: ['Étape 1 : bornes & masse', 'Étape 2 : réductions', 'Étape 3 : U_th', 'Étape 4 : Z_th', 'Étape 5 : I_N + vérification'],
        };
      }
      return {
        agent,
        task,
        provider: 'local',
        headline: 'Comprendre le résultat',
        body: `Votre montage se comporte, vu des bornes A-B, comme une source de ${vthText} en série avec ${rthText}.\n\nPourquoi ? Parce qu’un réseau linéaire ne peut présenter, à ses bornes, qu’une relation affine entre U et I. Le coefficient directeur donne Z_th, l’ordonnée à l’origine donne U_th.\n\n${doc.regime === 'ac' ? 'En sinusoïdal, cette relation reste vraie en notation complexe : Z_th devient une impédance et U_th un phaseur.' : 'En continu, Z_th est une simple résistance et U_th une tension réelle.'}\n\n${question ? `Votre question : « ${question} »\n\n` : ''}Le courant de court-circuit (${nthText}) est la pente de la droite U(I) : plus il est grand, plus Z_th est faible.`,
        metrics: baseMetrics,
        followUp: 'Essayez de changer une résistance et observez la droite U(I) se déformer.',
      };
    }
  }
}
