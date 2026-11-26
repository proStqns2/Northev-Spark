# ⚡ Northev Spark

**Studio de montages électriques & équivalents Thévenin / Norton**, avec collaboration temps réel, historique en base de données et agents IA spécialisés.

Construit avec **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS** et un **solveur nodal complexe** écrit de zéro — aucune bibliothèque de simulation : chaque résultat affiché est calculé, puis recoupé par une vérification indépendante.

---

## Ce que fait le site

| Page | Rôle |
|---|---|
| `/` | Présentation, aperçu de la bibliothèque (valeurs réellement calculées au chargement) |
| `/studio` | Grille de montage, palette de 13 dipôles, animation des électrons, résultats en direct |
| `/bibliotheque` | 15 montages de référence, filtrables, avec résultats attendus |
| `/compte` | Inscription / connexion, profil, avatar, thème, historique des montages, sécurité |
| `/multiwork` | Ateliers collaboratifs : code à **5 chiffres**, présence, chat, synchronisation temps réel |
| `/premium` | Hub de **5 agents IA** (Théo, Nora, Impeda, Volt, Mentor) avec moteur local + OpenAI/Gemini |
| `/export` | Export **PNG, SVG, HTML, JSON, Markdown** + carte d'invitation PNG avec code d'atelier |

### Le studio

- **Grille magnétique** : tracé au glisser, accrochage aux nœuds, déplacement, rotation, inversion, duplication.
- **Palette** : sources E/I, sources liées (VCVS/VCCS), R, C, L, potentiomètre, lampe, fils, interrupteurs, ampèremètre, voltmètre.
- **Animation des électrons** : la vitesse et le sens dérivent du courant réellement calculé (`offset-path` SVG, désactivé si `prefers-reduced-motion`).
- **Barre de droite** : réglage fin de chaque dipôle (valeur, régime sinusoïdal amplitude/fréquence/phase, gain des sources liées, interrupteur ouvert/fermé).
- **Barre de résultats** : `U_th`, `Z_th`, `I_N`, puissance maximale transférable, démarche en 6 étapes, superposition, réduction série/parallèle, tableau U/I/P par branche.

### Le moteur (`lib/engine/`)

- **MNA exacte en continu et en sinusoïdal établi** : conductance, sources de tension (MNA), sources de courant, sources liées.
- Fusion des nœuds idéaux (fils, interrupteurs fermés, bobines en continu, sources de tension éteintes).
- Résolution complexe par élimination de Gauss avec pivot partiel + conductance parasite `Gmin`.
- **Thévenin / Norton** : tension à vide, impédance par injection d'un courant de test de 1 A, puis **vérification croisée par court-circuit simulé réel** (écart affiché, typiquement `1e-14 %`).
- **Superposition** : chaque source indépendante est résolue séparément.
- **Réduction symbolique** série/parallèle avec explication de chaque étape.
- Arithmétique complexe et formatage ingénieur (`1,20 kΩ`) sans dépendance externe.

**Validation** (`scripts/verify-engine.ts`) — recoupement contre les résultats analytiques :

```
1. Diviseur de tension          U_th = 6 V, R_th = 500 Ω, I_N = 12 mA        ✓
2. Pont de Wheatstone           U_th ≈ 0 à l'équilibre, R_th = 180 Ω         ✓
3. Circuit RC en sinusoïdal     |Z_th| = 157,177 Ω (1 kΩ ∥ 1/(jωC))          ✓
4. Source de courant + R        U_th = 9,4 V, I_N = 2 mA                     ✓
5. Lectures par branche         I = 10 mA, U = 6 V, P = 30 mW                ✓
6. Réduction série/parallèle    R_éq = 100 Ω en 2 étapes                     ✓
7. VCVS                         V = 0,5 V                                     ✓
8. Équivalence T ⇄ N            U_th = I_N · Z_th à 1e-14                    ✓
```

Les **15 gabarits** de la bibliothèque passent tous le contrôle topologique (bornes valides, masse définie, aucun court-circuit de source, `status = ok`).

