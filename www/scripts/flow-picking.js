// scripts/flow-picking.js

// --- Notificări Dashboard ---

function setupDashboardNotification() {
    const notifFooter = document.getElementById('notification-footer');
    const bubble = document.getElementById('floating-order-bubble');
    const count = liveOrders.length;
    
    if (count > 0) {
        const text = `${count} ${count === 1 ? 'comandă' : 'comenzi'} așteaptă pregătirea.`;
        document.getElementById('order-notification-text-footer').textContent = text;
        document.getElementById('floating-order-count').textContent = count;
        
        if (isOrderNotificationHidden) {
            notifFooter.style.display = 'none';
            bubble.classList.add('visible');
        } else {
            notifFooter.style.display = 'block';
            bubble.classList.remove('visible');
        }
    } else {
        notifFooter.style.display = 'none';
        bubble.classList.remove('visible');
    }
}

function hideOrderNotification(event) {
    event.stopPropagation();
    isOrderNotificationHidden = true;
    setupDashboardNotification();
}

// --- Inițializare Proces Picking (PER COMANDĂ) ---

async function startPickingProcess() {
    // Reset UI
    document.getElementById('picking-complete').classList.add('hidden');
    document.getElementById('picking-error-overlay').classList.add('hidden');
    document.getElementById('picking-success-overlay').classList.add('hidden');
    document.getElementById('picking-item-success-overlay').classList.add('hidden');
    document.getElementById('floating-order-bubble').classList.remove('visible');
    
    // Inițializează
    window.processedOrderIds = new Set(); 

    if (liveOrders.length === 0) {
        finishPicking();
        return;
    }

    // SORTARE: De la prima intrată (Cea mai veche) la ultima (Cea mai nouă)
    liveOrders.sort((a, b) => {
        const idA = a.order_id || a.id || 0;
        const idB = b.order_id || b.id || 0;
        return idA - idB;
    });

    // 1. Grupează și pregătește lista de COMENZI
    // Returnează un obiect { validRoutes, problematicRoutes }
    const result = await createOrderBasedPickingList(liveOrders);
    
    // Combinăm listele: cele valide primele, cele cu probleme la coadă
    pickingRoutes = [...result.validRoutes, ...result.problematicRoutes];

    // Informăm utilizatorul dacă există comenzi cu probleme puse la coadă
    if (result.problematicRoutes.length > 0) {
        showToast(`${result.problematicRoutes.length} comenzi cu stoc insuficient mutate la final.`, true);
    }

    currentRouteIndex = 0; // Indexul comenzii curente
    currentStopIndex = 0;  // Indexul produsului curent din comandă

    if (pickingRoutes.length > 0) {
        await renderCurrentPickingStop();
    } else {
        finishPicking();
    }
}

// --- Funcții Helper pentru Listă ---

