// File Upload Elements
var excelFile = document.getElementById('excelFile');
var clientiFile = document.getElementById('clientiFile');
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

// Firebase Init
var db = null;
try {
  firebase.initializeApp({
      apiKey: "AIzaSyCLdOfp4z3FUJX2xt-xBZciyjxJZWeoh7A",
      authDomain: "magazzino-edile-pos.firebaseapp.com",
      projectId: "magazzino-edile-pos",
      storageBucket: "magazzino-edile-pos.firebasestorage.app",
      messagingSenderId: "696561179056",
      appId: "1:696561179056:web:fc6b1db62ed256fd3fde75"
  });
  db = firebase.firestore();
} catch(e) { console.warn("Firebase non configurato", e); }

try {
  var savedClienti = localStorage.getItem('posClientiData');
  if(savedClienti) { CLIENTI = JSON.parse(savedClienti); }
} catch(e){}

// UI Elements
function $(id){ return document.getElementById(id) }
var searchInput=$('searchInput'), clearBtn=$('clearBtn'), tbody=$('tbody'),
    emptyState=$('emptyState'), resultsInfo=$('resultsInfo'), tableWrap=$('tableWrap'),
    cartPanel=$('cartPanel'), cartBody=$('cartBody'), cartBadge=$('cartBadge'), cartFooter=$('cartFooter'),
    cartSubtitle=$('cartSubtitle'), addOverlay=$('addOverlay'), mQtyInput=$('mQty'),
    prevOverlay=$('prevOverlay'), toastEl=$('toast'),
    mobileCartBtn=$('mobileCartBtn'), cartCloseBtn=$('cartCloseBtn'), fabBadge=$('fabBadge');

function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fp(p){return p!=null?p.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'\u2014'}
function titleCase(s){return s.split(' ').map(function(w){return w.charAt(0)+w.slice(1).toLowerCase()}).join(' ')}
function hl(text,terms){var r=esc(text);terms.forEach(function(t){r=r.replace(new RegExp('('+t.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+')','gi'),'<span class="highlight">$1</span>')});return r}

// --- Initialization & Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if we have saved data
    const savedData = localStorage.getItem('posListData');
    if (savedData) {
        try {
            ITEMS = JSON.parse(savedData);
            if (ITEMS.length > 0) {
                initApp();
            }
        } catch (e) {
            console.error("Errore nel parse dei dati salvati", e);
            localStorage.removeItem('posListData');
        }
    }
});

btnReloadListino.addEventListener('click', () => {
    if(confirm('Vuoi caricare un nuovo file Excel? Questo chiuderà la sessione attuale e il preventivo in corso.')){
        appContainer.style.display = 'none';
        uploadOverlay.style.display = 'flex';
        uploadStatus.textContent = '';
        excelFile.value = '';
    }
});

