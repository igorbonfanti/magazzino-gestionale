# Storia dell'Applicazione: POS App (pos-app-v2)

Questo documento traccia la storia dello sviluppo e l'evoluzione tecnica dell'applicazione POS (Point of Sale), descrivendone l'architettura e le funzionalità implementate nelle varie fasi di rilascio.

---

## 🚀 Fase 1: La Fondazione - Il POS Offline e Standalone (11-12 Aprile 2026)
**Focus:** Creazione dell'infrastruttura di base e del motore client-side di rendering e ricerca offline.

### Prerogative Tecniche Implementate:
* **Architettura Applicativa SPA:** Applicazione progettata principalmente in HTML, CSS Vanilla e JavaScript. Pensata inizialmente come Single Page Application (SPA) capace di girare interamente all'interno del browser senza l'ausilio di un Web Server di calcolo (Standalone).
* **Gestione Dati Locali (Parsing Excel):** Implementata la lettura e il parsing in memoria (client-side) di file strutturati (Excel) contenenti il listino prezzi per i prodotti.
* **Interfaccia Utente (UI) ed Esperienza (UX):**
  * **Dark Mode Nativia:** Implementazione di un tema scuro moderno per un design di alta qualità, capace di ridurre l'affaticamento visivo.
  * **Motore di Ricerca in Memoria:** Implementazione di una ricerca ultra-rapida full-text sui prodotti, assieme a un sistema di filtri combinabili (Categoria e Fornitore) operanti sui dati caricati in RAM locale.
* **Motore Carrello (Shopping Cart):**
  * Calcolo reattivo del carrello virtuale: aggiunta, rimozione e modifica delle quantità.
  * Sottosistema matematico di calcolo per la quantificazione dei totali netti (imponibile), calcolo/scorporo dell'IVA dinamica e totalizzazione al lordo.
* **Generazione Layout di Stampa:** Interfacce specifiche e print-media queries per estrarre la vista in documentazione cartacea o PDF natively nel browser del client.

---

## 📱 Fase 2: Ottimizzazione PWA e Personalizzazione Operatore (12 Aprile 2026)
**Focus:** Ottimizzazione profonda per dispositivi mobili (Progressive Web App) e implementazione di logiche di persistenza "per-device".

### Prerogative Tecniche Implementate:
* **Adattabilità Responsive / PWA Workflow:** Potenziamento del frontend per rispondere ottimamente come Progressive Web App (PWA) su smartphone e tablet, fornendo ai singoli operatori una esperienza nativa e un'interfaccia reattiva (UI touch-friendly).
* **Importazione Anagrafica Multipla:** Oltre al listino prezzi, il sistema ora esegue l'ingestion in parallelo di un database `clienti.xlsx`. Questo ha sbloccato la personalizzazione di livello enterprise dei formati PDF (intestazione personalizzata e riferimento cliente).
* **Storage e Persistenza Locale (Client-Side):**
  * **Sistema Articoli Preferiti ("Starred Items"):** Costruzione di logica Javascript che si appoggia ad API di memorizzazione locale del browser (es. LocalStorage/IndexedDB).
  * **Micro-Localizzazione dell'UX:** Ogni venditore vanta la propria cache di prodotti salvati e i propri "Starred Items" senza confliggere con gli altri, garantendo l'avvio e la compilazione preventivo in tempi ridotti per scenari di vendita ricorrente.

---

## ☁️ Fase 3: Transizione Cloud con Sincronizzazione Firebase (12 Aprile 2026)
**Focus:** Superamento dell'isolamento standalone tramite Backend As A Service (BaaS), introduzione di persistenza remota condivisa.

### Prerogative Tecniche Implementate:
* **Integrazione Architetturale Firebase:** Collegamento dell'appliance JS Vanilla con l'ecosistema cloud di Google Firebase per le logiche di rete e il salvataggio distribuito.
* **Firestore NoSQL Ingestion:**
  * I preventivi completati vengono inviati su Cloud Firestore, conservando uno schema JSON completo (dati cliente, item venduti, totali statici) ai fini di ispezione e archiviazione.
