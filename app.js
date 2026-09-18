// Cloud Sync Elements
var uploadStatus = document.getElementById('uploadStatus');
var uploadOverlay = document.getElementById('uploadOverlay');
var appContainer = document.getElementById('appContainer');
var btnReloadListino = document.getElementById('btnReloadListino');

// Global State
var ITEMS = [];
var cart = [];
var currentItem = null;
var activeFilterCat = '';
var activeFilterForn = '';
var debounceTimer = null;
var CLIENTI = [];
var starredItems = JSON.parse(localStorage.getItem('posStarred') || '[]');
var currentCustomer = null;
window.currentQuoteIdSaved = null;
var CUSTOMER_META = {};
// Voci una tantum non presenti in anagrafica: vivono solo nel carrello e nel
// preventivo salvato, mai nel listino. Il contatore serve a dare a ognuna una
// chiave propria, perche' il codice puo' essere vuoto o ripetuto.
var customItemSeq = 0;
var editingCustomUid = null;

// Firebase Init
// auth-gate.js ha gia' chiamato initializeApp: qui va solo completata
// l'inizializzazione se per qualche motivo il gate non fosse stato caricato.
// Senza il guard, il secondo initializeApp lancerebbe "duplicate-app" e il
// catch lascerebbe db a null, rompendo tutta la sincronizzazione.
var db = null;
try {
  if (!firebase.apps.length) {
    firebase.initializeApp({
        apiKey: "AIzaSyCLdOfp4z3FUJX2xt-xBZciyjxJZWeoh7A",
        authDomain: "magazzino-edile-pos.firebaseapp.com",
        projectId: "magazzino-edile-pos",
        storageBucket: "magazzino-edile-pos.firebasestorage.app",
        messagingSenderId: "696561179056",
        appId: "1:696561179056:web:fc6b1db62ed256fd3fde75"
    });
  }
  db = firebase.firestore();
} catch(e) { console.warn("Firebase non configurato", e); }

try {
  var savedClienti = localStorage.getItem('posClientiData');
  if(savedClienti) { CLIENTI = JSON.parse(savedClienti); }
  var savedMeta = localStorage.getItem('posCustomerMeta');
  if(savedMeta) { CUSTOMER_META = JSON.parse(savedMeta); }
} catch(e){}

// UI Elements
function $(id){ return document.getElementById(id) }
var searchInput=$('searchInput'), clearBtn=$('clearBtn'), tbody=$('tbody'),
    emptyState=$('emptyState'), resultsInfo=$('resultsInfo'), tableWrap=$('tableWrap'),
    cartPanel=$('cartPanel'), cartBody=$('cartBody'), cartBadge=$('cartBadge'), cartFooter=$('cartFooter'),
    cartSubtitle=$('cartSubtitle'), addOverlay=$('addOverlay'), mQtyInput=$('mQty'),
    prevOverlay=$('prevOverlay'), toastEl=$('toast'),
    mobileCartBtn=$('mobileCartBtn'), cartCloseBtn=$('cartCloseBtn'), fabBadge=$('fabBadge'),
    customerOverlay=$('customerOverlay'), customerConfirmBtn=$('customerConfirmBtn');

function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fp(p){return p!=null?p.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'\u2014'}
// I prezzi unitari si mostrano come sono, fino a 4 decimali e senza zeri
// inutili. A 2 decimali 0,855 diventerebbe 0,86 e la riga non tornerebbe piu':
// chi legge farebbe 0,86 x 100 e si aspetterebbe 86,00 invece di 85,50.
function fpu(p){return p!=null?p.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:4}):'\u2014'}
// Arrotonda a 2 decimali, mezzo centesimo sempre verso l'alto.
//
// La versione precedente faceva Math.round((n + Number.EPSILON) * 100) / 100.
// Number.EPSILON vale circa 2e-16: su importi dell'ordine delle decine di euro
// e' troppo piccolo per correggere qualcosa, e ogni tanto spinge dalla parte
// sbagliata. Su 30.000 importi realistici sbagliava il centesimo 180 volte.
//
// Qui si scala il numero sulla sua rappresentazione decimale invece che
// moltiplicandolo: 34.605 * 100 in virgola mobile fa 3460.4999999999995 e
// arrotonderebbe a 34.60, mentre Number('34.605e+2') fa esattamente 3460.5.
// Stesso banco di prova: 31 differenze invece di 180.
//
// Resta un margine: in virgola mobile alcuni valori cadono esattamente sul
// mezzo centesimo e l'esito e' opinabile entro un centesimo. La cura
// definitiva sono i centesimi interi, come in magazzino-scorte (money.ts).
function ro2(n){
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  var segno = n < 0 ? -1 : 1;
  var a = Math.abs(n);
  var testo = a.toString();
  // notazione esponenziale (valori enormi o minuscoli): non si puo' scalare
  // la stringa, si ripiega sulla moltiplicazione
  if (testo.indexOf('e') !== -1 || testo.indexOf('E') !== -1) {
    return segno * Math.round(a * 100) / 100;
  }
  return segno * Number(Math.round(Number(testo + 'e+2')) + 'e-2');
}

// ===========================================================================
// CATENA DEI PREZZI
// ===========================================================================
// Una regola sola: non si arrotonda MAI un prezzo unitario prima di
// moltiplicarlo per la quantita'.
//
// Un articolo da 0,95 con il 10% di sconto costa 0,855. Arrotondando il pezzo
// a 0,86 e poi moltiplicando per 100 pezzi vengono 86,00 invece di 85,50:
// mezzo centesimo per pezzo diventa mezzo euro sulla riga. Piu' e' alta la
// quantita', piu' l'errore cresce.
//
// L'arrotondamento a 2 decimali si fa una volta sola, sul totale di riga.

/** Prezzo unitario netto applicato, a piena precisione. Non arrotondarlo. */
function prezzoUnitario(c){
  var p = (c && c.item && c.item.net) || 0;
  if (c && c.extraDiscount > 0) p = p * (1 - c.extraDiscount / 100);
  return p;
}

/** Totale della riga. E' qui, e solo qui, che si arrotonda. */
function totaleRiga(c){
  return ro2(prezzoUnitario(c) * ((c && c.qty) || 0));
}

/** Netto imponibile del carrello: somma di importi gia' a 2 decimali. */
function nettoCarrello(){
  var t = 0;
  cart.forEach(function(c){ t += totaleRiga(c); });
  return ro2(t);
}
function titleCase(s){return s.split(' ').map(function(w){return w.charAt(0)+w.slice(1).toLowerCase()}).join(' ')}
// Accetta sia "12,50" che "12.50" che "1.234,56": l'operatore digita come gli
// viene, e su tastiera numerica il separatore non e' sempre quello atteso.
function parseNum(v){
  var str = String(v == null ? '' : v).trim().replace(/[^0-9.,-]/g,'');
  if(!str) return 0;
  if(str.indexOf(',') !== -1) str = str.replace(/\./g,'').replace(',','.');
  var n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}
// Il carrello non puo' piu' identificare una riga dal solo codice: gli articoli
// fuori listino possono averlo vuoto, o uguale fra loro. Chi ha un uid usa
// quello, gli articoli di listino restano identificati dal codice.
function cartKey(item){
  if(!item) return 'cod:';
  return item.uid ? ('uid:'+item.uid) : ('cod:'+item.cod);
}
function findCartIndex(item){
  var k = cartKey(item);
  for(var i=0;i<cart.length;i++){ if(cartKey(cart[i].item) === k) return i; }
  return -1;
}
// Quantita' leggibile: gli articoli fuori listino possono portarsi dietro una
// unita' di misura ("12 ml"), quelli di listino no.
function qtyLabel(c){
  return c.qty + (c.item && c.item.um ? ' ' + c.item.um : '');
}
function hl(text,terms){var r=esc(text);terms.forEach(function(t){r=r.replace(new RegExp('('+t.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+')','gi'),'<span class="highlight">$1</span>')});return r}

// --- Initialization & Setup ---
// La sincronizzazione parte solo a utente autenticato: con le regole chiuse
// una lettura anonima fallirebbe con permission-denied. AuthGate.pronto()
// richiama subito se la sessione e' gia' attiva, altrimenti dopo il login.
// Attenzione: il corpo non deve contenere "});" annidati. build_standalone.ps1
// rimuove questo blocco con una regex non golosa che si ferma al primo "});",
// e un annidamento produrrebbe codice troncato nella build mobile.
document.addEventListener('DOMContentLoaded', () => {
    if (window.AuthGate) AuthGate.pronto(checkCloudUpdates);
    else checkCloudUpdates();
});

// L'interruttore chiaro/scuro: tema.js si occupa di icona, memoria e attributo.
if(window.Tema && $('btnTema')) Tema.collega($('btnTema'));

btnReloadListino.addEventListener('click', () => {
    if(confirm('Vuoi forzare il ricalcolo dal Cloud? Questo chiuderà la sessione attuale.')){
        localStorage.removeItem('posListinoDate');
        localStorage.removeItem('posClientiDate');
        window.location.reload();
    }
});