excelFile.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;

    uploadStatus.textContent = "Caricamento in corso, attendere...";
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, {type: 'binary'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            if(rows.length === 0) {
                uploadStatus.textContent = "Il file Excel è vuoto.";
                return;
            }

            // Find header indexes
            let headerRowIndex = -1;
            let colIdx = { cod: -1, desc: -1, price: -1, cat: -1, forn: -1, discount: -1 };

            for(let i=0; i<Math.min(10, rows.length); i++) {
                const row = rows[i];
                if(!row) continue;
                
                const strRow = row.map(c => String(c).toLowerCase());
                const codIdx = strRow.findIndex(c => c.includes('articolo'));
                const descIdx = strRow.findIndex(c => c.includes('descrizione') && !c.includes('categoria') && !c.includes('gruppo') && !c.includes('fornitore'));
                const priceIdx = strRow.findIndex(c => c.includes('prezzo 1') || c.includes('prezzo'));
                
                // Explicit mapping requested by user:
                // Column F (Index 5) = Sconto
                // Column I (Index 8) = Fornitore
                // Column K (Index 10) = Categoria
                const discountIdx = 5;
                const fornIdx = 8;
                const catIdx = 10;

                if(codIdx !== -1 && descIdx !== -1 && priceIdx !== -1) {
                    headerRowIndex = i;
                    colIdx = {
                        cod: codIdx, desc: descIdx, price: priceIdx, 
                        cat: catIdx !== -1 ? catIdx : -1,
                        forn: fornIdx !== -1 ? fornIdx : -1,
                        discount: discountIdx !== -1 ? discountIdx : -1
                    };
                    break;
                }
            }

            if(headerRowIndex === -1) {
                uploadStatus.textContent = "Impossibile trovare le colonne Articolo, Descrizione e Prezzo.";
                return;
            }

            ITEMS = [];
            for(let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if(!row || !row[colIdx.cod]) continue; // Skip empty rows or rows without a code

                let prezzo = row[colIdx.price];
                if (typeof prezzo === 'string') {
                    // Replace comma with dot and parse
                    prezzo = parseFloat(prezzo.replace(',', '.').replace(/[^0-9.]/g, ''));
                }
                if (isNaN(prezzo)) prezzo = 0;

                const cod = String(row[colIdx.cod] || '').trim();
                const desc = String(row[colIdx.desc] || '').trim();
                const grp = colIdx.cat !== -1 ? String(row[colIdx.cat] || '').trim() : '';
                const forn = colIdx.forn !== -1 ? String(row[colIdx.forn] || '').trim() : '';

                let sconto = 0;
                if (colIdx.discount !== -1) {
                    let rawSconto = row[colIdx.discount];
                    if (typeof rawSconto === 'string') {
                        rawSconto = parseFloat(rawSconto.replace(',', '.').replace(/[^0-9.-]/g, ''));
                    }
                    if (!isNaN(rawSconto)) sconto = rawSconto;
                }

                let net = prezzo;
                if (sconto > 0) {
                    if (sconto <= 1) sconto = Math.round(sconto * 10000) / 100; // handle raw excel decimals: 0.15 -> 15
                    net = Math.round(prezzo * (1 - sconto/100) * 100) / 100;
                } else if (sconto < 0) { 
                    sconto = Math.abs(sconto);
                    if (sconto <= 1) sconto = Math.round(sconto * 10000) / 100;
                    net = Math.round(prezzo * (1 - sconto/100) * 100) / 100;
                }

                ITEMS.push({
                    cod: cod,
                    desc: desc,
                    prezzo: prezzo,
                    sconto: sconto,
                    net: net,
                    grp: grp,
                    forn: forn,
                    _s: (cod + '|' + desc + '|' + forn).toLowerCase()
                });
            }

            localStorage.setItem('posListData', JSON.stringify(ITEMS));
            showToast("Listino aggiornato con successo!");
            initApp();

        } catch (error) {
            console.error(error);
            uploadStatus.textContent = "Errore durante l'analisi del file Excel.";
        }
    };
    reader.onerror = function(ex) {
        uploadStatus.textContent = "Errore durante la lettura del file.";
        console.error(ex);
    };
    
    reader.readAsBinaryString(file);
});

if(clientiFile) {
  clientiFile.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if(!file) return;
      uploadStatus.textContent = "Caricamento clienti in corso...";
      const reader = new FileReader();
      reader.onload = function(evt) {
          try {
              const data = evt.target.result;
              const workbook = XLSX.read(data, {type: 'binary'});
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
              CLIENTI = list;
              try {
                  localStorage.setItem('posClientiData', JSON.stringify(list));
              } catch(e) {
                  uploadStatus.innerHTML = '<span style="color:var(--danger)">Errore memoria: Database troppo grande ('+list.length+') per il browser.</span>';
                  console.error("Quota esaurita", e);
                  return;
              }
              uploadStatus.textContent = "Clienti caricati (" + list.length + ")! Ora carica il listino per accedere.";
          } catch(err) {
              uploadStatus.textContent = "Errore lettura file clienti.";
              console.error(err);
          }
      };
      reader.readAsBinaryString(file);
  });
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
  var cartCods={};cart.forEach(function(c){cartCods[c.item.cod]=true});

  if(!results.length&&(terms.length||activeFilterCat||activeFilterForn)){
    tableWrap.style.display='block';
    tbody.innerHTML='';emptyState.style.display='flex';
    emptyState.querySelector('.empty-text').textContent='Nessun articolo trovato';
    resultsInfo.innerHTML='';return;
  }
  if(!results.length && !terms.length && !starredItems.length) {
    tableWrap.style.display='block';
    tbody.innerHTML='';emptyState.style.display='flex';
    emptyState.querySelector('.empty-text').textContent='Digita per cercare o aggiungi preferiti';
    resultsInfo.innerHTML='';return;
  }
  
  emptyState.style.display='none';
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
      +'<td class="col-net">'+fp(item.net)+'</td>';
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
  $('mPrice').textContent='\u20ac '+fp(item.net);

  var dd = $('mDiscountDetail');
  if(item.sconto > 0){
    dd.style.display='flex';
    $('mOrigPrice').textContent='Listino: \u20ac '+fp(item.prezzo);
    $('mDiscBadge').textContent='-'+item.sconto+'%';
  } else {
    dd.style.display='none';
  }

  var existing=null;
  for(var i=0;i<cart.length;i++){if(cart[i].item.cod===item.cod){existing=cart[i];break}}
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
  $('mSubtotal').textContent='\u20ac '+fp(q*p);
}

