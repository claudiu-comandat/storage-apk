// --- Logică "Adaugă Produs" (Pagina 3) ---

function goToAddStep(step) {
    document.getElementById('add-step-1-products').classList.add('hidden');
    document.getElementById('add-step-1b-quantity').classList.add('hidden'); // NOU: Ascunde pasul de cantitate
    document.getElementById('add-step-2-location').classList.add('hidden');
    document.getElementById('add-step-3-confirm').classList.add('hidden');

    if (step === 1) {
        document.getElementById('add-step-1-products').classList.remove('hidden');
        renderAddProductList(); 
    } else if (step === '1b') { // NOU: Pasul pentru cantitate
        document.getElementById('add-step-1b-quantity').classList.remove('hidden');
    } else if (step === 2) {
        // MODIFICAT: Calculează sumarul pe baza cantităților
        let totalItems = scannedProductList.reduce((acc, item) => acc + item.quantity, 0);
        let uniqueSkus = scannedProductList.length;
        
        let summary = `${totalItems} ${totalItems === 1 ? 'produs' : 'produse'} (${uniqueSkus} SKU${uniqueSkus === 1 ? '' : '-uri'} unice)`;
        document.getElementById('add-product-summary').textContent = summary;
        document.getElementById('add-step-2-location').classList.remove('hidden');
    } else if (step === 3) {
        document.getElementById('add-step-3-confirm').classList.remove('hidden');
    }
}

async function handleProductScan(sku) {
    // MODIFICAT: Nu adaugă direct la listă, ci merge la pasul de cantitate
    const product = await getProductDetails(sku);
    currentScannedProduct = { sku, product }; // Stochează temporar produsul scanat
    
    document.getElementById('add-quantity-sku').textContent = product.name_ro; // Afișează SKU (name_ro e SKU)
    document.getElementById('add-quantity-input').value = 1; // Resetează cantitatea la 1
    
    goToAddStep('1b'); // Arată pasul de cantitate
}

// NOU: Funcție pentru a confirma cantitatea
function confirmAddQuantity() {
    const quantityInput = document.getElementById('add-quantity-input');
    const quantity = parseInt(quantityInput.value, 10);

    if (isNaN(quantity) || quantity <= 0) {
        showToast("Cantitate invalidă.", true);
        return;
    }
    
    if (!currentScannedProduct) {
        showToast("Eroare produs. Rescanează.", true);
        goToAddStep(1);
        return;
    }

    const skuToFind = currentScannedProduct.sku;

    // Verifică dacă produsul e deja în listă
    const existingItem = scannedProductList.find(item => item.sku === skuToFind);
    
    if (existingItem) {
        // Dacă există, adună cantitatea
        existingItem.quantity += quantity;
    } else {
        // Dacă nu există, adaugă-l
        scannedProductList.push({
            sku: currentScannedProduct.sku,
            product: currentScannedProduct.product,
            quantity: quantity
        });
    }
    
    const productName = currentScannedProduct.product.name_ro || currentScannedProduct.sku;
    currentScannedProduct = null;
    
    renderAddProductList();
    showToast(`Adăugat ${quantity} x ${productName}`);
    goToAddStep(1); // Mergi înapoi la ecranul de scanare
}


function renderAddProductList() {
    const listContainer = document.getElementById('add-product-list');
    const continueBtn = document.getElementById('add-to-location-btn');
    
    if (scannedProductList.length === 0) {
        listContainer.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark text-center p-4">Niciun produs scanat.</p>`;
        continueBtn.classList.add('hidden');
    } else {
        // MODIFICAT: Afișează și cantitatea
        listContainer.innerHTML = scannedProductList.map((item, index) => {
            return `
                <div class="product-list-item">
                    <div class="flex-1 truncate pr-2">
                        <p class="text-text-light dark:text-text-dark font-semibold truncate">
                            <span class="text-primary font-bold">${item.quantity} x</span> 
                            ${item.product.name_ro || item.sku}
                        </p>
                        <p class="text-xs text-subtext-light dark:text-subtext-dark font-mono">${item.sku}</p>
                    </div>
                    <button onclick="removeProductFromAddList(${index})" class="w-10 h-10 flex-shrink-0 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 rounded-full flex items-center justify-center">
                        <span class="material-icons-outlined">delete</span>
                    </button>
                </div>
            `;
        }).join('');
        continueBtn.classList.remove('hidden');
    }
}

function removeProductFromAddList(index) {
    const removed = scannedProductList.splice(index, 1);
    showToast(`Șters: ${removed[0].product.name_ro || removed[0].sku}`);
    renderAddProductList();
}

