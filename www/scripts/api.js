/**
 * Încarcă stocul inițial de la webhook
 */
async function loadInitialStorage() {
    showLoading(true);
    try {
        const response = await fetch(GET_STORAGE_WEBHOOK_URL, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Eroare HTTP: ${response.status}`);
        }

        const inventoryDataArray = await response.json();
        const inventoryLocationsObject = {};

        if (Array.isArray(inventoryDataArray)) {
            inventoryDataArray.forEach(item => {
                const { sku, location, quantity } = item;
                if (!sku || !location || quantity === undefined) {
                    console.warn("Item de stoc invalid, ignorat:", item);
                    return;
                }
                if (!inventoryLocationsObject[sku]) {
                    inventoryLocationsObject[sku] = {};
                }
                inventoryLocationsObject[sku][location] = quantity;
            });
        } else {
            console.warn("Răspunsul API de stoc nu a fost un array:", inventoryDataArray);
        }

        saveToLocalStorage('inventoryLocations', inventoryLocationsObject);
        console.log("Stoc încărcat de la webhook (format brut):", inventoryDataArray);
        console.log("Stoc transformat și salvat:", inventoryLocationsObject);

    } catch (error) {
        console.error("Eroare la încărcarea stocului:", error);
        saveToLocalStorage('inventoryLocations', {});
    } finally {
        showLoading(false);
        await fetchAndSetupOrders();
    }
}


/**
 * Preluare comenzi de la API
 */
async function fetchAndSetupOrders() {
    try {
        const response = await fetch(GET_ORDERS_WEBHOOK_URL);
        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);
        liveOrders = await response.json();

        if (!Array.isArray(liveOrders)) {
            console.warn("Răspunsul de la API-ul de comenzi nu a fost un array.", liveOrders);
            liveOrders = [];
        }

    } catch (error) {
        console.error("Eroare la preluarea comenzilor:", error);
        showToast("Eroare la preluarea comenzilor.", true);
        liveOrders = [];
    } finally {
        setupDashboardNotification();
    }
}

/**
 * Trimite actualizări de stoc către webhook-ul de stocare.
 */
async function sendStorageUpdate(sku, location, operation_type, value) {
    if (!sku || !location || !operation_type || value <= 0) {
        console.warn("Actualizare stoc anulată, date invalide:", { sku, location, operation_type, value });
        return;
    }

    const payload = {
        sku: sku,
        location: location,
        operation_type: operation_type, // "adunare" sau "scadere"
        value: value
    };

    try {
        const response = await fetch(STORAGE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Eroare Webhook Stoc: ${response.status}`);
        }
        console.log("Actualizare stoc trimisă:", payload);
    } catch (error) {
        console.error("Eroare la trimiterea actualizării de stoc:", error);
    }
}

// Funcția extractAsinFromSku a fost ȘTEARSĂ

/**
 * Preia detalii pentru mai multe SKU-uri.
 * MODIFICAT: Nu mai apelează API-ul de produse, returnează SKU-ul ca nume.
 */
async function fetchProductDetailsBatch(skus) {
    const productDB = loadFromLocalStorage('productDatabase');
    const productsToReturn = {};

    for (const sku of skus) {
        if (productDB[sku]) {
            productsToReturn[sku] = productDB[sku];
        } else {
            // Creează un produs placeholder
            const placeholderProduct = { name_ro: sku, name_en: sku, error: true };
            productDB[sku] = placeholderProduct; // Salvează placeholder în cache
            productsToReturn[sku] = placeholderProduct;
        }
    }

    // Salvează noile placeholder-uri (dacă au fost)
    saveToLocalStorage('productDatabase', productDB);

    // Returnează direct, fără apel API (fără showLoading)
    return productsToReturn;
}

/**
 * Preia detaliile unui singur produs (folosind funcția de batch).
 * MODIFICAT: Acum este o funcție locală rapidă.
 */
async function getProductDetails(sku) {
    const productDB = loadFromLocalStorage('productDatabase');
    if (productDB[sku]) {
        return productDB[sku]; // Returnează din cache
    }

    // Apeleză funcția de batch (care acum e locală și rapidă)
    const productMap = await fetchProductDetailsBatch([sku]);

    return productMap[sku];
}

async function sendPrintAwbRequest(payload) {
    // Payload trebuie să fie un obiect: { orderId: 123, internalId: "..." }
    if (!payload) {
        showToast("Date lipsă pentru printare.", true);
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(window.PRINT_AWB_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload) // Trimite tot obiectul exact cum vine
        });

        if (response.ok) {
            // Afișăm internal_id în mesajul de succes pentru confirmare vizuală
            const displayId = payload.internalId || payload.orderId;
            showToast(`Printare trimisă: ${displayId}`);
        } else {
            throw new Error(`Eroare server: ${response.status}`);
        }
    } catch (error) {
        console.error("Eroare printare AWB:", error);
        showToast("Eroare la trimiterea comenzii de printare.", true);
    } finally {
        showLoading(false);
    }
}

const OPENSALES_API_KEY = 'ops_98OMz81fhBv_rI5Sjq_qUlE2glG2QM-q';

async function fetchAwbAndConvert(internalId) {
    const url = `https://opensalesapi-production-4572.up.railway.app/orders/${internalId}/awb-outgoing/get-or-issue`;
    const method = 'POST';
    const headers = { 'Authorization': `Bearer ${OPENSALES_API_KEY}` };
    let arrayBuffer;
    let status = null;

    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { CapacitorHttp } = window.Capacitor.Plugins;
            try {
                const res = await CapacitorHttp.post({ url, headers, responseType: 'arraybuffer' });
                status = res.status;
                const data = res.data;
                if (typeof data === 'string') {
                    const bin = window.atob(data);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    arrayBuffer = bytes.buffer;
                } else {
                    arrayBuffer = data;
                }
            } catch (e) {
                const res = await fetch(url, { method, headers });
                status = res.status;
                if (!res.ok) throw new Error(`Eroare AWB: ${res.status}`);
                arrayBuffer = await res.arrayBuffer();
            }
        } else {
            const res = await fetch(url, { method, headers });
            status = res.status;
            if (!res.ok) throw new Error(`Eroare AWB: ${res.status}`);
            arrayBuffer = await res.arrayBuffer();
        }

        window.addLog({
            type: 'awb', success: true,
            request: { method, url, headers },
            response: { status, body: `[PDF binar, ${arrayBuffer.byteLength} bytes]` },
        });

        return window.renderPdfToZpl(arrayBuffer);
    } catch (e) {
        window.addLog({
            type: 'awb', success: false,
            request: { method, url, headers },
            response: status ? { status } : null,
            error: e.message,
        });
        throw e;
    }
}

// ExpuN funcțiile necesare global
window.loadInitialStorage = loadInitialStorage;
window.fetchAndSetupOrders = fetchAndSetupOrders;
window.sendStorageUpdate = sendStorageUpdate;
window.fetchProductDetailsBatch = fetchProductDetailsBatch;
window.getProductDetails = getProductDetails;
window.OPENSALES_API_KEY = OPENSALES_API_KEY;
window.sendPrintAwbRequest = sendPrintAwbRequest;
window.fetchAwbAndConvert = fetchAwbAndConvert;