$('mAddBtn').addEventListener('click',function(){
  if(!currentItem)return;
  var qty=parseFloat(mQtyInput.value)||0;
  var mED = $('mExtraDiscount');
  var ed=mED ? (parseFloat(mED.value)||0) : 0;
  if(qty<=0)return;
  var existing=null;var wasUpdate=false;
  for(var i=0;i<cart.length;i++){if(cart[i].item.cod===currentItem.cod){existing=cart[i];wasUpdate=true;break}}
  if(existing){existing.qty=qty; existing.extraDiscount=ed;}else{cart.push({item:currentItem,qty:qty,extraDiscount:ed})}
  window.currentQuoteIdSaved = null;
  closeAddModal();renderCart();doSearch();
  showToast(wasUpdate?'\u2713 Quantit\u00e0 aggiornata':'\u2713 Aggiunto al preventivo');
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
    var unitNet = c.item.net;
    if(c.extraDiscount > 0) unitNet = unitNet * (1 - c.extraDiscount/100);
    var sub=c.qty*(unitNet||0);
    var discParts = [];
    if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
    if(c.extraDiscount > 0) discParts.push('extra -'+c.extraDiscount+'%');
    var discLine = discParts.length > 0 ? '<div class="cart-item-disc">Sc. '+discParts.join(' | ')+' (listino '+fp(c.item.prezzo)+')</div>' : '';
    html+='<div class="cart-item">'
      +'<div class="cart-item-top"><div class="cart-item-name">'+esc(c.item.desc)+'</div><button class="cart-item-remove" data-action="remove" data-idx="'+idx+'" title="Rimuovi">&times;</button></div>'
      +'<div class="cart-item-cod">'+esc(c.item.cod)+'</div>'
      +discLine
      +'<div class="cart-item-bottom">'
      +'<div class="cart-item-qty">'
      +'<button data-action="dec" data-idx="'+idx+'">&minus;</button>'
      +'<input type="number" value="'+c.qty+'" min="1" step="0.01" data-action="setqty" data-idx="'+idx+'">'
      +'<button data-action="inc" data-idx="'+idx+'">+</button>'
      +'</div>'
      +'<div class="cart-item-total">\u20ac '+fp(sub)+'</div>'
      +'</div></div>';
  });
  cartBody.innerHTML=html;updateTotals();
}

cartBody.addEventListener('click',function(e){
  var t=e.target,a=t.getAttribute('data-action'),i=parseInt(t.getAttribute('data-idx'),10);
  if(a==='remove'&&!isNaN(i)){cart.splice(i,1);window.currentQuoteIdSaved=null;renderCart();doSearch();showToast('Articolo rimosso')}
  else if(a==='dec'&&!isNaN(i)){cart[i].qty=Math.max(1,cart[i].qty-1);window.currentQuoteIdSaved=null;renderCart()}
  else if(a==='inc'&&!isNaN(i)){cart[i].qty++;window.currentQuoteIdSaved=null;renderCart()}
});
cartBody.addEventListener('change',function(e){
  var t=e.target;
  if(t.getAttribute('data-action')==='setqty'){
    var i=parseInt(t.getAttribute('data-idx'),10);
    cart[i].qty=Math.max(1,parseFloat(t.value)||1);window.currentQuoteIdSaved=null;renderCart();
  }
});

