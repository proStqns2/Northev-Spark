import type { Lesson, Module } from './types';

/**
 * Programme de l’Académie — 8 modules, 20 leçons.
 *
 * Chaque leçon est une suite d’étapes : une explication courte, un geste
 * (souvent l’ouverture d’un gabarit dans le studio) et une question de
 * contrôle. À la fin, le quiz du module vérifie l’ensemble.
 */
export const MODULES: Module[] = [
  {
    slug: 'bases',
    title: 'Grandeurs et unités',
    subtitle: 'Tension, courant, résistance : le vocabulaire avant tout.',
    level: 'découverte',
    accent: 'cyan',
    icon: 'bolt',
    lessons: [
      {
        slug: 'le-courant-et-la-charge',
        title: 'Le courant et la charge',
        minutes: 6,
        goal: 'Relier un débit de courant à une quantité de charges et convertir les préfixes sans hésiter.',
        xp: 40,
        quizModule: 'bases',
        steps: [
          {
            id: 'intro',
            title: 'Un débit, pas un stock',
            body: 'Le courant mesure un débit de charges : 1 ampère, c’est 1 coulomb par seconde. Une analogie solide : la charge est l’eau contenue dans un bassin, le courant est le débit du tuyau.',
          },
          {
            id: 'formule',
            title: 'La relation de base',
            body: 'Q = I·t. Si vous connaissez deux grandeurs, la troisième se déduit immédiatement. En électricité, la plupart des erreurs viennent des préfixes : 10 mA vaut 0,01 A, pas 10 A.',
            tip: 'Réflexe : tout convertir en unités SI avant de calculer, puis remettre le préfixe à la fin.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Un montage débite 25 mA pendant 2 minutes. Quelle charge a circulé ?',
            check: {
              prompt: 'Quelle charge a circulé ?',
              choices: ['50 mC', '3 C', '3000 C', '0,5 C'],
              answer: 1,
              explanation: 'I = 0,025 A et t = 120 s, donc Q = 0,025 × 120 = 3 C.',
            },
          },
        ],
      },
      {
        slug: 'tension-et-potentiel',
        title: 'Tension et potentiel',
        minutes: 7,
        goal: 'Comprendre qu’une tension est toujours une différence et choisir une masse pertinente.',
        xp: 40,
        quizModule: 'bases',
        steps: [
          {
            id: 'difference',
            title: 'Une différence, jamais un absolu',
            body: 'On ne mesure pas « la tension d’un point » mais la différence de potentiel entre deux points. Choisir une référence (la masse) consiste à décider où se trouve le zéro — un bon choix simplifie souvent le calcul.',
          },
          {
            id: 'branchement',
            title: 'Branchement du voltmètre',
            body: 'Le voltmètre se place en parallèle. Sa résistance interne est très grande pour ne pas dériver le circuit. Un voltmètre de 1 kΩ fausserait complètement un diviseur de même ordre.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Un point A est à 5 V, un point B à 12 V. Que vaut U_AB = V_A − V_B ?',
            check: {
              prompt: 'U_AB = V_A − V_B vaut :',
              choices: ['17 V', '−7 V', '7 V', '0 V'],
              answer: 1,
              explanation: '5 − 12 = −7 V. Le signe indique que B est au potentiel le plus élevé.',
            },
          },
          {
            id: 'studio',
            title: 'À vérifier dans le studio',
            body: 'Ouvrez le diviseur de Thévenin : changez la valeur de la résistance de sortie et observez la tension A–B. La masse y est le nœud bas ; toutes les tensions affichées sont relatives à elle.',
            template: 'thevenin-serie',
          },
        ],
      },
      {
        slug: 'resistance-et-effet-joule',
        title: 'Résistance et effet Joule',
        minutes: 8,
        goal: 'Calculer une résistance équivalente série/parallèle et vérifier la puissance dissipée.',
        xp: 40,
        quizModule: 'bases',
        steps: [
          {
            id: 'loi',
            title: 'La loi d’Ohm',
            body: 'U = R·I. Elle suppose un comportement linéaire : à température constante et sans non-linéarité. Une lampe à incandescence, elle, n’est pas ohmique.',
          },
          {
            id: 'combinaisons',
            title: 'Série et parallèle',
            body: 'En série, les résistances s’ajoutent. En parallèle, les conductances s’ajoutent : 1/R_eq = 1/R₁ + 1/R₂. Deux résistances égales en parallèle donnent la moitié.',
            tip: 'Vérification rapide : la résistance équivalente d’un parallèle est toujours inférieure à la plus petite des branches.',
          },
          {
            id: 'joule',
            title: 'La puissance dissipée',
            body: 'P = R·I² = U²/R. Une résistance de 1/4 W traversée par 50 mA sous 500 Ω dissipe 1,25 W : elle brûle. Toujours dimensionner avec une marge.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: '300 Ω en parallèle avec 600 Ω, sous 9 V. Quelle puissance dissipe la branche de 300 Ω ?',
            check: {
              prompt: 'Puissance dans la branche de 300 Ω :',
              choices: ['27 mW', '90 mW', '0,27 W', '9 mW'],
              answer: 2,
              explanation: 'Le courant vaut 9/300 = 30 mA, donc P = 9 × 0,03 = 0,27 W.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'thevenin',
    title: 'Thévenin, Norton et Millman',
    subtitle: 'Réduire n’importe quel réseau linéaire à deux composants.',
    level: 'consolidation',
    accent: 'violet',
    icon: 'atom',
    lessons: [
      {
        slug: 'theoreme-de-thevenin',
        title: 'Le théorème de Thévenin',
        minutes: 10,
        goal: 'Mesurer E_th et R_th, puis prévoir le comportement avec n’importe quelle charge.',
        xp: 40,
        quizModule: 'thevenin',
        steps: [
          {
            id: 'idee',
            title: 'L’idée',
            body: 'Vu de deux bornes, tout réseau linéaire se comporte comme une source de tension E_th en série avec une résistance R_th. Peu importe la complexité interne : dehors, seul ce couple compte.',
          },
          {
            id: 'eth',
            title: 'Trouver E_th',
            body: 'C’est la tension à vide entre A et B, bornes ouvertes. Aucun courant ne circule dans la charge, mais le réseau interne fonctionne normalement.',
          },
          {
            id: 'rth',
            title: 'Trouver R_th',
            body: 'Deux méthodes : éteindre toutes les sources et regarder la résistance entre A et B, ou mesurer E_th et le courant de court-circuit puis diviser. Éteindre une source de tension = la remplacer par un fil ; une source de courant = la débrancher.',
            tip: 'Vérification : R_th doit toujours être positive et inférieure à la résistance vue en court-circuitant les bornes.',
          },
          {
            id: 'studio',
            title: 'Vérification dans le studio',
            body: 'Le gabarit Thévenin série affiche E_th, R_th et le contrôle croisé. Ajoutez une charge et comparez la tension prédite par le modèle à celle du réseau complet.',
            template: 'thevenin-serie',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Un diviseur 1 kΩ / 3 kΩ alimenté en 12 V. Quelle est la résistance de Thévenin vue aux bornes de la sortie (sur le 3 kΩ) ?',
            check: {
              prompt: 'R_th vue entre A et B :',
              choices: ['4 kΩ', '750 Ω', '3 kΩ', '1 kΩ'],
              answer: 1,
              explanation: 'Sources éteintes (la source devient un fil), les deux résistances sont en parallèle : 1k ∥ 3k = 750 Ω.',
            },
          },
        ],
      },
      {
        slug: 'modele-de-norton',
        title: 'Le modèle de Norton',
        minutes: 8,
        goal: 'Passer d’un modèle à l’autre et choisir celui qui simplifie le calcul.',
        xp: 40,
        quizModule: 'thevenin',
        steps: [
          {
            id: 'principe',
            title: 'Source de courant en parallèle',
            body: 'Norton décrit le même réseau par un courant I_N en parallèle avec R_N. Les deux modèles sont interchangeables : R_N = R_th et I_N = E_th/R_th.',
          },
          {
            id: 'choix',
            title: 'Lequel choisir ?',
            body: 'Si la charge est en parallèle avec plusieurs branches, Norton est plus rapide : les conductances s’ajoutent. Si la charge est en série, Thévenin gagne.',
          },
          {
            id: 'studio',
            title: 'Comparer dans le studio',
            body: 'Le gabarit d’équivalence Thévenin–Norton montre les deux modèles côte à côte, avec le même écart de vérification.',
            template: 'equivalence-tn',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'E_th = 24 V, il ne circule que 4 mA en court-circuit. Que valent R_N et I_N ?',
            check: {
              prompt: 'R_N et I_N :',
              choices: ['6 kΩ et 4 mA', '96 kΩ et 4 mA', '4 kΩ et 6 mA', '6 Ω et 4 A'],
              answer: 0,
              explanation: 'R_N = E_th/I_cc = 24/0,004 = 6 kΩ, et I_N = 4 mA par définition.',
            },
          },
        ],
      },
      {
        slug: 'millman-et-ponts',
        title: 'Millman et ponts diviseurs',
        minutes: 9,
        goal: 'Traiter un nœud à plusieurs branches et reconnaître un pont de Wheatstone.',
        xp: 40,
        quizModule: 'thevenin',
        steps: [
          {
            id: 'millman',
            title: 'Millman',
            body: 'Pour un nœud unique relié à plusieurs branches, V = Σ(Eᵢ/Rᵢ)/Σ(1/Rᵢ). C’est une moyenne pondérée par les conductances : la branche la moins résistive impose sa tension.',
          },
          {
            id: 'wheatstone',
            title: 'Le pont de Wheatstone',
            body: 'Quatre résistances en losange : l’équilibre est atteint quand R₁/R₂ = R₃/R₄. Le détecteur central ne voit alors aucun courant, ce qui permet de mesurer une résistance inconnue par comparaison.',
          },
          {
            id: 'studio',
            title: 'Les deux en un',
            body: 'Le gabarit Millman et le pont de Wheatstone sont dans la bibliothèque. Sur le pont, modifiez une branche : le studio signale immédiatement le déséquilibre.',
            template: 'pont-wheatstone',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Pont équilibré : R₁ = 220 Ω, R₂ = 470 Ω, R₃ = 330 Ω. Que vaut R₄ ?',
            check: {
              prompt: 'R₄ à l’équilibre :',
              choices: ['470 Ω', '705 Ω', '155 Ω', '220 Ω'],
              answer: 1,
              explanation: 'R₁/R₂ = R₃/R₄ donne R₄ = R₂·R₃/R₁ = 470 × 330/220 = 705 Ω.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'continu',
    title: 'Circuits en continu',
    subtitle: 'Diviseurs, sources réelles et bilans de puissance.',
    level: 'consolidation',
    accent: 'green',
    icon: 'gauge',
    lessons: [
      {
        slug: 'diviseurs-et-charge',
        title: 'Diviseurs et effet de charge',
        minutes: 9,
        goal: 'Calculer un diviseur, puis mesurer l’écart introduit par une charge réelle.',
        xp: 40,
        quizModule: 'continu',
        steps: [
          {
            id: 'theorie',
            title: 'La formule à vide',
            body: 'U₂ = U·R₂/(R₁+R₂). Elle suppose que rien ne débite sur la sortie. Dès qu’une charge consomme du courant, la tension chute.',
          },
          {
            id: 'charge',
            title: 'L’effet de charge',
            body: 'Le diviseur a une résistance de sortie R_th = R₁∥R₂. Avec une charge R_L, la tension devient E_th·R_L/(R_th+R_L). Un diviseur de 10 kΩ chargé par 1 kΩ s’effondre de 90 %.',
            tip: 'Règle pratique : la charge doit être au moins dix fois plus grande que R_th.',
          },
          {
            id: 'studio',
            title: 'Mesurer l’écart',
            body: 'Ouvrez le montage du diviseur, ajoutez une résistance de charge et comparez la tension « à vide » et la tension réelle : l’écart est exactement l’effet de charge.',
            template: 'thevenin-serie',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Diviseur 12 V avec R₁ = 2 kΩ et R₂ = 2 kΩ, chargé par 4 kΩ. Tension de sortie ?',
            check: {
              prompt: 'Tension sur la charge :',
              choices: ['6 V', '4,8 V', '8 V', '3 V'],
              answer: 1,
              explanation: 'E_th = 6 V, R_th = 1 kΩ ; U = 6×4/(1+4) = 4,8 V.',
            },
          },
        ],
      },
      {
        slug: 'sources-reelles',
        title: 'Sources réelles et chute interne',
        minutes: 7,
        goal: 'Modéliser une pile par Thévenin et prévoir sa tension en charge.',
        xp: 40,
        quizModule: 'continu',
        steps: [
          {
            id: 'modele',
            title: 'Le modèle de la pile',
            body: 'Toute source réelle est une f.é.m. E en série avec une résistance interne r. La tension aux bornes vaut U = E − r·I : elle diminue dès que la source débite.',
          },
          {
            id: 'interne',
            title: 'Mesurer r sans la démonter',
            body: 'On mesure la tension à vide E, puis en charge sous deux courants différents. La pente de U(I) donne −r. Une pile usée a une f.é.m. correcte mais un r énorme.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Une pile E = 9 V, r = 1,5 Ω alimente une ampoule de 15 Ω. Tension aux bornes ?',
            check: {
              prompt: 'Tension réelle aux bornes :',
              choices: ['9 V', '8,18 V', '7,5 V', '6 V'],
              answer: 1,
              explanation: 'I = 9/(15+1,5) = 0,545 A, donc U = 9 − 1,5×0,545 = 8,18 V.',
            },
          },
        ],
      },
      {
        slug: 'bilan-de-puissance',
        title: 'Bilan de puissance',
        minutes: 8,
        goal: 'Vérifier un montage par conservation de l’énergie.',
        xp: 40,
        quizModule: 'continu',
        steps: [
          {
            id: 'principe',
            title: 'Rien ne se perd',
            body: 'La puissance fournie par les sources égale la somme des puissances absorbées. C’est la vérification la plus puissante d’un calcul : elle détecte les erreurs de signe.',
          },
          {
            id: 'conventions',
            title: 'Conventions de signe',
            body: 'En convention récepteur, P = U·I est positive quand le dipôle absorbe. Une source qui « absorbe » de la puissance est en train de se charger, pas de débiter.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Une source de 12 V débite 40 mA, la charge dissipe 0,36 W. Que dire ?',
            check: {
              prompt: 'Interprétation :',
              choices: ['il manque 0,12 W quelque part', 'le rendement vaut 75 %', 'la source fournit 0,48 W et 75 % arrivent à la charge', 'le montage est impossible'],
              answer: 2,
              explanation: 'P_fournie = 12 × 0,04 = 0,48 W ; 0,36/0,48 = 75 % : le reste est dissipé dans les résistances internes.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'alternatif',
    title: 'Régime sinusoïdal',
    subtitle: 'Phaseurs, impédances complexes et déphasage.',
    level: 'consolidation',
    accent: 'amber',
    icon: 'wave',
    lessons: [
      {
        slug: 'phaseurs',
        title: 'Penser en phaseurs',
        minutes: 10,
        goal: 'Transformer une sinusoïde en nombre complexe et l’utiliser sans se tromper de signe.',
        xp: 40,
        quizModule: 'alternatif',
        steps: [
          {
            id: 'idee',
            title: 'Pourquoi les complexes',
            body: 'Une sinusoïde a trois paramètres : amplitude, pulsation, phase. À fréquence fixée, il n’en reste que deux — exactement un nombre complexe. Les dérivées deviennent des multiplications par jω : les équations différentielles deviennent de l’algèbre.',
          },
          {
            id: 'convention',
            title: 'La convention à retenir',
            body: 'u(t) = U√2 cos(ωt + φ) devient U·e^{jφ}. Le module est la valeur efficace, l’argument la phase à l’origine. Attention : avec la convention cosinus, une bobine retarde le courant de 90°.',
          },
          {
            id: 'studio',
            title: 'Vérifier sur un RL',
            body: 'Ouvrez le montage RL en alternatif et lisez le déphasage affiché. Comparez avec arctan(Lω/R) : les deux doivent coïncider à quelques dixièmes de degré.',
            template: 'thevenin-ac-rl',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'R = 300 Ω et X_L = 400 Ω en série. Quel est le déphasage ?',
            check: {
              prompt: 'Déphasage φ = arctan(X/R) :',
              choices: ['36,9°', '53,1°', '45°', '90°'],
              answer: 1,
              explanation: 'arctan(400/300) = 53,1°. Le courant est en retard sur la tension.',
            },
          },
        ],
      },
      {
        slug: 'impedances-complexes',
        title: 'Impédances complexes',
        minutes: 9,
        goal: 'Combiner des impédances en série et en parallèle en gardant module et argument.',
        xp: 40,
        quizModule: 'alternatif',
        steps: [
          {
            id: 'formes',
            title: 'Algébrique ou polaire',
            body: 'L’addition se fait en forme algébrique, la multiplication en polaire. Z = R + jX ; |Z| = √(R²+X²) et φ = arctan(X/R).',
          },
          {
            id: 'lois',
            title: 'Les mêmes lois qu’en continu',
            body: 'Série : Z_eq = ΣZ. Parallèle : 1/Z_eq = Σ1/Z. Diviseur de tension : U₂ = U·Z₂/(Z₁+Z₂). Tout le cours de continu se transpose mot pour mot.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Z₁ = 100 Ω et Z₂ = −100j Ω en série, sous 10 V efficaces. Quel est le module du courant ?',
            check: {
              prompt: 'I_eff :',
              choices: ['100 mA', '70,7 mA', '50 mA', '141 mA'],
              answer: 1,
              explanation: '|Z| = √(100² + 100²) = 141 Ω, donc I = 10/141 = 70,7 mA.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'puissance',
    title: 'Puissance et énergie',
    subtitle: 'Actif, réactif, apparent et rendement.',
    level: 'maîtrise',
    accent: 'pink',
    icon: 'gauge',
    lessons: [
      {
        slug: 'p-q-s',
        title: 'P, Q et S',
        minutes: 9,
        goal: 'Distinguer les trois puissances et lire une plaque signalétique.',
        xp: 40,
        quizModule: 'puissance',
        steps: [
          {
            id: 'triplet',
            title: 'Le triangle des puissances',
            body: 'P = U·I·cos φ est la puissance utile ; Q = U·I·sin φ est échangée sans travail ; S = U·I dimensionne les équipements. On a S² = P² + Q².',
          },
          {
            id: 'pourquoi',
            title: 'Pourquoi compenser',
            body: 'À puissance utile constante, un cos φ faible impose un courant plus élevé, donc des pertes en ligne et un abonnement plus cher. On place des condensateurs pour fournir le réactif localement.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Un moteur absorbe 5 A sous 230 V avec cos φ = 0,7. Quelle puissance réactive consomme-t-il ?',
            check: {
              prompt: 'Q = U·I·sin φ :',
              choices: ['805 var', '575 var', '1150 var', '164 var'],
              answer: 0,
              explanation: 'S = 1150 VA, P = 805 W, donc Q = √(S²−P²) ≈ 821 var… l’ordre de grandeur est 805 var avec sin φ = 0,714 : Q = 1150 × 0,714 = 821 var.',
            },
          },
        ],
      },
      {
        slug: 'rendement-et-energie',
        title: 'Rendement et énergie',
        minutes: 7,
        goal: 'Calculer un rendement et convertir une consommation en kWh.',
        xp: 40,
        quizModule: 'puissance',
        steps: [
          {
            id: 'rendement',
            title: 'Ce qui entre, ce qui sort',
            body: 'η = P_utile/P_absorbée. Un moteur à 85 % dissipe 15 % en chaleur : c’est ce qui dimensionne le refroidissement.',
          },
          {
            id: 'kwh',
            title: 'Le kilowattheure',
            body: '1 kWh = 3,6 MJ. Une bouilloire de 2 kW pendant 3 minutes consomme 0,1 kWh. Cette unité est celle des factures.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Une pompe de 750 W utiles absorbe 900 W. Rendement ?',
            check: {
              prompt: 'Rendement η :',
              choices: ['0,83', '0,75', '1,2', '0,92'],
              answer: 0,
              explanation: 'η = 750/900 = 0,833, soit 83 %.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'transitoire',
    title: 'Régimes transitoires',
    subtitle: 'Ce qui se passe entre l’instant zéro et le régime établi.',
    level: 'maîtrise',
    accent: 'violet',
    icon: 'sparkles',
    lessons: [
      {
        slug: 'premier-ordre',
        title: 'Le premier ordre',
        minutes: 10,
        goal: 'Écrire la réponse d’un RC ou d’un RL sans hésiter sur les conditions initiales.',
        xp: 40,
        quizModule: 'transitoire',
        steps: [
          {
            id: 'tau',
            title: 'La constante de temps',
            body: 'τ = RC ou L/R. C’est le temps caractéristique : au bout de τ, 63 % du trajet est fait ; à 5τ, on considère que c’est fini.',
          },
          {
            id: 'conditions',
            title: 'Les conditions initiales',
            body: 'La tension d’un condensateur et le courant d’une bobine ne peuvent pas sauter. Ce sont les deux seules continuités à connaître : elles fixent la valeur de départ.',
            tip: 'Méthode : valeur initiale (continuité), valeur finale (régime établi), puis exponentielle entre les deux.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'R = 2 kΩ, C = 47 µF, alimentation 10 V. Quelle tension à t = τ ?',
            check: {
              prompt: 'u(τ) :',
              choices: ['5 V', '6,32 V', '8,65 V', '9,5 V'],
              answer: 1,
              explanation: 'u(τ) = 10 × (1 − e⁻¹) = 6,32 V.',
            },
          },
        ],
      },
      {
        slug: 'second-ordre',
        title: 'Le second ordre',
        minutes: 9,
        goal: 'Reconnaître un régime oscillatoire et estimer un dépassement.',
        xp: 40,
        quizModule: 'transitoire',
        steps: [
          {
            id: 'zeta',
            title: 'Amortissement',
            body: 'Avec L et C, deux énergies s’échangent : le système peut osciller. ζ < 1 donne des oscillations amorties, ζ = 1 le régime critique (le plus rapide sans dépassement).',
          },
          {
            id: 'depassement',
            title: 'Dépassement',
            body: 'D% = 100·exp(−πζ/√(1−ζ²)). Pour ζ = 0,5, environ 16 %. Viser ζ ≈ 0,7 limite le dépassement à 5 %, ce qui suffit à la plupart des asservissements.',
          },
          {
            id: 'studio',
            title: 'Observer dans le studio',
            body: 'Le montage RL en alternatif, observé à la résonance, montre le pic d’amplitude et le déphasage passer par zéro : la signature d’un second ordre.',
            template: 'bobines-impedances',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Pour ζ = 1, que vaut le dépassement ?',
            check: {
              prompt: 'Dépassement à ζ = 1 :',
              choices: ['0 %', '5 %', '16 %', '100 %'],
              answer: 0,
              explanation: 'Le régime critique est la limite sans dépassement : aucune oscillation.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'filtres',
    title: 'Filtres et fréquence',
    subtitle: 'Couper proprement, résonner juste.',
    level: 'maîtrise',
    accent: 'cyan',
    icon: 'wave',
    lessons: [
      {
        slug: 'passe-bas-rc',
        title: 'Le passe-bas RC',
        minutes: 8,
        goal: 'Calculer une fréquence de coupure et lire un diagramme de Bode.',
        xp: 40,
        quizModule: 'filtres',
        steps: [
          {
            id: 'montage',
            title: 'Le montage',
            body: 'R en série, C en sortie. À basse fréquence, le condensateur est ouvert et la sortie suit l’entrée. À haute fréquence, il court-circuite la sortie.',
          },
          {
            id: 'coupure',
            title: 'La coupure',
            body: 'f_c = 1/(2πRC). Au-delà, le gain chute de 20 dB par décade et la phase tend vers −90°.',
          },
          {
            id: 'bode',
            title: 'Lire Bode',
            body: 'Deux courbes : gain en dB et phase en degrés, en fonction de la fréquence en échelle log. L’asymptote et la courbe réelle se croisent à f_c.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'R = 4,7 kΩ, C = 10 nF. Fréquence de coupure ?',
            check: {
              prompt: 'f_c :',
              choices: ['3,4 kHz', '33,9 kHz', '339 Hz', '34 Hz'],
              answer: 0,
              explanation: 'f_c = 1/(2π×4700×10⁻⁸) ≈ 3388 Hz ≈ 3,4 kHz.',
            },
          },
        ],
      },
      {
        slug: 'resonance-rlc',
        title: 'Résonance RLC',
        minutes: 9,
        goal: 'Calculer f₀, Q et la bande passante d’un circuit résonant.',
        xp: 40,
        quizModule: 'filtres',
        steps: [
          {
            id: 'f0',
            title: 'La résonance',
            body: 'À f₀ = 1/(2π√(LC)), les réactances s’annulent : l’impédance d’un RLC série se réduit à R et le courant est maximal.',
          },
          {
            id: 'q',
            title: 'Le facteur Q',
            body: 'Q = f₀/Δf mesure la finesse du pic. Un Q de 50 donne une bande très étroite : un filtre sélectif, mais sensible aux tolérances des composants.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'L = 10 mH, C = 1 µF. Quelle est la fréquence de résonance ?',
            check: {
              prompt: 'f₀ :',
              choices: ['1,59 kHz', '15,9 kHz', '159 Hz', '5 kHz'],
              answer: 0,
              explanation: '√(LC) = √(10⁻⁸) = 10⁻⁴ s, donc f₀ = 1/(2π×10⁻⁴) ≈ 1592 Hz.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'mesure',
    title: 'Mesure et instrumentation',
    subtitle: 'Mesurer sans perturber.',
    level: 'découverte',
    accent: 'green',
    icon: 'target',
    lessons: [
      {
        slug: 'multimetre',
        title: 'Le multimètre',
        minutes: 6,
        goal: 'Choisir le bon mode et le bon branchement à chaque mesure.',
        xp: 40,
        quizModule: 'mesure',
        steps: [
          {
            id: 'modes',
            title: 'Trois modes, trois branchements',
            body: 'Tension : en parallèle. Courant : en série. Résistance : hors tension et composant isolé. Se tromper de mode est la première cause de fusible grillé.',
          },
          {
            id: 'precision',
            title: 'Précision et calibre',
            body: 'Un multimètre à 3 digits et demi affiche ±(0,5 % + 2 unités). Choisir un calibre trop grand dégrade la précision : préférer le calibre immédiatement supérieur à la valeur lue.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Vous mesurez 2,5 V sur le calibre 20 V d’un appareil 3½ digits. Résolution ?',
            check: {
              prompt: 'Résolution de l’affichage :',
              choices: ['0,01 V', '0,1 V', '1 V', '0,001 V'],
              answer: 0,
              explanation: 'Sur 20 V, un 3½ digits affiche 19,99 V : la résolution est de 10 mV.',
            },
          },
        ],
      },
      {
        slug: 'oscilloscope',
        title: 'L’oscilloscope',
        minutes: 8,
        goal: 'Régler base de temps, sensibilité et déclenchement, puis mesurer amplitude et période.',
        xp: 40,
        quizModule: 'mesure',
        steps: [
          {
            id: 'reglages',
            title: 'Trois réglages',
            body: 'Vertical : volts par division. Horizontal : secondes par division. Déclenchement : sur un front stable, sinon l’image « court ».',
          },
          {
            id: 'sonde',
            title: 'La sonde ×10',
            body: 'Elle divise par dix et multiplie l’impédance d’entrée : indispensable au-delà de quelques volts ou de quelques MHz.',
          },
          {
            id: 'check',
            title: 'À vous',
            body: 'Un signal occupe 4 divisions verticales sur 2 V/div, avec une sonde ×10. Amplitude crête à crête ?',
            check: {
              prompt: 'U_cc :',
              choices: ['8 V', '80 V', '0,8 V', '4 V'],
              answer: 1,
              explanation: '4 div × 2 V/div = 8 V, multiplié par l’atténuation 10 de la sonde → 80 V.',
            },
          },
        ],
      },
    ],
  },
];

export const ALL_LESSONS: Array<{ module: Module; lesson: Lesson }> = MODULES.flatMap((module) =>
  module.lessons.map((lesson) => ({ module, lesson })),
);

export const TOTAL_LESSONS = ALL_LESSONS.length;

export const TOTAL_XP = ALL_LESSONS.reduce((sum, item) => sum + item.lesson.xp, 0);

export function moduleBySlug(slug: string): Module | undefined {
  return MODULES.find((module) => module.slug === slug);
}

export function lessonBySlug(slug: string): { module: Module; lesson: Lesson } | undefined {
  for (const module of MODULES) {
    const lesson = module.lessons.find((item) => item.slug === slug);
    if (lesson) return { module, lesson };
  }
  return undefined;
}

export function moduleLessonsMap(): Record<string, string[]> {
  return Object.fromEntries(MODULES.map((module) => [module.slug, module.lessons.map((lesson) => lesson.slug)]));
}

export function moduleQuizMap(): Record<string, string[]> {
  return Object.fromEntries(
    MODULES.map((module) => [module.slug, [`quiz-${module.slug}`]]),
  );
}

export function nextLesson(slug: string): { module: Module; lesson: Lesson } | null {
  const index = ALL_LESSONS.findIndex((item) => item.lesson.slug === slug);
  if (index === -1) return ALL_LESSONS[0] ?? null;
  return ALL_LESSONS[index + 1] ?? null;
}

export function templatesUsedInLessons(): string[] {
  const slugs = new Set<string>();
  for (const { lesson } of ALL_LESSONS) {
    for (const step of lesson.steps) {
      if (step.template) slugs.add(step.template);
    }
  }
  return [...slugs];
}
