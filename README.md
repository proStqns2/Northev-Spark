# Northev-Spark

Petit site statique (HTML/CSS/JS, aucune dépendance ni build) :

- **`index.html`** — page d'accueil (présentation + galerie de symboles électriques).
- **`profil.html`** — page de profil : consultation et édition du profil
  (prénom, nom, pseudo, poste, localisation, e-mail, site web, GitHub,
  biographie, avatar recadré automatiquement en 256×256).
- **Thème du site** — panneau « Thème » dans l'en-tête : mode système /
  clair / sombre, couleur d'accent personnalisée (contraste du texte calculé
  automatiquement) et arrondi des coins réglable.

Le profil et le thème sont enregistrés dans le `localStorage` du navigateur
(clés `northev.profile` et `northev.theme`) — rien n'est envoyé à un serveur.

## Lancer en local

Aucune compilation nécessaire, par exemple :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Structure

```
index.html            page d'accueil
profil.html           page de profil (consultation + édition)
assets/css/style.css  styles + variables de thème (clair/sombre)
assets/js/theme.js    logique du thème (mode, accent, rayon, persistance)
assets/js/profile.js  logique du profil (formulaire, validation, avatar, localStorage)
assets/screenshots/   captures des symboles électriques (bobine, résistance…)
```