function updateTotals(){
  var nItems=0,netto=0;
  cart.forEach(function(c){
    var unitNet = c.item.net;
    if(c.extraDiscount > 0) unitNet = unitNet * (1 - c.extraDiscount/100);
    nItems+=c.qty;netto+=c.qty*(unitNet||0);
  });
  var iva=netto*0.22;
  $('ftItems').textContent=nItems;
  $('ftNetto').textContent='\u20ac '+fp(netto);
  $('ftIva').textContent='\u20ac '+fp(iva);
  $('ftTotale').textContent='\u20ac '+fp(netto+iva);
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
    var unitNet = c.item.net;
    if(c.extraDiscount > 0) unitNet = unitNet * (1 - c.extraDiscount/100);
    var sub=c.qty*(unitNet||0);netto+=sub;
    var discParts = [];
    if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
    if(c.extraDiscount > 0) discParts.push('-'+c.extraDiscount+'%');
    var discTd = discParts.length > 0 ? discParts.join('<br>') : '';
    rows+='<tr><td class="prev-cod">'+esc(c.item.cod)+'</td><td>'+esc(c.item.desc)
      +'</td><td class="r">'+fp(c.item.prezzo)+'</td><td class="disc-cell" style="line-height:1.2;">'+discTd
      +'</td><td class="r">'+fp(unitNet)+'</td><td class="r">'+c.qty
      +'</td><td class="r">'+fp(sub)+'</td></tr>';
  });
  var baseIva=netto*0.22;
  var totIvaInc=netto+baseIva;
  
  var globalDiscount = getGlobalDiscountVal();
  var finalTotIvaInc = totIvaInc - globalDiscount;
  if(finalTotIvaInc < 0) finalTotIvaInc = 0;
  var finalNetto = finalTotIvaInc / 1.22;
  var finalIva = finalTotIvaInc - finalNetto;

  var today=new Date().toLocaleDateString('it-IT');
  var html = '<div style="margin-bottom:20px"><div style="font-size:11px;color:var(--text3)">Il Magazzino Edile S.r.l. \u2014 Preventivo del '+today+'</div></div>'
    +'<table class="prev-table"><thead><tr><th>Codice</th><th>Descrizione</th><th class="r">Listino \u20ac</th><th class="r">Sc.%</th><th class="r">Netto \u20ac</th><th class="r">Qt\u00e0</th><th class="r">Totale \u20ac</th></tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot>';
  
  if(globalDiscount > 0) {
    html += '<tr><td colspan="6" style="text-align:right;font-size:12px;color:var(--text2)">Totale prima dello sconto</td><td class="prev-total-val r" style="font-size:12px;color:var(--text2)">'+fp(totIvaInc)+'</td></tr>'
      + '<tr><td colspan="6" style="text-align:right;font-weight:bold;color:var(--danger)">Sconto Arrotondamento (IVA inclusa)</td><td class="r" style="color:var(--danger);font-weight:bold;">- '+fp(globalDiscount)+'</td></tr>';
  }
  
  html += '<tr><td colspan="6" style="text-align:right">Totale Netto</td><td class="prev-total-val r">'+fp(finalNetto)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:12px;color:var(--text2)">IVA 22%</td><td class="r" style="font-family:JetBrains Mono,monospace;font-size:12px">'+fp(finalIva)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:14px">Totale IVA incl.</td><td class="prev-total-val r" style="font-size:18px">'+fp(finalTotIvaInc)+'</td></tr>'
    +'</tfoot></table>';
  $('prevBody').innerHTML=html;
}

function showPreventivo(){
  if(!cart.length)return;
  if($('globalDiscountAbsolute')) {
      $('globalDiscountAbsolute').value = "0,00";
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
    
    $('scRagione').textContent = currentCustomer.ragione;
    $('scIndirizzo').textContent = currentCustomer.indirizzo;
    $('scCitta').textContent = currentCustomer.citta;
    $('scPiva').textContent = currentCustomer.piva;
    selCustBox.style.display = 'block';
    window.currentQuoteIdSaved = null;
  });

  $('btnRemoveCustomer').addEventListener('click', function(){
    currentCustomer = null;
    selCustBox.style.display = 'none';
    custSearch.parentElement.style.display = 'block';
    custSearch.focus();
    window.currentQuoteIdSaved = null;
  });
}