async function checkCloudUpdates() {
    uploadOverlay.style.display = 'flex';
    if(!firebase.apps.length || !firebase.storage) {
        uploadStatus.innerHTML = '<span style="color:var(--red)">Firebase Storage non configurato</span>';
        setTimeout(initAppFallback, 2000);
        return;
    }
    
    var storage = firebase.storage();
    
    try {
        // 1. Check Listino
        uploadStatus.textContent = "Verifica listino sul server cloud...";
        var listinoRef = storage.ref('listino.xlsx');
        var lMeta = await listinoRef.getMetadata().catch(e => null);
        
        var lCachedDate = localStorage.getItem('posListinoDate');
        var lNeedsUpdate = false;
        
        if(lMeta) {
            if(!lCachedDate || lCachedDate !== lMeta.updated) lNeedsUpdate = true;
        } else if(!localStorage.getItem('posListData')) {
             throw new Error("Listino 'listino.xlsx' non trovato nel cloud e non presente in memoria.");
        }
        
        if(lNeedsUpdate && lMeta) {
            uploadStatus.textContent = "Scaricamento listino in corso (" + (lMeta.size/1024/1024).toFixed(1) + " MB)...";
            var lUrl = await listinoRef.getDownloadURL();
            var lRes = await fetch(lUrl);
            var lBlob = await lRes.arrayBuffer();
            
            uploadStatus.textContent = "Elaborazione dati listino...";
            const workbook = XLSX.read(lBlob, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            let headerRowIndex = -1;
            let colIdx = { cod: -1, desc: -1, price: -1, cat: -1, forn: -1, discount: -1 };
            for(let i=0; i<Math.min(10, rows.length); i++) {
                const row = rows[i];
                if(!row) continue;
                const strRow = row.map(c => String(c).toLowerCase());
                const codIdx = strRow.findIndex(c => c.includes('articolo'));
                const descIdx = strRow.findIndex(c => c.includes('descrizione') && !c.includes('categoria') && !c.includes('gruppo') && !c.includes('fornitore'));
                const priceIdx = strRow.findIndex(c => c.includes('prezzo 1') || c.includes('prezzo'));
                const discountIdx = 5; const fornIdx = 8; const catIdx = 10;
                if(codIdx !== -1 && descIdx !== -1 && priceIdx !== -1) {
                    headerRowIndex = i; colIdx = { cod: codIdx, desc: descIdx, price: priceIdx, cat: catIdx !== -1 ? catIdx : -1, forn: fornIdx !== -1 ? fornIdx : -1, discount: discountIdx !== -1 ? discountIdx : -1 };
                    break;
                }
            }
            if(headerRowIndex === -1) throw new Error("Colonne listino errate: assicurati che le intestazioni includano 'articolo', 'descrizione' e 'prezzo'.");
            
            let list = [];
            for(let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if(!row || !row[colIdx.cod]) continue;

                let prezzo = row[colIdx.price];
                if (typeof prezzo === 'string') prezzo = parseFloat(prezzo.replace(',', '.').replace(/[^0-9.]/g, ''));
                if (isNaN(prezzo)) prezzo = 0;

                const cod = String(row[colIdx.cod] || '').trim();
                const desc = String(row[colIdx.desc] || '').trim();
                const grp = colIdx.cat !== -1 && row[colIdx.cat] ? String(row[colIdx.cat] || '').trim() : '';
                const forn = colIdx.forn !== -1 && row[colIdx.forn] ? String(row[colIdx.forn] || '').trim() : '';

                let sconto = 0;
                if (colIdx.discount !== -1 && row[colIdx.discount]) {
                    let rawSconto = row[colIdx.discount];
                    if (typeof rawSconto === 'string') rawSconto = parseFloat(rawSconto.replace(',', '.').replace(/[^0-9.-]/g, ''));
                    if (!isNaN(rawSconto)) sconto = rawSconto;
                }

                // Il netto unitario resta a piena precisione: arrotondarlo qui
                // significherebbe portarsi l'errore dentro ogni riga di
                // preventivo, moltiplicato per la quantita'.
                let net = prezzo;
                if (sconto !== 0) {
                    if (sconto < 0) sconto = Math.abs(sconto);
                    if (sconto <= 1) sconto = Math.round(sconto * 10000) / 100;
                    net = prezzo * (1 - sconto/100);
                }

                list.push({ cod: cod, desc: desc, prezzo: prezzo, sconto: sconto, net: net, grp: grp, forn: forn, _s: (cod + '|' + desc + '|' + forn).toLowerCase() });
            }
            localStorage.setItem('posListData', JSON.stringify(list));
            localStorage.setItem('posListinoDate', lMeta.updated);
        }
        
        // 2. Check Clienti
        uploadStatus.textContent = "Verifica archivio clienti sul server...";
        var clientiRef = storage.ref('clienti.xlsx');
        var cMeta = await clientiRef.getMetadata().catch(e => null);
        var cCachedDate = localStorage.getItem('posClientiDate');
        var cNeedsUpdate = false;
        
        if(cMeta) {
            if(!cCachedDate || cCachedDate !== cMeta.updated) cNeedsUpdate = true;
        }
        
        if(cNeedsUpdate && cMeta) {
            uploadStatus.textContent = "Scaricamento clienti.xlsx in corso (" + (cMeta.size/1024/1024).toFixed(1) + " MB)...";
            var cUrl = await clientiRef.getDownloadURL();
            var cRes = await fetch(cUrl);
            var cBlob = await cRes.arrayBuffer();
            
            const workbook = XLSX.read(cBlob, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            let list = [];
            for(let i=1; i<rows.length; i++) {
                let row = rows[i];
                if(!row || !row[1]) continue;
                list.push({
                    ragione: String(row[1]).trim(),
                    piva: row[2] ? String(row[2]).trim() : '',
                    email: row[7] ? String(row[7]).trim() : '',
                    indirizzo: row[8] ? String(row[8]).trim() : '',
                    citta: row[10] ? String(row[10]).trim() : ''
                });
            }
            localStorage.setItem('posClientiData', JSON.stringify(list));
            localStorage.setItem('posClientiDate', cMeta.updated);
        }
        
        // 3. Sync Custom Clienti from Firestore
        await syncCustomClienti();

        // 4. Sync Customer Meta
        await syncCustomerMeta();
        
        initAppFallback();
        
    } catch(err) {
        console.error(err);
        uploadStatus.innerHTML = '<span style="color:var(--red)">Errore Cloud: ' + err.message + '<br>Avvio con backup memoria offline in 3s...</span>';
        setTimeout(initAppFallback, 3000);
    }
}

// Il listino in cache puo' essere stato interpretato da una versione che
// arrotondava il netto unitario a 2 decimali. Prezzo e sconto sono salvati
// tali e quali, quindi il netto si puo' ricalcolare qui, a piena precisione,
// senza aspettare che l'amministratore ricarichi il file.
function normalizzaNetti(items) {
    var corretti = 0;
    items.forEach(function(it){
        var atteso = (it.sconto > 0) ? it.prezzo * (1 - it.sconto/100) : it.prezzo;
        if (typeof atteso === 'number' && isFinite(atteso) && it.net !== atteso) {
            it.net = atteso;
            corretti++;
        }
    });
    if (corretti) console.log('Netti unitari ricalcolati a piena precisione: ' + corretti);
    return items;
}

function initAppFallback() {
    const listData = localStorage.getItem('posListData');
    const cliData = localStorage.getItem('posClientiData');
    if(listData) {
        ITEMS = normalizzaNetti(JSON.parse(listData));
        if(cliData && CLIENTI.length === 0) { 
            CLIENTI = JSON.parse(cliData); 
        } else if(cliData) {
            // Se abbiamo già dei clienti (es. da Firestore), uniamoli evitando duplicati
            const local = JSON.parse(cliData);
            local.forEach(c => {
               const exists = CLIENTI.some(x => x.ragione === c.ragione && x.piva === c.piva);
               if(!exists) CLIENTI.push(c);
            });
        }
        initApp();
    } else {
        uploadStatus.innerHTML = '<span style="color:var(--red)">Nessun listino offline disponibile e impossibile scaricarlo. Contatta l\'amministratore.</span>';
    }
}

function initApp() {
    uploadOverlay.style.display = 'none';
    appContainer.style.display = 'flex';
    
    // Reset state
    cart = [];
    activeFilterCat = '';
    activeFilterForn = '';
    searchInput.value = '';
    clearBtn.classList.remove('visible');

    // Build Filters Dropdowns
    var filterCat = $('filterCat');
    var filterForn = $('filterForn');

    function updateFilterOptions() {
        let validCats = new Set();
        let validForns = new Set();

        ITEMS.forEach(function(item) {
            // A category is valid if there's no active supplier filter, OR this item belongs to the active supplier
            if (!activeFilterForn || item.forn === activeFilterForn) {
                if (item.grp) validCats.add(item.grp);
            }
            
            // A supplier is valid if there's no active category filter, OR this item belongs to the active category
            if (!activeFilterCat || item.grp === activeFilterCat) {
                if (item.forn) validForns.add(item.forn);
            }
        });

        var currentCat = filterCat.value;
        filterCat.innerHTML = '<option value="">Tutte le Categorie</option>';
        Array.from(validCats).sort().forEach(function(cat) {
            var opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = titleCase(cat);
            filterCat.appendChild(opt);
        });
        if (validCats.has(currentCat)) { filterCat.value = currentCat; } 
        else { activeFilterCat = ''; filterCat.value = ''; }

        var currentForn = filterForn.value;
        filterForn.innerHTML = '<option value="">Tutti i Fornitori</option>';
        Array.from(validForns).sort().forEach(function(forn) {
            var opt = document.createElement('option');
            opt.value = forn;
            opt.textContent = titleCase(forn);
            filterForn.appendChild(opt);
        });
        if (validForns.has(currentForn)) { filterForn.value = currentForn; }
        else { activeFilterForn = ''; filterForn.value = ''; }
    }
    
    // Clear out old event listeners if they exist by cloning or rely on the fact that initApp only runs once usually (to be safe, we just assign the onchange instead of addEventListener to prevent dupes)
    filterCat.onchange = function() {
        activeFilterCat = this.value;
        updateFilterOptions();
        doSearch();
    };
    
    filterForn.onchange = function() {
        activeFilterForn = this.value;
        updateFilterOptions();
        doSearch();
    };

    $('resetFiltersBtn').addEventListener('click', function() {
        activeFilterCat = '';
        activeFilterForn = '';
        updateFilterOptions();
        doSearch();
    });

    updateFilterOptions();

    // Quick Qty Build (ensure we only do this once if re-initialized)
    $('quickQtyBtns').innerHTML = '';
    [1,5,10,25,50,100].forEach(function(n){
        var btn=document.createElement('button');btn.className='qty-chip';btn.textContent=n;
        btn.addEventListener('click',function(){mQtyInput.value=n;updateSubtotal()});
        $('quickQtyBtns').appendChild(btn);
    });
    
    doSearch();
    renderCart();
    searchInput.focus();
}

// --- Application Logic ---
['input','keyup','change'].forEach(function(evt){
  searchInput.addEventListener(evt,function(){
    clearBtn.classList.toggle('visible',searchInput.value.length>0);
    clearTimeout(debounceTimer);debounceTimer=setTimeout(doSearch,80);
  });
});
clearBtn.addEventListener('click',function(){searchInput.value='';clearBtn.classList.remove('visible');doSearch();searchInput.focus()});

tableWrap.addEventListener('click', function(e){
  var starBtn = e.target.closest('.star-btn');
  if(starBtn) {
    e.stopPropagation();
    var cod = starBtn.getAttribute('data-cod');
    var idx = starredItems.indexOf(cod);
    if(idx > -1) {
      starredItems.splice(idx, 1);
      starBtn.classList.remove('star-active');
      starBtn.innerHTML = '&#9734;';
    } else {
      starredItems.push(cod);
      starBtn.classList.add('star-active');
      starBtn.innerHTML = '&#9733;';
    }
    localStorage.setItem('posStarred', JSON.stringify(starredItems));
    if(!searchInput.value.trim() && !activeFilterCat && !activeFilterForn) doSearch(); // refresh default view
  }
});

function doSearch(){
  var terms=searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  var results = [];
  var isDefault = false;
  
  if(!terms.length && !activeFilterCat && !activeFilterForn && starredItems.length > 0) {
      results = ITEMS.filter(function(it){ return starredItems.includes(it.cod); });
      isDefault = true;
  } else {
      results=ITEMS.filter(function(item){
        if(activeFilterCat && item.grp !== activeFilterCat) return false;
        if(activeFilterForn && item.forn !== activeFilterForn) return false;
        if(!terms.length)return true;
        return terms.every(function(t){return item._s.indexOf(t)!==-1});
      });
  }
  var MAX=200,showing=results.slice(0,MAX);
  var cartCods={};cart.forEach(function(c){if(!c.item.custom)cartCods[c.item.cod]=true});

  if(!results.length&&(terms.length||activeFilterCat||activeFilterForn)){
    tableWrap.style.display='block';
    tbody.innerHTML='';emptyState.style.display='flex';
    emptyState.querySelector('.empty-text').textContent='Nessun articolo trovato';
    mostraScorciatoiaFuoriListino(searchInput.value.trim());
    resultsInfo.innerHTML='';return;
  }
  if(!results.length && !terms.length && !starredItems.length) {
    tableWrap.style.display='block';
    tbody.innerHTML='';emptyState.style.display='flex';
    emptyState.querySelector('.empty-text').textContent='Digita per cercare o aggiungi preferiti';
    mostraScorciatoiaFuoriListino('');
    resultsInfo.innerHTML='';return;
  }
  
  emptyState.style.display='none';
  mostraScorciatoiaFuoriListino('');
  if(isDefault) {
      resultsInfo.innerHTML='<span>&#9733; Articoli Preferiti ('+results.length+')</span>';
  } else {
      resultsInfo.innerHTML='<span>'+results.length.toLocaleString('it')+'</span> risultati'+(results.length>MAX?' \u2014 primi <span>'+MAX+'</span>':'');
  }

  var frag=document.createDocumentFragment();
  showing.forEach(function(item){
    var tr=document.createElement('tr');
    if(cartCods[item.cod])tr.className='in-cart';
    tr.addEventListener('click',function(e){ 
       if(!e.target.closest('.star-btn')) openAddModal(item); 
    });
    var dH=terms.length?hl(item.desc,terms):esc(item.desc);
    var cH=terms.length?hl(item.cod,terms):esc(item.cod);
    var discHtml = item.sconto > 0 ? ('-'+item.sconto+'%') : '';
    var isStar = starredItems.includes(item.cod);
    tr.innerHTML='<td class="col-star"><span class="star-btn '+(isStar?'star-active':'')+'" data-cod="'+esc(item.cod)+'">'+(isStar?'&#9733;':'&#9734;')+'</span></td>'
      +'<td class="col-cod">'+cH+'</td>'
      +'<td class="col-desc">'+dH+'</td>'
      +'<td class="col-cat">'+esc(item.grp?titleCase(item.grp):'\u2014')+'</td>'
      +'<td class="col-forn">'+esc(item.forn||'\u2014')+'</td>'
      +'<td class="col-price">'+fp(item.prezzo)+'</td>'
      +'<td class="col-disc">'+discHtml+'</td>'
      +'<td class="col-net">'+fpu(item.net)+'</td>';
    frag.appendChild(tr);
  });
  tbody.innerHTML='';tbody.appendChild(frag);tableWrap.scrollTop=0;
}

// ADD MODAL
function openAddModal(item){
  currentItem=item;
  $('mCod').textContent='COD. '+item.cod;
  $('mName').textContent=item.desc;
  $('mMeta').textContent=[item.cat,item.grp,item.forn].filter(Boolean).join(' \u00b7 ');
  $('mPrice').textContent='\u20ac '+fpu(item.net);

  var dd = $('mDiscountDetail');
  if(item.sconto > 0){
    dd.style.display='flex';
    $('mOrigPrice').textContent='Listino: \u20ac '+fp(item.prezzo);
    $('mDiscBadge').textContent='-'+item.sconto+'%';
  } else {
    dd.style.display='none';
  }

  var idxEsistente=findCartIndex(item);
  var existing=idxEsistente>-1?cart[idxEsistente]:null;
  mQtyInput.value=existing?existing.qty:1;
  var mExtraDiscountEl = $('mExtraDiscount');
  if(mExtraDiscountEl) mExtraDiscountEl.value = existing ? (existing.extraDiscount || 0) : 0;
  $('mAddBtn').textContent=existing?'\u2713 Aggiorna quantit\u00e0':'+ Aggiungi al preventivo';
  updateSubtotal();
  addOverlay.classList.add('open');
  setTimeout(function(){mQtyInput.focus();mQtyInput.select()},100);
}

function closeAddModal(){addOverlay.classList.remove('open');currentItem=null;searchInput.focus()}
addOverlay.addEventListener('click',function(e){if(e.target===addOverlay)closeAddModal()});
$('addCloseBtn').addEventListener('click',closeAddModal);
$('addCancelBtn').addEventListener('click',closeAddModal);
mQtyInput.addEventListener('input',updateSubtotal);
var mExtraDiscountEl = $('mExtraDiscount');
if(mExtraDiscountEl) {
  mExtraDiscountEl.addEventListener('input',updateSubtotal);
  mExtraDiscountEl.addEventListener('change',updateSubtotal);
}

function updateSubtotal(){
  var q=parseFloat(mQtyInput.value)||0;
  var p=currentItem?(currentItem.net||0):0;
  var mED = $('mExtraDiscount');
  var ed = mED ? (parseFloat(mED.value)||0) : 0;
  if(ed > 0) p = p * (1 - ed/100);
  var sub = ro2(q * p);
  $('mSubtotal').textContent='\u20ac '+fp(sub);
}

$('mAddBtn').addEventListener('click',function(){
  if(!currentItem)return;
  var qty=parseFloat(mQtyInput.value)||0;
  var mED = $('mExtraDiscount');
  var ed=mED ? (parseFloat(mED.value)||0) : 0;
  if(qty<=0)return;
  var idxEsistente=findCartIndex(currentItem);
  var existing=idxEsistente>-1?cart[idxEsistente]:null;
  var wasUpdate=!!existing;
  if(existing){existing.qty=qty; existing.extraDiscount=ed;}else{cart.push({item:currentItem,qty:qty,extraDiscount:ed})}
  window.currentQuoteIdSaved = null;
  closeAddModal();renderCart();doSearch();
  showToast(wasUpdate?'\u2713 Quantit\u00e0 aggiornata':'\u2713 Aggiunto al preventivo');
});

// --- ARTICOLI FUORI LISTINO -------------------------------------------------
// Il flusso normale resta quello di sempre: si cerca, si clicca, si aggiunge.
// Questa e' solo la via d'uscita per la voce che in anagrafica non c'e'. Compare
// dove serve davvero — sotto una ricerca senza risultati — e in un bottone
// discreto accanto ai filtri. La voce creata non entra in ITEMS: resta nel
// carrello, finisce nel preventivo salvato, e li' muore.

var customItemOverlay = $('customItemOverlay');

function mostraScorciatoiaFuoriListino(termine){
  var b = $('emptyCustomBtn');
  if(!b) return;
  if(emptyState.style.display === 'none'){ b.style.display = 'none'; return; }
  b.style.display = 'inline-flex';
  b.textContent = termine
    ? '\u2795 Aggiungi \u00ab' + (termine.length > 40 ? termine.slice(0,40) + '\u2026' : termine) + '\u00bb fuori listino'
    : '\u2795 Aggiungi un articolo fuori listino';
  b.setAttribute('data-termine', termine || '');
}

function aggiornaSubtotaleCustom(){
  var prezzo = parseNum($('ciPrezzo').value);
  var qty = parseNum($('ciQty').value);
  $('ciSubtotal').textContent = '\u20ac ' + fp(ro2(ro2(prezzo) * qty));
}

function openCustomItemModal(prefillDesc, uid){
  editingCustomUid = uid || null;
  var voce = null;
  if(uid){
    for(var i=0;i<cart.length;i++){ if(cart[i].item.uid === uid){ voce = cart[i]; break; } }
    if(!voce){ editingCustomUid = null; }
  }

  $('ciDesc').value   = voce ? voce.item.desc : (prefillDesc || '');
  $('ciCod').value    = voce ? (voce.item.cod || '') : '';
  $('ciUm').value     = voce ? (voce.item.um || '') : '';
  $('ciPrezzo').value = voce ? fp(voce.item.net) : '';
  $('ciQty').value    = voce ? voce.qty : '1';
  $('customItemConfirmBtn').textContent = voce ? '\u2713 Aggiorna la voce' : '+ Aggiungi al preventivo';

  aggiornaSubtotaleCustom();
  customItemOverlay.classList.add('open');
  setTimeout(function(){
    var campo = voce ? $('ciPrezzo') : $('ciDesc');
    campo.focus(); campo.select();
  }, 100);
}

function closeCustomItemModal(){
  customItemOverlay.classList.remove('open');
  editingCustomUid = null;
}

function confirmCustomItem(){
  var desc = $('ciDesc').value.trim();
  if(!desc){ alert('La descrizione e\' obbligatoria.'); $('ciDesc').focus(); return; }

  var prezzo = ro2(parseNum($('ciPrezzo').value));
  if(prezzo < 0){ alert('Il prezzo non puo\' essere negativo.'); $('ciPrezzo').focus(); return; }
  if(prezzo === 0 && !confirm('Prezzo a zero: la riga risultera\' in omaggio. Confermi?')){
    $('ciPrezzo').focus(); return;
  }

  var qty = parseNum($('ciQty').value);
  if(qty <= 0){ alert('La quantita\' deve essere maggiore di zero.'); $('ciQty').focus(); return; }

  var cod = $('ciCod').value.trim();
  var um  = $('ciUm').value.trim();

  if(editingCustomUid){
    for(var i=0;i<cart.length;i++){
      if(cart[i].item.uid === editingCustomUid){
        cart[i].item.desc = desc;
        cart[i].item.cod = cod;
        cart[i].item.um = um;
        cart[i].item.prezzo = prezzo;
        cart[i].item.net = prezzo;
        cart[i].qty = qty;
        break;
      }
    }
    showToast('\u2713 Voce aggiornata');
  } else {
    cart.push({
      item: {
        uid: 'FL-' + Date.now() + '-' + (++customItemSeq),
        custom: true,
        cod: cod, desc: desc, um: um,
        prezzo: prezzo, sconto: 0, net: prezzo,
        grp: '', forn: ''
      },
      qty: qty,
      extraDiscount: 0
    });
    showToast('\u2713 Articolo fuori listino aggiunto');
  }

  window.currentQuoteIdSaved = null;
  closeCustomItemModal();
  renderCart();
  if(prevOverlay.classList.contains('open')) renderPrevBody();
}

if($('customItemBtn')) $('customItemBtn').addEventListener('click', function(){
  openCustomItemModal(searchInput.value.trim(), null);
});
if($('emptyCustomBtn')) $('emptyCustomBtn').addEventListener('click', function(){
  openCustomItemModal(this.getAttribute('data-termine') || '', null);
});
if($('customItemCloseBtn')) $('customItemCloseBtn').addEventListener('click', closeCustomItemModal);
if($('customItemCancelBtn')) $('customItemCancelBtn').addEventListener('click', closeCustomItemModal);
if($('customItemConfirmBtn')) $('customItemConfirmBtn').addEventListener('click', confirmCustomItem);
if(customItemOverlay) customItemOverlay.addEventListener('click', function(e){
  if(e.target === customItemOverlay) closeCustomItemModal();
});
['ciPrezzo','ciQty'].forEach(function(id){
  if($(id)) $(id).addEventListener('input', aggiornaSubtotaleCustom);
});
if($('customItemModal')) $('customItemModal').addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); confirmCustomItem(); }
});

