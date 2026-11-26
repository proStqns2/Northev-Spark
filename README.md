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

## Trois couches techniques

| Couche | Rôle | Dossier | Port |
|---|---|---|---|
| **Next.js 15** | site, studio, moteur de calcul, projets, API REST | `app/`, `lib/`, `components/` | 3000 |
| **Node.js** | serveur temps réel autonome (WebSocket natif, zéro dépendance) | `server/` | 4100 |
| **Angular 20** | atelier collaboratif (signals, zoneless) | `angular-workshop/` | 4300 |

Le serveur Node est indépendant : il ne calcule rien, il synchronise (curseurs,
présence, chat, révisions). Next.js et Angular sont deux clients du même protocole.

```bash
node server/realtime.mjs         # temps réel (ws://localhost:4100)
npm run dev                      # Next.js  → http://localhost:3000
cd angular-workshop && npm i && npm start   # Angular → http://localhost:4300
```

Le serveur Node expose aussi une API de secours sans WebSocket :
`GET /health`, `GET|POST /api/rooms`, `GET|PATCH|DELETE /api/rooms/:code`,
`POST /api/rooms/:code/presence`, `POST /api/rooms/:code/chat`.

### Symboles normalisés

Les captures de référence de la branche `assets/screenshots/` (bobine L,
résistance R, condensateur C, source E, source i) ont été copiées dans
`public/symbols/reference/` et servent de modèle à
`components/studio/symbols/NormSymbol.tsx` :

- résistance = **rectangle** CEI (et non zigzag), bobine = 4 arches + noyau,
  condensateur = deux armatures, source de courant = cercle + flèche traversante ;
- le même dessin sert dans la palette **Build Box**, sur la grille, dans les
  exports PNG/SVG/HTML (`lib/studio/symbolSvg.ts`) et dans le client Angular ;
- la page `/symboles` présente chaque capture à côté de sa version vectorielle.

La palette **Build Box** (`components/studio/BuildBox.tsx`) reprend la mise en
page du manuel : groupes titrés (Essentiels, Sources idéales, Éléments passifs,
Sources de signal, Charge & réglage) et tuiles carrées à grand symbole.

---

## Comptes & multiwork

- Mots de passe hachés **scrypt** (`N=16384, r=8, p=1`) + sel aléatoire ; comparaison à temps constant.
- Sessions : cookie `httpOnly`, `sameSite=lax`, 30 jours ; jetons hachés côté serveur.
- Multiwork : l'hôte crée un atelier → un code à 5 chiffres (sans zéro initial) est généré et unique parmi les ateliers ouverts.
- Le second utilisateur saisit le code → il rejoint l'atelier, apparaît dans la présence et peut éditer le montage.
- Diffusion par **Server-Sent Events** (`/api/rooms/[code]/events`) : révisions, présence, curseurs et chat. Repli par interrogation périodique si le flux est coupé.

### Curseurs partagés (style Canva)

Chaque participant voit le curseur des autres se déplacer **en direct et interpolé** sur la grille.

| Élément | Rôle |
|---|---|
| `POST /api/rooms/[code]/cursor` | publie la position (cellules de grille), l'outil actif, l'élément survolé |
| `GET /api/rooms/[code]/events` | un seul flux SSE ; événements `ready`, `presence`, `cursors`, `revision`, `chat`, `room-closed` |
| `perfect-cursors` | interpolation par spline des points reçus → mouvement fluide à 60 fps |
| `hooks/useCollaboration.ts` | sous-écrit la publication (throttle 100 ms), les participants et le repli polling |

Détails : le serveur ne renvoie les curseurs que si leur signature a changé (~9 Hz), masque les curseurs inactifs depuis 12 s, et pousse un `heartbeat` toutes les 15 s. Le client dessine les curseurs distants au-dessus du canvas (`CursorOverlay`) avec pastille de nom colorée, et publie son propre pointeur converti en cellules par `getScreenCTM()`.

### Projets

Un projet regroupe plusieurs montages, ses membres et ses ateliers.

- `/projets` — grille de cartes, recherche, modale de création (nom, description, couleur, montages de départ issus des gabarits).
- `/projets/[id]` — onglets **Montages** (miniatures SVG, `U_th`/`Z_th`/`I_N` calculés, rattachement d'un montage existant), **Membres** (invitation par e-mail), **Ateliers** (ouverture d'un atelier rattaché au projet + codes actifs), **Paramètres** (renommage, suppression propriétaire).
- API : `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/[id]`, `POST /api/projects/[id]/members`, `POST /api/projects/[id]/circuits`.
- Le studio propose un sélecteur « Projet » dans sa barre d'outils ; la sauvegarde envoie `projectId`. Le hub Multiwork permet de rattacher un atelier à un projet et de filtrer les sessions par projet.

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
  api/rooms/*           ateliers multiwork, présence, curseurs, chat, SSE
  api/projects/*        projets, membres, rattachement de montages
  projets/ symboles/    pages projets et bibliothèque de symboles
  api/ai                hub d'agents (local / OpenAI / Gemini)
  api/import, solve      import texte/JSON, calcul serveur
components/
  shell/ ui/            navigation, toasts, avatars, thèmes
  studio/cursors/       PerfectCursor (spline) + CursorOverlay (curseurs distants)
  studio/               canvas SVG, palette, inspecteur, résultats
hooks/useCollaboration.ts  présence + curseurs temps réel (SSE, repli polling)
  marketing/            vignettes néon de la bibliothèque
lib/
  engine/               types, complex, linalg, solver, equivalent, reduce, format
  studio/               géométrie de grille, doc, export, symboles SVG
  ai/                   définitions d'agents, moteur local, fournisseurs
  db/                   store JSON, dépôt, Supabase
  auth/                 scrypt, sessions, thèmes
server/                 serveur temps réel Node (WebSocket natif + API REST)
angular-workshop/       client Angular de l'atelier collaboratif
public/symbols/         captures de référence des symboles du cours
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