async function createOrderBasedPickingList(orders) {
    const validRoutes = [];
    const skippedOrders = []; // Comenzi care nu au stoc complet în prima trecere

    // Încărcăm stocul real din browser
    const realInventory = loadFromLocalStorage('inventoryLocations') || {};
    
    // Facem o copie a inventarului pentru a simula rezervările.
    let virtualInventory = JSON.parse(JSON.stringify(realInventory));
    
    // Colectăm SKU-uri pentru detalii
    const allSkus = new Set();
    orders.forEach(o => {
        if(Array.isArray(o.products)) o.products.forEach(p => allSkus.add(p.sku));
    });
    const productMap = await fetchProductDetailsBatch(Array.from(allSkus));

    // --- PASUL 1: Identificăm comenzile care pot fi livrate INTEGRAL ---
    for (const order of orders) {
        if (!Array.isArray(order.products)) continue;
        
        let tempInventory = JSON.parse(JSON.stringify(virtualInventory));
        let orderStops = [];
        let isOrderFullyStocked = true;
        
        // Consolidăm cererea
        const demandMap = new Map();
        for (const item of order.products) {
            const current = demandMap.get(item.sku) || 0;
            demandMap.set(item.sku, current + item.quantity);
        }

        // Verificăm stocul
        for (const [sku, qtyNeeded] of demandMap.entries()) {
            let qtyRemaining = qtyNeeded;
            const productInfo = productMap[sku];
            const skuLocations = tempInventory[sku] || {};
            const sortedLocKeys = Object.keys(skuLocations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            for (const locKey of sortedLocKeys) {
                if (qtyRemaining <= 0) break;
                const available = skuLocations[locKey];
                if (available <= 0) continue;

                const toTake = Math.min(available, qtyRemaining);
                orderStops.push({
                    sku: sku,
                    quantityToPick: toTake,
                    locationKey: locKey,
                    product: productInfo
                });

                qtyRemaining -= toTake;
                skuLocations[locKey] -= toTake;
            }

            if (qtyRemaining > 0) {
                isOrderFullyStocked = false;
                break; 
            }
        }

        if (isOrderFullyStocked && orderStops.length > 0) {
            // Sortăm pașii și adăugăm la lista validă
            orderStops.sort((a, b) => a.locationKey.localeCompare(b.locationKey, undefined, { numeric: true }));
            validRoutes.push({
                orderData: order,
                stops: orderStops,
                isProblematic: false
            });
            virtualInventory = tempInventory; // Commit la stoc
        } else {
            // Dacă nu e completă, o păstrăm pentru Pasul 2
            skippedOrders.push(order);
        }
    }
    
    // --- PASUL 2: Procesăm comenzile PROBLEMATICE cu stocul RĂMAS ---
    const problematicRoutes = [];
    
    for (const order of skippedOrders) {
        let orderStops = [];
        const demandMap = new Map();
        for (const item of order.products) {
            const current = demandMap.get(item.sku) || 0;
            demandMap.set(item.sku, current + item.quantity);
        }

        for (const [sku, qtyNeeded] of demandMap.entries()) {
            let qtyRemaining = qtyNeeded;
            const productInfo = productMap[sku];
            // Folosim virtualInventory care a rămas după comenzile valide
            const skuLocations = virtualInventory[sku] || {}; 
            const sortedLocKeys = Object.keys(skuLocations).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            // Luăm ce a mai rămas
            for (const locKey of sortedLocKeys) {
                if (qtyRemaining <= 0) break;
                const available = skuLocations[locKey];
                if (available <= 0) continue;

                const toTake = Math.min(available, qtyRemaining);
                orderStops.push({
                    sku: sku,
                    quantityToPick: toTake,
                    locationKey: locKey,
                    product: productInfo
                });

                qtyRemaining -= toTake;
                skuLocations[locKey] -= toTake;
            }

            // Pentru ce lipsește, creăm un stop special "LIPSĂ STOC"
            if (qtyRemaining > 0) {
                orderStops.push({
                    sku: sku,
                    quantityToPick: qtyRemaining,
                    locationKey: "LIPSĂ STOC", // Cheie specială
                    product: productInfo
                });
            }
        }

        // Sortăm: Locațiile reale primele, "LIPSĂ STOC" la final
        orderStops.sort((a, b) => {
            if (a.locationKey === "LIPSĂ STOC") return 1;
            if (b.locationKey === "LIPSĂ STOC") return -1;
            return a.locationKey.localeCompare(b.locationKey, undefined, { numeric: true });
        });

        if (orderStops.length > 0) {
            problematicRoutes.push({
                orderData: order,
                stops: orderStops,
                isProblematic: true // Flag pentru UI
            });
        }
    }

    return { validRoutes, problematicRoutes };
}

// --- Randare UI ---

async function renderCurrentPickingStop() {
    if (currentRouteIndex >= pickingRoutes.length) {
        finishPicking();
        return;
    }
    
    const currentOrder = pickingRoutes[currentRouteIndex];
    if (!currentOrder || currentOrder.stops.length === 0) {
        currentRouteIndex++;
        currentStopIndex = 0;
        renderCurrentPickingStop();
        return;
    }

    // -- Indicator Multi-Produs & Problemă Stoc --
    const indicator = document.getElementById('multi-product-indicator');
    
    // Resetăm clasele indicatorului
    indicator.className = 'hidden text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-1 border';

    if (currentOrder.isProblematic) {
        // Stil ROȘU pentru comenzi cu probleme
        indicator.textContent = "STOC INSUFICIENT";
        indicator.classList.remove('hidden');
        indicator.classList.add('bg-red-500/20', 'text-red-400', 'border-red-500/30');
    } else if (currentOrder.stops.length > 1) {
        // Stil ALBASTRU pentru multi-produs normal
        indicator.textContent = "Multi-Produs";
        indicator.classList.remove('hidden');
        indicator.classList.add('bg-blue-500/20', 'text-blue-400', 'border-blue-500/30');
    } else {
        indicator.classList.add('hidden');
    }

    const stop = currentOrder.stops[currentStopIndex];
    
    // 1. Locație
    const locRow = document.getElementById('loc-row');
    const locDesc = document.getElementById('loc-desc');
    const locShelf = document.getElementById('loc-shelf');
    const locBox = document.getElementById('loc-box');

    if (stop.locationKey === "LIPSĂ STOC") {
        // Afișare specială pentru lipsă stoc
        locRow.textContent = "!";
        locDesc.textContent = "LIPSĂ";
        locShelf.textContent = "STOC";
        locBox.textContent = "!";
        
        // Facem textul roșu
        locRow.parentElement.parentElement.classList.add('text-red-500');
    } else {
        // Afișare normală
        locRow.parentElement.parentElement.classList.remove('text-red-500');
        const locParts = stop.locationKey.split(',');
        locRow.textContent = locParts[0] || '-';
        locDesc.textContent = locParts[1] || '-';
        locShelf.textContent = locParts[2] || '-';
        locBox.textContent = locParts[3] || '-';
    }

    // 2. Produs
    const displayDiv = document.getElementById('picking-sku-display');
    const sku = stop.sku;
    if (sku.length > 5) {
        const mainPart = sku.substring(0, sku.length - 5);
        const highlightPart = sku.substring(sku.length - 5);
        displayDiv.innerHTML = `${mainPart}<span class="text-highlight drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]">${highlightPart}</span>`;
    } else {
        displayDiv.textContent = sku;
    }

    // 3. Cantitate
    const qty = stop.quantityToPick;
    document.getElementById('picking-qty-display').textContent = `${qty} unitat${qty !== 1 ? 'e' : 'i'}`;

    // 4. Progres (GLOBAL PE COMENZI)
    const totalOrders = pickingRoutes.length;
    const currentOrderNumber = currentRouteIndex + 1;
    
    document.getElementById('picking-progress-text').innerHTML = `Comanda <span class="text-white">${currentOrderNumber}</span> din ${totalOrders}`;
    
    const stepsInCurrentOrder = currentOrder.stops.length;
    const currentStep = currentStopIndex; 
    
    const fraction = stepsInCurrentOrder > 0 ? (currentStep / stepsInCurrentOrder) : 0;
    const globalProgress = ((currentRouteIndex + fraction) / totalOrders) * 100;
    
    document.getElementById('picking-progress-bar').style.width = `${Math.round(globalProgress)}%`;
    document.getElementById('picking-progress-percent').textContent = `${Math.round(globalProgress)}%`;
}

// --- Logică Scanare ---

window.errorLottieAnim = null;

function initErrorAnimation() {
    const container = document.getElementById('lottie-error-container');
    if (!container) return;
    
    try {
        window.errorLottieAnim = lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: false,
            autoplay: false,
            path: 'assets/error.json'
        });
    } catch (e) {
        console.warn("Lottie load failed", e);
    }
}