// CART
function renderCart(){
  if(!cart.length){
    cartBody.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">&#128203;</div><div class="cart-empty-text">Clicca su un articolo<br>per aggiungerlo al preventivo</div></div>';
    cartFooter.style.display='none';cartBadge.style.display='none';
    cartSubtitle.textContent='Seleziona articoli dal listino';
    if(fabBadge) fabBadge.textContent = '0';
    return;
  }
  cartBadge.style.display='flex';cartBadge.textContent=cart.length;
  cartFooter.style.display='block';
  cartSubtitle.textContent=cart.length+' articol'+(cart.length===1?'o':'i')+' selezionat'+(cart.length===1?'o':'i');
  var html='';
  cart.forEach(function(c,idx){
    var unitNet = prezzoUnitario(c);
    var sub = totaleRiga(c);
    var discParts = [];
    if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
    if(c.extraDiscount > 0) discParts.push('extra -'+c.extraDiscount+'%');
    var discLine = discParts.length > 0 ? '<div class="cart-item-disc">Sc. '+discParts.join(' | ')+' (listino '+fp(c.item.prezzo)+')</div>' : '';
    var isCustom = !!c.item.custom;
    // Una voce fuori listino non ha una riga nel listino su cui tornare a
    // cliccare: l'unico modo per correggerla e' da qui.
    var nameHtml = isCustom
      ? '<div class="cart-item-name cart-item-editable" data-action="editcustom" data-idx="'+idx+'" title="Modifica questa voce">'+esc(c.item.desc)+'<span class="edit-hint">&#9998;</span></div>'
      : '<div class="cart-item-name">'+esc(c.item.desc)+'</div>';
    var codHtml = isCustom
      ? '<div class="cart-item-cod"><span class="badge-fuorilistino">fuori listino</span>'+(c.item.cod?' '+esc(c.item.cod):'')+'</div>'
      : '<div class="cart-item-cod">'+esc(c.item.cod)+'</div>';
    var umHtml = c.item.um ? '<span class="cart-item-um">'+esc(c.item.um)+'</span>' : '';
    html+='<div class="cart-item'+(isCustom?' is-custom':'')+'">'
      +'<div class="cart-item-top">'+nameHtml+'<button class="cart-item-remove" data-action="remove" data-idx="'+idx+'" title="Rimuovi">&times;</button></div>'
      +codHtml
      +discLine
      +'<div class="cart-item-bottom">'
      +'<div class="cart-item-qty">'
      +'<button data-action="dec" data-idx="'+idx+'">&minus;</button>'
      +'<input type="number" value="'+c.qty+'" min="1" step="0.01" data-action="setqty" data-idx="'+idx+'">'
      +'<button data-action="inc" data-idx="'+idx+'">+</button>'
      +'</div>'+umHtml
      // Il prezzo applicato sotto il totale di riga: prima, per sapere a
      // quanto stavi vendendo, dovevi riaprire il modale dell'articolo.
      +'<div class="cart-item-money">'
      +'<div class="cart-item-total">\u20ac '+fp(sub)+'</div>'
      +'<div class="cart-item-unit">\u20ac '+fpu(unitNet)+(c.item.um?' / '+esc(c.item.um):' cad.')+'</div>'
      +'</div>'
      +'</div></div>';
  });
  cartBody.innerHTML=html;updateTotals();
}

