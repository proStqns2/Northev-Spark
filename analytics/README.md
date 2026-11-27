# Analyses hors ligne (PySpark)

Ce dossier contient **le seul composant du projet qui ne tourne pas dans
Next.js**. C'est volontaire : l'analyse de masse est un travail de batch, qui
n'a rien à faire dans le processus web.

## Ce que fait le job

`spark_academy.py` lit l'export JSONL de l'académie et produit des tables
Parquet dans `analytics/out/` :

| Sortie | Contenu |
| --- | --- |
| `learner_kpis` | XP, série, leçons, quiz, badges, précision des exercices par apprenant |
| `module_progress` | apprenants, essais, moyenne et taux de réussite par module |
| `drill_accuracy` | précision par famille d'exercices (10 familles) |
| `badge_popularity` | nombre de déblocages par badge (44 badges) |
| `circuit_stats` | taille moyenne et régime des montages enregistrés |
| `daily_activity` | volume d'événements par jour et par type |
| `summary.json` | synthèse chiffrée |

## Récupérer les données

```bash
# 1. se connecter pour obtenir le cookie de session
curl -s -c /tmp/spark.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"vous@exemple.fr","password":"…"}'

# 2. exporter le flux d'événements
curl -s -b /tmp/spark.txt http://localhost:3000/api/analytics/export \
  -o analytics/data/spark-events.jsonl

# 3. lancer l'analyse
python -m pip install -r analytics/requirements.txt
spark-submit analytics/spark_academy.py --input analytics/data/spark-events.jsonl
```

Sans export réel, le job sait fabriquer un jeu de démonstration :

```bash
python analytics/spark_academy.py --input analytics/data/demo.jsonl --sample
```

## Garanties

- **Aucune donnée nominative** : l'export ne contient que des identifiants
  hachés (`anon_…`), le type d'événement, des scores et des horodatages.
- **Aucune dépendance du site** : si Spark n'est pas installé, le site
  fonctionne exactement de la même façon.
- **Aucun accès automatique** : `/api/analytics/export` exige un compte et,
  si `DATA_ADMIN_TOKEN` est défini, l'en-tête `X-Data-Token`.
