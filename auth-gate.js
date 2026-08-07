// Gate di autenticazione condiviso fra le app aziendali.
//
// Stesso file, identico, in magazzino-gestionale e ordini: l'API firebase.auth()
// e' la stessa nella 8.x namespaced e nella compat 9.x/10.x, quindi non serve
// una variante per app. Se lo modifichi qui, riportalo anche nell'altro repo.
//
// Cosa fa:
//   - inizializza Firebase (una volta sola: se l'app ha gia' chiamato
//     initializeApp non lo rifa', altrimenti otterrebbe "duplicate-app");
//   - copre la pagina con una schermata di accesso finche' non c'e' un utente;
//   - espone AuthGate.pronto(cb), che esegue cb solo a utente autenticato.
//
// L'app NON deve toccare Firestore prima di AuthGate.pronto(): con le regole
// chiuse ogni lettura anonima fallisce con permission-denied.
//
// Il controllo vero sta nelle regole Firestore/Storage, non qui: questa e'
// soltanto l'interfaccia. Non aggiungere allowlist di UID lato client, darebbe
// l'illusione di una protezione che il browser puo' aggirare.

(function () {
  'use strict';

  var CONFIG = {
    apiKey: 'AIzaSyCLdOfp4z3FUJX2xt-xBZciyjxJZWeoh7A',
    authDomain: 'magazzino-edile-pos.firebaseapp.com',
    projectId: 'magazzino-edile-pos',
    storageBucket: 'magazzino-edile-pos.firebasestorage.app',
    messagingSenderId: '696561179056',
    appId: '1:696561179056:web:fc6b1db62ed256fd3fde75'
  };

  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.error('[AuthGate] SDK Firebase Auth non caricato: manca lo script firebase-auth?');
    return;
  }

  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(CONFIG);
  }

  var auth = firebase.auth();
  var codaCallback = [];
  var utenteCorrente = null;
  var overlay = null;

  // --- messaggi di errore ------------------------------------------------

  function messaggioErrore(err) {
    switch ((err && err.code) || '') {
      case 'auth/invalid-email':
        return 'Indirizzo email non valido.';
      case 'auth/user-disabled':
        return 'Utente disabilitato.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email o password errati.';
      case 'auth/too-many-requests':
        return 'Troppi tentativi falliti. Riprova fra qualche minuto.';
      case 'auth/network-request-failed':
        return 'Connessione assente: impossibile raggiungere Firebase.';
      default:
        return 'Accesso non riuscito. Riprova.';
    }
  }

  // --- schermata di accesso ----------------------------------------------

  function creaOverlay() {
    var el = document.createElement('div');
    el.id = 'authGateOverlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'background:#0f172a',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
    ].join(';');

    el.innerHTML =
      '<form id="authGateForm" style="width:100%;max-width:360px;background:#fff;' +
      'border-radius:12px;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,.3)">' +
      '<h1 style="margin:0;font-size:18px;color:#0f172a">Accesso richiesto</h1>' +
      '<p style="margin:6px 0 20px;font-size:13px;color:#64748b">Questa applicazione contiene dati aziendali.</p>' +
      '<label for="authGateEmail" style="display:block;font-size:13px;font-weight:600;color:#334155">Email</label>' +
      '<input id="authGateEmail" type="email" autocomplete="username" required ' +
      'style="width:100%;box-sizing:border-box;margin:4px 0 14px;padding:9px 11px;font-size:14px;' +
      'border:1px solid #cbd5e1;border-radius:7px">' +
      '<label for="authGatePassword" style="display:block;font-size:13px;font-weight:600;color:#334155">Password</label>' +
      '<input id="authGatePassword" type="password" autocomplete="current-password" required ' +
      'style="width:100%;box-sizing:border-box;margin:4px 0 6px;padding:9px 11px;font-size:14px;' +
      'border:1px solid #cbd5e1;border-radius:7px">' +
      '<p id="authGateErrore" role="alert" style="display:none;margin:10px 0 0;padding:8px 10px;' +
      'font-size:13px;color:#991b1b;background:#fee2e2;border-radius:7px"></p>' +
      '<button id="authGateSubmit" type="submit" ' +
      'style="width:100%;margin-top:18px;padding:10px;font-size:14px;font-weight:600;color:#fff;' +
      'background:#0f172a;border:0;border-radius:7px;cursor:pointer">Accedi</button>' +
      '</form>';

    var form = el.querySelector('#authGateForm');
    var campoErrore = el.querySelector('#authGateErrore');
    var bottone = el.querySelector('#authGateSubmit');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      campoErrore.style.display = 'none';
      bottone.disabled = true;
      bottone.textContent = 'Accesso in corso...';

      var email = el.querySelector('#authGateEmail').value.trim();
      var password = el.querySelector('#authGatePassword').value;

      auth.signInWithEmailAndPassword(email, password)
        .catch(function (err) {
          campoErrore.textContent = messaggioErrore(err);
          campoErrore.style.display = 'block';
        })
        .then(function () {
          bottone.disabled = false;
          bottone.textContent = 'Accedi';
        });
    });

    return el;
  }

  // Coprire con un overlay non basta: senza "inert" i controlli dell'app
  // restano raggiungibili col tab e visibili ai lettori di schermo, anche se
  // graficamente nascosti. Marchiamo cio' che disattiviamo noi, per non
  // rimuovere un inert che appartenesse gia' alla pagina.
  function applicaInert(attivo) {
    var radice = document.body;
    if (!radice) return;
    for (var i = 0; i < radice.children.length; i++) {
      var el = radice.children[i];
      if (el === overlay) continue;
      if (attivo) {
        if (!el.hasAttribute('inert')) {
          el.setAttribute('inert', '');
          el.setAttribute('data-authgate-inert', '');
        }
      } else if (el.hasAttribute('data-authgate-inert')) {
        el.removeAttribute('inert');
        el.removeAttribute('data-authgate-inert');
      }
    }
  }

  function mostraAccesso() {
    if (!overlay) overlay = creaOverlay();
    if (!overlay.isConnected) {
      (document.body || document.documentElement).appendChild(overlay);
    }
    applicaInert(true);
    var campo = overlay.querySelector('#authGateEmail');
    if (campo) campo.focus();
  }

  function nascondiAccesso() {
    applicaInert(false);
    if (overlay && overlay.isConnected) overlay.remove();
  }

  // --- ciclo di vita ------------------------------------------------------

  auth.onAuthStateChanged(function (utente) {
    utenteCorrente = utente;

    if (!utente) {
      // Anche a sessione scaduta: ricompare l'accesso senza ricaricare.
      if (document.body) mostraAccesso();
      else document.addEventListener('DOMContentLoaded', mostraAccesso);
      return;
    }

    nascondiAccesso();
    var daEseguire = codaCallback;
    codaCallback = [];
    daEseguire.forEach(function (cb) {
      try { cb(utente); } catch (err) { console.error('[AuthGate] callback fallita', err); }
    });
  });

  window.AuthGate = {
    /** Esegue cb quando c'e' un utente autenticato. Se c'e' gia', subito. */
    pronto: function (cb) {
      if (utenteCorrente) cb(utenteCorrente);
      else codaCallback.push(cb);
    },
    /** Utente corrente, o null. */
    utente: function () { return utenteCorrente; },
    /** Esce e rimette la schermata di accesso. */
    logout: function () { return auth.signOut(); }
  };
})();