cartBody.addEventListener('click',function(e){
  // closest e non e.target: il click puo' arrivare sull'icona matita dentro il
  // nome, non sull'elemento che porta data-action.
  var t=e.target.closest('[data-action]');
  if(!t)return;
  var a=t.getAttribute('data-action'),i=parseInt(t.getAttribute('data-idx'),10);
  if(isNaN(i))return;
  if(a==='remove'){cart.splice(i,1);window.currentQuoteIdSaved=null;renderCart();doSearch();showToast('Articolo rimosso')}
  else if(a==='dec'){cart[i].qty=Math.max(1,cart[i].qty-1);window.currentQuoteIdSaved=null;renderCart()}
  else if(a==='inc'){cart[i].qty++;window.currentQuoteIdSaved=null;renderCart()}
  else if(a==='editcustom'){openCustomItemModal('',cart[i].item.uid)}
});
cartBody.addEventListener('change',function(e){
  var t=e.target;
  if(t.getAttribute('data-action')==='setqty'){
    var i=parseInt(t.getAttribute('data-idx'),10);
    cart[i].qty=Math.max(1,parseFloat(t.value)||1);window.currentQuoteIdSaved=null;renderCart();
  }
});

function updateTotals(){
  var nItems=0;
  cart.forEach(function(c){ nItems += c.qty; });
  var netto = nettoCarrello();
  var iva=ro2(netto*0.22);
  $('ftItems').textContent=nItems;
  $('ftNetto').textContent='\u20ac '+fp(netto);
  $('ftIva').textContent='\u20ac '+fp(iva);
  $('ftTotale').textContent='\u20ac '+fp(ro2(netto+iva));
  if(fabBadge) fabBadge.textContent=cart.length;
}

if(mobileCartBtn && cartCloseBtn) {
    mobileCartBtn.addEventListener('click', function() {
        cartPanel.classList.add('open');
    });
    cartCloseBtn.addEventListener('click', function() {
        cartPanel.classList.remove('open');
    });
}

$('btnClear').addEventListener('click',function(){
  if(!cart.length||!confirm('Svuotare tutto il preventivo?'))return;
  cart=[];window.currentQuoteIdSaved=null;renderCart();doSearch();showToast('Preventivo svuotato');
});
$('btnPrev').addEventListener('click',showPreventivo);

function getGlobalDiscountVal() {
    var gdEl = $('globalDiscountAbsolute');
    if (!gdEl) return 0;
    var digits = (gdEl.value || "").replace(/\D/g, '');
    if (!digits) digits = "0";
    return parseInt(digits, 10) / 100;
}

if($('globalDiscountAbsolute')) {
  $('globalDiscountAbsolute').addEventListener('input', function(e){ 
      var val = getGlobalDiscountVal();
      this.value = val.toFixed(2).replace('.', ',');
      renderPrevBody(); 
  });
}

function renderPrevBody() {
  if(!cart.length)return;
  var netto=0;
  var rows='';
  cart.forEach(function(c){
    var unitNet = prezzoUnitario(c);
    var sub = totaleRiga(c);
    netto+=sub;
    var discParts = [];
    if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
    if(c.extraDiscount > 0) discParts.push('-'+c.extraDiscount+'%');
    var discTd = discParts.length > 0 ? discParts.join('<br>') : '';
    // Il marcatore "fuori listino" e' per l'operatore: .prev-fl sparisce nella
    // stampa e nel PDF, dove al cliente serve solo la riga.
    var codTd = c.item.custom
      ? (c.item.cod ? esc(c.item.cod) : '<span class="prev-fl">fuori listino</span>')
      : esc(c.item.cod);
    rows+='<tr><td class="prev-cod">'+codTd+'</td><td>'+esc(c.item.desc)
      +'</td><td class="r">'+fp(c.item.prezzo)+'</td><td class="disc-cell" style="line-height:1.2;">'+discTd
      +'</td><td class="r">'+fpu(unitNet)+'</td><td class="r">'+esc(qtyLabel(c))
      +'</td><td class="r">'+fp(sub)+'</td></tr>';
  });
  netto = ro2(netto);
  var baseIva = ro2(netto*0.22);
  var totIvaInc = ro2(netto+baseIva);
  
  var globalDiscount = getGlobalDiscountVal();
  var finalTotIvaInc = ro2(totIvaInc - globalDiscount);
  if(finalTotIvaInc < 0) finalTotIvaInc = 0;
  var finalNetto = ro2(finalTotIvaInc / 1.22);
  var finalIva = ro2(finalTotIvaInc - finalNetto);

  var today=new Date().toLocaleDateString('it-IT');
  var html = '<div style="margin-bottom:20px"><div style="font-size:11px;color:var(--text3)">Il Magazzino Edile S.r.l. \u2014 Preventivo del '+today+'</div></div>'
    +'<table class="prev-table"><thead><tr><th>Codice</th><th>Descrizione</th><th class="r">Listino \u20ac</th><th class="r">Sc.%</th><th class="r">Netto \u20ac</th><th class="r">Qt\u00e0</th><th class="r">Totale \u20ac</th></tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot>';
  
  if(globalDiscount > 0) {
    html += '<tr><td colspan="6" style="text-align:right;font-size:12px;color:var(--text2)">Totale prima dello sconto</td><td class="prev-total-val r" style="font-size:12px;color:var(--text2)">'+fp(totIvaInc)+'</td></tr>'
      + '<tr><td colspan="6" style="text-align:right;font-weight:bold;color:var(--red)">Sconto Arrotondamento (IVA inclusa)</td><td class="r" style="color:var(--red);font-weight:bold;">- '+fp(globalDiscount)+'</td></tr>';
  }
  
  html += '<tr><td colspan="6" style="text-align:right">Totale Netto</td><td class="prev-total-val r">'+fp(finalNetto)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:12px;color:var(--text2)">IVA 22%</td><td class="r" style="font-family:JetBrains Mono,monospace;font-size:12px">'+fp(finalIva)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:14px">Totale IVA incl.</td><td class="prev-total-val r" style="font-size:18px">'+fp(finalTotIvaInc)+'</td></tr>'
    +'</tfoot></table>';
  $('prevBody').innerHTML=html;
}

