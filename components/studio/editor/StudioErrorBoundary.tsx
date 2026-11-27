'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Garde-fou d'affichage du Studio.
 *
 * Si le plan (ou n'importe quelle zone de l'atelier) lève une exception au
 * rendu, React démonte sinon tout l'arbre : l'utilisateur voit une zone vide et
 * en conclut que « le plan n'existe pas ». Ici on capture l'erreur, on affiche
 * un message lisible et deux issues : recharger l'atelier sans perdre le
 * document, ou repasser en mode liste (montage pas à pas, sans canvas).
 */

interface Props {
  children: ReactNode;
  /** contenu de secours proposé quand le rendu principal échoue */
  fallback?: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
  attempt: number;
}

export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // trace utile en console, jamais renvoyée au serveur
    console.error('[studio] rendu interrompu', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel flex h-full min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertTriangle size={20} className="text-spark-amber" />
        <p className="text-[12px] font-medium text-fg">{this.props.label ?? 'Le plan'} n’a pas pu s’afficher.</p>
        <p className="max-w-[36ch] text-[10.5px] leading-relaxed text-fg-mute">
          Votre montage est conservé. Rechargez la zone, ou continuez avec la liste « Montage pas à pas » qui ne dépend
          pas du dessin.
        </p>
        <code className="max-w-full truncate rounded bg-ink-900 px-2 py-1 font-mono text-[9.5px] text-spark-amber/80">
          {this.state.error.message.slice(0, 120)}
        </code>
        <div className="mt-1 flex gap-1.5">
          <button
            type="button"
            onClick={() => this.setState((current) => ({ error: null, attempt: current.attempt + 1 }))}
            className="btn btn-primary btn-sm"
          >
            <RefreshCw size={11} /> Recharger la zone
          </button>
        </div>
        {this.props.fallback}
      </div>
    );
  }
}