* **Transazioni per Concorrenza Numerica:**
  * Implementazione vitale di query Atomiche (Firestore Transactions) per l'assegnazione dei numeri di preventivo (Incremental Sequencing). Questo risolve la minaccia critica di conflitti documentali generati quando molteplici dispositivi approvano preventivi contemporaneamente.
* **Automazione Flusso Informazioni:**
  * Implementazioni algoritmiche che agganciano i dati anagrafici dal file `clienti.xlsx` (es. `email_cliente`) per innescare un hook di auto-compilazione verso i client di posta locali dell'operatore emittente (con corpi mail autogenerati).
* **Storico Centralizzato Multilingua e UI di Ricerca Backend:**
  * Creazione di una nuova vista dashboard per l'interrogazione remota dello storico generale preventivi.
  * Motore di ricerca Multi-Filtro asincrono, utile per localizzare documenti passati attraverso incroci logici (date range, match cliente), consentirne la revisione ed eventuale ri-emissione.

---

---

## 💶 Fase 4: Sconti Espliciti e Logiche di POS (14 Aprile 2026)
**Focus:** Gestione autonoma della scontistica extra-riga e arrotondamenti cassa in perfetto stile POS.

### Prerogative Tecniche Implementate:
* **Logica Checkout a Cascata:** Implementazione di un calcolo ricorsivo per la detrazione progressiva degli sconti (Sconto excel originario, riduzioni custom del venditore, e arrotondamento).
* **Simulatore Keypad POS:** Introduzione di una maschera numerica intelligente (`inputmode="numeric"`) nel campo di arrotondamento totale, che permette all'operatore di digitare le cifre e auto-popolare i due slot decimali senza input della virgola (es. digitazione rapida da numpad) emulando i classici terminali di cassa.
* **Aggiornamento Architettura Preventivi Cloud:** Il payload JSON del database Cloud Firestore è stato aggiornato per storicizzare gli esatti delta al netto, sia a livello di riga articolo (sconto extra del venditore in percentuale) che in calce al documento (sconto globale).
* **Generazione Nativa Excel:** Sostituzione dell'esportazione CSV con la libreria SheetJS per la scrittura di veri e propri file `.xlsx`. Iniezione di formule Excel native per il calcolo progressivo degli sconti su più fattori (Sconto excel originario e sconti operatore dinamici), permettendo ricalcoli diretti all'interno dei fogli di calcolo scaricati, a prescindere dal Locale linguistico.
* **Math Standardizer:** Introduzione di una funzione di rounding globale per forzare in maniera matematica i calcoli in virgola mobile a 2 decimali progressivi, eliminando le derive millesimali create dal JS rispetto all'approccio di arrotondamento usato da Excel.

---

## ☁️ Fase 5: Major Release v2.0 & Cloud Hub (14 Aprile 2026)
**Focus:** Rilascio della Major Release 2.0.0. Trasformazione dell'applicazione da uno strumento locale a un terminale Cloud PWA a "Zero Setup".

### Prerogative Tecniche Implementate:
* **Firebase Storage Sync:** Implementazione vitale dello scaricamento asincrono. I file di database pesanti `listino.xlsx` e `clienti.xlsx` non devono più essere caricati localmente dal file-system dell'iPad. Sono posizionati centralmente da un admin su Cloud Firebase Storage.
* **Smart Data Fetching (Bandwidth Saver):** All'avvio dell'applicazione i tablet scaricano solamente il Payload Metadati in pochi byte (`.getMetadata()`). Se il payload riporta modifiche lato cloud, esegue il `fetch` asincrono del buffer, rianalizza il dizionario e salva tutto in LocalStorage. Questo azzera letteralmente il costo dei download e garantisce la continuità lavorativa Offline-first.
* **Automazione Setup:** L'interfaccia UI di Upload è stata deprecata ed evoluta in uno Smart Loader animato che indica all'operatore in tempo reale le fasi di sincronizzazione cloud.

---

## 📊 Fase 6: Analisi dei Costi e Marginalità (14 Aprile 2026)
**Focus:** Integrazione dei costi di fornitura per il calcolo e la visualizzazione della redditività in tempo reale durante la preventivazione.