function showPreventivo(scontoCassa){
  if(!cart.length)return;
  if($('globalDiscountAbsolute')) {
      $('globalDiscountAbsolute').value = fp(scontoCassa || 0);
  }
  renderPrevBody();
  prevOverlay.classList.add('open');
}

function closePrev(){prevOverlay.classList.remove('open')}
prevOverlay.addEventListener('click',function(e){if(e.target===prevOverlay)closePrev()});
$('prevCloseBtn').addEventListener('click',closePrev);
$('prevCloseBtnFoot').addEventListener('click',closePrev);

// Swipe to close su Mobile
var pMod = $('prevModal');
var pTx = 0, pTy = 0;
if(pMod){
  pMod.addEventListener('touchstart', function(e){ pTx = e.changedTouches[0].screenX; pTy = e.changedTouches[0].screenY; }, {passive:true});
  pMod.addEventListener('touchend', function(e){
    var dx = e.changedTouches[0].screenX - pTx;
    var dy = Math.abs(e.changedTouches[0].screenY - pTy);
    // Se lo scorrimento supera 80px verso destra ed è prevalentemente orizzontale
    if(dx > 80 && dx > dy * 1.5) closePrev();
  }, {passive:true});
}

// Autocomplete Logica Clienti
var custSearch = $('customerSearch');
var custRes = $('customerResults');
var selCustBox = $('selectedCustomerBox');

if(custSearch) {
  custSearch.addEventListener('input', function(){
    var q = this.value.toLowerCase().trim();
    if(CLIENTI.length === 0) { custRes.style.display = 'none'; return; }
    if(q.length < 2) { custRes.style.display = 'none'; return; }
    var arr = CLIENTI.filter(function(c){ 
      return (c.ragione && c.ragione.toLowerCase().includes(q)) || (c.piva && c.piva.toLowerCase().includes(q)); 
    }).slice(0, 20);
    
    if(!arr.length) { custRes.style.display = 'none'; return; }
    
    var html = '';
    arr.forEach(function(c, i){
      html += '<div class="customer-row" data-idx="'+i+'" style="padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer;">'
           + '<div style="font-weight:600; font-size:13px; color:var(--text);">' + c.ragione + '</div>'
           + '<div style="font-size:11px; color:var(--text3);">' + c.citta + (c.piva ? ' - P.IVA: '+c.piva : '') + '</div></div>';
    });
    custRes.innerHTML = html;
    custRes.style.display = 'block';
    custRes.currentResults = arr;
  });

  custRes.addEventListener('click', function(e){
    var row = e.target.closest('.customer-row');
    if(!row) return;
    var idx = row.getAttribute('data-idx');
    currentCustomer = custRes.currentResults[idx];
    
    custSearch.value = '';
    custRes.style.display = 'none';
    custSearch.parentElement.style.display = 'none';
    
    
    updateSelectedCustomerUI();
    selCustBox.style.display = 'block';
    $('quoteContactDetails').style.display = 'block';
    window.currentQuoteIdSaved = null;
  });

  $('btnRemoveCustomer').addEventListener('click', function(){
    currentCustomer = null;
    selCustBox.style.display = 'none';
    $('quoteContactDetails').style.display = 'none';
    $('quoteTel').value = '';
    $('quoteCantiere').value = '';
    custSearch.parentElement.style.display = 'block';
    custSearch.focus();
    window.currentQuoteIdSaved = null;
  });
}

// --- GESTIONE CLIENTE MANUALE ---
if($('btnNewCustomer')) {
  $('btnNewCustomer').addEventListener('click', openCustomerModal);
}
if($('customerCloseBtn')) $('customerCloseBtn').addEventListener('click', closeCustomerModal);
if($('customerCancelBtn')) $('customerCancelBtn').addEventListener('click', closeCustomerModal);
if($('customerConfirmBtn')) $('customerConfirmBtn').addEventListener('click', confirmCustomer);

function openCustomerModal() {
  if(currentCustomer) {
    $('custRagione').value = currentCustomer.ragione || '';
    $('custPiva').value = currentCustomer.piva || '';
    $('custEmail').value = currentCustomer.email || '';
    $('custIndirizzo').value = currentCustomer.indirizzo || '';
    $('custCitta').value = currentCustomer.citta || '';
    $('custSaveDb').checked = false;
  } else if(custSearch.value.trim().length > 0) {
    $('custRagione').value = titleCase(custSearch.value.trim());
    $('custPiva').value = '';
    $('custEmail').value = '';
    $('custIndirizzo').value = '';
    $('custCitta').value = '';
    $('custSaveDb').checked = true;
  } else {
    // Clear all
    ['custRagione','custPiva','custEmail','custIndirizzo','custCitta'].forEach(id => $(id).value = '');
    $('custSaveDb').checked = true;
  }
  $('customerOverlay').classList.add('open');
}

function closeCustomerModal() {
  $('customerOverlay').classList.remove('open');
}