function startPickingScan() {
    startScanner('picking');
}

async function handlePickingScan(scannedCode) {
    if (currentRouteIndex >= pickingRoutes.length) return;
    
    const currentOrder = pickingRoutes[currentRouteIndex];
    const stop = currentOrder.stops[currentStopIndex];

    // Dacă locația este "LIPSĂ STOC", utilizatorul nu are ce cod să scaneze pentru a valida
    // Poate doar să dea "Skip" sau să scaneze produsul dacă îl găsește în altă parte (dar logic ar fi skip)
    if (stop.locationKey === "LIPSĂ STOC") {
        showToast("Acest produs lipsește din stoc. Folosește 'Sari peste' sau verifică manual.", true);
        return;
    }

    const expectedSku = stop.sku.toUpperCase();
    const scanned = scannedCode.trim().toUpperCase();

    if (scanned === expectedSku) {
        showToast("Cod Corect!", false);
        await advancePickingStop(); 
    } else {
        showWrongProductError();
    }
}

function showWrongProductError() {
    const overlay = document.getElementById('picking-error-overlay');
    overlay.classList.remove('hidden');
    
    if (!window.errorLottieAnim) {
        initErrorAnimation();
    }
    if (window.errorLottieAnim) {
        window.errorLottieAnim.goToAndPlay(0, true);
    }
    
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 3000);
}

// --- Avansare și Finalizare Comandă ---

