# Firebase Shared Architecture

Questo documento descrive l'infrastruttura Firebase attualmente in uso dal progetto `pos-app-v2` (Il Magazzino Edile - POS & Preventivi). 
L'obiettivo è fornire tutte le informazioni necessarie per permettere ad applicazioni future di connettersi allo stesso backend, condividere il listino prezzi, l'anagrafica clienti e lo storico delle operazioni.

## 1. Configurazione di Accesso (Firebase Config)

Per connettere un'applicazione (Web, Mobile, etc.) a questo progetto Firebase, utilizzare il seguente blocco di configurazione. Assicurarsi di includere gli SDK di Firebase appropriati (es. `firebase-app`, `firebase-firestore`, `firebase-storage`).

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyCLdOfp4z3FUJX2xt-xBZciyjxJZWeoh7A",
  authDomain: "magazzino-edile-pos.firebaseapp.com",
  projectId: "magazzino-edile-pos",
  storageBucket: "magazzino-edile-pos.firebasestorage.app",
  messagingSenderId: "696561179056",
  appId: "1:696561179056:web:fc6b1db62ed256fd3fde75"
};

// Inizializzazione (Compat V9/V10)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
```

## 2. Firebase Storage (File Condivisi)

Lo storage viene utilizzato per ospitare i file sorgente "Master" (in formato Excel `.xlsx`) che vengono scaricati dalle app all'avvio per aggiornare la cache locale.

*   **`listino.xlsx`**: File principale del listino prezzi. Contiene le colonne per codice articolo, descrizione, prezzo base, categoria, fornitore e sconti.
*   **`clienti.xlsx`**: File master per l'anagrafica clienti generica. Contiene ragione sociale, P.IVA, email, indirizzo e città.

**Logica di sincronizzazione consigliata:**
Le app dovrebbero verificare la data di ultimo aggiornamento (Metadata `updated`) del file su Storage e scaricarlo solo se risulta più recente rispetto alla versione salvata in memoria locale, riducendo così il traffico dati.

## 3. Firebase Firestore (Database NoSQL)

Il database Firestore viene utilizzato per i dati transazionali e per arricchire dinamicamente l'anagrafica.

### Collezioni attive:

#### `clienti`
Contiene i clienti aggiunti **manualmente** dagli operatori tramite l'app, che non sono presenti nel `clienti.xlsx` originale. Le app future dovranno unire in memoria i clienti scaricati dallo Storage con quelli letti da questa collezione.
*   **Struttura Documento:** `ragione` (String), `piva` (String), `email` (String), `indirizzo` (String), `citta` (String), `manual` (Boolean: true), `timestamp` (ServerTimestamp).

#### `customer_meta`
Contiene metadati aggiuntivi associati ai clienti per agevolare l'autocompletamento intelligente in base allo storico di utilizzo (es. telefoni usati per le consegne e indirizzi dei cantieri).
*   **ID Documento:** Generato automaticamente.
*   **Struttura Documento:** 
    *   `ragione` (String): Identificativo univoco del cliente (Ragione Sociale). Funge da chiave di collegamento logica.
    *   `telefoni` (Array di String): Lista di numeri di telefono associati storicamente a questo cliente.
    *   `cantieri` (Array di String): Lista di indirizzi di cantieri usati per le consegne.
    *   `sitePhones` (Map/Object): Mappatura `{"Cantiere A": "Telefono 1"}` per associare uno specifico numero di telefono ad un determinato cantiere per auto-suggerimenti.

#### `quotes`
Contiene lo storico e i dettagli di tutti i preventivi generati.
*   **ID Documento:** Identificativo univoco del preventivo (es. `PREV-2024-0001`).
*   **Struttura Documento:**
    *   `quoteId` (String): Copia dell'ID documento.
    *   `dateIso` (String - ISO 8601): Data di creazione.
    *   `timestamp` (ServerTimestamp): Timestamp di sistema per l'ordinamento cronologico corretto.
    *   `customer` (Object): Dati anagrafici del cliente associato, inclusi cantiere e telefono usati.
    *   `items` (Array di Object): Lista articoli (codice, descrizione, qtà, netto unitario, subotale riga, prezzo listino, sconto base, sconto extra).
    *   `netTotal` (Number): Totale netto del preventivo.
    *   `globalDiscount` (Number): Eventuale sconto cassa o arrotondamento applicato al totale lordo.
    *   `type` (String): Metodo di export utilizzato originariamente (es. 'PDF', 'EMAIL', 'WHATSAPP').
    *   `searchTokens` (String): Stringa ottimizzata per la ricerca testuale, unisce ID, Ragione Sociale e PIVA in un unico campo (es. "prev-2024-0001 mario rossi srl 0123456").

#### `metadata`
Contiene contatori globali o impostazioni architetturali di sistema.
*   **Documento: `quoteCounter`**
    *   `value` (Number): Ultimo numero progressivo utilizzato per i preventivi (es. 42). Per incrementarlo in modo sicuro in un ambiente distribuito (es. più operatori in contemporanea), si raccomanda l'uso di una `Transaction` di Firestore che garantisca la coerenza del dato (lock and increment).

## 4. Linee Guida per le Nuove App
1.  **Dati Statici vs Dinamici:** Il nucleo del listino e l'anagrafica "bulk" provengono dai file Excel su Storage. Questo permette un facile aggiornamento massivo da parte degli amministratori. I dati operativi e creati sul momento (preventivi, nuovi clienti "al volo", smart tagging dei cantieri) vivono su Firestore per garantire la sincronizzazione in tempo reale tra tutti i dispositivi aziendali.
2.  **Architettura Offline-First:** L'applicazione attuale salva una copia cache (in `localStorage`) del listino, dei clienti e dei metadati. Le app future dovrebbero replicare questo approccio per massimizzare le performance (evitando di riscaricare decine di mega ad ogni avvio) e per permettere l'utilizzo basilare del sistema anche in assenza temporanea di rete.
