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
