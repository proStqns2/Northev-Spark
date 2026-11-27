/**
 * Emblèmes des agents — un tracé SVG par agent, aucun fichier image.
 *
 * Les tuiles historiques réutilisaient trois photos pour onze agents (Volt et
 * Mentor empruntaient l'emblème d'un autre). Ici chaque agent possède son
 * propre dessin vectoriel : il reste net à toutes les tailles, hérite de la
 * couleur de l'agent et s'affiche correctement dans le thème sombre comme dans
 * un aperçu iframe.
 *
 * Tracé commun : viewBox 32 × 32, `currentColor` pour le trait (donc la classe
 * de couleur du parent suffit), accent appliqué en opacité.
 */

import { EMBLEM_IDS, hasEmblem, type EmblemId } from '@/lib/ai/emblems';
import { cn } from '@/lib/utils';

export { EMBLEM_IDS, hasEmblem };
export type { EmblemId };

function Glyph({ id }: { id: EmblemId }) {
  switch (id) {
    /* Théo — source de tension en série avec une résistance */
    case 'theo':
      return (
        <>
          <circle cx="9" cy="16" r="5" />
          <path d="M9 13.4v2.4M7.8 14.6h2.4M7.8 17.6h2.4" />
          <path d="M14 16h4" />
          <rect x="18" y="13" width="7" height="6" rx="1" />
        </>
      );
    /* Nora — source de courant en parallèle avec une résistance */
    case 'nora':
      return (
        <>
          <circle cx="9" cy="16" r="5" />
          <path d="M9 19.2V13.4M9 13.4l-1.6 1.8M9 13.4l1.6 1.8" />
          <path d="M14 8h5M14 24h5" />
          <rect x="19" y="6.5" width="5" height="19" rx="1" />
        </>
      );
    /* Équivalence — deux flèches opposées T ⇄ N */
    case 'convert':
      return (
        <>
          <path d="M5 12h18M19.4 9.6 23 12l-3.6 2.4" />
          <path d="M27 20H9M12.6 17.6 9 20l3.6 2.4" />
          <path d="M12 6.5h8M12 25.5h8" opacity="0.35" />
        </>
      );
    /* Impéda — triangle des impédances (R, X, φ) */
    case 'impeda':
      return (
        <>
          <path d="M6 26h18M24 26V8" />
          <path d="M6 26 24 8" />
          <path d="M6 26a8 8 0 0 0 3-6" opacity="0.5" />
          <circle cx="24" cy="8" r="1.4" />
        </>
      );
    /* Bobines — enroulements d'une inductance */
    case 'coils':
      return (
        <>
          <path d="M4 16h2" />
          <path d="M6 16a3 3 0 0 1 6 0 3 3 0 0 1 6 0 3 3 0 0 1 6 0 3 3 0 0 1 4 0" />
          <path d="M6 16v6M28 16v6" opacity="0.35" />
          <path d="M6 22h22" opacity="0.35" />
        </>
      );
    /* Sources — transformation d'une source en l'autre */
    case 'sources':
      return (
        <>
          <circle cx="8" cy="16" r="4.5" />
          <path d="M8 12.6v3.2M6.4 14.2h3.2" />
          <path d="M13 16h5M15.6 13.6 18 16l-2.4 2.4" />
          <circle cx="24" cy="16" r="4.5" />
          <path d="M24 18.6v-5.2M24 13.4l-1.5 1.7M24 13.4l1.5 1.7" />
        </>
      );
    /* Labo — fiole de mesure */
    case 'lab':
      return (
        <>
          <path d="M13 6h6M15 6v7l-6.5 12a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L17 13V6" />
          <path d="M10.5 19h11" opacity="0.45" />
          <circle cx="15" cy="22.5" r="1" />
          <circle cx="18" cy="24" r="0.8" opacity="0.6" />
        </>
      );
    /* Hub — nœud central et ses liaisons */
    case 'hub':
      return (
        <>
          <path d="M16 5.5 25 10.5v11L16 26.5 7 21.5v-11Z" />
          <circle cx="16" cy="16" r="2.6" />
          <path d="M16 13.4V8.6M16 18.6v4.8M18.2 14.7l4-2.2M13.8 17.3l-4 2.2" opacity="0.5" />
        </>
      );
    /* Dipôles — caractéristique U(I) décroissante */
    case 'dipoles':
      return (
        <>
          <path d="M6 6v20h20" opacity="0.45" />
          <path d="M8.5 10.5 24 22" />
          <path d="M8.5 10.5h2M10.5 10.5v2" />
          <path d="M20.5 20a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0" />
          <path d="M6 26.5h.1" opacity="0" />
        </>
      );
    /* Volt — bouclier de validation */
    case 'volt':
      return (
        <>
          <path d="M16 4.5 26 8v9c0 5.4-4.3 9-10 11-5.7-2-10-5.6-10-11V8Z" />
          <path d="M11.5 16.4l3.2 3.3 6.3-6.6" />
        </>
      );
    /* Mentor — livre ouvert */
    case 'mentor':
      return (
        <>
          <path d="M4.5 8.5c4-1.6 8-1.6 11.5.6v15c-3.5-2.2-7.5-2.2-11.5-.6Z" />
          <path d="M27.5 8.5c-4-1.6-8-1.6-11.5.6v15c3.5-2.2 7.5-2.2 11.5-.6Z" />
          <path d="M16 9.1v15" opacity="0.4" />
        </>
      );
    default:
      return null;
  }
}

/**
 * Pastille d'emblème d'un agent.
 *
 * `size` est le côté du carré en pixels ; le fond teinté utilise la couleur de
 * l'agent à faible opacité, donc le rendu reste lisible sur n'importe quel
 * fond. Un identifiant inconnu retombe sur l'emblème du Hub.
 */
export function AgentEmblem({
  id,
  size = 36,
  color,
  className,
  rounded = 'rounded-lg',
}: {
  id: string;
  size?: number;
  /** couleur d'accent de l'agent (`agent.color`) */
  color?: string;
  className?: string;
  rounded?: string;
}) {
  const emblem: EmblemId = hasEmblem(id) ? id : 'hub';
  const accent = color ?? 'currentColor';
  const glyph = Math.round(size * 0.66);

  return (
    <span
      data-emblem={emblem}
      className={cn(
        'inline-grid shrink-0 place-items-center border border-white/10',
        rounded,
        className,
      )}
      style={{
        width: size,
        height: size,
        color: accent,
        background: `linear-gradient(140deg, ${accent}26, ${accent}0a 60%, transparent)`,
      }}
      aria-hidden="true"
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Glyph id={emblem} />
      </svg>
    </span>
  );
}
