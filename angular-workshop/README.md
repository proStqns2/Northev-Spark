# Atelier Angular — Northev Spark

Client **Angular 20** (signals, zoneless) de l'atelier collaboratif. Il parle au
backend Node unifié (`../server/api/`, Fastify) par **WebSocket** : curseurs
interpolés, présence, chat et révisions du montage.

```
Angular (4300)  ──/rt──►  backend Node (4100)  ──ws──►  autres clients
   signals                 Fastify + SSE + WS             Next.js ou Angular
```

## Lancer

Le backend doit tourner (une seule commande, à la racine du dépôt) :

```bash
npm run api                       # http://localhost:4100
```

Puis l'atelier Angular :

```bash
cd angular-workshop
npm install
npm start                         # http://localhost:4300
```

Le proxy de développement (`proxy.conf.json`) redirige `/rt` vers `:4100` en
HTTP **et** en WebSocket — aucune configuration CORS, aucune URL en dur.

## Utilisation

1. **Créer un atelier** → un code à 5 chiffres s'affiche.
2. Ouvrir `http://localhost:4300/?code=12345` dans un autre navigateur (ou
   partager le code) → les deux curseurs se voient en direct.
3. Cliquer deux nœuds de la grille pour poser un dipôle ; la valeur se règle
   dans le panneau de gauche.

Le même code d'atelier fonctionne depuis le studio Next.js (`/multiwork`) :
les deux clients partagent le protocole JSON.

## Protocole

| Client → serveur | Effet |
|---|---|
| `{type:'cursor',x,y,tool,hover}` | publie le curseur (cellules de grille) |
| `{type:'idle'}` | masque le curseur |
| `{type:'activity',activity}` | libellé d'activité dans la présence |
| `{type:'doc',doc}` | publie une nouvelle version du montage |
| `{type:'chat',text}` | message d'équipe |
| `{type:'ping'}` | garde la session vivante |

| Serveur → client | Contenu |
|---|---|
| `welcome` | doc, révision, participants, historique du chat |
| `cursors` | liste des curseurs vivants (diffusée à ~10 Hz) |
| `presence` | participants, activité, inactivité |
| `revision` | nouveau montage + auteur |
| `chat` | message |
| `member-joined` / `member-left` | arrivées et départs |
| `room-closed` | atelier fermé par l'hôte |

## Détails d'implémentation

- **Interpolation** : `RealtimeService.tick()` lisse la position des curseurs
  distants à chaque `requestAnimationFrame` (facteur 0,24) — équivalent du
  `perfect-cursors` utilisé côté Next.js.
- **Zoneless** : `provideZonelessChangeDetection()` — aucun `zone.js`, la vue
  se rafraîchit sur les signals.
- **Identité** : l'`userId` est persisté dans `localStorage`, donc l'utilisateur
  garde sa couleur (palette déterministe par hash) d'une session à l'autre.

## Vérification

```bash
node test-proxy.mjs    # 2 clients WS via le proxy : curseurs + chat
```
