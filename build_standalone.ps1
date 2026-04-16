$ErrorActionPreference = 'Stop'

# 1. Read files
$excelPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'ILMAGAZZINOEDILE_NET_090426.xlsx'
$excelBytes = [System.IO.File]::ReadAllBytes($excelPath)
$excelB64 = [System.Convert]::ToBase64String($excelBytes)

$html = Get-Content (Join-Path $PSScriptRoot 'index.html') -Raw -Encoding UTF8
$css = Get-Content (Join-Path $PSScriptRoot 'styles.css') -Raw -Encoding UTF8
$js = Get-Content (Join-Path $PSScriptRoot 'app.js') -Raw -Encoding UTF8

# 2. Modify index.html
# Remove the upload button logic and upload card
$html = $html -replace '(<div class="upload-overlay" id="uploadOverlay">)([\s\S]*?)(</div>\s*</div>)', ''
$html = $html -replace '<button class="btn btn-secondary reload-btn".*?</button>', ''
# Make app Container visible manually just in case
$html = $html -replace 'style="display: none;"', ''

# 3. Modify app.js to strip localStorage/upload and auto-load B64
$autoLoadLogic = @"
document.addEventListener('DOMContentLoaded', () => {
    var binary_string = window.atob('$excelB64');
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    
    try {
        var workbook = XLSX.read(bytes.buffer, {type: 'array'});
        var firstSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[firstSheetName];
        var rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        
        let headerRowIndex = -1;
        let colIdx = { cod: -1, desc: -1, price: -1, cat: -1, forn: -1, discount: -1 };

        for(let i=0; i<Math.min(10, rows.length); i++) {
            const row = rows[i];
            if(!row) continue;
            
            const strRow = row.map(c => String(c).toLowerCase());
            const codIdx = strRow.findIndex(c => c.includes('articolo'));
            const descIdx = strRow.findIndex(c => c.includes('descrizione') && !c.includes('categoria') && !c.includes('gruppo') && !c.includes('fornitore'));
            const priceIdx = strRow.findIndex(c => c.includes('prezzo 1') || c.includes('prezzo'));
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

        ITEMS = [];
        for(let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if(!row || !row[colIdx.cod]) continue;

            let prezzo = row[colIdx.price];
            if (typeof prezzo === 'string') {
                prezzo = parseFloat(prezzo.replace(',', '.').replace(/[^0-9.-]/g, ''));
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
                if (sconto <= 1) sconto = Math.round(sconto * 10000) / 100;
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
        
        initApp();
    } catch(e) {
        console.error("Error parsing embedded excel:", e);
    }
});
"@

# We will strip out the old DOMContentLoaded listener block and the excelFile listener
$js = $js -replace "(?s)document\.addEventListener\('DOMContentLoaded'.*?\}\);", ""
$js = $js -replace "(?s)btnReloadListino\.addEventListener.*?\);", ""
$js = $js -replace "(?s)excelFile\.addEventListener.*?reader\.readAsBinaryString\(file\);\s*\}\);", ""

# Append our new logic to the bottom
$js = $js + "`n`n" + $autoLoadLogic

# Modify initApp to remove uploadOverlay reference since we deleted it
$js = $js -replace "uploadOverlay\.style\.display = 'none';", ""

# 4. Integrate into HTML
$html = $html -replace '<link rel="stylesheet" href="styles.css">', "<style>`n$css`n</style>"
$html = $html -replace '<script src="app.js"></script>', "<script>`n$js`n</script>"

# 5. Output
$outputPath = Join-Path $PSScriptRoot 'Magazzino_App_Mobile.html'
Set-Content -Path $outputPath -Value $html -Encoding UTF8
Write-Output "Successfully built Magazzino_App_Mobile.html at $outputPath"
