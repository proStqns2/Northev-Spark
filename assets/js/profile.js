/* =========================================================
   Northev Spark — gestion du profil
   - Profil (nom, pseudo, poste, bio, contact…) modifiable
     depuis la page profil.html, persisté dans localStorage
     sous la clé "northev.profile".
   - L'avatar est redimensionné en 256x256 (canvas) avant
     stockage pour rester léger.
   - L'en-tête (mini-avatar) et l'accueil s'affichent en
     direct via l'événement "nvs:profile".
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'northev.profile';
  var EVENT = 'nvs:profile';
  var BIO_MAX = 300;

  var DEFAULTS = {
    firstName: 'Alex',
    lastName: 'Northev',
    username: 'alex.northev',
    job: 'Étudiant · Électronique',
    location: 'Marrakech, Maroc',
    email: 'alex@northev.dev',
    website: 'https://northev.dev',
    github: 'proStqns2',
    bio: 'Passionné de circuits et de développement web. Ceci est un profil de démonstration — cliquez sur « Modifier le profil » pour le personnaliser.',
    avatar: ''
  };

  function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? Object.assign(cloneDefaults(), JSON.parse(raw)) : cloneDefaults();
    } catch (e) { return cloneDefaults(); }
  }

  function save(profile) {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch (e) {
      toast('Enregistrement impossible (stockage local plein ?)');
      return false;
    }
    document.dispatchEvent(new CustomEvent(EVENT));
    return true;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent(EVENT));
  }

  /* ---------------- Petite notification ---------------- */

  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast--out');
      setTimeout(function () { el.remove(); }, 350);
    }, 2400);
  }

  /* ---------------- Utilitaires ---------------- */

  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || '';
    return el;
  }

  function setRow(id, visible) {
    var el = $(id);
    if (el) el.hidden = !visible;
    return el;
  }

  function prettyName(p) {
    return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.username || 'Anonyme';
  }

  function prettyUrl(v) { return String(v || '').replace(/^https?:\/\//i, '').replace(/\/+$/, ''); }

  function initialsOf(p) {
    var a = (p.firstName || '').trim().charAt(0);
    var b = (p.lastName || '').trim().charAt(0);
    return (a + b).toUpperCase() || String(p.username || '?').charAt(0).toUpperCase();
  }

  function fillAvatar(node, p) {
    if (!node) return;
    node.textContent = '';
    if (p.avatar) {
      var img = document.createElement('img');
      img.src = p.avatar;
      img.alt = 'Photo de profil';
      node.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.textContent = initialsOf(p);
      span.setAttribute('aria-hidden', 'true');
      node.appendChild(span);
    }
  }

  /* ---------------- Affichage global (avatar nav + accueil) ---------------- */

  function renderShared(p) {
    var nav = $('navAvatar');
    if (nav) {
      fillAvatar(nav, p);
      nav.title = prettyName(p);
    }
    setText('homeName', prettyName(p));
    setText('homeUsername', '@' + p.username);
    setText('homeJob', [p.job, p.location].filter(Boolean).join(' · '));
    fillAvatar($('homeAvatar'), p);
  }

  /* ---------------- Carte profil (mode consultation) ---------------- */

  function renderView() {
    var p = load();
    renderShared(p);

    var view = $('profileView');
    if (!view) return;

    fillAvatar($('pvAvatar'), p);
    setText('pvName', prettyName(p));
    setText('pvUsername', '@' + p.username);
    setText('pvJob', p.job);
    setText('pvLocation', p.location);

    var email = $('pvEmail');
    if (email) {
      email.textContent = p.email || '';
      email.href = p.email ? 'mailto:' + p.email : '#';
    }
    setRow('rowEmail', !!p.email);

    var site = $('pvWebsite');
    if (site) {
      site.textContent = prettyUrl(p.website);
      site.href = p.website || '#';
      site.rel = 'noopener';
      site.target = '_blank';
    }
    setRow('rowWebsite', !!p.website);

    var gh = $('pvGithub');
    if (gh) {
      gh.textContent = p.github ? '@' + p.github : '';
      gh.href = p.github ? 'https://github.com/' + encodeURIComponent(p.github) : '#';
      gh.rel = 'noopener';
      gh.target = '_blank';
    }
    setRow('rowGithub', !!p.github);

    setText('pvBio', p.bio);
    setRow('rowBio', !!p.bio);
  }

  /* ---------------- Formulaire d'édition ---------------- */

  var pendingAvatar = '';

  var FIELDS = ['firstName', 'lastName', 'username', 'job', 'location', 'email', 'website', 'github', 'bio'];

  function fieldId(k) { return 'f' + k.charAt(0).toUpperCase() + k.slice(1); }

  function showError(name, message) {
    var input = $(fieldId(name));
    var err = document.querySelector('.error[data-for="' + fieldId(name) + '"]');
    if (input) input.classList.toggle('input--invalid', !!message);
    if (err) err.textContent = message || '';
    return !message;
  }

  function fillForm(p) {
    FIELDS.forEach(function (k) {
      var el = $(fieldId(k));
      if (el) el.value = p[k] || '';
    });
    pendingAvatar = p.avatar || '';
    fillAvatar($('evAvatar'), p);
    updateCounter();
    FIELDS.forEach(function (k) { showError(k, ''); });
  }

  function updateCounter() {
    var bio = $('fBio');
    var out = $('bioCount');
    if (out && bio) out.textContent = bio.value.length + ' / ' + BIO_MAX;
  }

  function collect() {
    var ok = true;

    var firstName = $('fFirstName').value.trim();
    ok = showError('firstName', firstName ? '' : 'Prénom requis.') && ok;

    var lastName = $('fLastName').value.trim();
    ok = showError('lastName', lastName ? '' : 'Nom requis.') && ok;

    var username = $('fUsername').value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
    ok = showError('username', /^[a-z0-9._-]{2,30}$/.test(username) ? '' : '2 à 30 caractères : lettres, chiffres, point, tiret, underscore.') && ok;

    var email = $('fEmail').value.trim();
    ok = showError('email', !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Adresse e-mail invalide.') && ok;

    var website = $('fWebsite').value.trim();
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    if (website) {
      try { new URL(website); showError('website', ''); }
      catch (e) { ok = showError('website', 'URL invalide (ex. : exemple.com).') && ok; }
    } else {
      showError('website', '');
    }

    var github = $('fGithub').value.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/+$/, '').replace(/^@/, '');
    ok = showError('github', !github || /^[\w-]{1,39}$/.test(github) ? '' : 'Pseudo GitHub invalide.') && ok;

    var bio = $('fBio').value.trim().slice(0, BIO_MAX);

    if (!ok) return null;

    return {
      firstName: firstName,
      lastName: lastName,
      username: username,
      job: $('fJob').value.trim(),
      location: $('fLocation').value.trim(),
      email: email,
      website: website,
      github: github,
      bio: bio,
      avatar: pendingAvatar
    };
  }

  function showView() {
    var view = $('profileView');
    var edit = $('profileEdit');
    if (!view || !edit) return;
    edit.hidden = true;
    view.hidden = false;
    renderView();
  }

  function showEdit() {
    var view = $('profileView');
    var edit = $('profileEdit');
    if (!view || !edit) return;
    fillForm(load());
    view.hidden = true;
    edit.hidden = false;
    var first = $('fFirstName');
    if (first) first.focus();
  }

  /* Redimensionne l'image en carré 256x256 avant de la stocker. */
  function processAvatar(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choisissez un fichier image (JPG, PNG…).'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var S = 256;
        var canvas = document.createElement('canvas');
        canvas.width = S;
        canvas.height = S;
        var ctx = canvas.getContext('2d');
        var s = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, S, S);
        pendingAvatar = canvas.toDataURL('image/jpeg', 0.85);
        fillAvatar($('evAvatar'), {
          avatar: pendingAvatar,
          firstName: $('fFirstName').value,
          lastName: $('fLastName').value,
          username: $('fUsername').value
        });
      } catch (e) {
        toast('Impossible de traiter cette image.');
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast('Image illisible.');
    };
    img.src = url;
  }

  function initForm() {
    var editBtn = $('editBtn');
    var cancelBtn = $('cancelBtn');
    var resetBtn = $('resetBtn');
    var form = $('profileForm');
    if (!editBtn || !form) return;

    editBtn.addEventListener('click', showEdit);
    if (cancelBtn) cancelBtn.addEventListener('click', showView);

    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (window.confirm('Réinitialiser le profil avec les valeurs par défaut ?')) {
        reset();
        fillForm(load());
        showView();
        toast('Profil réinitialisé.');
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var profile = collect();
      if (!profile) { toast('Vérifiez les champs en rouge.'); return; }
      if (save(profile)) {
        showView();
        toast('Profil enregistré ✓');
      }
    });

    form.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('profileEdit').hidden) showView();
    });

    /* Avatar */
    var avatarBtn = $('avatarBtn');
    var avatarInput = $('avatarInput');
    var avatarRemoveBtn = $('avatarRemoveBtn');
    if (avatarBtn && avatarInput) {
      avatarBtn.addEventListener('click', function () { avatarInput.click(); });
      avatarInput.addEventListener('change', function () {
        processAvatar(avatarInput.files && avatarInput.files[0]);
        avatarInput.value = '';
      });
    }
    if (avatarRemoveBtn) {
      avatarRemoveBtn.addEventListener('click', function () {
        pendingAvatar = '';
        fillAvatar($('evAvatar'), {
          firstName: $('fFirstName').value,
          lastName: $('fLastName').value,
          username: $('fUsername').value
        });
      });
    }

    var bio = $('fBio');
    if (bio) bio.addEventListener('input', updateCounter);

    var closeBtn = $('closeEdit');
    if (closeBtn) closeBtn.addEventListener('click', showView);
  }

  /* ---------------- Démarrage ---------------- */

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    renderView();
    initForm();
    document.addEventListener(EVENT, renderView);
  });
})();