---

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
```

Aucune clé n'est nécessaire : le site démarre en **mode démo local** (persistance JSON dans `.data/`).

### Compte de démonstration

```bash
npx tsx scripts/seed-demo.ts
# demo@northev.fr / demo1234  (4 montages d'exemple)
```

### Vérifier le moteur

```bash
npx tsx scripts/verify-engine.ts
```

---

## Configuration (`.env.local`)

Copiez `.env.example`. Tout est optionnel.

| Variable | Effet |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Historique synchronisé dans Supabase (sinon JSON local) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Les agents répondent via GPT (sinon moteur local) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Les agents répondent via Gemini |
| `DATA_DIR` | Emplacement du fichier JSON de démo |

### Supabase

Exécutez [`supabase/schema.sql`](supabase/schema.sql) dans l'éditeur SQL du projet, puis renseignez les clés.
Les tables `profiles`, `circuits`, `rooms` et `room_events` sont créées avec index, triggers `updated_at` et RLS activée.
Le serveur utilise la clé `service_role` : elle ne quitte jamais le backend. La synchronisation est déclenchée depuis `/compte` (bouton **Synchroniser**) et à chaque sauvegarde.

### Agents IA

Les cinq agents **calculent réellement** : ils consomment le solveur nodal et la réduction symbolique, puis rédigent l'explication.
- **Sans clé** : réponse produite par le moteur local (`provider: "local"`), vérifiable et déterministe.
- **Avec clé** : le contexte (composants + résultats vérifiés) est envoyé à OpenAI ou Gemini ; la réponse est étiquetée `provider: "openai" | "gemini"`.
- Les clés ne sont **jamais** exposées au navigateur : tout passe par `/api/ai`.
- Si l'appel échoue, l'agent retombe automatiquement sur le moteur local et le signale dans `warning`.

---

## Comptes & multiwork

- Mots de passe hachés **scrypt** (`N=16384, r=8, p=1`) + sel aléatoire ; comparaison à temps constant.
- Sessions : cookie `httpOnly`, `sameSite=lax`, 30 jours ; jetons hachés côté serveur.
- Multiwork : l'hôte crée un atelier → un code à 5 chiffres (sans zéro initial) est généré et unique parmi les ateliers ouverts.
- Le second utilisateur saisit le code → il rejoint l'atelier, apparaît dans la présence et peut éditer le montage.
- Diffusion par **Server-Sent Events** (`/api/rooms/[code]/events`) : révisions, présence et chat. Repli par interrogation périodique si le flux est coupé.

---

## Exports

| Format | Contenu |
|---|---|
| **PNG** ×2 | Schéma vectoriel rendu au canvas, cartouche de résultats intégré |
| **SVG** | Vectoriel autonome, éditable (Figma / Illustrator) |
| **HTML** | Page autonome : schéma + métriques + tableau des composants |
| **JSON** | Réimportable via `/api/import` ou le studio |
| **Markdown** | Compte rendu de TP (équations, valeurs, tableau) |
| **Invitation PNG** | Carte avec code d'atelier à 5 chiffres et nom de l'hôte |

---

## Structure

```
app/                    pages (App Router) + routes API
  api/auth/*            inscription, connexion, déconnexion, session
  api/circuits/*        historique CRUD + favoris + synchro cloud
  api/rooms/*           ateliers multiwork, présence, chat, SSE
  api/ai                hub d'agents (local / OpenAI / Gemini)
  api/import, solve      import texte/JSON, calcul serveur
components/
  shell/ ui/            navigation, toasts, avatars, thèmes
  studio/               canvas SVG, palette, inspecteur, résultats
  marketing/            vignettes néon de la bibliothèque
lib/
  engine/               types, complex, linalg, solver, equivalent, reduce, format
  studio/               géométrie de grille, doc, export, symboles SVG
  ai/                   définitions d'agents, moteur local, fournisseurs
  db/                   store JSON, dépôt, Supabase
  auth/                 scrypt, sessions, thèmes
supabase/schema.sql     schéma complet (tables, index, triggers, RLS)
scripts/                vérification moteur + seed démo
```

---

## Modèle de données (montage)

```ts
{
  name: string, notes?: string,
  components: Array<{ id, kind, a: "x,y", b: "x,y", value, label?, ac?, gain?, closed?, ctrl? }>,
  ground: "x,y",
  terminals: { a: "x,y" | null, b: "x,y" | null },
  regime: "dc" | "ac",
  frequency: number   // Hz, régime sinusoïdal
}
```

Chaque broche est un **nœud de grille** : deux broches posées sur la même case sont électriquement reliées. Les fils et interrupteurs fermés fusionnent les nœuds.

---

## Limites assumées

- Régime sinusoïdal **établi uniquement** (pas de régime transitoire ni de simulation temporelle).
- Les transformateurs, mutuelles et composants non linéaires (diodes) ne sont pas modélisés.
- Trois champs `import` (texte, JSON, gabarit) valident les données par **Zod** avant toute résolution.
