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
- **Studio** : construction et calcul entièrement locaux (solveur MNA dans
  `lib/engine/`). Les routes `/api/solve`, `/api/circuits` ne consultent jamais
  l'IA.
- **Assistant** : activé par trois conditions cumulatives
  (`AI_ASSISTANT_ENABLED`, une clé fournisseur, `prefs.ai` du compte). Sans
  elles, `/api/ai/*` répond `403` avec un code `AI_OFF` et un lien vers
  `/assistant`, jamais une erreur silencieuse.

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
  C'est le seul composant non-Next, et il est facultatif par construction.
- Aucune donnée nominative dans les exports : identifiants hachés `anon_…`,
  empreintes de jetons, longueurs de hachés de mot de passe.

## 4. Choix assumés

| Décision | Raison |
| --- | --- |
| Un seul processus Next.js | Contrainte du projet : une commande, un serveur, tout le contrôle dans React/Next |
| Pas de base obligatoire | Le site doit démarrer sans service externe |
| IA désactivée par défaut | Elle ne doit jamais conditionner l'inscription ou le dessin |
| Tests sans navigateur | L'environnement n'a pas de Chromium ; les tests jsdom couvrent les gestes |
