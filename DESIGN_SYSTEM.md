# Tema Antigravity v2

**Famiglia:** magazzino-gestionale (POS e preventivi), magazzino-scorte,
ordini (analisi fornitori), controllo-ddt (riconciliazione POS).

Il tema non è un documento da ricopiare a mano: sono **due file**, identici in
tutti i repository.

| File | Cosa porta |
|---|---|
| [`tema.css`](tema.css) | i **colori** e le misure: superfici, testo, marchio, stati, raggi, scala tipografica |
| [`base.css`](base.css) | le **forme**: bottoni, campi, tabelle, modali, pastiglie, testata |

Servono tutti e due. Due app con gli stessi colori ma bottoni diversi restano
due app diverse: il family feeling sta nelle forme quanto nelle tinte.

```html
<link rel="stylesheet" href="tema.css">
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="styles.css">
<script src="tema.js"></script>   <!-- nel <head>, prima del corpo -->
```

L'ordine non è negoziabile: il foglio dell'app si carica per ultimo e quindi
vince. Se un'app ridefinisce `.btn`, il componente condiviso non serve a
niente.

Se un colore o un componente manca, si aggiunge qui e si riporta il file negli
altri tre repository. Quello che vive in un solo progetto non appartiene al
tema.

---

## Cosa cambia rispetto alla v1

La v1 era una buona base e **resta riconoscibile**: stessi sfondi scuri, stessa
ambra, stessa coppia DM Sans + JetBrains Mono. Cambiano tre cose.

### 1. Esiste anche il tema chiaro

La v1 era solo scura. In cantiere, con il sole sullo schermo di un telefono, un
fondo `#0f1117` non si legge. Ora il tema segue il sistema operativo, e
l'interruttore in testata lo forza e lo ricorda.

### 2. I contrasti passano WCAG AA

Misurati, non stimati. Nella v1 `--text3` — il colore di **tutte** le
intestazioni di colonna, dei placeholder e delle etichette — stava così:

| Coppia | v1 | v2 |
|---|---:|---:|
| `--text3` su `--surface` | 3.53 ✗ | 5.85 ✓ |
| `--text3` su `--surface2` (intestazioni tabella) | 3.12 ✗ | 5.17 ✓ |
| `--text3` su `--surface3` | 2.74 ✗ | 4.53 ✓ |
| `--red` su `--surface` | 4.47 ✗ | 6.06 ✓ |

La soglia AA per il testo normale è 4.5:1. Tutti i colori di testo della v2
passano su **ogni** superficie su cui possono finire, in entrambi i temi.

### 3. La scala tipografica sale di un gradino

La v1 prescriveva intestazioni di tabella a 10px e celle a 12px. Su un listino
di 1.000 articoli letto tutto il giorno è troppo poco. La v2 usa token:

| Token | Valore | Dove |
|---|---:|---|
| `--fs-micro` | 11px | intestazioni di colonna, badge |
| `--fs-sm` | 13px | celle di tabella, testo secondario |
| `--fs-base` | 14px | testo corrente, campi |
| `--fs-lg` | 16px | titoli di sezione |
| `--fs-xl` | 19px | titoli di modale |

---

## I colori

### Superfici e testo

| Token | Chiaro | Scuro | A cosa serve |
|---|---|---|---|
| `--bg` | `#f2f4f8` | `#0f1117` | sfondo della pagina |
| `--surface` | `#ffffff` | `#1a1d27` | card, pannelli, modali |
| `--surface2` | `#eceff5` | `#232735` | intestazioni tabella, hover |
| `--surface3` | `#e0e4ed` | `#2c3044` | bottoni secondari, campi in rilievo |
| `--border` | `#d3d8e3` | `#333850` | divisori |
| `--border-strong` | `#aeb6c7` | `#454b6b` | perimetri, bordo dei campi |
| `--text` | `#161922` | `#e8eaf0` | testo primario |
| `--text2` | `#4a5165` | `#aeb3c7` | testo secondario |
| `--text3` | `#5e657b` | `#9397b1` | etichette, placeholder, meta |

### Marchio

L'ambra è l'identità e resta. Ma l'ambra del riempimento, su fondo bianco, sta
a 2:1: come **testo** su tema chiaro è illeggibile. Per questo il marchio è
diviso in tre ruoli, e vanno usati per quello che sono:

| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| `--accent` | `#e08c00` | `#f59e0b` | **riempimento**: bottone primario, barre |
| `--accent2` | `#c77800` | `#fbbf24` | il riempimento sotto il mouse |
| `--accent-text` | `#94580a` | `#fbbf24` | ambra usata come **testo** sulla pagina |
| `--accent-ink` | `#1a1206` | `#0f1117` | ciò che si scrive **sopra** `--accent` |
| `--accent-bg` | 12% | 10% | velatura: riga attiva, anello di messa a fuoco |
| `--accent-border` | 45% | 35% | bordi accentati |