$('prevPrintBtn').addEventListener('click', async function(){
  var qId = await saveQuoteToCloud('PDF');
  
  if(typeof html2pdf !== 'undefined') {
    var element = document.createElement('div');
    var today = new Date().toLocaleDateString('it-IT');
    var qStr = qId ? '<br><span style="font-size:14px;color:#16a34a;">N° ' + qId + '</span>' : '';
    var custHtml = '';
    if (currentCustomer) {
       custHtml = '<div style="text-align:right; font-size:13px; margin-bottom:24px;">'
                + '<div><strong>Spett.le</strong></div>'
                + '<div style="font-size:16px; font-weight:bold; color:#000;">'+currentCustomer.ragione+'</div>'
                + '<div>'+currentCustomer.indirizzo+'</div>'
                + '<div>'+currentCustomer.citta+'</div>'
                + (currentCustomer.piva ? '<div>P.IVA: '+currentCustomer.piva+'</div>' : '')
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
      + '</div>';
    var style = document.createElement('style');
    style.innerHTML = 'table{width:100%;border-collapse:collapse;margin-top:16px}'
      +'th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;color:#666;border-bottom:2px solid #ccc}'
      +'th.r,td.r{text-align:right}'
      +'td{padding:8px 10px;font-size:12px;border-bottom:1px solid #eee}'
      +'tfoot td{border-top:2px solid #333;font-weight:bold;padding:10px}'
      +'.prev-cod{font-family:monospace;font-size:11px;color:#b45309}'
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
      +'.prev-total-val{font-family:monospace;color:#16a34a}'
      +'</style></head><body>'
      +'<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">'
      +'<div><h1>Il Magazzino Edile S.r.l.</h1>'
      +'<div class="sub">Preventivo del '+new Date().toLocaleDateString('it-IT')+'<br><span style="color:#16a34a;font-weight:bold;font-size:14px">'+qStr+'</span></div></div>'
      +(currentCustomer ? '<div style="text-align:right; font-size:13px;"><div><strong>Spett.le</strong></div><div style="font-size:16px; font-weight:bold;">'+currentCustomer.ragione+'</div><div>'+currentCustomer.indirizzo+'</div><div>'+currentCustomer.citta+'</div>'+(currentCustomer.piva?'<div>P.IVA: '+currentCustomer.piva+'</div>':'')+'</div>' : '')
      +'</div>'
      +content+'</body></html>');
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
           var unitNet = c.item.net;
           if(c.extraDiscount > 0) unitNet = unitNet * (1 - c.extraDiscount/100);
           var sub = c.qty*(unitNet||0);
           netto += sub;
           return {
               cod: c.item.cod, desc: c.item.desc, qty: c.qty, 
               net: unitNet, subtotal: sub, prezzo: c.item.prezzo, sconto: c.item.sconto, extraDiscount: c.extraDiscount || 0
           };
        });
        
        var baseIva = netto * 0.22;
        var totIvaInc = netto + baseIva;
        var globalDiscount = getGlobalDiscountVal();
        var finalTotIvaInc = totIvaInc - globalDiscount;
        if(finalTotIvaInc < 0) finalTotIvaInc = 0;
        var finalNetto = finalTotIvaInc / 1.22;
        
        var quoteData = {
           quoteId: quoteId,
           dateIso: dateObj.toISOString(),
           timestamp: firebase.firestore.FieldValue.serverTimestamp(),
           customer: currentCustomer || null,
           items: itemsForDb,
           netTotal: finalNetto,
           globalDiscount: globalDiscount,
           type: type,
           searchTokens: (quoteId + " " + (currentCustomer ? currentCustomer.ragione + " " + currentCustomer.piva : "")).toLowerCase()
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
    
    var bodyText = "In allegato i dettagli del Preventivo" + qStr + ".\n\n";
    if(currentCustomer) bodyText += "Spett.le " + currentCustomer.ragione + "\n\n";
    bodyText += "Elenco:\n";
    var netto = 0;
    cart.forEach(function(c){
        var unitNet = c.item.net;
        if(c.extraDiscount > 0) unitNet = unitNet * (1 - c.extraDiscount/100);
        var sub = c.qty * (unitNet || 0);
        netto += sub;
        var discText = "";
        var discParts = [];
        if(c.item.sconto > 0) discParts.push('-'+c.item.sconto+'%');
        if(c.extraDiscount > 0) discParts.push('-'+c.extraDiscount+'%');
        if(discParts.length > 0) discText = " (Sc. " + discParts.join('|') + ")";
        
        bodyText += "- " + c.qty + "x " + c.item.desc + discText + " (E. " + fp(sub) + ")\n";
    });
    
    var baseIva = netto * 0.22;
    var totIvaInc = netto + baseIva;
    var globalDiscount = getGlobalDiscountVal();
    var finalTotIvaInc = totIvaInc - globalDiscount;
    if(finalTotIvaInc < 0) finalTotIvaInc = 0;
    var finalNetto = finalTotIvaInc / 1.22;
    var finalIva = finalTotIvaInc - finalNetto;

    if(globalDiscount > 0) {
        bodyText += "\nSconto di Cassa (IVA inclusa): -E. " + fp(globalDiscount);
    }
    
    bodyText += "\nTotale Netto: E. " + fp(finalNetto);
    bodyText += "\nIVA 22%: E. " + fp(finalIva);
    bodyText += "\nTotale: E. " + fp(finalTotIvaInc);
    
    bodyText += "\n\nIl Magazzino Edile S.r.l.";
    
    var subject = encodeURIComponent("Preventivo - Il Magazzino Edile" + qStr);
    var body = encodeURIComponent(bodyText);
    
    var toEmail = (currentCustomer && currentCustomer.email) ? currentCustomer.email : "";
    
    window.location.href = "mailto:" + toEmail + "?subject=" + subject + "&body=" + body;
});

