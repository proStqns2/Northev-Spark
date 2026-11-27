# Architecture — séparation des responsabilités

Ce document décrit les décisions qui répondent aux deux problèmes signalés :
« tout est mélangé avec l'IA » et « le plan du studio ne fonctionne pas ».

## 1. Trois domaines étanches

```
┌──────────────────────┐   ┌───────────────────────┐   ┌────────────────────┐
│  Compte & session    │   │  Studio & calcul      │   │  Assistant (option)│
│  /compte, /api/auth  │   │  /studio, /api/circuits│   │  /assistant        │
│  aucune IA           │   │  aucune IA            │   │  opt-in explicite  │
└──────────────────────┘   └───────────────────────┘   └────────────────────┘
```

- **Compte** : inscription, connexion, mot de passe, préférences. Aucune route
  d'authentification n'appelle un fournisseur de modèle. `GET /api/auth/status`
  renvoie `requiresAi: false` — c'est vérifiable et testé.
- **Studio** : construction et calcul sans IA (solveur MNA dans
  `lib/engine/`). `/api/values/analyze` peut déléguer la construction et le
  calcul du bloc R·C·L à Express, qui réutilise le même solveur. En l’absence
  du service, Next.js calcule sur place.
- **Assistant** : activé par trois conditions cumulatives
  (`AI_ASSISTANT_ENABLED`, une clé fournisseur, `prefs.ai` du compte). Sans
  elles, `/api/ai/*` répond `403` avec un code `AI_OFF` et un lien vers
  `/assistant`, jamais une erreur silencieuse.

## 1 bis. Deux serveurs, un seul runtime (agents)

Les onze agents de `/agents` ne sont pas des appels de modèle : ce sont des
fonctions de calcul déterministes, réunies dans **`lib/agents/runtime.ts`**.

```
navigateur
   │  POST /api/agents/:id/run          (Next.js — app/api/[...path])
   ├─────────────► EXPRESS_URL défini ? ── oui ──► POST :4001/api/v1/agents/:id/run
   │                                                   │
   └────────────────────────── non ────────────────────┤
                                                       ▼
                                        lib/agents/runtime.ts  (même module)
                                                       │
                                        lib/engine (MNA), lib/studio/editor
```

- **Un runtime, deux hôtes.** Express n'est pas un second moteur : il importe le
  même module. Conséquence : impossible que les deux serveurs divergent, et le
  test `scripts/agents-check.mjs` compare leurs grandeurs valeur par valeur.
- **`servedBy`** dans chaque réponse (`next` | `express`) et en-tête
  `X-Spark-Service` : l'interface affiche qui a répondu, avec la raison d'un
  repli (`fallbackReason`). Le badge est visible dans la sortie d'agent.
- **Aucune clé requise.** Un agent travaille hors ligne ; une clé fournisseur
  ne sert qu'à rédiger une explication, jamais à produire une grandeur.
- **Démarrage** : `npm run dev` (Next seul) suffit. Pour le service :
  `npm run express` puis `EXPRESS_URL=http://127.0.0.1:4001 npm run dev`, ou
  `npm run dev:all` qui lance les deux. Sans `EXPRESS_URL`, Next répond seul et
  l'indique.

Contrôle : `npm run check:agents` (12 contrôles sans Express, 16 avec).

## 2. Cœur de l'atelier

`lib/studio/editor.ts` contient un **automate pur** : `(état, geste) → état`.

| Ce qui se passe avant | Ce qui se passe maintenant |
| --- | --- |
| La logique de pose vivait dans le composant de dessin | Elle vit dans `editor.ts`, testée par 40 tests Node |
| Un clic manqué = montage impossible | `placePart` cherche une place libre et décale au besoin |
| Pas d'annulation fiable | Historique de 60 étapes, `commit/live` séparés |
| Les erreurs étaient muettes | `diagnose()` produit des messages avec un conseil |

L'interface (`EditorCanvas`, `PartPalette`, `PartInspector`, `EditorShell`) ne
fait que dessiner et transmettre les gestes. `scripts/studio-check.mjs` vérifie
la chaîne complète dans un DOM réel (jsdom) : palette → pose → glisser → fil →
calcul → annulation.

## 3. Données

```
.data/db.json   ← source de vérité (atomique, sans dépendance)
      │
      ├── (option) miroir MongoDB  : MONGODB_URI + MIRROR_MONGO=on
      └── (option) export JSONL    : /api/analytics/export → PySpark hors ligne
```

- MongoDB est un **miroir** : `/api/data/backup`, `scripts/mongo-migrate.mjs`.
  Absent, tout fonctionne ; présent, on obtient une copie interrogeable.
- PySpark tourne **hors du processus web** (`analytics/spark_academy.py`).
  Il n’est pas nécessaire pour démarrer le site.
- Aucune donnée nominative dans les exports : identifiants hachés `anon_…`,
  empreintes de jetons, longueurs de hachés de mot de passe.

## 4. Choix assumés

| Décision | Raison |
| --- | --- |
| Next.js autonome | Une commande suffit pour le studio, le compte et l’API ; Express est facultatif (`npm run dev:all` lance les deux) |
| Pas de base obligatoire | Le site doit démarrer sans service externe |
| IA désactivée par défaut | Elle ne doit jamais conditionner l'inscription ou le dessin |
| Tests sans navigateur | L'environnement n'a pas de Chromium ; les tests jsdom couvrent les gestes |
