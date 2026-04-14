# Antigravity POS Web App 🚀

Una moderna applicazione Point of Sale (POS) basata su web, progettata per funzionare sia online che offline (come PWA) su PC, tablet e dispositivi mobili. Il sistema permette di caricare listini in formato Excel, gestire il carrello acquisti, applicare sconti e generare preventivi esportabili in PDF o Excel.

## ✨ Caratteristiche Principali

- **Funzionamento Offline**: Grazie ai Service Workers (PWA), l'app funziona perfettamente anche senza connessione internet dopo il primo caricamento.
- **Importazione da Excel**: Carica listini prodotti e anagrafiche clienti direttamente nell'app senza bisogno di database complessi o server backend.
- **Interfaccia Moderna**: Design allo stato dell'arte con tema dark, animazioni fluide e un'ottima usabilità e reattività su dispositivi touch e desktop.
- **Gestione Preventivi**: 
  - Creazione rapida di preventivi con ricerca intelligente dei prodotti.
  - Gestione di sconti a riga e sconti globali sul totale.
  - Esportazione professionale in **PDF**.
  - Esportazione in formato **Excel (XLSX)** con formule native incorporate.
- **Cloud Sync (Opzionale)**: Integrazione con Firebase Firestore per la sincronizzazione dei preventivi tra più dispositivi, con generazione automatica di numerazioni univoche della documentazione.
- **Deploy Singolo File Standalone**: Possibilità di compilare l'intera app web e le sue dipendenze in un unico file HTML altamente portabile e condivisibile.

## 🚀 Guida Rapida / Installazione

Per utilizzare o testare il software localmente, segui questi semplici passaggi:

### 1. Clona la repository

```bash
git clone https://github.com/TUA_ORGANIZZAZIONE/pos-app-v2.git
cd pos-app-v2
```

### 2. Avviare l'applicazione

Poiché l'app utilizza funzionalità avanzate come i Service Workers (per l'offline) e i moduli JavaScript nativi, non puoi semplicemente aprire `index.html` facendo doppio clic sul file per via delle stringenti policy di sicurezza dei browser (CORS). Devi servire la cartella tramite un server web locale.

**Opzione A: Usando VS Code (Consigliato)**
1. Apri la cartella del progetto in Visual Studio Code.
2. Installa l'estensione **Live Server**.
3. Fai clic destro sul file `index.html` e seleziona *Open with Live Server*.

**Opzione B: Usando Python**
Se hai Python installato nel sistema operativo, apri il terminale nella cartella del progetto ed esegui:
```bash
python -m http.server 8000
```
Quindi apri il browser all'indirizzo `http://localhost:8000`.

### 3. Struttura dei Dati Necessari (Template Excel)

L'applicazione consuma cataloghi in formato foglio di calcolo. Al primo avvio, ti verrà richiesto di caricare il file. L'applicazione analizza fogli Excel con estensione `.xlsx`.

*   **Listino Prodotti**: Il file deve contenere delle colonne riconoscibili dal sistema (la prima riga deve essere di intestazione). Le colonne standard ricercate includono: `Categoria`, `Sottocategoria`, `Fornitore`, `Codice Articolo` (o varianti simili), `Descrizione`, e `Listino` (il prezzo base).
*   **Archivio Clienti**: L'app supporta un secondo file Excel usato per la compilazione automatica e la ricerca rapida delle anagrafiche nell'intestazione del preventivo.

## 🛠 Compilare la Versione "Standalone"

L'architettura prevede la possibilità di impacchettare l'app. Troverai incluso uno script PowerShell (`build_standalone.ps1`) che unisce e compatta l'HTML, il CSS, e il codice JavaScript (convertendo eventuali risorse grafiche in Base64) generando un unico file finale chiamato `Magazzino_App_Mobile.html`.
Questo file è completamente portabile (lo si può per esempio inviare per mail ad un collega che potrà aprirlo ed usarlo al volo).

Per eseguire la compilazione in Windows:
1. Apri il terminale **Windows PowerShell**.
2. Naviga nella root del progetto.
3. Esegui il comando:
```powershell
.\build_standalone.ps1
```
*(Nota: se PowerShell blocca l'esecuzione degli script a causa delle execution policies, potresti dover lanciare temporaneamente `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

## ⚙️ Configurazione Cloud Firebase (Opzionale)

Se desideri abilitare lo storico cloud condiviso per permettere a collaboratori molteplici di sincronizzarsi e mantenere uno storico globale dei documenti emessi:

1. Visita la [Firebase Console](https://console.firebase.google.com/) e crea un nuovo Web Project.
2. Abilita un **Firestore Database** in test mode o con regole adeguate al rilascio di produzione.
3. Ottieni o genera il blocco di configurazione web (`firebaseConfig`).
4. Apri il file `app.js` e sostituisci il placeholder object `firebaseConfig` con il rispettivo che hai generato al passaggio precedente.

## 📱 Installazione come App (PWA)

Se l'applicazione è hostata sotto HTTPS (o in `localhost` durante i test), i browser compatibili la indicheranno come installabile:
- **Su Desktop (Chrome / Edge)**: Clicca o sull'icona apposita situata all'estrema destra della barra degli indirizzi o nel menu opzioni *"Installa app"*. L'applicazione verrà aggiunta tra i programmi.
- **Su Smartphone Mobile**: Accedendo al link dell'app dal browser del device e selezionando *"Aggiungi a schermata Home"* dal menu nativo del sistema. Si comporterà da quel momento in avanti analoga ad un'app nativa intera.

## 📝 Documentazione Architettura e Roadmap
Per ulteriori dettagli tecnici sullo sviluppo ed il progresso:
- Leggi [APP_HISTORY.md](./APP_HISTORY.md) per l'evoluzione storica e i mutamenti di design pattern dall'origine offline fino all'integrazione Cloud attuale.
- Controlla [FUTURE_UPGRADES.md](./FUTURE_UPGRADES.md) per la visione dei feature planned e la tabella di marcia del progetto.
