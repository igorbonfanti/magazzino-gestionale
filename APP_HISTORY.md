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

---

*L'app è così evoluta da un tool tattico isolato a un software omnicanale con operatività edge/cloud per l'intero reparto aziendale (v1.3.0).*