async function confirmCustomer() {
  const ragione = $('custRagione').value.trim();
  if(!ragione) { alert("La Ragione Sociale è obbligatoria."); return; }
  
  const nuovoCliente = {
    ragione: ragione,
    piva: $('custPiva').value.trim(),
    email: $('custEmail').value.trim(),
    indirizzo: $('custIndirizzo').value.trim(),
    citta: $('custCitta').value.trim(),
    manual: true
  };

  if($('custSaveDb').checked) {
    if(!db) { alert("Errore: Firebase non connesso."); }
    else {
      showToast("Salvataggio cliente nel Cloud...");
      try {
        await db.collection('clienti').add({
            ...nuovoCliente,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        CLIENTI.push(nuovoCliente);
      } catch(e) { console.error(e); }
    }
  }

  currentCustomer = nuovoCliente;
  updateSelectedCustomerUI();
  
  closeCustomerModal();
  custSearch.value = '';
  custRes.style.display = 'none';
  custSearch.parentElement.style.display = 'none';
  selCustBox.style.display = 'block';
  $('quoteContactDetails').style.display = 'block';
  window.currentQuoteIdSaved = null;
  showToast("Cliente impostato");
}

function updateSelectedCustomerUI() {
  if(!currentCustomer) return;
  $('scRagione').textContent = currentCustomer.ragione;
  $('scIndirizzo').textContent = currentCustomer.indirizzo || '';
  $('scCitta').textContent = currentCustomer.citta || '';
  $('scPiva').textContent = currentCustomer.piva || '';
  
  // Update datalists
  const meta = CUSTOMER_META[currentCustomer.ragione] || { telefoni: [], cantieri: [] };
  
  const datalistTelefoni = $('listTelefoni');
  if (datalistTelefoni) {
      datalistTelefoni.innerHTML = '';
      meta.telefoni.forEach(t => {
          let opt = document.createElement('option');
          opt.value = t;
          datalistTelefoni.appendChild(opt);
      });
  }
  
  const datalistCantieri = $('listCantieri');
  if (datalistCantieri) {
      datalistCantieri.innerHTML = '';
      meta.cantieri.forEach(c => {
          let opt = document.createElement('option');
          opt.value = c;
          datalistCantieri.appendChild(opt);
      });
  }
}

function getQuoteCustomer() {
    if(!currentCustomer) return null;
    var tel = $('quoteTel') ? $('quoteTel').value.trim() : '';
    var cantiere = $('quoteCantiere') ? $('quoteCantiere').value.trim() : '';
    return { ...currentCustomer, tel: tel, cantiere: cantiere };
}

async function syncCustomClienti() {
    if(!db) return;
    try {
        const snap = await db.collection('clienti').orderBy('timestamp', 'desc').get();
        snap.forEach(doc => {
            const data = doc.data();
            const exists = CLIENTI.some(c => c.ragione === data.ragione && c.piva === data.piva);
            if(!exists) CLIENTI.push(data);
        });
    } catch(e) {}
}

async function syncCustomerMeta() {
    if(!db) return;
    try {
        const snap = await db.collection('customer_meta').get();
        snap.forEach(doc => {
            // doc.id is a base64 encoded string of ragione, or just a custom id with reason field
            CUSTOMER_META[doc.data().ragione] = {
                telefoni: doc.data().telefoni || [],
                cantieri: doc.data().cantieri || [],
                sitePhones: doc.data().sitePhones || {}
            };
        });
        localStorage.setItem('posCustomerMeta', JSON.stringify(CUSTOMER_META));
    } catch(e) {}
}

async function updateCustomerMeta(ragione, tel, cantiere) {
    if(!ragione || (!tel && !cantiere)) return;
    
    var meta = CUSTOMER_META[ragione] || { telefoni: [], cantieri: [], sitePhones: {} };
    if(!meta.sitePhones) meta.sitePhones = {};
    var changed = false;
    
    if(tel && !meta.telefoni.includes(tel)) {
        meta.telefoni.push(tel);
        changed = true;
    }
    if(cantiere && !meta.cantieri.includes(cantiere)) {
        meta.cantieri.push(cantiere);
        changed = true;
    }
    if(cantiere && tel && meta.sitePhones[cantiere] !== tel) {
        meta.sitePhones[cantiere] = tel;
        changed = true;
    }
    
    if(changed) {
        CUSTOMER_META[ragione] = meta;
        localStorage.setItem('posCustomerMeta', JSON.stringify(CUSTOMER_META));
        
        if(db) {
            try {
                // Find document by ragione
                const snapshot = await db.collection('customer_meta').where('ragione', '==', ragione).limit(1).get();
                if(snapshot.empty) {
                    await db.collection('customer_meta').add({
                        ragione: ragione,
                        telefoni: meta.telefoni,
                        cantieri: meta.cantieri,
                        sitePhones: meta.sitePhones
                    });
                } else {
                    const docId = snapshot.docs[0].id;
                    await db.collection('customer_meta').doc(docId).update({
                        telefoni: meta.telefoni,
                        cantieri: meta.cantieri,
                        sitePhones: meta.sitePhones
                    });
                }
            } catch(e) { console.error("Error updating customer_meta", e); }
        }
    }
}

$('prevPrintBtn').addEventListener('click', async function(){
  var qId = await saveQuoteToCloud('PDF');
  var qc = getQuoteCustomer();
  
  if(typeof html2pdf !== 'undefined') {
    var element = document.createElement('div');
    var today = new Date().toLocaleDateString('it-IT');
    var qStr = qId ? '<br><span style="font-size:14px;color:#16a34a;">N° ' + qId + '</span>' : '';
    var custHtml = '';
    if (qc) {
      var destBox = '';
      if(qc.cantiere || qc.tel) {
          destBox = '<div style="margin-top:10px; padding:6px; background:#f3f4f6; border-radius:4px; font-size:11px; text-align:left; border-left:3px solid var(--accent);">';
          if(qc.cantiere) destBox += '<div style="margin-bottom:2px"><strong>Destinazione Cantiere:</strong> '+qc.cantiere+'</div>';
          if(qc.tel) destBox += '<div><strong>Tel. Riferimento:</strong> '+qc.tel+'</div>';
          destBox += '</div>';
      }
      custHtml = '<div style="text-align:right; font-size:13px; margin-bottom:24px;">'
               + '<div><strong>Spett.le</strong></div>'
               + '<div style="font-size:16px; font-weight:bold; color:#000;">'+qc.ragione+'</div>'
               + '<div>'+qc.indirizzo+'</div>'
               + '<div>'+qc.citta+'</div>'
               + (qc.piva ? '<div>P.IVA: '+qc.piva+'</div>' : '')
               + destBox
               + '</div>';
    }

    element.innerHTML = '<div style="padding:40px; color:#222; font-family:Arial,sans-serif;">'
      + '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">'
      + '<div>'
      + '<h1>Il Magazzino Edile S.r.l.</h1>'
      + '<div style="color:#666; font-size:12px;">Preventivo del '+today+qStr+'</div>'
      + '</div>'
      + custHtml
      + '</div>'
      + $('prevBody').innerHTML
      + '<div style="margin-top:20px; font-size:12px; padding-top:10px; border-top:1px solid #eee; color:#444;"><strong>Coordinate Bancarie (IBAN):</strong> IT85J0503401742000000032814</div>'
      + '</div>';
    var style = document.createElement('style');
    style.innerHTML = 'table{width:100%;border-collapse:collapse;margin-top:16px}'
      +'th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;color:#666;border-bottom:2px solid #ccc}'
      +'th.r,td.r{text-align:right}'
      +'td{padding:8px 10px;font-size:12px;border-bottom:1px solid #eee}'
      +'tfoot td{border-top:2px solid #333;font-weight:bold;padding:10px}'
      +'.prev-cod{font-family:monospace;font-size:11px;color:#b45309}'
      +'.prev-fl{display:none}'
      +'.prev-total-val{color:#16a34a;font-family:monospace;}';
    element.appendChild(style);

    var opt = {
      margin:       10,
      filename:     'preventivo_'+(qId ? qId : today.split('/').join('-'))+'.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    showToast("Generazione PDF in corso...");
    html2pdf().set(opt).from(element).save().then(function(){
       showToast("PDF Scaricato!");
    });
  } else {
    var content=$('prevBody').innerHTML;
    var w=window.open('','_blank');
    var qStr = qId ? ' N° ' + qId : '';
    w.document.write('<!DOCTYPE html><html><head><title>Preventivo - Il Magazzino Edile</title>'
      +'<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#222}'
      +'h1{font-size:20px;margin-bottom:4px}.sub{color:#666;font-size:12px;margin-bottom:24px}'
      +'table{width:100%;border-collapse:collapse;margin-top:16px}'
      +'th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#666;border-bottom:2px solid #ccc}'
      +'th.r,td.r{text-align:right}'
      +'td{padding:8px 10px;font-size:12px;border-bottom:1px solid #eee}'
      +'td.r{font-family:monospace}'
      +'td.disc-cell{color:#e67700;font-family:monospace;font-size:11px;text-align:right}'
      +'tfoot td{border-top:2px solid #333;font-weight:bold;padding:10px}'
      +'.prev-cod{font-family:monospace;font-size:11px;color:#b45309}'
      +'.prev-fl{display:none}'
      +'.prev-total-val{font-family:monospace;color:#16a34a}'
      +'</style></head><body>'
      +'<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">'
      +'<div><h1>Il Magazzino Edile S.r.l.</h1>'
      +'<div class="sub">Preventivo del '+new Date().toLocaleDateString('it-IT')+'<br><span style="color:#16a34a;font-weight:bold;font-size:14px">'+qStr+'</span></div></div>'
      +(qc ? '<div style="text-align:right; font-size:13px;"><div><strong>Spett.le</strong></div><div style="font-size:16px; font-weight:bold;">'+qc.ragione+'</div><div>'+qc.indirizzo+'</div><div>'+qc.citta+'</div>'+(qc.piva?'<div>P.IVA: '+qc.piva+'</div>':'')+((qc.cantiere||qc.tel)?'<div style="margin-top:8px; font-size:11px; color:#444; border:1px solid #ddd; padding:4px; text-align:left;">'+(qc.cantiere?'<strong>Destinazione:</strong> '+qc.cantiere+'<br>':'')+(qc.tel?'<strong>Tel:</strong> '+qc.tel:'')+'</div>':'')+'</div>' : '')
      +'</div>'
      +content
      +'<div style="margin-top:20px; font-size:12px; padding-top:10px; border-top:1px solid #eee; color:#444;"><strong>Coordinate Bancarie (IBAN):</strong> IT85J0503401742000000032814</div>'
      +'</body></html>');
    w.document.close();
    setTimeout(function(){w.print()},300);
  }
});

async function saveQuoteToCloud(type) {
    if(!db || !cart.length) return null;
    if(window.currentQuoteIdSaved) return window.currentQuoteIdSaved;
    
    showToast("Sincronizzazione su Cloud...");
    try {
        var nextNumStr = await db.runTransaction(async (transaction) => {
            var counterRef = db.collection('metadata').doc('quoteCounter');
            var doc = await transaction.get(counterRef);
            var nextNum = 1;
            if(doc.exists) nextNum = (doc.data().value || 0) + 1;
            transaction.set(counterRef, { value: nextNum });
            return String(nextNum).padStart(4, '0');
        });
        
        var dateObj = new Date();
        var quoteId = 'PREV-' + dateObj.getFullYear() + '-' + nextNumStr;
        
        var netto = 0;
        var itemsForDb = cart.map(function(c){
           var unitNet = prezzoUnitario(c);
           var sub = totaleRiga(c);
           netto += sub;
           return {
               cod: c.item.cod || '', desc: c.item.desc, qty: c.qty, 
               net: unitNet, subtotal: sub, prezzo: c.item.prezzo || 0, sconto: c.item.sconto || 0, extraDiscount: c.extraDiscount || 0,
               custom: !!c.item.custom, um: c.item.um || ''
           };
        });
        
        netto = ro2(netto);
        var baseIva = ro2(netto * 0.22);
        var totIvaInc = ro2(netto + baseIva);
        var globalDiscount = getGlobalDiscountVal();
        var finalTotIvaInc = ro2(totIvaInc - globalDiscount);
        if(finalTotIvaInc < 0) finalTotIvaInc = 0;
        var finalNetto = ro2(finalTotIvaInc / 1.22);
        
        var qc = getQuoteCustomer();
        if(qc) {
            // Async background meta update
            updateCustomerMeta(qc.ragione, qc.tel, qc.cantiere);
        }
        
        var quoteData = {
           quoteId: quoteId,
           dateIso: dateObj.toISOString(),
           timestamp: firebase.firestore.FieldValue.serverTimestamp(),
           customer: qc,
           items: itemsForDb,
           netTotal: finalNetto,
           globalDiscount: globalDiscount,
           type: type,
           searchTokens: (quoteId + " " + (qc ? qc.ragione + " " + qc.piva : "")).toLowerCase()
        };
        
        await db.collection('quotes').doc(quoteId).set(quoteData);
        window.currentQuoteIdSaved = quoteId;
        return quoteId;
    } catch(err) {
        console.error(err);
        showToast("Errore di sincronizzazione");
        return null;
    }
}

$('prevEmailBtn').addEventListener('click', async function() {
    if(!cart.length) return;
    
    var qId = await saveQuoteToCloud('EMAIL');
    var qStr = qId ? " (N° " + qId + ")" : "";
    var qc = getQuoteCustomer();
    
    var bodyText = "In allegato i dettagli del Preventivo" + qStr + ".\n\n";
    if(qc) {
        bodyText += "Spett.le " + qc.ragione + "\n";
        if(qc.cantiere || qc.tel) {
            bodyText += "\nRiferimenti Consegna:\n";
            if(qc.cantiere) bodyText += "Cantiere: " + qc.cantiere + "\n";
            if(qc.tel) bodyText += "Telefono: " + qc.tel + "\n";
        }
    }
    bodyText += "\nElenco:\n";
    var netto = 0;
    cart.forEach(function(c){
        var unitNet = prezzoUnitario(c);
        var sub = totaleRiga(c);
        netto += sub;
        var discText = "";
        var discParts = [];
        if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
        if(c.extraDiscount > 0) discParts.push('-'+c.extraDiscount+'%');
        if(discParts.length > 0) discText = " (Sc. " + discParts.join('|') + ")";
        
        bodyText += "- " + qtyLabel(c) + " x " + c.item.desc + discText + " (E. " + fp(sub) + ")\n";
    });
    
    netto = ro2(netto);
    var baseIva = ro2(netto * 0.22);
    var totIvaInc = ro2(netto + baseIva);
    var globalDiscount = getGlobalDiscountVal();
    var finalTotIvaInc = ro2(totIvaInc - globalDiscount);
    if(finalTotIvaInc < 0) finalTotIvaInc = 0;
    var finalNetto = ro2(finalTotIvaInc / 1.22);
    var finalIva = ro2(finalTotIvaInc - finalNetto);

    if(globalDiscount > 0) {
        bodyText += "\nSconto di Cassa (IVA inclusa): -E. " + fp(globalDiscount);
    }
    
    bodyText += "\nTotale Netto: E. " + fp(finalNetto);
    bodyText += "\nIVA 22%: E. " + fp(finalIva);
    bodyText += "\nTotale: E. " + fp(finalTotIvaInc);
    
    bodyText += "\n\nCoordinate Bancarie (IBAN):\nIT85J0503401742000000032814";
    bodyText += "\n\nIl Magazzino Edile S.r.l.";
    
    var subject = encodeURIComponent("Preventivo - Il Magazzino Edile" + qStr);
    var body = encodeURIComponent(bodyText);
    
    var toEmail = (qc && qc.email) ? qc.email : "";
    
    window.location.href = "mailto:" + toEmail + "?subject=" + subject + "&body=" + body;
});

$('prevWhatsappBtn').addEventListener('click', async function() {
    if(!cart.length) return;
    
    var qId = await saveQuoteToCloud('WHATSAPP');
    var qStr = qId ? " (N° " + qId + ")" : "";
    var qc = getQuoteCustomer();
    
    var bodyText = "*Preventivo" + qStr + "*\n\n";
    if(qc) {
        bodyText += "Spett.le *" + qc.ragione + "*\n";
        if(qc.cantiere) bodyText += "Cantiere: _" + qc.cantiere + "_\n";
    }
    bodyText += "\n*Elenco Articoli:*\n";
    var netto = 0;
    cart.forEach(function(c){
        var unitNet = prezzoUnitario(c);
        var sub = totaleRiga(c);
        netto += sub;
        var discText = "";
        var discParts = [];
        if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
        if(c.extraDiscount > 0) discParts.push('-'+c.extraDiscount+'%');
        if(discParts.length > 0) discText = " (_Sc. " + discParts.join('|') + "_)";
        
        bodyText += "▪️ " + qtyLabel(c) + " x " + c.item.desc + discText + " (*€ " + fp(sub) + "*)\n";
    });
    
    netto = ro2(netto);
    var baseIva = ro2(netto * 0.22);
    var totIvaInc = ro2(netto + baseIva);
    var globalDiscount = getGlobalDiscountVal();
    var finalTotIvaInc = ro2(totIvaInc - globalDiscount);
    if(finalTotIvaInc < 0) finalTotIvaInc = 0;
    var finalNetto = ro2(finalTotIvaInc / 1.22);
    var finalIva = ro2(finalTotIvaInc - finalNetto);

    if(globalDiscount > 0) {
        bodyText += "\nSconto di Cassa (IVA incl.): *-€ " + fp(globalDiscount) + "*";
    }
    
    bodyText += "\n\nTotale Netto: € " + fp(finalNetto);
    bodyText += "\nIVA 22%: € " + fp(finalIva);
    bodyText += "\n*Totale Finale: € " + fp(finalTotIvaInc) + "*";
    
    bodyText += "\n\n*Coordinate Bancarie (IBAN):*\n`IT85J0503401742000000032814`";
    bodyText += "\n\n_Il Magazzino Edile S.r.l._";
    
    var toPhone = "";
    if(qc && qc.tel) toPhone = qc.tel;
    
    // Clean phone number
    toPhone = toPhone.replace(/\s+/g, '');
    if(toPhone !== "") {
        if(!toPhone.startsWith("+") && !toPhone.startsWith("00")) {
            toPhone = "+39" + toPhone;
        }
        // Remove the + for the wa.me link
        toPhone = toPhone.replace('+', '');
    } else {
        if(!confirm("Nessun numero di telefono trovato. Vuoi aprire WhatsApp per cercare manualmente il contatto?")) {
            return;
        }
    }
    
    var textEncoded = encodeURIComponent(bodyText);
    var waUrl = "https://wa.me/" + toPhone + "?text=" + textEncoded;
    window.open(waUrl, '_blank');
});

$('prevExportBtn').addEventListener('click',function(){
  if(!cart.length)return;
  if(typeof XLSX === 'undefined') {
     showToast('Libreria Excel non caricata, riprova.');
     return;
  }
  
  var ws_name = "Preventivo";
  var wb = XLSX.utils.book_new();
  var qc = getQuoteCustomer();
  
  var ws_data = [
    ['Il Magazzino Edile S.r.l. - Preventivo'],
    ['Data:', new Date().toLocaleDateString('it-IT')],
    []
  ];

  if(qc) {
      ws_data.push(['CLIENTE:', qc.ragione]);
      if(qc.piva) ws_data.push(['P.IVA:', qc.piva]);
      if(qc.indirizzo) ws_data.push(['INDIRIZZO:', qc.indirizzo + ' ' + (qc.citta||'')]);
      if(qc.cantiere) ws_data.push(['DESTINAZIONE:', qc.cantiere]);
      if(qc.tel) ws_data.push(['TEL RIFERIMENTO:', qc.tel]);
      ws_data.push([]);
  }

  ws_data.push(['Codice', 'Descrizione', 'Prezzo Listino', 'Sconto 1 %', 'Sconto 2 %', 'Prezzo Netto', 'Quantita', 'Totale Riga']);
  
  var headerOffset = ws_data.length;

  cart.forEach(function(c, i){
    var r = i + headerOffset + 1;
    var listino = c.item.prezzo || 0;
// ... rest of the logic should be adjusted for offset
    var sc1 = c.item.sconto || 0;
    var sc2 = c.extraDiscount || 0;
    var qty = c.qty || 1;
    
    ws_data.push([
      c.item.cod,
      c.item.desc + (c.item.um ? ' (' + c.item.um + ')' : ''),
      listino,
      sc1,
      sc2,
      { t: 'n', f: 'C'+r+'*(1-D'+r+'/100)*(1-E'+r+'/100)' },
      qty,
      { t: 'n', f: 'ROUND(F'+r+'*G'+r+', 2)' }   // unico arrotondamento della riga
    ]);
  });
  
  var startRow = headerOffset + 1;
  var endRow = headerOffset + cart.length;
  var totalNettoRow = endRow + 1;
  
  ws_data.push(["", "", "", "", "", "Totale Netto", "", { t:'n', f:'ROUND(SUM(H'+startRow+':H'+endRow+'), 2)' }]);
  ws_data.push(["", "", "", "", "", "IVA 22%", "", { t:'n', f:'ROUND(H'+totalNettoRow+'*0.22, 2)' }]);
  var ivaRow = totalNettoRow + 1;
  ws_data.push(["", "", "", "", "", "Totale (IVA Incl.)", "", { t:'n', f:'ROUND(H'+totalNettoRow+'+H'+ivaRow+', 2)' }]);
  var totalIvaIncRow = ivaRow + 1;
  
  var gd = getGlobalDiscountVal();
  if(gd > 0) {
      ws_data.push(["", "", "", "", "", "Arrotondamento / Cassa", "", -gd]);
      var arrRow = totalIvaIncRow + 1;
      ws_data.push(["", "", "", "", "", "Totale Finale Da Pagare", "", { t:'n', f:'ROUND(H'+totalIvaIncRow+'+H'+arrRow+', 2)' }]);
  }
  
  var ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, ws_name);
  
  var fname = 'preventivo_' + new Date().toISOString().slice(0,10) + '.xlsx';
  XLSX.writeFile(wb, fname);
  showToast('Excel esportato!');
});

function showToast(msg){toastEl.textContent=msg;toastEl.classList.add('show');setTimeout(function(){toastEl.classList.remove('show')},2000)}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(customItemOverlay && customItemOverlay.classList.contains('open'))closeCustomItemModal();
    else if(prevOverlay.classList.contains('open'))closePrev();
    else if(addOverlay.classList.contains('open'))closeAddModal();
    else{searchInput.value='';clearBtn.classList.remove('visible');doSearch();searchInput.focus()}
  }
  if(e.key==='Enter'&&addOverlay.classList.contains('open')&&!(customItemOverlay&&customItemOverlay.classList.contains('open')))$('mAddBtn').click();
});

