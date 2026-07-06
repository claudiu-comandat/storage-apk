// ============================================================
// flow-retur.js — Logică Procesare Retur
// ============================================================

// --- Stare locală a modulului ---
let returOrders = [];       // Comenzile EasySales preîncărcate
let returRmaList = [];      // Lista RMA eMAG preîncărcată
let returCurrentRma = null; // RMA activ găsit la scanare
let returCurrentOrder = null; // Comanda EasySales activă găsită la scanare
let returTrendyolClaims = [];
let returTrendyolReasons = [];
let returCurrentTrendyolClaim = null;
let returTrendyolPhotoBase64 = null;

// --- URL-uri webhook (n8n) ---
const RETUR_FETCH_ORDERS_WEBHOOK   = 'https://automatizare.comandat.ro/webhook/retur-fetch-orders';
const RETUR_FETCH_RMA_WEBHOOK      = 'https://automatizare.comandat.ro/webhook/retur-fetch-rma';
const RETUR_SAVE_RMA_WEBHOOK       = 'https://automatizare.comandat.ro/webhook/retur-save-rma';
const RETUR_STORNO_NERIDICAT_WEBHOOK = 'https://automatizare.comandat.ro/webhook/retur-storno-neridicat';

// --- Configurare Trendyol ---
const TRENDYOL_SELLER_ID = 'PLACEHOLDER'; // De completat
const RETUR_FETCH_TRENDYOL_CLAIMS_WEBHOOK  = 'https://automatizare.comandat.ro/webhook/retur-fetch-trendyol-claims';
const RETUR_FETCH_TRENDYOL_REASONS_WEBHOOK = 'https://automatizare.comandat.ro/webhook/retur-fetch-trendyol-reasons';
const RETUR_APPROVE_TRENDYOL_CLAIM_WEBHOOK = 'https://automatizare.comandat.ro/webhook/retur-approve-trendyol-claim';
const RETUR_REJECT_TRENDYOL_CLAIM_WEBHOOK  = 'https://automatizare.comandat.ro/webhook/retur-reject-trendyol-claim';

// ============================================================
// DESCHIDERE ECRAN
// ============================================================

/**
 * Deschide pagina de Procesare Retur și declanșează preîncărcarea datelor.
 */