$('prevExportBtn').addEventListener('click',function(){
  if(!cart.length)return;
  var csv='Codice;Descrizione;Prezzo Listino;Sconto %;Prezzo Netto;Quantita;Totale\n';
  var netto=0;
  cart.forEach(function(c){
    var sub=c.qty*(c.item.net||0);netto+=sub;
    csv+='"'+c.item.cod+'";"'+c.item.desc+'";'+(c.item.prezzo||0).toFixed(2)+';'+(c.item.sconto||0)+';'+(c.item.net||0).toFixed(2)+';'+c.qty+';'+sub.toFixed(2)+'\n';
  });
  csv+=';;;;;"Totale Netto";'+netto.toFixed(2)+'\n';
  csv+=';;;;;"IVA 22%";'+(netto*0.22).toFixed(2)+'\n';
  csv+=';;;;;"Totale";'+(netto*1.22).toFixed(2)+'\n';
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='preventivo_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  showToast('CSV esportato');
});

function showToast(msg){toastEl.textContent=msg;toastEl.classList.add('show');setTimeout(function(){toastEl.classList.remove('show')},2000)}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(prevOverlay.classList.contains('open'))closePrev();
    else if(addOverlay.classList.contains('open'))closeAddModal();
    else{searchInput.value='';clearBtn.classList.remove('visible');doSearch();searchInput.focus()}
  }
  if(e.key==='Enter'&&addOverlay.classList.contains('open'))$('mAddBtn').click();
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
    loadStorico();
});
if(btnSearchStorico) btnSearchStorico.addEventListener('click', loadStorico);

function openStorico() {
    if(storicoOverlay) storicoOverlay.classList.add('open');
    loadStorico();
}

function closeStorico() {
    if(storicoOverlay) storicoOverlay.classList.remove('open');
}