function handleLocationScan(locationKey) {
    scannedLocation = locationKey;
    
    // MODIFICAT: Construiește sumarul pe baza listei
    let confirmListHtml = scannedProductList.map(item => {
        return `<li><span class="font-bold">${item.quantity} x</span> ${item.product.name_ro || item.sku}</li>`;
    }).join('');
    
    document.getElementById('add-confirm-list').innerHTML = confirmListHtml;
    document.getElementById('add-confirm-location').innerHTML = formatLocation(locationKey, true);
    goToAddStep(3); 
}

async function saveMultiAdd() {
    if (scannedProductList.length === 0 || !scannedLocation) {
        showToast("Date invalide. Încearcă din nou.", true);
        return;
    }

    showLoading(true);
    const inventory = loadFromLocalStorage('inventoryLocations');
    
    // MODIFICAT: Iterează prin lista de produse și cantitățile lor
    const storagePromises = [];
    let totalItems = 0;

    for (const item of scannedProductList) {
        const sku = item.sku;
        const quantityToAdd = item.quantity;
        totalItems += quantityToAdd;
        
        if (!inventory[sku]) inventory[sku] = {};
        
        const currentQuantity = inventory[sku][scannedLocation] || 0;
        inventory[sku][scannedLocation] = currentQuantity + quantityToAdd;
        
        storagePromises.push(
            sendStorageUpdate(sku, scannedLocation, "adunare", quantityToAdd)
        );
    }
    
    try {
        saveToLocalStorage('inventoryLocations', inventory);
        await Promise.all(storagePromises);
        showToast(`Adăugate ${totalItems} produse la ${scannedLocation}`);
        showPage('page-dashboard');
    } catch (error) {
        console.error("Eroare la salvarea adăugării multiple:", error);
        showToast("Eroare la sincronizarea stocului.", true);
    } finally {
        showLoading(false);
    }
}

function resetAddFlow(navigateToDashboard = false) {
    scannedProductList = []; 
    scannedLocation = null;
    currentScannedProduct = null; // NOU
    
    document.getElementById('add-step-1-products').classList.remove('hidden');
    document.getElementById('add-step-1b-quantity').classList.add('hidden'); // NOU
    document.getElementById('add-step-2-location').classList.add('hidden');
    document.getElementById('add-step-3-confirm').classList.add('hidden');
    renderAddProductList(); 
    if (navigateToDashboard) {
        showPage('page-dashboard');
    }
}

function handleCancelAddFlow() {
    // Verifică dacă suntem la Pasul 1 (lista de produse)
    const step1Active = !document.getElementById('add-step-1-products').classList.contains('hidden');
    
    if (step1Active) {
        // Dacă suntem la pasul 1, ieșim de tot (comportamentul vechi)
        resetAddFlow(true);
    } else {
        // Dacă suntem la pasul 1b, 2, or 3, ne întoarcem la pasul 1 (lista de produse)
        // și resetăm produsul scanat curent (dacă există)
        currentScannedProduct = null;
        goToAddStep(1);
    }
}

async function quickAddProductBySku(sku) {
    // 1. Verifică dacă suntem în pasul de confirmare (Step 3) - dacă da, ignoră
    if (!document.getElementById('add-step-3-confirm').classList.contains('hidden')) {
        return; 
    }

    // 2. Obține detaliile produsului
    const product = await getProductDetails(sku);
    
    // 3. Verifică dacă există deja în listă
    const existingItem = scannedProductList.find(item => item.sku === sku);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        scannedProductList.push({
            sku: sku,
            product: product,
            quantity: 1
        });
    }

    // 4. Actualizează UI-ul listei
    renderAddProductList();
    showToast(`Adăugat rapid: ${product.name_ro || sku}`);
    
    // 5. Asigură-te că rămânem/revenim la pasul 1 (în caz că eram la pasul de cantitate)
    if (document.getElementById('add-step-1-products').classList.contains('hidden')) {
         goToAddStep(1);
    }
}

// ExpuN funcțiile necesare global
window.goToAddStep = goToAddStep;
window.handleProductScan = handleProductScan;
window.confirmAddQuantity = confirmAddQuantity;
window.removeProductFromAddList = removeProductFromAddList;
window.handleLocationScan = handleLocationScan;
window.saveMultiAdd = saveMultiAdd;
window.resetAddFlow = resetAddFlow;
window.handleCancelAddFlow = handleCancelAddFlow;
window.quickAddProductBySku = quickAddProductBySku;