async function advancePickingStop() {
    const currentOrder = pickingRoutes[currentRouteIndex];
    const stop = currentOrder.stops[currentStopIndex];

    // 1. Scădere Stoc (Doar dacă locația e validă)
    if (stop.locationKey !== "LIPSĂ STOC") {
        const inventory = loadFromLocalStorage('inventoryLocations');
        if (inventory[stop.sku] && inventory[stop.sku][stop.locationKey]) {
             inventory[stop.sku][stop.locationKey] -= stop.quantityToPick;
             if (inventory[stop.sku][stop.locationKey] <= 0) {
                 delete inventory[stop.sku][stop.locationKey];
             }
             saveToLocalStorage('inventoryLocations', inventory);
             await sendStorageUpdate(stop.sku, stop.locationKey, "scadere", stop.quantityToPick);
        }
    }

    // 2. Incrementare pas
    currentStopIndex++;

    // 3. Verifică dacă s-a terminat COMANDA
    if (currentStopIndex >= currentOrder.stops.length) {
        // --- FINALIZARE COMANDĂ ---
        
        // Dacă comanda a fost problematică, poate nu vrem să generăm AWB automat?
        // Momentan păstrăm fluxul standard, dar poți adăuga o verificare aici.
        const success = await handleOrderComplete(currentOrder); // Trimitem întreaga rută (cu _cachedZpl)
        
        if (success) {
            currentRouteIndex++;
            currentStopIndex = 0;
        } else {
            currentStopIndex--; 
        }
    } else {
        // --- COMANDA CONTINUĂ (Mai sunt produse) ---
        await showItemSuccessOverlay();
    }
    
    renderCurrentPickingStop();
}

function showItemSuccessOverlay() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('picking-item-success-overlay');
        overlay.classList.remove('hidden');
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            resolve();
        }, 4000); // 4 secunde
    });
}

async function handleOrderComplete(orderRoute) {
    const internalId = orderRoute.orderData.internal_id || "N/A";

    showToast(`Finalizare comandă ${internalId}...`, false);

    try {
        showToast("Generez și descarc AWB...", false);
        const zplString = await window.fetchAwbAndConvert(internalId);
        showToast("Trimit la imprimantă Zebra...", false);
        await window.NativePrinter.print(zplString);
        showToast("✅ AWB printat cu succes!", false);
    } catch (e) {
        showToast("Eroare la printare AWB: " + e.message, true);
        return false;
    }

    emitInvoiceRequest(internalId);

    await showSuccessTimer();
    return true;
}

// Trimite cererea de emitere factură în fundal (nu blochează finalizarea comenzii),
// dar loghează request/response și anunță utilizatorul dacă eșuează.
function emitInvoiceRequest(internalId) {
    const url = `https://opensalesapi-production-4572.up.railway.app/orders/${internalId}/invoice/emit`;
    const method = 'POST';
    const headers = { 'Authorization': `Bearer ${window.OPENSALES_API_KEY}` };

    fetch(url, { method, headers })
        .then(async (res) => {
            const bodyText = await res.text().catch(() => '');
            window.addLog({
                type: 'invoice', success: res.ok,
                request: { method, url, headers },
                response: { status: res.status, body: bodyText },
            });
            if (!res.ok) {
                showToast(`Eroare factură comandă ${internalId} (cod ${res.status})`, true);
            }
        })
        .catch(e => {
            window.addLog({
                type: 'invoice', success: false,
                request: { method, url, headers },
                error: e.message,
            });
            showToast(`Eroare rețea la factura comenzii ${internalId}: ${e.message}`, true);
        });
}

function showSuccessTimer() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('picking-success-overlay');
        const countSpan = document.getElementById('success-timer-count');
        const ring = document.getElementById('success-timer-ring');
        
        overlay.classList.remove('hidden');
        
        let secondsLeft = 5;
        countSpan.textContent = secondsLeft;
        
        // Reset ring animation
        ring.style.strokeDashoffset = '0';
        void ring.offsetWidth;
        ring.style.strokeDashoffset = '754';
        ring.style.transitionDuration = '5s';

        const timer = setInterval(() => {
            secondsLeft--;
            countSpan.textContent = secondsLeft;
            
            if (secondsLeft <= 0) {
                clearInterval(timer);
                overlay.classList.add('hidden');
                resolve(); 
            }
        }, 1000);
    });
}

function skipPickingStop() {
    if (currentRouteIndex >= pickingRoutes.length) return;
    
    if (pickingRoutes.length <= 1) {
        showToast("Este singura comandă rămasă.", true);
        return;
    }
    
    const skippedOrder = pickingRoutes.splice(currentRouteIndex, 1)[0];
    pickingRoutes.push(skippedOrder);
    
    currentStopIndex = 0;
    
    showToast("Comandă amânată.");
    renderCurrentPickingStop();
}

function finishPicking() {
    document.getElementById('picking-complete').classList.remove('hidden');
    liveOrders = []; 
    isOrderNotificationHidden = false;
    setupDashboardNotification();
}

// Expun funcțiile
window.setupDashboardNotification = setupDashboardNotification;
window.hideOrderNotification = hideOrderNotification;
window.startPickingProcess = startPickingProcess;
window.advancePickingStop = advancePickingStop;
window.skipPickingStop = skipPickingStop;
window.startPickingScan = startPickingScan;
window.handlePickingScan = handlePickingScan;