> Regola pratica: `--accent` non si scrive mai, si riempie. Se serve
> dell'ambra come testo, è `--accent-text`.

### Stati

| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| `--green` | `#0e7540` | `#34d07f` | importi, esito positivo, righe già a carrello |
| `--red` | `#c12828` | `#ff6b6b` | errori, rimozione |
| `--orange` | `#a64c08` | `#fb923c` | sconti, avvisi, voci fuori listino |
| `--blue` | `#1d4ed8` | `#60a5fa` | informazione neutra, collegamenti |

Ogni stato ha il suo `-bg` (velatura) e `-border`.

### Ombre e veli

`--shadow`, `--shadow-lg`, `--overlay-veil`. Non si scrivono più ombre a mano:
sul tema chiaro un `rgba(0,0,0,0.5)` diventa una macchia.

---

## I componenti

### Nomi

I componenti generici hanno il prefisso `ag-`. Non è vezzo: quattro basi di
codice nate separate si calpestano i nomi. In `magazzino-scorte` la classe
`.campo` marca **le colonne modificabili di una tabella**, non un campo di
testo — stilarla come input avrebbe rotto quelle intestazioni.

Fanno eccezione i bottoni, che si chiamano `.btn` in tre app su quattro (77
usi) e restano così. `.bottone` è il dialetto di `magazzino-scorte`, tenuto
come alias nello stesso file per non riscriverne il markup.

| Componente | Classe |
|---|---|
| Testata | `.ag-header` + `.ag-logo`, `.ag-titolo`, `.ag-modulo`, `.ag-versione`, `.ag-sottotitolo`, `.ag-azioni` |
| Menu | `.ag-nav` + `.ag-nav-voce`, `.ag-nav-gruppo`, `.ag-nav-conta` (stati: `.attiva`, `.disattiva`) |
| Bottone | `.btn` (alias `.bottone`) |
| Varianti | `.btn-primary` (alias `.bottone.principale`), `.btn-danger`, `.btn-success`, `.btn-ghost`, `.btn-secondary` |
| Misure | `.btn-sm` (alias `.bottone.piccolo`), `.btn-lg`, `.btn-icona` |
| Campo | `.ag-campo` + `.ag-etichetta` |
| Tabella | `.ag-tabella-wrap` + `.ag-tabella` |
| Pastiglia | `.ag-pastiglia` + `-verde` `-rossa` `-arancio` `-blu` `-ambra` |
| Card | `.ag-card` |
| Modale | `.ag-velo` + `.ag-finestra` |
| Stato vuoto | `.ag-vuoto` + `.ag-vuoto-icona`, `.ag-vuoto-testo` |
| Dati numerici | `.ag-dati` (alias `.ag-mono`) |

### La testata e il menu

Sono il motivo per cui quattro app sembrano un programma solo. Prima ognuna
annunciava un prodotto diverso — *Antigravity Ordini*, *Riconcilia*, *Listino
Prezzi Netto*, *Scorte* — e navigava a modo suo: `magazzino-gestionale` senza
menu, `magazzino-scorte` con una barra orizzontale, `controllo-ddt` con una
colonna a sinistra. Tre schemi bastavano a far sembrare tre programmi.

**Un programma, quattro moduli.** Il titolo dice sempre le stesse due cose
nello stesso ordine:

```html
<header class="ag-header">
  <div class="ag-logo">ME</div>
  <div class="ag-titolo">
    <h1>Il Magazzino Edile</h1>
    <span class="ag-modulo">Preventivi<span class="ag-versione">v2.6.0</span></span>
  </div>
  <div class="ag-azioni">…</div>
</header>
```

| Modulo | Era |
|---|---|
| Preventivi | Listino Prezzi Netto |
| Scorte | Scorte |
| Ordini | Antigravity Ordini |
| Riconciliazione | Riconcilia |

Anche il `<title>` della scheda segue: `Il Magazzino Edile — <Modulo>`.

**Il menu è una barra a linguette orizzontale**, subito sotto la testata,
con la voce attiva sottolineata in ambra. Orizzontale e non laterale perché su
tablet e telefono la colonna mangia metà schermo, e queste app si usano in
magazzino. `controllo-ddt` aveva una colonna: è stata convertita.

```html
<nav class="ag-nav">
  <span class="ag-nav-gruppo">Sede</span>        <!-- stacco, solo se il menu è lungo -->
  <a href="…" class="active">Rilevazione</a>      <!-- link (react-router) -->
  <button class="ag-nav-voce attiva">Listino</button>   <!-- o bottone/li -->
  <button class="ag-nav-voce disattiva">Anomalie <span class="ag-nav-conta">3</span></button>
</nav>
```

