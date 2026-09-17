// Interruttore chiaro/scuro condiviso fra le app del magazzino.
//
// Stesso file, identico, in magazzino-gestionale, ordini e controllo-ddt.
// magazzino-scorte fa la stessa cosa in React con src/lib/tema.ts: stesso
// attributo data-tema, stessi valori 'chiaro' e 'scuro', stessa chiave di
// memoria. Se lo modifichi qui, riportalo anche negli altri repository.
//
// Va caricato nel <head>, PRIMA che il corpo della pagina venga disegnato:
// letto dopo, la pagina comparirebbe un istante col tema sbagliato.
//
//     <script src="tema.js"></script>
//
// Poi, dove serve il bottone:
//
//     Tema.collega(document.getElementById('btnTema'));

(function () {
  'use strict';

  var CHIAVE = 'magazzino.tema';
  var radice = document.documentElement;
  var bottoni = [];

  function leggiSalvato() {
    try {
      var v = localStorage.getItem(CHIAVE);
      return (v === 'chiaro' || v === 'scuro') ? v : null;
    } catch (e) {
      return null; // niente localStorage: si segue il sistema
    }
  }

  function preferenzaSistema() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'scuro' : 'chiaro';
  }

  /** Il tema in vigore adesso: la scelta dell'utente, se c'e', altrimenti quella del sistema. */
  function attuale() {
    return leggiSalvato() || preferenzaSistema();
  }

  function aggiornaBottoni() {
    var tema = attuale();
    var scuro = tema === 'scuro';
    bottoni.forEach(function (b) {
      // L'icona mostra dove si va, non dove si e': e' quello che il dito si aspetta.
      b.textContent = scuro ? '☀️' : '\u{1F319}';
      b.setAttribute('title', scuro ? 'Passa al tema chiaro' : 'Passa al tema scuro');
      b.setAttribute('aria-label', b.getAttribute('title'));
      b.setAttribute('aria-pressed', String(scuro));
    });
  }

  function applica(tema) {
    if (tema) radice.setAttribute('data-tema', tema);
    else radice.removeAttribute('data-tema');
    aggiornaBottoni();
  }

  // Si applica subito, prima del primo disegno.
  applica(leggiSalvato());

  // Se l'utente non ha mai scelto, si segue il sistema anche quando cambia
  // in corsa (il passaggio automatico al tramonto, per esempio).
  if (window.matchMedia) {
    var query = window.matchMedia('(prefers-color-scheme: dark)');
    var reagisci = function () { if (!leggiSalvato()) aggiornaBottoni(); };
    if (query.addEventListener) query.addEventListener('change', reagisci);
    else if (query.addListener) query.addListener(reagisci);
  }

  window.Tema = {
    /** Il tema in vigore: 'chiaro' o 'scuro'. */
    attuale: attuale,

    /** Impone un tema e lo ricorda. */
    imposta: function (tema) {
      if (tema !== 'chiaro' && tema !== 'scuro') return;
      try { localStorage.setItem(CHIAVE, tema); } catch (e) { /* si continua senza ricordarselo */ }
      applica(tema);
    },

    /** Torna a seguire il sistema operativo. */
    automatico: function () {
      try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente da dimenticare */ }
      applica(null);
    },

    /** Dall'uno all'altro. */
    inverti: function () {
      window.Tema.imposta(attuale() === 'scuro' ? 'chiaro' : 'scuro');
    },

    /** Trasforma un bottone nell'interruttore del tema, icona compresa. */
    collega: function (bottone) {
      if (!bottone || bottoni.indexOf(bottone) !== -1) return;
      bottoni.push(bottone);
      bottone.addEventListener('click', window.Tema.inverti);
      aggiornaBottoni();
    }
  };
})();