async function loadStorico() {
    if(!db) { alert("Database non configurato."); return; }
    
    $('storicoLoading').style.display = 'block';
    if($('storicoEmpty')) $('storicoEmpty').style.display = 'none';
    if(storicoListBody) storicoListBody.innerHTML = '';
    
    try {
        var quotesRef = db.collection('quotes');
        var query = quotesRef.orderBy('timestamp', 'desc');
        
        var snapshot = await query.limit(200).get();
        var results = [];
        
        snapshot.forEach(function(doc){ results.push(doc.data()); });
        
        var nQuery = sfNum.value.trim().toLowerCase();
        var cQuery = sfCustomer.value.trim().toLowerCase();
        var iQuery = sfItem.value.trim().toLowerCase();
        var dFrom = sfDateFrom.value ? new Date(sfDateFrom.value) : null;
        var dTo = sfDateTo.value ? new Date(sfDateTo.value) : null;
        if(dTo) dTo.setHours(23,59,59,999);
        
        var filtered = results.filter(function(q){
            if(nQuery && q.quoteId.toLowerCase().indexOf(nQuery)===-1) return false;
            if(cQuery) {
                var cMatch = false;
                if(q.customer) {
                   if((q.customer.ragione||'').toLowerCase().includes(cQuery)) cMatch = true;
                   if((q.customer.piva||'').toLowerCase().includes(cQuery)) cMatch = true;
                }
                if(!cMatch) return false;
            }
            if(dFrom || dTo) {
                var qDate = new Date(q.dateIso);
                if(dFrom && qDate < dFrom) return false;
                if(dTo && qDate > dTo) return false;
            }
            if(iQuery) {
                var iMatch = false;
                if(q.items) {
                    for(var k=0; k<q.items.length; k++) {
                       if((q.items[k].desc||'').toLowerCase().includes(iQuery) || (q.items[k].cod||'').toLowerCase().includes(iQuery)) {
                           iMatch = true; break;
                       }
                    }
                }
                if(!iMatch) return false;
            }
            return true;
        });
        
        if(!storicoListBody) return;
        
        if(filtered.length === 0) {
            $('storicoEmpty').style.display = 'block';
        } else {
            var html = '';
            filtered.forEach(function(q){
                var dataObj = new Date(q.dateIso);
                var dataStr = dataObj.toLocaleDateString('it-IT') + ' ' + dataObj.toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'});
                var custName = q.customer ? String(q.customer.ragione) : 'Nessun cliente';
                var custPiva = q.customer && q.customer.piva ? String(q.customer.piva) : '';
                
                var itemsStr = '';
                if(q.items && q.items.length) {
                    itemsStr = q.items.map(function(it){ return it.qty + 'x ' + (it.desc || it.cod) }).join(', ');
                }
                
                window['_szQuote_' + q.quoteId] = q;
                
                html += '<tr class="storico-row">' +
                        '<td><div class="storico-cod">' + q.quoteId + '</div><div class="storico-date">' + dataStr + '</div></td>' +
                        '<td><div class="storico-customer">' + esc(custName) + '</div>' + (custPiva ? '<div class="storico-piva">P.IVA: '+esc(custPiva)+'</div>' : '') + '</td>' +
                        '<td><div class="storico-items" title="'+esc(itemsStr)+'">' + esc(itemsStr) + '</div></td>' +
                        '<td style="text-align:right"><div class="storico-total">\u20ac ' + fp(q.netTotal * 1.22) + '</div></td>' +
                        '<td style="text-align:center"><button class="btn btn-secondary" onclick="restoreQuote(\''+q.quoteId+'\')" style="padding:6px 12px; font-size:11px; width:100%;">Riapri \u27F3</button></td>' +
                        '</tr>';
            });
            storicoListBody.innerHTML = html;
        }
        
    } catch(err) {
        console.error(err);
        if($('storicoEmpty')){ $('storicoEmpty').innerHTML = "Errore lettura DB: " + err.message; $('storicoEmpty').style.display = 'block'; }
    } finally {
        if($('storicoLoading')) $('storicoLoading').style.display = 'none';
    }
}

window.restoreQuote = function(quoteId) {
    var q = window['_szQuote_' + quoteId];
    if(!q) return;
    
    if(cart.length > 0) {
        if(!confirm("Questo sostituira' il preventivo attualmente in corso. Vuoi procedere?")) return;
    }
    
    cart = [];
    q.items.forEach(function(it){
        var matched = ITEMS.filter(function(x){ return x.cod === it.cod })[0];
        var itemObj = matched ? matched : {
            cod: it.cod, desc: it.desc, grp: it.grp, forn: it.forn,
            prezzo: it.prezzo || 0, netto: it.net || 0, sconto: it.sconto || 0, net: it.net || 0
        };
        cart.push({ item: itemObj, qty: it.qty });
    });
    
    currentCustomer = q.customer;
    if(currentCustomer && $('customerSearch')) {
        $('scRagione').textContent = currentCustomer.ragione || '';
        $('scIndirizzo').textContent = currentCustomer.indirizzo || '';
        $('scCitta').textContent = currentCustomer.citta || '';
        $('scPiva').textContent = currentCustomer.piva || '';
        $('selectedCustomerBox').style.display = 'block';
        $('customerSearch').parentElement.style.display = 'none';
    } else if($('customerSearch')) {
        $('selectedCustomerBox').style.display = 'none';
        $('customerSearch').parentElement.style.display = 'block';
    }
    
    window.currentQuoteIdSaved = q.quoteId;
    
    renderCart();
    doSearch();
    closeStorico();
    
    // Open print preview automatically to proceed
    showPreventivo();
    showToast("Preventivo " + q.quoteId + " riaperto!");
};