### Prerogative Tecniche Implementate:
* **Integrazione Costi di Acquisto:** Esposizione dei prezzi di costo fornitore nel popup di selezione articoli, nella lista del preventivo in corso e nel riepilogo finale.
* **Calcolo Marginalità Dinamico:** Algoritmo matematico per determinare il margine netto di guadagno in tempo reale, visualizzato sia in valore assoluto che in percentuale (%), consentendo ai venditori di monitorare la redditività delle transazioni per ogni articolo e a livello globale.
* **UI/UX Intuitiva:** Implementazione di badge identificativi coerenti con l'attuale design system (es. indicatori di sconto), in modo da fornire un immediato feedback finanziario senza appesantire la lettura della lista.

---

## 🚚 Fase 7: Smart Tracking e Gestione Cantieri (15 Aprile 2026)
**Focus:** Separazione dei dati logistici dall'anagrafica statica per abilitare la gestione dinamica delle consegne per cliente.

### Prerogative Tecniche Implementate:
* **Disaccoppiamento Dati Operativi:** Separazione delle referenze di recapito telefonico e degli indirizzi di cantiere (destinazione merce) dai dati statici del cliente. Questo permette di elaborare ordini al medesimo committente potendo variare il luogo di lavorazione effettivo.
* **Smart Storage e Autocompletamento:** Introduzione di un sistema intelligente che memorizza silenziosamente i riferimenti logistici digitati per cliente e li suggerisce in fase di redazione nel checkout, velocizzando sensibilmente i follow-up.
* **Refactoring Omnicanale degli Export:** Strutturazione dei nuovi metadati in modo che alimentino direttamente e dinamicamente l'output multipiattaforma: integrati nelle stampe PDF, nell'auto-generazione delle e-mail e inseriti nelle celle dei report in formato nativo Excel (.xlsx).

---

*L'app è così in rapida evoluzione continua da un tool tattico isolato a un ecosistema gestionale omnicanale intelligente, forte di operatività edge-cloud.*

---

## 🧾 Fase 8: Articoli Fuori Listino (17 Settembre 2026)
**Focus:** Preventivare una voce che in anagrafica non esiste, senza toccare il flusso di chi lavora.

* **Via d'uscita dove serve:** la scorciatoia compare sotto una ricerca senza
  risultati, gia' precompilata con il termine digitato, e in un bottone accanto
  ai filtri. Il percorso normale — cerca, clicca, aggiungi — resta identico.
* **Voce una tantum:** descrizione, codice facoltativo, unita' di misura,
  prezzo netto e quantita'. Non entra nel listino: vive nel carrello, viene
  storicizzata nel documento e li' finisce.
* **Identita' di riga:** il carrello non distingue piu' le righe dal solo
  codice, che per queste voci puo' essere vuoto o ripetuto. Ogni voce fuori
  listino porta una chiave propria, quindi due voci uguali restano due righe.
* **Propagazione completa:** carrello, riepilogo, PDF, stampa, Excel (con
  l'unita' di misura in coda alla descrizione, per non rompere le formule),
  email, WhatsApp, salvataggio su Firestore e riapertura dallo storico.
* **Marcatore asimmetrico:** a schermo la riga porta il badge "fuori listino";
  nella stampa e nel PDF sparisce, perche' al cliente non interessa da quale
  archivio arriva.

### Correzioni incluse
* **Foglio di stile troncato:** una graffa mancante in `styles.css` lasciava
  aperta la media query dei 768px. Tutto il CSS successivo — l'intera tabella
  dello Storico e le regole del modale cliente — era inerte su desktop.
* **Sconto extra perso:** riaprendo un preventivo dallo storico, lo sconto
  di riga del venditore non veniva ricaricato e il documento tornava a
  prezzo pieno.

---

## 🎨 Fase 9: Tema Condiviso v2 (17 Settembre 2026)
**Focus:** Un solo linguaggio visivo per le quattro app, leggibile anche in cantiere.

* **Un file, quattro repository:** `tema.css` e `tema.js`, identici in
  magazzino-gestionale, magazzino-scorte, ordini e controllo-ddt. Nessuna app
  ridefinisce piu' i colori nel proprio `:root`. Regole e procedura di
  adozione in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).
* **Tema chiaro:** la v1 era solo scura e sotto il sole non si leggeva. Ora
  il tema segue il sistema operativo, e l'interruttore in testata lo forza e
  lo ricorda.
