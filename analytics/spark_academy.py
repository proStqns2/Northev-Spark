#!/usr/bin/env python3
"""
Pipeline PySpark de l'académie Northev Spark.

Le site n'a pas besoin de Spark pour fonctionner : ce job tourne **hors ligne**,
sur l'export JSONL produit par `GET /api/analytics/export`.

    curl -s -H "Cookie: spark_session=…" http://localhost:3000/api/analytics/export \
         -o analytics/data/spark-events.jsonl

    spark-submit analytics/spark_academy.py \
        --input analytics/data/spark-events.jsonl \
        --output analytics/out

Sorties (format Parquet, plus un résumé texte) :

  - `learner_kpis`      : XP, série, leçons, quiz, badges, exercices par apprenant
  - `module_progress`   : taux de réussite par module de quiz
  - `drill_accuracy`    : précision par famille d'exercices
  - `badge_popularity`  : fréquence de déblocage des badges
  - `circuit_stats`     : taille et régime des montages enregistrés
  - `daily_activity`    : activité par jour (UTC)

Le job refuse de démarrer si le fichier est vide, et il ne lit jamais de
données nominatives : l'export ne contient que des identifiants hachés.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

REQUIRED_SPARK = "3.3"


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyse PySpark des événements académiques")
    parser.add_argument("--input", required=True, help="fichier JSONL exporté")
    parser.add_argument("--output", default="analytics/out", help="répertoire de sortie")
    parser.add_argument("--master", default=None, help="ex. spark://… ; vide = local[*]")
    parser.add_argument("--sample", action="store_true", help="génère un jeu de démonstration si l'entrée est absente")
    parser.add_argument("--show", type=int, default=12, help="lignes affichées par table")
    return parser.parse_args(argv)


def ensure_spark():
    try:
        from pyspark.sql import SparkSession  # noqa: F401
        import pyspark
    except ImportError:  # pragma: no cover - dépend de l'environnement
        print(
            "PySpark est absent. Installez les dépendances d'analyse :\n"
            "  python -m pip install -r analytics/requirements.txt\n"
            "puis relancez avec spark-submit ou python analytics/spark_academy.py.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    version = getattr(pyspark, "__version__", "?")
    if not version.startswith(("3.", "4.")):
        print(f"Version PySpark inattendue : {version} (attendu ≥ {REQUIRED_SPARK})", file=sys.stderr)
        raise SystemExit(2)


def demo_events() -> list[dict]:
    """Jeu de démonstration : permet de valider le job sans base réelle."""
    events: list[dict] = []
    learners = [f"anon_{index:04x}" for index in range(1, 41)]
    modules = ["bases", "theoremes", "puissance", "filtres", "transitoires", "triphase", "machines", "securite"]
    for index, learner in enumerate(learners):
        xp = 40 * (index + 1) + (index % 7) * 15
        events.append(
            {
                "type": "learner_summary",
                "user": learner,
                "xp": xp,
                "streak": index % 9,
                "bestStreak": index % 12,
                "lessons": index % 20,
                "quizzes": index % 8,
                "badges": index % 11,
                "drills": index * 3,
                "drillsCorrect": index * 2,
                "days": index % 21 + 1,
                "lastActive": f"2026-11-{(index % 28) + 1:02d}T09:00:00.000Z",
            }
        )
        for module in modules[: (index % 4) + 1]:
            events.append(
                {
                    "type": "quiz_attempt",
                    "user": learner,
                    "module": module,
                    "best": 40 + (index * 7 + len(module)) % 60,
                    "attempts": 1 + index % 3,
                    "at": f"2026-11-{(index % 28) + 1:02d}T10:00:00.000Z",
                }
            )
        for lesson_index in range(index % 5):
            events.append(
                {
                    "type": "lesson_done",
                    "user": learner,
                    "lesson": f"lecon-{lesson_index + 1}",
                    "at": f"2026-11-{(index % 28) + 1:02d}T11:00:00.000Z",
                    "xp": 40,
                }
            )
        for kind in ("divider", "rc-charge", "impedance-rc", "norton"):
            solved = (index + len(kind)) % 9
            events.append(
                {
                    "type": "drill_stats",
                    "user": learner,
                    "kind": kind,
                    "solved": solved,
                    "correct": max(0, solved - index % 3),
                }
            )
        for badge_index in range(index % 6):
            events.append(
                {
                    "type": "badge",
                    "user": learner,
                    "badge": ["premier-pas", "etincelle", "sans-faute", "serie-3", "calculatrice"][badge_index],
                    "at": f"2026-11-{(index % 28) + 1:02d}T12:00:00.000Z",
                }
            )
        if index % 3 == 0:
            events.append(
                {
                    "type": "circuit",
                    "owner": learner,
                    "components": 3 + index % 9,
                    "regime": "ac" if index % 2 else "dc",
                    "template": "thevenin-serie" if index % 2 else None,
                    "status": "draft",
                    "createdAt": f"2026-11-{(index % 28) + 1:02d}T13:00:00.000Z",
                    "vth": 12.0 / (index % 5 + 1),
                    "rth": 1000.0 * (index % 4 + 1),
                }
            )
    return events


def build_session(master: str | None):
    from pyspark.sql import SparkSession

    builder = SparkSession.builder.appName("northev-spark-academy")
    builder = builder.config("spark.sql.shuffle.partitions", "8").config("spark.ui.showConsoleProgress", "false")
    if master:
        builder = builder.master(master)
    else:
        builder = builder.master("local[*]")
    return builder.getOrCreate()


def write_jsonl(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    ensure_spark()

    from pyspark.sql import functions as F

    input_path = Path(args.input)
    if not input_path.exists() or input_path.stat().st_size == 0:
        if not args.sample:
            print(
                f"Entrée absente ou vide : {input_path}\n"
                "Exportez d'abord depuis /api/analytics/export, ou relancez avec --sample.",
                file=sys.stderr,
            )
            return 1
        write_jsonl(input_path, demo_events())
        print(f"Jeu de démonstration écrit dans {input_path}")

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    spark = build_session(args.master)
    spark.sparkContext.setLogLevel("WARN")

    events = spark.read.json(str(input_path)).cache()
    total = events.count()
    if total == 0:
        print("Aucun événement à analyser.", file=sys.stderr)
        return 1

    print(f"Événements lus : {total}")
    events.groupBy("type").count().orderBy(F.desc("count")).show(args.show, truncate=False)

    # --- KPI par apprenant -------------------------------------------------
    summaries = events.filter(F.col("type") == "learner_summary")
    learner_kpis = (
        summaries.select(
            "user",
            F.col("xp").cast("int").alias("xp"),
            F.col("streak").cast("int").alias("streak"),
            F.col("bestStreak").cast("int").alias("best_streak"),
            F.col("lessons").cast("int").alias("lessons"),
            F.col("quizzes").cast("int").alias("quizzes"),
            F.col("badges").cast("int").alias("badges"),
            F.col("drills").cast("int").alias("drills"),
            F.col("drillsCorrect").cast("int").alias("drills_correct"),
            F.to_timestamp("lastActive").alias("last_active"),
        )
        .withColumn("drill_accuracy", F.when(F.col("drills") > 0, F.col("drills_correct") / F.col("drills")).otherwise(F.lit(0.0)))
        .withColumn("xp_bucket", (F.col("xp") / F.lit(500)).cast("int") * F.lit(500))
    )
    learner_kpis.write.mode("overwrite").parquet(str(output / "learner_kpis"))
    print("\nRépartition des XP (par tranche de 500) :")
    learner_kpis.groupBy("xp_bucket").count().orderBy("xp_bucket").show(args.show)

    # --- réussite par module ----------------------------------------------
    quizzes = events.filter(F.col("type") == "quiz_attempt")
    module_progress = (
        quizzes.groupBy("module")
        .agg(
            F.countDistinct("user").alias("learners"),
            F.count("*").alias("attempts"),
            F.round(F.avg("best"), 1).alias("average_best"),
            F.round(F.avg(F.when(F.col("best") >= 70, 1).otherwise(0)) * 100, 1).alias("pass_rate_pct"),
            F.max("best").alias("best_score"),
        )
        .orderBy(F.desc("learners"))
    )
    module_progress.write.mode("overwrite").parquet(str(output / "module_progress"))
    print("\nRéussite par module :")
    module_progress.show(args.show, truncate=False)

    # --- précision des exercices ------------------------------------------
    drills = events.filter(F.col("type") == "drill_stats")
    drill_accuracy = (
        drills.groupBy("kind")
        .agg(
            F.sum("solved").alias("solved"),
            F.sum("correct").alias("correct"),
            F.round(F.sum("correct") / F.sum("solved") * 100, 1).alias("accuracy_pct"),
            F.countDistinct("user").alias("learners"),
        )
        .withColumn("accuracy_pct", F.round(F.col("correct") / F.col("solved") * 100, 1))
        .orderBy(F.desc("solved"))
    )
    drill_accuracy.write.mode("overwrite").parquet(str(output / "drill_accuracy"))
    print("\nPrécision par famille d'exercices :")
    drill_accuracy.show(args.show, truncate=False)

    # --- badges ------------------------------------------------------------
    badges = (
        events.filter(F.col("type") == "badge")
        .groupBy("badge")
        .agg(F.countDistinct("user").alias("owners"), F.count("*").alias("awards"))
        .orderBy(F.desc("owners"))
    )
    badges.write.mode("overwrite").parquet(str(output / "badge_popularity"))
    print("\nBadges les plus débloqués :")
    badges.show(args.show, truncate=False)

    # --- montages ----------------------------------------------------------
    circuits = events.filter(F.col("type") == "circuit")
    circuit_stats = (
        circuits.groupBy("regime", "status")
        .agg(
            F.count("*").alias("circuits"),
            F.round(F.avg("components"), 1).alias("average_components"),
            F.round(F.avg("rth"), 1).alias("average_rth"),
        )
        .orderBy(F.desc("circuits"))
    )
    circuit_stats.write.mode("overwrite").parquet(str(output / "circuit_stats"))
    print("\nMontages enregistrés :")
    circuit_stats.show(args.show, truncate=False)

    # --- activité quotidienne ---------------------------------------------
    dated = events.filter(F.col("at").isNotNull()).withColumn("day", F.to_date("at"))
    daily_activity = (
        dated.groupBy("day", "type")
        .count()
        .orderBy("day", "type")
    )
    daily_activity.write.mode("overwrite").parquet(str(output / "daily_activity"))
    print("\nActivité quotidienne (extrait) :")
    daily_activity.orderBy(F.desc("day")).show(args.show, truncate=False)

    # --- synthèse texte ----------------------------------------------------
    totals = learner_kpis.agg(
        F.count("*").alias("learners"),
        F.sum("xp").alias("total_xp"),
        F.round(F.avg("xp"), 1).alias("average_xp"),
        F.round(F.avg("streak"), 2).alias("average_streak"),
        F.max("xp").alias("top_xp"),
    ).collect()[0]

    summary = {
        "events": total,
        "learners": int(totals["learners"] or 0),
        "total_xp": int(totals["total_xp"] or 0),
        "average_xp": float(totals["average_xp"] or 0),
        "average_streak": float(totals["average_streak"] or 0),
        "top_xp": int(totals["top_xp"] or 0),
        "modules": module_progress.count(),
        "badges": badges.count(),
        "circuit_rows": circuits.count(),
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("\nSynthèse :")
    for key, value in summary.items():
        print(f"  {key:>14} : {value}")
    print(f"\nRésultats écrits dans {output}")

    spark.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
