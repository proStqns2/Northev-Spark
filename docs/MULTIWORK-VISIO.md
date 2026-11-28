# Multiwork — visio et curseurs partagés

Ce document décrit l'ajout « visio d'atelier + curseurs enrichis » au mode
Multiwork. Rien n'a été retiré de l'existant : ce sont des **calques additifs**
autour de la collaboration déjà en place (SSE, fusion à trois branches, verrous).

## 1. La visio, sans serveur média

```
Alice ──getUserMedia──► RTCPeerConnection ◄──► RTCPeerConnection ◄──getUserMedia── Bob
   │                          ▲                        ▲                            │
   └──POST /signal ──► boîte aux lettres en mémoire ──► flux SSE ──► POST /signal ──┘
```

* **Le média ne transite pas par le serveur.** WebRTC négocie une connexion
  directe entre les deux navigateurs ; le serveur ne voit jamais l'image ni le son.
* **La signalisation utilise le canal existant** : `POST /api/rooms/:code/signal`
  dépose offer/answer/ICE dans une boîte aux lettres **volatile** (mémoire vive,
  TTL 45 s, plafond 240 messages), et le flux SSE (`event: signal`) la vide vers
  son destinataire. Aucune ligne n'est écrite sur disque ni dans Supabase.
* **Pas de « glare »** : le plus petit identifiant propose (`shouldInitiate`),
  l'autre répond. Règle calculée des deux côtés, donc aucune coordination.
* **Maillage borné** : `MAX_CALL_PEERS = 4` connexions par navigateur.
* **Reprise** : une connexion en échec est retentée une fois côté proposeur ;
  le bouton « relancer » refait une session propre.
* **STUN publics** seulement (Google, Cloudflare). Derrière deux NAT symétriques
  un relais TURN serait nécessaire : ce cas affiche l'erreur et propose de relancer.

États publiés dans la présence (`POST /api/rooms/:code/media`) : `live`, `mic`,
`cam`, `session`. `updateCursor` préserve ce bloc, donc bouger le curseur ne
coupe jamais la caméra.

## 2. Ce que l'on voit des autres (curseurs)

| Calque | Rôle | Réglable |
| --- | --- | --- |
| sillage | les ~900 ms de trajectoire derrière le curseur | oui |
| clic | anneau au moment où le pair appuie | non (toujours) |
| fenêtre du pair | cadre de la portion de montage qu'il regarde | oui |
| étiquette | nom, outil, dipôle sélectionné, micro/caméra | oui |
| parole | anneau vert quand le pair parle | oui (via visio) |
| suivi | épingler un pair : son curseur reste en évidence | geste |

Réglages persistés par navigateur (`northev.cursors.v1`) : forme (flèche / point /
halo), taille 80–140 %, et les quatre interrupteurs ci-dessus.

## 3. Fichiers

* `lib/collab/media.ts` — logique pure : qui propose, validation des signaux,
  libellés, seuil de parole.
* `lib/collab/cursorTrails.ts` — sillage (borné en nombre et en durée).
* `lib/collab/mediaBus.ts` — bus « en train de parler » (évite cinq niveaux de props).
* `hooks/useMediaCall.ts` — WebRTC : entrée/sortie, offre/réponse/ICE, bascules.
* `hooks/useCursorPreferences.ts` — réglages d'affichage persistés.
* `components/multiwork/CallPanel.tsx` — mosaïque + commandes (colonne ou vignette).
* `components/studio/cursors/CursorOverlay.tsx` — calque de curseurs.
* `components/studio/cursors/CursorPreferences.tsx` — panneau de réglage.
* Serveur : `lib/db/store.ts` (`RoomMedia`, `RoomSignal`), `lib/db/repo.ts`
  (`setRoomMedia`, `pushRoomSignal`, `roomSignalsFor`), `lib/api/roomStream.ts`
  (événement `signal`), `lib/api/routes/rooms.ts` (`/media`, `/signal`).

## 4. Vérifications

```bash
npm test                          # 214 tests, dont média, sillage, calque de curseurs
npm run check:call                # 14 vérifications HTTP de bout en bout (serveur démarré)
```

`scripts/call-check.mjs` (14 vérifications) crée deux comptes réels, un atelier, publie l'état
caméra/micro puis vérifie que l'offre arrive **par le flux SSE** chez le bon
destinataire, et que les garde-fous serveur tiennent (signal démesuré → 413,
sans session → 401, type inconnu → 422).

## 5. Limites connues

* Deux instances Next différentes ne partagent pas la boîte aux lettres en
  mémoire : la négociation suppose que l'atelier est servi par le même processus
  (c'est déjà le cas des curseurs, verrous et « en train d'écrire »).
* Pas d'enregistrement, pas de transcription, pas de partage d'écran.
* Safari/iOS : la caméra peut demander un geste supplémentaire après un
  changement d'onglet ; le bouton « relancer » rétablit la session.