// Gestione PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      console.log('SW registrato!', reg);
    }).catch(function(err) {
      console.log('SW fallito', err);
    });
  });

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// --- STORICO PREVENTIVI (UI & LOGIC) ---
var storicoOverlay = $('storicoOverlay');
var btnStorico = $('btnStorico');
var storicoCloseBtn = $('storicoCloseBtn');
var btnSearchStorico = $('btnSearchStorico');
var btnClearStorico = $('btnClearStorico');
var storicoListBody = $('storicoListBody');
var sfNum = $('sfNum'), sfDateFrom = $('sfDateFrom'), sfDateTo = $('sfDateTo'), sfCustomer = $('sfCustomer'), sfItem = $('sfItem');

if(btnStorico) btnStorico.addEventListener('click', openStorico);
if(storicoCloseBtn) storicoCloseBtn.addEventListener('click', closeStorico);
if(btnClearStorico) btnClearStorico.addEventListener('click', function() {
    sfNum.value=''; sfDateFrom.value=''; sfDateTo.value=''; sfCustomer.value=''; sfItem.value='';
    loadStorico(false);
});
if(btnSearchStorico) btnSearchStorico.addEventListener('click', function(){ loadStorico(false); });
if($('btnStoricoAltri')) $('btnStoricoAltri').addEventListener('click', function(){ loadStorico(true); });
// I filtri scritti a mano agiscono su quel che e' gia' stato scaricato: si
// applicano mentre si digita, senza richiedere niente al server.
['sfNum','sfCustomer','sfItem'].forEach(function(id){
    if($(id)) $(id).addEventListener('input', function(){ if(STORICO.length) renderStorico(); });
});

