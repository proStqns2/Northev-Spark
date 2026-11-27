'use client';

import { CircuitDoc } from '@/lib/engine/types';
import { EditorShell } from '@/components/studio/editor/EditorShell';

interface Props {
  user: { id: string; name: string } | null;
  circuitId?: string;
  templateSlug?: string;
  templateDocJson: string | null;
  seeded?: boolean;
  restoreDraft?: boolean;
  projectOptions?: Array<{ id: string; name: string; color: string }>;
  /** gabarit d'origine quand l'atelier est ouvert depuis le hub d'agents */
  agentId?: string;
  initialProjectId?: string;
  templates: Array<{
    slug: string;
    title: string;
    subtitle: string;
    accent: string;
    regime: 'dc' | 'ac';
    components: number;
  }>;
  /** l’assistant IA est une zone séparée : le studio fonctionne sans lui */
  aiEnabled?: boolean;
}

/**
 * Studio — atelier de schémas.
 *
 * Le composant ne contient plus de logique de dessin : il transmet le document
 * initial à `EditorShell`, qui pilote le cœur pur `lib/studio/editor.ts`.
 * L’assistant IA n’est jamais appelé au chargement ; s’il est activé, c’est un
 * lien explicite vers `/assistant`.
 */
export function StudioPageClient({
  user,
  circuitId,
  templateSlug,
  templateDocJson,
  seeded = false,
  restoreDraft = true,
  initialProjectId,
  templates,
  aiEnabled = false,
}: Props) {
  let initialDoc: CircuitDoc | null = null;
  if (templateDocJson) {
    try {
      initialDoc = JSON.parse(templateDocJson) as CircuitDoc;
    } catch {
      initialDoc = null;
    }
  }

  return (
    <EditorShell
      user={user}
      circuitId={circuitId}
      templateSlug={templateSlug}
      initialDoc={
        initialDoc ?? {
          name: 'Nouveau montage',
          notes: '',
          components: [],
          ground: '',
          terminals: { a: null, b: null },
          regime: 'dc',
          frequency: 50,
        }
      }
      seeded={seeded}
      restoreDraft={restoreDraft}
      templates={templates}
      projectId={initialProjectId}
      aiEnabled={aiEnabled}
    />
  );
}
