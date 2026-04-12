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

function updateSubtotal(){
  var q=parseFloat(mQtyInput.value)||0;
  var p=currentItem?(currentItem.net||0):0;
  $('mSubtotal').textContent='\u20ac '+fp(q*p);
}

$('mAddBtn').addEventListener('click',function(){
  if(!currentItem)return;
  var qty=parseFloat(mQtyInput.value)||0;
  if(qty<=0)return;
  var existing=null;var wasUpdate=false;
  for(var i=0;i<cart.length;i++){if(cart[i].item.cod===currentItem.cod){existing=cart[i];wasUpdate=true;break}}
  if(existing){existing.qty=qty}else{cart.push({item:currentItem,qty:qty})}
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
    var sub=c.qty*(c.item.net||0);
    var discLine = c.item.sconto > 0 ? '<div class="cart-item-disc">Sc. -'+c.item.sconto+'% (listino '+fp(c.item.prezzo)+')</div>' : '';
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
  if(a==='remove'&&!isNaN(i)){cart.splice(i,1);renderCart();doSearch();showToast('Articolo rimosso')}
  else if(a==='dec'&&!isNaN(i)){cart[i].qty=Math.max(1,cart[i].qty-1);renderCart()}
  else if(a==='inc'&&!isNaN(i)){cart[i].qty++;renderCart()}
});
cartBody.addEventListener('change',function(e){
  var t=e.target;
  if(t.getAttribute('data-action')==='setqty'){
    var i=parseInt(t.getAttribute('data-idx'),10);
    cart[i].qty=Math.max(1,parseFloat(t.value)||1);renderCart();
  }
});

function updateTotals(){
  var nItems=0,netto=0;
  cart.forEach(function(c){nItems+=c.qty;netto+=c.qty*(c.item.net||0)});
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
  cart=[];renderCart();doSearch();showToast('Preventivo svuotato');
});
$('btnPrev').addEventListener('click',showPreventivo);

// PREVENTIVO
function showPreventivo(){
  if(!cart.length)return;
  var netto=0;
  var rows='';
  cart.forEach(function(c){
    var sub=c.qty*(c.item.net||0);netto+=sub;
    var discTd = c.item.sconto > 0 ? '-'+c.item.sconto+'%' : '';
    rows+='<tr><td class="prev-cod">'+esc(c.item.cod)+'</td><td>'+esc(c.item.desc)
      +'</td><td class="r">'+fp(c.item.prezzo)+'</td><td class="disc-cell">'+discTd
      +'</td><td class="r">'+fp(c.item.net)+'</td><td class="r">'+c.qty
      +'</td><td class="r">'+fp(sub)+'</td></tr>';
  });
  var iva=netto*0.22;
  var today=new Date().toLocaleDateString('it-IT');
  $('prevBody').innerHTML='<div style="margin-bottom:20px"><div style="font-size:11px;color:var(--text3)">Il Magazzino Edile S.r.l. \u2014 Preventivo del '+today+'</div></div>'
    +'<table class="prev-table"><thead><tr><th>Codice</th><th>Descrizione</th><th class="r">Listino \u20ac</th><th class="r">Sc.%</th><th class="r">Netto \u20ac</th><th class="r">Qt\u00e0</th><th class="r">Totale \u20ac</th></tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot>'
    +'<tr><td colspan="6" style="text-align:right">Totale Netto</td><td class="prev-total-val r">'+fp(netto)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:12px;color:var(--text2)">IVA 22%</td><td class="r" style="font-family:JetBrains Mono,monospace;font-size:12px">'+fp(iva)+'</td></tr>'
    +'<tr><td colspan="6" style="text-align:right;font-size:14px">Totale IVA incl.</td><td class="prev-total-val r" style="font-size:18px">'+fp(netto+iva)+'</td></tr>'
    +'</tfoot></table>';
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
  });

  $('btnRemoveCustomer').addEventListener('click', function(){
    currentCustomer = null;
    selCustBox.style.display = 'none';
    custSearch.parentElement.style.display = 'block';
    custSearch.focus();
  });
}

$('prevPrintBtn').addEventListener('click',function(){
  if(typeof html2pdf !== 'undefined') {
    var element = document.createElement('div');
    var today = new Date().toLocaleDateString('it-IT');
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
      + '<div style="color:#666; font-size:12px;">Preventivo del '+today+'</div>'
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
      filename:     'preventivo_'+today.split('/').join('-')+'.pdf',
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
      +'<div class="sub">Preventivo del '+new Date().toLocaleDateString('it-IT')+'</div></div>'
      +(currentCustomer ? '<div style="text-align:right; font-size:13px;"><div><strong>Spett.le</strong></div><div style="font-size:16px; font-weight:bold;">'+currentCustomer.ragione+'</div><div>'+currentCustomer.indirizzo+'</div><div>'+currentCustomer.citta+'</div>'+(currentCustomer.piva?'<div>P.IVA: '+currentCustomer.piva+'</div>':'')+'</div>' : '')
      +'</div>'
      +content+'</body></html>');
    w.document.close();
    setTimeout(function(){w.print()},300);
  }
});

$('prevEmailBtn').addEventListener('click', function() {
    if(!cart.length) return;
    var bodyText = "In allegato i dettagli del Preventivo.\n\n";
    if(currentCustomer) bodyText += "Spett.le " + currentCustomer.ragione + "\n\n";
    bodyText += "Elenco:\n";
    var netto = 0;
    cart.forEach(function(c){
        var sub = c.qty * (c.item.net || 0);
        netto += sub;
        bodyText += "- " + c.qty + "x " + c.item.desc + " (E. " + fp(sub) + ")\n";
    });
    bodyText += "\nTotale Netto: E. " + fp(netto);
    bodyText += "\nIVA 22%: E. " + fp(netto * 0.22);
    bodyText += "\nTotale: E. " + fp(netto * 1.22);
    
    bodyText += "\n\nIl Magazzino Edile S.r.l.";
    
    var subject = encodeURIComponent("Preventivo - Il Magazzino Edile");
    var body = encodeURIComponent(bodyText);
    
    window.location.href = "mailto:?subject=" + subject + "&body=" + body;
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

  // Fai un auto-refresh della pagina se il service worker rileva un aggiornamento (es. quando cambiamo la versione)
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