function openStorico() {
    if(storicoOverlay) storicoOverlay.classList.add('open');
    loadStorico(false);
}

function closeStorico() {
    if(storicoOverlay) storicoOverlay.classList.remove('open');
}

// Lo storico chiede al server solo la finestra di date richiesta e ne scarica
// una pagina per volta. Prima scaricava gli ultimi 200 preventivi e filtrava
// nel browser: passata quella soglia, i piu' vecchi diventavano irraggiungibili
// qualunque cosa si scrivesse nei filtri.
//
// L'intervallo di date usa dateIso, che e' una stringa ISO: confrontata come
// testo ordina come una data. Filtro e ordinamento cadono sullo stesso campo,
// quindi Firestore non chiede nessun indice composto da creare a mano.
var PAGINA_STORICO = 60;
var storicoUltimoDoc = null;   // cursore per "carica altri"
var storicoFine = false;       // il server non ha altro da dare
var STORICO = [];              // i preventivi caricati finora

function filtriStorico() {
    return {
        num: sfNum.value.trim().toLowerCase(),
        cliente: sfCustomer.value.trim().toLowerCase(),
        articolo: sfItem.value.trim().toLowerCase(),
        da: sfDateFrom.value || '',
        a: sfDateTo.value || ''
    };
}

function costruisciQueryStorico(f) {
    var q = db.collection('quotes');
    if(f.da) q = q.where('dateIso', '>=', f.da + 'T00:00:00.000Z');
    if(f.a)  q = q.where('dateIso', '<=', f.a + 'T23:59:59.999Z');
    return q.orderBy('dateIso', 'desc').limit(PAGINA_STORICO);
}

// Numero, cliente e articolo restano a carico del browser: sono ricerche per
// sottostringa, e Firestore non le sa fare. Agiscono su cio' che e' gia'
// stato scaricato, per questo il conteggio in fondo dice sempre quanti
// documenti sono stati esaminati.
function applicaFiltriLocali(elenco, f) {
    return elenco.filter(function(q){
        if(f.num && (q.quoteId||'').toLowerCase().indexOf(f.num) === -1) return false;
        if(f.cliente) {
            var c = q.customer || {};
            if((c.ragione||'').toLowerCase().indexOf(f.cliente) === -1 &&
               (c.piva||'').toLowerCase().indexOf(f.cliente) === -1) return false;
        }
        if(f.articolo) {
            var trovato = (q.items||[]).some(function(it){
                return (it.desc||'').toLowerCase().indexOf(f.articolo) !== -1 ||
                       (it.cod||'').toLowerCase().indexOf(f.articolo) !== -1;
            });
            if(!trovato) return false;
        }
        return true;
    });
}

function totaleDocumento(q) {
    // netTotal e' gia' al netto dello sconto di cassa: l'IVA ci va sopra.
    return ro2((q.netTotal || 0) * 1.22);
}

function renderStorico() {
    var f = filtriStorico();
    var righe = applicaFiltriLocali(STORICO, f);

    if(!storicoListBody) return;

    if(righe.length === 0) {
        storicoListBody.innerHTML = '';
        $('storicoEmpty').style.display = 'block';
    } else {
        $('storicoEmpty').style.display = 'none';
        storicoListBody.innerHTML = righe.map(function(q){
            var d = new Date(q.dateIso);
            var quando = d.toLocaleDateString('it-IT') + ' ' +
                         d.toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'});
            var cliente = q.customer && q.customer.ragione ? String(q.customer.ragione) : 'Nessun cliente';
            var piva = q.customer && q.customer.piva ? String(q.customer.piva) : '';
            var articoli = (q.items||[]).map(function(it){
                return it.qty + (it.um ? ' '+it.um : '') + ' × ' + (it.desc || it.cod);
            }).join(', ');
            var fuoriListino = (q.items||[]).some(function(it){ return it.custom; })
                ? ' <span class="badge-fuorilistino">fuori listino</span>' : '';
            return '<tr class="storico-row">' +
                '<td><div class="storico-cod">' + esc(q.quoteId) + '</div><div class="storico-date">' + esc(quando) + '</div></td>' +
                '<td><div class="storico-customer">' + esc(cliente) + '</div>' +
                     (piva ? '<div class="storico-piva">P.IVA: '+esc(piva)+'</div>' : '') + '</td>' +
                '<td><div class="storico-items" title="'+esc(articoli)+'">' + esc(articoli) + fuoriListino + '</div></td>' +
                '<td style="text-align:right"><div class="storico-total">€ ' + fp(totaleDocumento(q)) + '</div></td>' +
                '<td style="text-align:center"><button class="btn btn-secondary storico-riapri" data-quote="'+esc(q.quoteId)+'">Riapri ⟳</button></td>' +
                '</tr>';
        }).join('');
    }

    var conteggio = $('storicoConteggio');
    if(conteggio) {
        conteggio.textContent = righe.length === STORICO.length
            ? righe.length + ' preventivi'
            : righe.length + ' di ' + STORICO.length + ' esaminati';
    }
    var altri = $('btnStoricoAltri');
    if(altri) altri.style.display = storicoFine ? 'none' : 'inline-flex';
}

async function loadStorico(continua) {
    if(!db) { alert('Database non configurato.'); return; }

    if(!continua) { STORICO = []; storicoUltimoDoc = null; storicoFine = false; }

    $('storicoLoading').style.display = 'block';
    if($('storicoEmpty')) $('storicoEmpty').style.display = 'none';

    try {
        var f = filtriStorico();
        var q = costruisciQueryStorico(f);
        if(continua && storicoUltimoDoc) q = q.startAfter(storicoUltimoDoc);

        var snap = await q.get();
        snap.forEach(function(doc){ STORICO.push(doc.data()); });

        storicoUltimoDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : storicoUltimoDoc;
        if(snap.docs.length < PAGINA_STORICO) storicoFine = true;

        renderStorico();
    } catch(err) {
        console.error(err);
        if($('storicoEmpty')) {
            $('storicoEmpty').textContent = 'Errore lettura archivio: ' + err.message;
            $('storicoEmpty').style.display = 'block';
        }
    } finally {
        if($('storicoLoading')) $('storicoLoading').style.display = 'none';
    }
}

// Delega: prima ogni riga portava un onclick con il numero interpolato
// nell'HTML e ogni preventivo restava appeso a window['_szQuote_...'].
if(storicoListBody) storicoListBody.addEventListener('click', function(e){
    var b = e.target.closest('.storico-riapri');
    if(!b) return;
    var id = b.getAttribute('data-quote');
    var q = STORICO.filter(function(x){ return x.quoteId === id; })[0];
    if(q) riapriPreventivo(q);
});

function riapriPreventivo(q) {
    if(!q) return;

    if(cart.length > 0 && !confirm("Questo sostituira' il preventivo attualmente in corso. Vuoi procedere?")) return;

    cart = [];
    q.items.forEach(function(it){
        var itemObj;
        if(it.custom){
            // Fuori listino: non c'e' niente da ritrovare in ITEMS, la riga si
            // ricostruisce dal documento salvato. Nuovo uid, perche' la vecchia
            // chiave apparteneva alla sessione in cui fu creata.
            itemObj = {
                uid: 'FL-' + Date.now() + '-' + (++customItemSeq),
                custom: true,
                cod: it.cod || '', desc: it.desc || '', um: it.um || '',
                prezzo: it.prezzo || it.net || 0, sconto: 0, net: it.net || 0,
                grp: '', forn: ''
            };
        } else {
            var matched = ITEMS.filter(function(x){ return x.cod === it.cod })[0];
            itemObj = matched ? matched : {
                cod: it.cod, desc: it.desc, grp: it.grp || '', forn: it.forn || '',
                prezzo: it.prezzo || 0, sconto: it.sconto || 0, net: it.net || 0
            };
        }
        // extraDiscount andava perso alla riapertura: il preventivo ricaricato
        // tornava al prezzo pieno di riga.
        cart.push({ item: itemObj, qty: it.qty, extraDiscount: it.extraDiscount || 0 });
    });

    currentCustomer = q.customer;
    if(currentCustomer && $('customerSearch')) {
        updateSelectedCustomerUI();
        if($('quoteTel')) $('quoteTel').value = currentCustomer.tel || '';
        if($('quoteCantiere')) $('quoteCantiere').value = currentCustomer.cantiere || '';
        $('selectedCustomerBox').style.display = 'block';
        if($('quoteContactDetails')) $('quoteContactDetails').style.display = 'block';
        $('customerSearch').parentElement.style.display = 'none';
    } else if($('customerSearch')) {
        $('selectedCustomerBox').style.display = 'none';
        if($('quoteContactDetails')) $('quoteContactDetails').style.display = 'none';
        if($('quoteTel')) $('quoteTel').value = '';
        if($('quoteCantiere')) $('quoteCantiere').value = '';
        $('customerSearch').parentElement.style.display = 'block';
    }

    window.currentQuoteIdSaved = q.quoteId;

    renderCart();
    doSearch();
    closeStorico();

    // Anche lo sconto di cassa torna: senza, un documento riemesso aveva un
    // totale diverso dall'originale, e nessuno se ne accorgeva.
    showPreventivo(q.globalDiscount || 0);
    showToast('Preventivo ' + q.quoteId + ' riaperto');
}

// Resta raggiungibile dal vecchio nome, nel caso qualcosa lo richiami.
window.restoreQuote = function(quoteId) {
    riapriPreventivo(STORICO.filter(function(x){ return x.quoteId === quoteId; })[0]);
};

if($('quoteCantiere')) {
    $('quoteCantiere').addEventListener('change', function() {
        if(!currentCustomer) return;
        var meta = CUSTOMER_META[currentCustomer.ragione];
        if(meta && meta.sitePhones && meta.sitePhones[this.value]) {
            if($('quoteTel').value.trim() === '') {
                $('quoteTel').value = meta.sitePhones[this.value];
            }
        }
    });
}
