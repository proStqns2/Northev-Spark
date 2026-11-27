# Clés IA — mode d'emploi et sécurité

## ⚠️ À faire en premier : révoquer les clés publiées dans le chat

Deux clés ont été collées dans la conversation. Une conversation n'est pas un
coffre : **considérez-les comme compromises**.

1. Google AI Studio → *Get API key* → supprimer la clé concernée, en créer une
   nouvelle.
2. OpenRouter → *Keys* → révoquer `sk-or-v1-…`, en créer une nouvelle.

Ensuite seulement, placez la nouvelle clé dans `.env.local` (jamais dans un
fichier suivi par Git).

## Où mettre les clés

`.env.local` à la racine (fichier ignoré par Git) :

```ini
# une seule suffit
GEMINI_API_KEY=…
OPENROUTER_API_KEY=sk-or-v1-…
OPENAI_API_KEY=sk-…

# modèles (facultatifs)
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_MODEL=google/gemini-2.0-flash-001

# interrupteur explicite de l'assistant
AI_ASSISTANT_ENABLED=on
```

Sur Vercel : *Project → Settings → Environment Variables*, mêmes noms, portée
Production + Preview.

## Vérifier qu'une clé fonctionne

```bash
npm run ai:check          # affiche le fournisseur, le modèle, le code HTTP
npm run ai:check -- --json
```

Le script n'affiche **jamais** la clé : seulement sa longueur et l'état de la
réponse. Code de sortie 0 si au moins un fournisseur répond.

## Ce que fait l'application sans clé

Tout, sauf parler à un modèle :

| Fonction | Sans clé | Avec clé + consentement |
| --- | --- | --- |
| Compte, connexion | ✅ | ✅ |
| Studio (poser, câbler, calculer) | ✅ | ✅ |
| Académie, labo, exercices | ✅ | ✅ |
| « Décrire un montage » | ✅ moteur local (gabarits) | ✅ modèle + validation solveur |
| Agents du hub | ✅ réponses locales | ✅ modèle |

## Exécution automatique : ce qui est déjà automatique

- Le calcul se refait à chaque geste (pas de bouton obligatoire).
- La sauvegarde locale est différée de 700 ms après la dernière modification ;
  la sauvegarde serveur est un clic (ou Ctrl+S).
- La construction par description **valide** toujours le résultat : un JSON de
  modèle qui ne se calcule pas est rejeté au profit du gabarit local, avec le
  motif affiché. Aucun montage cassé n'arrive dans l'éditeur.

## Limite de l'environnement de développement

La sandbox où le site est construit n'a **pas d'accès sortant** vers
`generativelanguage.googleapis.com` ni `openrouter.ai` (seuls npm, PyPI et
GitHub sont joignables). C'est pourquoi `npm run ai:check` répond
`fetch failed` ici alors que les clés sont présentes. Sur votre machine ou sur
Vercel, l'appel part normalement : lancez `npm run ai:check` pour le confirmer
avant d'utiliser l'assistant.

## Agents : aucun appel réseau

Les onze agents de `/agents` s'exécutent **sans clé** : `lib/agents/runtime.ts`
ne fait que du calcul (solveur MNA + contrôleur). Une clé fournisseur ne sert
qu'à reformuler l'explication. Conséquence pratique : si `npm run ai:check`
échoue chez vous (réseau bloqué, clé révoquée), la page `/agents` continue de
calculer et d'afficher U_th, R_th, I_N, f₀, Q, etc.
