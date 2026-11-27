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
| `/express` | **Barre de valeurs R · C · L** en grand + documentation du service Express qui la sert |

### Le studio

- **Barre de valeurs R · C · L** (sous la barre d'outils) : trois champs compacts qui
  acceptent la notation d'ingénieur (`4,7k`, `100nF`, `10 mH`, `1e-6`), plus E et f.
  Chaque frappe relance l'analyse : le service **Express** construit un diviseur
  `R / (L ∥ C)`, le résout et renvoie `U_th`, `Z_th`, `I_N`, la résonance `f₀`,
  le facteur de qualité `Q`, `X_L`, `X_C` et la puissance maximale. **Charger**
  remplace le montage, **Ajouter** pose le bloc à droite sans modifier le
  câblage ni le régime du circuit existant. Les deux actions sont annulables
  dans l’atelier. Le badge indique qui a répondu (`express · leader` ou
  `moteur next` en repli).
- **Grille magnétique** : tracé au glisser, accrochage aux nœuds, déplacement, rotation, inversion, duplication.
- **Palette** : sources E/I, sources liées (VCVS/VCCS), R, C, L, potentiomètre, lampe, fils, interrupteurs, ampèremètre, voltmètre.
- **Animation des électrons** : la vitesse et le sens dérivent du courant réellement calculé (`offset-path` SVG, désactivé si `prefers-reduced-motion`).
- **Barre de droite** : réglage fin de chaque dipôle (valeur, régime sinusoïdal amplitude/fréquence/phase, gain des sources liées, interrupteur ouvert/fermé).
- **Barre de résultats** : `U_th`, `Z_th`, `I_N`, puissance maximale transférable, démarche en 6 étapes, superposition, réduction série/parallèle, tableau U/I/P par branche.
- **Schémas équivalents** : Thévenin et Norton dessinés en SVG, avec une charge `R_L` réglable (0,1 Ω → 1 MΩ) qui affiche `U_L`, `I_L` et `P_L` et signale le transfert maximal quand `R_L ≈ |Z_th|`.

#### Raccourcis du canvas

| Touche | Action |
|---|---|
| molette | zoom centré sur le curseur |
| `Alt` + glisser, bouton du milieu | déplacer la vue |
| `R` | pivoter le dipôle sélectionné (0° → 90° → 180° → 270°) |
| `F` | retourner le dipôle (permuter A et B) |
| `Suppr` / `Retour arrière` | effacer la sélection |
| `Ctrl+Z` / `Ctrl+Y` | annuler / rétablir |
| `A`, `B`, `M` | poser la borne A, la borne B, la masse |
| `V`, `E` | outil sélection, outil gomme |
| `Ctrl+S` | enregistrer le montage |

### Barre de valeurs R · C · L et service Express

Le calcul de la barre vit dans `lib/express/` et sert **deux** points d'entrée :

| Entrée | Rôle |
|---|---|
| `POST /api/values/analyze` (Next) | relais : transmet à Express si `EXPRESS_URL` répond, sinon calcule sur place (`x-spark-service: next`) |
| `POST /api/v1/analyze` (Express, port 4001) | **leader du montage** : validation, cache 30 s, journal, CORS aperçus |
| `GET /api/v1/analyze?r=1k&c=100n&l=10m&f=50` | même calcul en lecture directe |
| `POST /api/v1/preview` | SVG du montage construit |
| `GET /api/v1/values` · `/api/v1/templates` · `/api/v1/health` | bornes/préfixes, bibliothèque résolue, état du service |

Le montage canonique est un **diviseur `R / (L ∥ C)`** fermé sur la source
(la source débite réellement, donc le tableau U/I/P par branche est parlant) :

```
U_th = E · Z_LC / (R + Z_LC)      Z_th = R ∥ Z_LC
Z_LC = jωL / (1 − ω²LC)           f₀ = 1/(2π√(LC))     Q = (1/R)·√(L/C)
```

La même équation est vérifiée dans `lib/express/model.test.ts` (U_th, Z_th,
I_N, f₀, Q, courants réels) et le comportement continu (bobine = fil → sortie
nulle) est testé aussi. Aucune formule n'est inventée : le service appelle le
solveur MNA du dépôt (`lib/engine`), il n'en existe pas de copie.

```bash
npm run express          # service seul, tsx watch → http://localhost:4001
npm run dev:all          # Express (4001) + site Next (3000) ensemble
npm run express:start    # service en production (tsx, aucune build)
```

Variables : `EXPRESS_PORT` (4001), `EXPRESS_URL` (vue par Next pour le relais),
`NEXT_PUBLIC_EXPRESS_URL` (appel direct depuis le navigateur),
`EXPRESS_SERVICE_KEY` (en-tête `x-spark-key` exigé sur les POST),
`EXPRESS_ALLOWED_ORIGIN` (CORS ; par défaut `*.e2b.app`, `*.e2b.dev`, localhost).
Si Express est arrêté, le studio continue de fonctionner : le relais calcule
localement et la barre affiche `moteur next`.

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
npx tsx scripts/verify-engine.ts   # 8 cas analytiques (npm run verify)
npm test                           # solveur, atelier et API
npm run check:studio               # interactions dans l’atelier, site déjà démarré
```

`npm test` couvre le solveur MNA, le simulateur de charge `R_L`, le canal multi-onglets, l’atelier (pose, câblage, historique), le rendu des schémas équivalents, l’API et la barre R·C·L (préfixes SI, résultats analytiques et rendu).

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

### Assistant Gemini (bouton dans le studio)

Le studio expose un bouton **Gemini** qui ouvre deux outils :

| Outil | Ce qu'il fait |
|---|---|
| **Schéma équivalent** | Gemini propose un montage Thévenin/Norton en JSON ; le serveur valide la structure (zod, types autorisés), le **recalcule** avec le solveur, puis mesure l'écart sur U_th et I_N (8 % max en DC). Au-delà, la proposition est affichée mais **non certifiée**. |
| **Rééquilibrer** | 10 contrôles déterministes (aucun appel IA) : bornes, masse, valeurs nulles, source court-circuitée, source de courant ouverte, fréquence AC, doublons… Chaque correction est expliquée. |

**Fournisseurs** — `OPENROUTER_API_KEY` (routeur multi-modèles, format OpenAI), `GEMINI_API_KEY`,
`OPENAI_API_KEY`. Ordre en mode `auto` : OpenRouter → OpenAI → Gemini → moteur local. Le repli est
silencieux pour l'utilisateur (la réponse locale est toujours produite) et la clé est expurgée des erreurs.

**Sécurité de la clé** — la clé n'est jamais dans le bundle client :

- `GEMINI_API_KEY` est lue dans le route handler Node (`/api/ai/schema`), jamais préfixée `NEXT_PUBLIC_` ;
- l'API ne renvoie que `{configured, model, source}` ; les erreurs sont expurgées (`key=***`) ;
- chaque utilisateur peut enregistrer **sa propre clé** depuis `Compte → Clés IA` : elle est
  chiffrée en AES-256-GCM (`SECRET_KEY`) et seule une empreinte du type `AQ.A…yl8A` est réaffichée ;
- priorité d'usage : clé personnelle → clé serveur → message d'aide.

Routes : `GET|POST /api/ai/schema`, `POST /api/ai/balance`, `GET|POST|DELETE /api/profile/keys`.

### Agents IA — les dix tuiles du manuel

`/agents` présente les dix agents, chacun avec son emblème d'origine
(`public/agents/tiles/`, découpé depuis la planche fournie) :

| Agent | Emblème | Rôle |
|---|---|---|
| Théo | Thévenin : série | analyse nodale modifiée, U_th / Z_th |
| Nora | Norton : parallèle | I_N, R_N, cohérence T ⇄ N |
| Équivalence | Équivalence T ⇄ N | passerelle entre les deux modèles |
| Impéda | Thévenin AC : série RL | impédances complexes, phase |
| Bobines | Norton AC : parallèle RL | admittances et régime sinusoïdal |
| Labo T–N | Labo de calcul : T–N | mesures à vide / court-circuit |
| Sources | Transformation de sources | réduction par équivalences locales |
| Hub | Hub principal : équivalence | synthèse et validation |
| Dipôles | Dipôles équivalents | caractéristique U(I) |
| Volt / Mentor | — | audit et pédagogie |

### Agents IA

Les cinq agents **calculent réellement** : ils consomment le solveur nodal et la réduction symbolique, puis rédigent l'explication.
- **Sans clé** : réponse produite par le moteur local (`provider: "local"`), vérifiable et déterministe.
- **Avec clé** : le contexte (composants + résultats vérifiés) est envoyé à OpenAI ou Gemini ; la réponse est étiquetée `provider: "openai" | "gemini"`.
- Les clés ne sont **jamais** exposées au navigateur : tout passe par `/api/ai`.
- Si l'appel échoue, l'agent retombe automatiquement sur le moteur local et le signale dans `warning`.

---

## Une seule application : Next.js + React

| Couche | Rôle | Dossier |
|---|---|---|
| **Next.js 15 (App Router)** | pages React, studio, ateliers | `app/`, `components/` |
| **Route handlers Next** | API REST native : comptes, montages, projets, IA, solveur | `app/api/[...path]/route.ts`, `lib/api/routes/` |
| **Moteur + données** | MNA complexe, agents IA, persistance Supabase | `lib/` |

Le site entier — interface React, contrôle des accès, API, flux temps réel —
vit dans cette application Next.js. Une commande suffit :

```bash
npm run dev      # http://localhost:3000  (site + API)
npm run build && npm start
```

Le seul processus annexe est **facultatif** : le service Express (`server/express.ts`,
port 4001) qui sert la barre de valeurs R·C·L et relaie éventuellement vers Next
(`NEXT_INTERNAL_URL`). Sans lui, tout fonctionne en repli local.

L'API est répartie dans `lib/api/routes/*.ts` sous forme de tables
`[verbe, chemin, handler]`, exécutées par le route handler
`app/api/[...path]/route.ts` (`Request` → `Response` Web). Aucun port
supplémentaire n'est ouvert, aucun proxy n'intervient : ce que le navigateur
appelle sous `/api/*` est exécuté dans le même processus que le rendu React.

Routes exposées : `/api/auth/*`, `/api/circuits`, `/api/projects/*`,
`/api/solve`, `/api/ai/*`, `/api/templates`, `/api/profile/*`, `/api/rooms/*`,
`/api/values/*`, `/api/import`, `/api/health`.

Temps réel : `/api/rooms/:code/events` (SSE — présence, curseurs, révisions,
chat) et le canal `BroadcastChannel` côté navigateur, tous deux dans Next.

En production, le même build se déploie tel quel sur Vercel : `next build`
puis fonctions serverless, les variables (`SECRET_KEY`, `SUPABASE_*`, clés IA)
étant fournies par l'environnement.

### Symboles normalisés

Les captures de référence de la branche `assets/screenshots/` (bobine L,
résistance R, condensateur C, source E, source i) ont été copiées dans
`public/symbols/reference/` et servent de modèle à
`components/studio/symbols/NormSymbol.tsx` :

- résistance = **rectangle** CEI (et non zigzag), bobine = 4 arches + noyau,
  condensateur = deux armatures, source de courant = cercle + flèche traversante ;
- le même dessin sert dans la palette **Build Box**, sur la grille, dans les
  exports PNG/SVG/HTML (`lib/studio/symbolSvg.ts`) ;
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

### Collaboration entre onglets (sans serveur)

Ouvrir le studio dans deux onglets suffit à tester le mode Multiworks : `hooks/useMultiTab.ts` relie les onglets par **BroadcastChannel** (`lib/collab/channel.ts`), sans compte ni réseau.

| Message | Effet |
|---|---|
| `doc` | le montage entier est répliqué dans les autres onglets (garde-fou anti-boucle) |
| `lock` | verrou souple `lockedBy` : le composant en cours d'édition est encadré en pointillés chez les autres, avec le nom de l'éditeur |
| `activity` | journal d'activité (« Ryad ajoute R1 », « règle R1 → 2,2 kΩ ») |
| `cursor` | curseur nommé, diffusé à ~10 Hz, purgé après 4 s de silence |
| `bye` | fermeture de l'onglet : curseurs et verrous sont retirés |

La présence serveur (SSE) et les onglets locaux se cumulent : les curseurs distants et locaux sont fusionnés dans le même overlay.

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
hooks/useMultiTab.ts       collaboration entre onglets (BroadcastChannel)
  marketing/            vignettes néon de la bibliothèque
lib/
  engine/               types, complex, linalg, solver, equivalent, reduce, format
  engine/load.ts        charge R_L branchée sur l'équivalent (U_L, I_L, P_L)
  collab/channel.ts     messages BroadcastChannel (doc, lock, activity, cursor)
  studio/               géométrie de grille, doc, export, symboles SVG
  ai/                   définitions d'agents, moteur local, fournisseurs
  db/                   store JSON, dépôt, Supabase
  auth/                 scrypt, sessions, thèmes
server/                 serveur temps réel Node (WebSocket natif + API REST)
lib/api/                routes API natives servies par Next.js
public/symbols/         captures de référence des symboles du cours
public/brand/           logo isométrique (512/192, version sombre)
public/agents/tiles/    les 10 emblèmes d'agents extraits de la planche
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