* **Contrasti misurati:** `--text3` — il colore di tutte le intestazioni di
  colonna e dei placeholder — stava a 2.7–3.5:1, sotto la soglia WCAG AA.
  Ogni colore di testo della v2 passa 4.5:1 su ogni superficie, in entrambi i
  temi.
* **Scala tipografica:** intestazioni da 10 a 11px, celle da 12 a 13px, netto
  di riga a 14px. Il listino si legge senza avvicinarsi allo schermo.
* **Listino a schede su telefono:** sotto i 768px la tabella a otto colonne
  scorreva in orizzontale e il prezzo netto restava fuori schermo. Le stesse
  celle diventano una scheda per articolo, col netto in evidenza.
* **Schermata di accesso coerente:** `auth-gate.js` prende i colori dal tema,
  con valori di riserva per le app che non lo caricano ancora.

### Correzioni incluse
* **Storico limitato a 200 documenti:** la ricerca scaricava gli ultimi 200
  preventivi e filtrava nel browser. Superata quella soglia i piu' vecchi
  erano irraggiungibili. Ora l'intervallo di date e' un vincolo della query e
  l'archivio arriva a pagine, con un cursore.
* **Sconto di cassa perso:** riaprendo un documento, l'arrotondamento veniva
  azzerato e il totale non coincideva piu' con l'originale.
* **Perdita di memoria nello storico:** ogni preventivo restava appeso a
  `window['_szQuote_...']` e ogni riga portava un `onclick` con il numero
  interpolato nell'HTML. Sostituiti da un elenco in memoria e dalla delega
  degli eventi.
* **Variabile inesistente:** cinque punti del codice usavano `var(--danger)`,
  che non e' mai stato definito in nessuna versione del tema.

---

## 🧩 Fase 10: Un solo programma (17 Settembre 2026)
**Focus:** Componenti, testate e menu condivisi. Quattro app che sembrano quattro moduli dello stesso gestionale.

Il tema v2 aveva unificato i **colori**, ma ogni app disegnava i propri
bottoni, campi e tabelle — e due app con gli stessi colori e bottoni diversi
restano due app diverse.

* **Secondo strato condiviso, `base.css`:** le forme. Bottoni, campi, tabelle,
  modali, pastiglie, testata e menu, definiti una volta e usati da tutte e
  quattro. Ogni app ha dovuto **cancellare** le proprie definizioni di `.btn`:
  il foglio dell'app si carica per ultimo, quindi finché restavano vincevano
  loro.
* **Nomi a prova di collisione:** i componenti generici hanno il prefisso
  `ag-`. Non è vezzo: in `magazzino-scorte` la classe `.campo` marca le colonne
  modificabili di una tabella, non un campo di testo — stilarla come input
  avrebbe riempito quelle intestazioni di riquadri bianchi. Fanno eccezione i
  bottoni, `.btn` in tre app su quattro, con `.bottone` di scorte tenuto come
  alias.
* **Un programma, quattro moduli:** il titolo dice sempre *Il Magazzino
  Edile · <Modulo>*. Sparite le insegne scollegate — *Antigravity Ordini*,
  *Riconcilia*, *Listino Prezzi Netto*. Anche i titoli delle schede del
  browser seguono lo schema.
* **Una sola navigazione:** barra a linguette orizzontale sotto la testata,
  voce attiva sottolineata in ambra. `magazzino-gestionale` non aveva menu,
  `controllo-ddt` aveva una colonna a sinistra: ora hanno la stessa barra di
  `magazzino-scorte`. Orizzontale perché su tablet la colonna mangia metà
  schermo.
* **`magazzino-scorte` allineata:** carattere da system-ui a DM Sans, bottone
  primario dal nero all'ambra, angoli da 5 a 8px.

### Correzioni incluse
* **La testata finiva sulla carta:** convertendo `magazzino-scorte` si perdeva
  la classe `.schermo`, che significava "non stampare". Ora `base.css` nasconde
  `.ag-header` e `.ag-nav` in `@media print`, per tutte e quattro.
* **`.tasto-grosso` non era mai stata definita:** il bottone "Entra" della
  schermata di accesso di `magazzino-scorte` usciva col grigio predefinito del
  browser, ed è la prima cosa che si vede dell'app.