La linguetta accesa deve seguire **la vista, non il click**: così resta giusta
anche quando è il programma a cambiare schermata da solo (fine di
un'elaborazione, ritorno da un errore).

Testata e menu **non si stampano**: `base.css` li nasconde in `@media print`,
una volta per tutte e quattro.

### Il bottone primario

Uno solo per schermata. È l'azione che l'utente è venuto a fare: aggiungere al
preventivo, chiudere la rilevazione, avviare la riconciliazione. Tutto il resto
è `.btn` di riposo. `magazzino-scorte` aveva il primario **nero**; ora è ambra
come nelle altre tre.

---

## Regole d'oro

1. **Nessun colore fuori dai token.** Niente `#333`, niente `rgba(0,0,0,.5)`,
   niente `red`. Se un colore non c'è, si aggiunge a `tema.css`, non alla
   singola app. Le uniche eccezioni ammesse sono i colori dei marchi altrui
   (il verde di WhatsApp), e anche quelli vanno verificati a contrasto.
2. **Sempre in coppia.** Ogni colore di testo che si aggiunge va misurato su
   `--surface`, `--surface2` e `--surface3` in **entrambi** i temi. Se non
   arriva a 4.5:1, non entra.
3. **Dati in monospaziato, a destra.** Prezzi, quantità, sconti e partite IVA
   usano `--font-dati` e sono allineati a destra: in colonna si leggono. I
   codici articolo restano in monospaziato ma a sinistra.
4. **La messa a fuoco non si toglie.** `tema.css` disegna `:focus-visible` per
   tutti. Nessuna app deve fare `outline: none`.
5. **La carta è bianca.** `tema.css` forza il tema chiaro in stampa: un
   preventivo stampato non esce col fondo nero. Non serve farlo di nuovo per
   ogni app.
6. **Angoli tondi:** `--radius-sm` (8px) per bottoni e campi, `--radius` (12px)
   per card e blocchi, 16px per le modali.

---

## Come sceglie il tema

Di suo segue il sistema operativo. L'interruttore scrive `data-tema="chiaro"`
o `data-tema="scuro"` su `<html>` e quella scelta vince, ricordata in
`localStorage` sotto `magazzino.tema`.

Nelle app in JavaScript semplice basta [`tema.js`](tema.js):

```js
Tema.collega(document.getElementById('btnTema'));  // bottone e icona
Tema.attuale();      // 'chiaro' | 'scuro'
Tema.imposta('scuro');
Tema.automatico();   // torna a seguire il sistema
```

`magazzino-scorte` fa la stessa cosa in React, con `src/lib/tema.ts`: stesso
attributo, stessi valori, stessa chiave. I due meccanismi sono
intercambiabili.

---

## Adottare il tema in un'app esistente

1. Copiare `tema.css`, `base.css` e `tema.js` nella radice del repository.
2. Caricarli come mostrato in cima a questo documento.
3. **Cancellare il `:root` dell'app.** Se resta, vince sul tema e il chiaro
   non funziona.
4. **Cancellare le definizioni di `.btn` dell'app.** Stesso motivo: il foglio
   dell'app si carica dopo, quindi le sue regole vincono su `base.css` e i
   bottoni restano diversi da quelli delle altre app. Vanno tenute solo le
   varianti che usa soltanto quell'app, e il comportamento di disposizione
   (`.cart-actions .btn { flex: 1 }` è layout, non aspetto).
5. Caricare i caratteri della famiglia, se l'app non lo faceva:
   `DM Sans` e `JetBrains Mono` da Google Fonts.
6. Cercare i colori scritti a mano e sostituirli con i token:
   `grep -nE "rgba\(|#[0-9a-fA-F]{3,6}" styles.css`
7. Controllare le collisioni di nome **prima** di usare una classe condivisa:
   `grep -rn 'class="[^"]*nome' .`
8. Aggiungere i file nuovi alla lista del service worker e alzarne la versione.
   Se l'app non ha un service worker, mettere una versione nell'URL
   (`base.css?v=2`), altrimenti i browser continuano a servire la copia vecchia.

### Il caso di magazzino-scorte

Quell'app ha il foglio di stile scritto con nomi italiani (`--fondo`,
`--pannello`, `--testo`…). Riscrivere 1.600 righe non serve: `tema.css`
contiene gli **alias** che mappano quei nomi sugli stessi valori. L'adozione è
cancellare i due blocchi `:root` e `:root[data-tema='scuro']` da `styles.css` e
nient'altro. I token suoi e solo suoi — le pastiglie delle classi A/B/C del
prontuario — restano dove sono.

---

## Verificare un colore nuovo

Il contrasto si misura, non si stima. Lo script usato per costruire questa
palette:

```python
def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126*_lin(r) + 0.7152*_lin(g) + 0.0722*_lin(b)

def contrasto(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
```

Testo normale: ≥ 4.5. Testo grande (≥ 24px, o ≥ 19px grassetto): ≥ 3.0.