async function openReturPage() {
    showPage('page-retur');
    setReturState('loading');
    returCurrentRma = null;
    returCurrentOrder = null;
    resetReturResultPanel();

    try {
        showLoading(true);
        // Preîncărcăm în paralel: comenzile EasySales și RMA-urile eMAG
        const [ordersResult, rmaResult, trendyolClaimsResult, trendyolReasonsResult] = await Promise.allSettled([
            fetchReturOrders(),
            fetchReturRmaList(),
            fetchTrendyolClaims(),
            fetchTrendyolReasons()
        ]);

        if (ordersResult.status === 'rejected') {
            console.error('Eroare preîncărcare comenzi EasySales:', ordersResult.reason);
        }
        if (rmaResult.status === 'rejected') {
            console.error('Eroare preîncărcare RMA eMAG:', rmaResult.reason);
        }
        if (trendyolClaimsResult.status === 'rejected') {
            console.error('Eroare preîncărcare claims Trendyol:', trendyolClaimsResult.reason);
        }
        if (trendyolReasonsResult.status === 'rejected') {
            console.error('Eroare preîncărcare motive Trendyol:', trendyolReasonsResult.reason);
        }

        setReturState('ready');
        showToast('Date preîncărcate. Scanează AWB-ul.');
    } catch (err) {
        console.error('Eroare fatală la deschiderea paginii retur:', err);
        showToast('Eroare la pregătirea datelor.', true);
        setReturState('error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// FETCH DATE
// ============================================================

async function fetchReturOrders() {
    const response = await fetch(RETUR_FETCH_ORDERS_WEBHOOK, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    returOrders = Array.isArray(data) ? data : [];
    console.log(`[Retur] ${returOrders.length} comenzi EasySales preîncărcate.`);
}

async function fetchReturRmaList() {
    const response = await fetch(RETUR_FETCH_RMA_WEBHOOK, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    returRmaList = Array.isArray(data) ? data : [];
    console.log(`[Retur] ${returRmaList.length} cereri RMA eMAG preîncărcate.`);
}

// ============================================================
// SCANARE AWB
// ============================================================

function startReturScan() {
    startScanner('retur_awb');
}

/**
 * Apelat de scanner.js când modul este 'retur_awb'.
 * Caută AWB-ul mai întâi în RMA, apoi în comenzile EasySales.
 */
function handleReturAwbScan(awb) {
    const cleanAwb = awb.trim();
    resetReturResultPanel();
    returCurrentRma = null;
    returCurrentOrder = null;
    returCurrentTrendyolClaim = null;

    // 1. Caută în lista RMA (status: Approved=3, Received=6, sau alte statusuri relevante)
    const RELEVANT_RMA_STATUSES = [3, 6]; // 3=Approved/Preluate, 6=Received/Receptionate
    const rmaMatch = returRmaList.find(rma => {
        if (!RELEVANT_RMA_STATUSES.includes(rma.request_status)) return false;
        const awbNumbers = extractRmaAwbs(rma);
        return awbNumbers.some(a => a === cleanAwb);
    });

    if (rmaMatch) {
        returCurrentRma = rmaMatch;
        showRmaPanel(rmaMatch);
        return;
    }

    // 2. Caută în claims Trendyol (WaitingInAction)
    const trendyolMatch = returTrendyolClaims.find(claim =>
        (claim.awbs || []).some(a => String(a).trim() === cleanAwb)
    );
    if (trendyolMatch) {
        returCurrentTrendyolClaim = trendyolMatch;
        showTrendyolClaimPanel(trendyolMatch);
        return;
    }

    // 3. Fallback: caută în comenzile EasySales
    const orderMatch = returOrders.find(order => {
        const awbIds = Array.isArray(order.awb_id) ? order.awb_id : [];
        const shipmentAwbs = (order.shipments || []).flatMap(s =>
            Array.isArray(s.awb_id) ? s.awb_id : []
        );
        return [...awbIds, ...shipmentAwbs].some(a => String(a).trim() === cleanAwb);
    });

    if (orderMatch) {
        returCurrentOrder = orderMatch;
        showOrderPanel(orderMatch);
        return;
    }

    // 3. Nimic găsit
    showReturNotFound(cleanAwb);
}

/** Extrage AWB-urile dintr-un obiect RMA */
function extractRmaAwbs(rma) {
    const awbs = [];
    if (rma.awb) awbs.push(String(rma.awb).trim());
    if (Array.isArray(rma.awbs)) rma.awbs.forEach(a => awbs.push(String(a).trim()));
    return awbs;
}

// ============================================================
// AFIȘARE PANEL RMA
// ============================================================

function showRmaPanel(rma) {
    const panel = document.getElementById('retur-result-panel');
    panel.innerHTML = '';

    const statusNames = { 1: 'Incomplet', 2: 'Nou', 3: 'Aprobat (Preluat)', 4: 'Refuzat', 5: 'Anulat', 6: 'Recepționat', 7: 'Finalizat' };
    const statusName = statusNames[rma.request_status] || `Status ${rma.request_status}`;

    const existingTax = parseFloat(rma.return_tax_value) || 0;
    const existingRetained = parseFloat(rma.retained_amount) || 0;

    panel.innerHTML = `
        <div class="retur-card">
            <div class="retur-card-header retur-card-header--rma">
                <span class="material-icons-outlined">assignment_return</span>
                <h3>Cerere Retur eMAG</h3>
                <span class="retur-badge">${statusName}</span>
            </div>
            <div class="retur-info-grid">
                <div class="retur-info-item"><label>ID eMAG</label><span>${rma.emag_id || '-'}</span></div>
                <div class="retur-info-item"><label>ID Comandă</label><span>${rma.order_id || '-'}</span></div>
                <div class="retur-info-item"><label>Data</label><span>${rma.date ? rma.date.substring(0, 10) : '-'}</span></div>
                <div class="retur-info-item"><label>Motiv</label><span>${rma.return_reason || '-'}</span></div>
            </div>

            ${existingTax > 0 || existingRetained > 0 ? `
            <div class="retur-existing-values">
                <span class="material-icons-outlined" style="color: #f59e0b; font-size:16px;">warning</span>
                <span>Valori existente: Taxă retur: <strong>${existingTax} RON</strong> | Sumă reținută: <strong>${existingRetained} RON</strong></span>
            </div>` : ''}

            <div class="retur-form">
                <div class="retur-form-row">
                    <label for="retur-taxa-input">Taxă Retur (RON)</label>
                    <input type="number" id="retur-taxa-input" value="${existingTax}" min="0" step="0.01" placeholder="0.00" class="retur-input" oninput="updateReturTotal()">
                </div>
                <div class="retur-form-row">
                    <label for="retur-retinuta-input">Sumă Reținută (RON)</label>
                    <input type="number" id="retur-retinuta-input" value="${existingRetained}" min="0" step="0.01" placeholder="0.00" class="retur-input" oninput="updateReturTotal()">
                </div>
                <div id="retur-total-display" class="retur-total-display hidden">
                    Total Tax Returnare: <strong id="retur-total-value">0 RON</strong>
                </div>
                <div class="retur-form-row">
                    <label for="retur-observatii-input">Observații <span id="retur-obs-required" class="retur-required hidden">*obligatoriu</span></label>
                    <textarea id="retur-observatii-input" class="retur-textarea" rows="3" placeholder="Adaugă observații..."></textarea>
                </div>
            </div>

            <div class="retur-actions">
                <button onclick="submitRma(event, 'finalizat')" class="retur-btn retur-btn--finalizat">
                    <span class="material-icons-outlined">check_circle</span> Finalizat
                </button>
                <button onclick="submitRma(event, 'refuzat')" class="retur-btn retur-btn--refuzat">
                    <span class="material-icons-outlined">cancel</span> Refuzat
                </button>
            </div>
        </div>
    `;

    panel.classList.remove('hidden');
    updateReturTotal();
}

function updateReturTotal() {
    const taxa = parseFloat(document.getElementById('retur-taxa-input')?.value) || 0;
    const retinuta = parseFloat(document.getElementById('retur-retinuta-input')?.value) || 0;
    const total = taxa + retinuta;
    const totalDisplay = document.getElementById('retur-total-display');
    const totalValue = document.getElementById('retur-total-value');
    if (totalDisplay && totalValue) {
        if (total > 0) {
            totalDisplay.classList.remove('hidden');
            totalValue.textContent = `${total.toFixed(2)} RON`;
        } else {
            totalDisplay.classList.add('hidden');
        }
    }
}

// ============================================================
// SUBMIT RMA
// ============================================================

async function submitRma(event, action) {
    if (!returCurrentRma) return;

    const taxa = parseFloat(document.getElementById('retur-taxa-input')?.value) || 0;
    const retinuta = parseFloat(document.getElementById('retur-retinuta-input')?.value) || 0;
    const observatii = document.getElementById('retur-observatii-input')?.value?.trim() || '';
    const obsRequired = document.getElementById('retur-obs-required');

    // Validare
    if (action === 'refuzat') {
        if (!observatii) {
            if (obsRequired) obsRequired.classList.remove('hidden');
            document.getElementById('retur-observatii-input').focus();
            showToast('Observațiile sunt obligatorii pentru status Refuzat!', true);
            return;
        }
    }

    if (action === 'finalizat' && (taxa > 0 || retinuta > 0)) {
        if (!observatii) {
            if (obsRequired) obsRequired.classList.remove('hidden');
            document.getElementById('retur-observatii-input').focus();
            showToast('Observațiile sunt obligatorii când există taxe sau sume reținute!', true);
            return;
        }
    }

    // Construire payload
    const statusMap = { 'finalizat': 7, 'refuzat': 4 };
    const payload = {
        emag_id: returCurrentRma.emag_id,
        order_id: returCurrentRma.order_id,
        request_status: statusMap[action],
        observations: observatii || undefined,
        // Dacă refuzat, NU trimitem taxe
        return_tax_value: action !== 'refuzat' && taxa > 0 ? taxa : undefined,
        retained_amount: action !== 'refuzat' && retinuta > 0 ? retinuta : undefined,
        // Dacă finalizat și există taxe, trimitem și suma totală pentru FGO
        taxa_returnare_fgo: action === 'finalizat' && (taxa > 0 || retinuta > 0) ? (taxa + retinuta) : undefined,
        // internal_order_id necesar pentru storno EasySales
        internal_order_id: returCurrentRma.internal_order_id || null,
    };

    // Dezactivare buton prevenire dublu-click
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;

    showLoading(true);
    try {
        const response = await fetch(RETUR_SAVE_RMA_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const actionLabel = action === 'finalizat' ? 'Finalizat' : 'Refuzat';
        showToast(`Cerere de retur ${actionLabel} cu succes!`);
        showPage('page-dashboard');
    } catch (err) {
        console.error('Eroare la trimiterea RMA:', err);
        showToast('Eroare la procesarea cererii de retur.', true);
        if (btn) btn.disabled = false; // Re-enable în caz de eroare
    } finally {
        showLoading(false);
    }
}

// ============================================================
// AFIȘARE PANEL COMANDĂ (NERIDICAT)
// ============================================================

function showOrderPanel(order) {
    const panel = document.getElementById('retur-result-panel');
    panel.innerHTML = '';

    const products = (order.products || []).map(p =>
        `<li><span class="retur-sku">${p.sku || '-'}</span> — ${p.name || '-'} × <strong>${p.quantity}</strong></li>`
    ).join('');

    panel.innerHTML = `
        <div class="retur-card">
            <div class="retur-card-header retur-card-header--order">
                <span class="material-icons-outlined">inventory_2</span>
                <h3>Comandă EasySales</h3>
                <span class="retur-badge retur-badge--order">${order.status || '-'}</span>
            </div>
            <div class="retur-info-grid">
                <div class="retur-info-item"><label>ID Intern</label><span class="retur-mono">${order.internal_id || '-'}</span></div>
                <div class="retur-info-item"><label>ID Comandă</label><span class="retur-mono">${order.order_display_id || order.id || '-'}</span></div>
                <div class="retur-info-item"><label>Client</label><span>${order.customer?.name || '-'}</span></div>
                <div class="retur-info-item"><label>Marketplace</label><span>${order.marketplace || order.website || '-'}</span></div>
            </div>
            <div class="retur-products">
                <label>Produse:</label>
                <ul class="retur-product-list">${products || '<li>Niciun produs</li>'}</ul>
            </div>
            <div class="retur-actions">
                <button onclick="confirmNeridicat(event)" class="retur-btn retur-btn--neridicat">
                    <span class="material-icons-outlined">do_not_disturb_on</span> Confirmă Produs Neridicat
                </button>
            </div>
        </div>
    `;

    panel.classList.remove('hidden');
}

// ============================================================
// CONFIRMARE NERIDICAT
// ============================================================

async function confirmNeridicat(event) {
    if (!returCurrentOrder) return;
    if (!returCurrentOrder.internal_id) {
        showToast('ID intern comandă lipsă. Nu se poate continua.', true);
        return;
    }

    const confirmed = confirm(`Confirmi că această comandă (#${returCurrentOrder.order_display_id || returCurrentOrder.id}) are produse neridicate?\nSe va genera Factură Storno în EasySales.`);
    if (!confirmed) return;

    // Prevenire dublu click
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;

    showLoading(true);
    try {
        const response = await fetch(RETUR_STORNO_NERIDICAT_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ internal_order_id: returCurrentOrder.internal_id })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        showToast('Factură Storno generată în EasySales!');
        showPage('page-dashboard');
    } catch (err) {
        console.error('Eroare la confirmarea produsului neridicat:', err);
        showToast('Eroare la generarea Storno.', true);
        if (btn) btn.disabled = false;
    } finally {
        showLoading(false);
    }
}

// ============================================================
// UTILIT ĂȚI UI
// ============================================================

function setReturState(state) {
    const loadingEl = document.getElementById('retur-loading-state');
    const readyEl = document.getElementById('retur-ready-state');
    const errorEl = document.getElementById('retur-error-state');

    [loadingEl, readyEl, errorEl].forEach(el => el && el.classList.add('hidden'));

    if (state === 'loading' && loadingEl) loadingEl.classList.remove('hidden');
    if (state === 'ready' && readyEl) readyEl.classList.remove('hidden');
    if (state === 'error' && errorEl) errorEl.classList.remove('hidden');
}

function resetReturResultPanel() {
    const panel = document.getElementById('retur-result-panel');
    if (panel) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
    }
}

function showReturNotFound(awb) {
    const panel = document.getElementById('retur-result-panel');
    panel.innerHTML = `
        <div class="retur-card retur-card--notfound">
            <span class="material-icons-outlined" style="font-size:48px; color:#ef4444;">search_off</span>
            <h3>AWB Negăsit</h3>
            <p>AWB-ul <strong class="retur-mono">${awb}</strong> nu a fost găsit în nicio cerere de retur sau comandă activă.</p>
            <button onclick="startReturScan()" class="retur-btn retur-btn--scan">
                <span class="material-icons-outlined">qr_code_scanner</span> Scanează din nou
            </button>
        </div>
    `;
    panel.classList.remove('hidden');
}

// ============================================================
// FETCH DATE TRENDYOL
// ============================================================

async function fetchTrendyolClaims() {
    const response = await fetch(RETUR_FETCH_TRENDYOL_CLAIMS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: TRENDYOL_SELLER_ID })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    returTrendyolClaims = Array.isArray(data) ? data : [];
    console.log(`[Retur] ${returTrendyolClaims.length} claims Trendyol preîncărcate.`);
}

async function fetchTrendyolReasons() {
    const response = await fetch(RETUR_FETCH_TRENDYOL_REASONS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: TRENDYOL_SELLER_ID })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    returTrendyolReasons = Array.isArray(data) ? data : [];
}

// ============================================================
// AFIȘARE PANEL TRENDYOL CLAIM
// ============================================================

const TRENDYOL_NO_PHOTO_REASON_IDS = new Set([1651, 451]);

function showTrendyolClaimPanel(claim) {
    returTrendyolPhotoBase64 = null;
    const panel = document.getElementById('retur-result-panel');
    panel.innerHTML = '';

    const date = claim.claimDate ? new Date(claim.claimDate).toLocaleDateString('ro-RO') : '-';

    const products = (claim.items || []).map(p =>
        `<li><span class="retur-sku">${p.barcode || '-'}</span> — ${p.productName || '-'} × <strong>${p.quantity || 1}</strong></li>`
    ).join('') || '<li>Niciun produs</li>';

    const reasonOptions = returTrendyolReasons.map(r =>
        `<option value="${r.id}">${r.name}</option>`
    ).join('');

    panel.innerHTML = `
        <div class="retur-card">
            <div class="retur-card-header retur-card-header--trendyol">
                <span class="material-icons-outlined">assignment_return</span>
                <h3>Cerere Retur Trendyol</h3>
                <span class="retur-badge retur-badge--trendyol">În Așteptare</span>
            </div>
            <div class="retur-info-grid">
                <div class="retur-info-item"><label>Nr. Comandă</label><span class="retur-mono">${claim.orderNumber || '-'}</span></div>
                <div class="retur-info-item"><label>Data</label><span>${date}</span></div>
                <div class="retur-info-item retur-info-item--full"><label>Motiv Client</label><span>${claim.customerClaimItemReason || '-'}</span></div>
            </div>
            <div class="retur-products">
                <label>Produse:</label>
                <ul class="retur-product-list">${products}</ul>
            </div>
            <div class="retur-actions">
                <button onclick="approveTrendyolClaim(event)" class="retur-btn retur-btn--finalizat">
                    <span class="material-icons-outlined">check_circle</span> Aprobă
                </button>
                <button onclick="toggleTrendyolRejectForm()" class="retur-btn retur-btn--refuzat" id="trendyol-reject-toggle-btn">
                    <span class="material-icons-outlined">cancel</span> Respinge
                </button>
            </div>
            <div id="trendyol-reject-form" class="retur-reject-form hidden">
                <div class="retur-form-row">
                    <label for="trendyol-reason-select">Motiv Respingere <span class="retur-required">*obligatoriu</span></label>
                    <select id="trendyol-reason-select" class="retur-input" onchange="onTrendyolReasonChange(this)">
                        <option value="">Selectează motivul...</option>
                        ${reasonOptions}
                    </select>
                </div>
                <div class="retur-form-row">
                    <label for="trendyol-reject-desc">Descriere <span class="retur-required">*obligatorie</span></label>
                    <textarea id="trendyol-reject-desc" class="retur-textarea" rows="3" placeholder="Descrie problema (max. 500 caractere)..." maxlength="500"></textarea>
                </div>
                <div id="trendyol-photo-section" class="hidden">
                    <div class="retur-form-row">
                        <label>Fotografie <span id="trendyol-photo-required" class="retur-required hidden">*obligatorie</span></label>
                        <label class="retur-photo-upload">
                            <span class="material-icons-outlined">add_a_photo</span>
                            <span>Adaugă fotografie</span>
                            <input type="file" accept="image/*" capture="environment" onchange="handleTrendyolPhotoSelect(this)" style="display:none">
                        </label>
                        <img id="trendyol-photo-preview" class="retur-photo-preview hidden" alt="Preview">
                    </div>
                </div>
                <div class="retur-actions" style="margin-top: 0.75rem;">
                    <button onclick="submitTrendyolReject(event)" class="retur-btn retur-btn--refuzat" style="grid-column: 1 / -1;">
                        <span class="material-icons-outlined">send</span> Trimite Respingere
                    </button>
                </div>
            </div>
        </div>
    `;

    panel.classList.remove('hidden');
}

function toggleTrendyolRejectForm() {
    const form = document.getElementById('trendyol-reject-form');
    const btn = document.getElementById('trendyol-reject-toggle-btn');
    if (!form) return;
    const isHidden = form.classList.toggle('hidden');
    if (btn) {
        btn.innerHTML = isHidden
            ? '<span class="material-icons-outlined">cancel</span> Respinge'
            : '<span class="material-icons-outlined">close</span> Anulează';
    }
}

function onTrendyolReasonChange(select) {
    const photoSection = document.getElementById('trendyol-photo-section');
    const photoRequired = document.getElementById('trendyol-photo-required');
    if (!photoSection) return;
    if (!select.value) { photoSection.classList.add('hidden'); return; }
    photoSection.classList.remove('hidden');
    const requiresPhoto = !TRENDYOL_NO_PHOTO_REASON_IDS.has(parseInt(select.value));
    if (photoRequired) photoRequired.classList.toggle('hidden', !requiresPhoto);
}

function handleTrendyolPhotoSelect(input) {
    const file = input.files[0];
    if (!file) { returTrendyolPhotoBase64 = null; return; }
    const reader = new FileReader();
    reader.onload = e => {
        returTrendyolPhotoBase64 = e.target.result.split(',')[1];
        const preview = document.getElementById('trendyol-photo-preview');
        if (preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
    };
    reader.readAsDataURL(file);
}

// ============================================================
// APROBARE CLAIM TRENDYOL
// ============================================================

async function approveTrendyolClaim(event) {
    if (!returCurrentTrendyolClaim) return;
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;
    showLoading(true);
    try {
        const response = await fetch(RETUR_APPROVE_TRENDYOL_CLAIM_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sellerId: TRENDYOL_SELLER_ID,
                claimId: returCurrentTrendyolClaim.claimId,
                claimLineItemIdList: returCurrentTrendyolClaim.claimLineItemIdList || [],
            }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showToast('Retur Trendyol aprobat!');
        showPage('page-dashboard');
    } catch (err) {
        console.error('Eroare aprobare claim Trendyol:', err);
        showToast('Eroare la aprobarea returului.', true);
        if (btn) btn.disabled = false;
    } finally {
        showLoading(false);
    }
}

// ============================================================
// RESPINGERE CLAIM TRENDYOL
// ============================================================

async function submitTrendyolReject(event) {
    if (!returCurrentTrendyolClaim) return;
    const reasonId = parseInt(document.getElementById('trendyol-reason-select')?.value);
    const description = document.getElementById('trendyol-reject-desc')?.value?.trim() || '';
    if (!reasonId) { showToast('Selectează un motiv de respingere!', true); return; }
    if (!description) { showToast('Descrierea este obligatorie!', true); return; }
    if (!TRENDYOL_NO_PHOTO_REASON_IDS.has(reasonId) && !returTrendyolPhotoBase64) {
        showToast('Poza este obligatorie pentru acest motiv!', true); return;
    }
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;
    showLoading(true);
    try {
        const response = await fetch(RETUR_REJECT_TRENDYOL_CLAIM_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sellerId: TRENDYOL_SELLER_ID,
                claimId: returCurrentTrendyolClaim.claimId,
                claimItemIdList: returCurrentTrendyolClaim.claimLineItemIdList || [],
                claimIssueReasonId: reasonId,
                description,
                imageBase64: returTrendyolPhotoBase64 || undefined,
            }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showToast('Retur Trendyol respins!');
        showPage('page-dashboard');
    } catch (err) {
        console.error('Eroare respingere claim Trendyol:', err);
        showToast('Eroare la respingerea returului.', true);
        if (btn) btn.disabled = false;
    } finally {
        showLoading(false);
    }
}

// ============================================================
// EXPUNERE GLOBALĂ
// ============================================================
window.openReturPage = openReturPage;
window.startReturScan = startReturScan;
window.handleReturAwbScan = handleReturAwbScan;
window.submitRma = submitRma;
window.confirmNeridicat = confirmNeridicat;
window.updateReturTotal = updateReturTotal;
window.approveTrendyolClaim = approveTrendyolClaim;
window.toggleTrendyolRejectForm = toggleTrendyolRejectForm;
window.onTrendyolReasonChange = onTrendyolReasonChange;
window.handleTrendyolPhotoSelect = handleTrendyolPhotoSelect;
window.submitTrendyolReject = submitTrendyolReject;
