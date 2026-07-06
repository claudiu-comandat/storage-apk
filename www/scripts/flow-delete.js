// --- Logică "Șterge Produs" (Pagina 5) ---

function resetDeleteFlow(navigateToDashboard = false) {
    deleteProductList = []; 
    deleteLocation = null;
    currentScannedProductForDelete = null; // MODIFICARE
    
    document.getElementById('delete-step-1-products').classList.remove('hidden');
    document.getElementById('delete-step-1b-quantity').classList.add('hidden'); // MODIFICARE
    document.getElementById('delete-step-2-location').classList.add('hidden');
    document.getElementById('delete-step-3-confirm').classList.add('hidden');
    
    document.getElementById('delete-product-list').innerHTML = ''; 

    if (navigateToDashboard) {
        showPage('page-dashboard');
    }
}

function goToDeleteStep(step) {
    document.getElementById('delete-step-1-products').classList.add('hidden');
    document.getElementById('delete-step-1b-quantity').classList.add('hidden'); // MODIFICARE
    document.getElementById('delete-step-2-location').classList.add('hidden');
    document.getElementById('delete-step-3-confirm').classList.add('hidden');
    
    if (step === 1) {
        document.getElementById('delete-step-1-products').classList.remove('hidden');
        renderDeleteProductList();
    } else if (step === '1b') { // MODIFICARE: Pas nou
        document.getElementById('delete-step-1b-quantity').classList.remove('hidden');
    } else if (step === 2) {
        if (deleteProductList.length === 0) {
            showToast("Trebuie să scanezi cel puțin un produs.", true);
            goToDeleteStep(1); 
            return;
        }
        // MODIFICARE: Calculează sumarul pe baza cantităților
        let totalItems = deleteProductList.reduce((acc, item) => acc + item.quantity, 0);
        let uniqueSkus = deleteProductList.length;
        document.getElementById('delete-summary-text').textContent = `${totalItems} buc. (${uniqueSkus} SKU-uri) selectate`;
        document.getElementById('delete-step-2-location').classList.remove('hidden');
    } else if (step === 3) {
         renderDeleteConfirmPage(); 
         document.getElementById('delete-step-3-confirm').classList.remove('hidden');
    }
}

// MODIFICARE: Logica de scanare
async function handleDeleteProductScan(sku) {
    // Nu adaugă direct la listă, ci merge la pasul de cantitate
    const product = await getProductDetails(sku);
    currentScannedProductForDelete = { sku, product }; // Stochează temporar
    
    document.getElementById('delete-quantity-sku').textContent = product.name_ro; 
    document.getElementById('delete-quantity-input').value = 1; // Resetează cantitatea
    
    goToDeleteStep('1b'); // Arată pasul de cantitate
}

// MODIFICARE: Funcție nouă
function confirmDeleteQuantity() {
    const quantityInput = document.getElementById('delete-quantity-input');
    const quantity = parseInt(quantityInput.value, 10);

    if (isNaN(quantity) || quantity <= 0) {
        showToast("Cantitate invalidă.", true);
        return;
    }
    
    if (!currentScannedProductForDelete) {
        showToast("Eroare produs. Rescanează.", true);
        goToDeleteStep(1);
        return;
    }

    const skuToFind = currentScannedProductForDelete.sku;

    // Verifică dacă produsul e deja în listă
    const existingItem = deleteProductList.find(item => item.sku === skuToFind);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        deleteProductList.push({
            sku: currentScannedProductForDelete.sku,
            product: currentScannedProductForDelete.product,
            quantity: quantity
        });
    }
    
    const productName = currentScannedProductForDelete.product.name_ro || currentScannedProductForDelete.sku;
    currentScannedProductForDelete = null;
    
    renderDeleteProductList();
    showToast(`Setat ${quantity} x ${productName} pentru ștergere`);
    goToDeleteStep(1); // Mergi înapoi la ecranul de scanare
}


// MODIFICARE: Afișează cantitatea
function renderDeleteProductList() {
    const listContainer = document.getElementById('delete-product-list');
    const continueBtn = document.getElementById('delete-to-location-btn');
    
    if (deleteProductList.length === 0) {
        listContainer.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark text-center p-4">Niciun produs scanat.</p>`;
        continueBtn.classList.add('hidden');
    } else {
        listContainer.innerHTML = deleteProductList.map((item, index) => {
            return `
                <div class="product-list-item">
                    <div class="flex-1 truncate pr-2">
                        <p class="text-text-light dark:text-text-dark font-semibold truncate">
                            <span class="text-red-600 font-bold">${item.quantity} x</span> 
                            ${item.product.name_ro || item.sku}
                        </p>
                        <p class="text-xs text-subtext-light dark:text-subtext-dark font-mono">${item.sku}</p>
                    </div>
                    <button onclick="removeProductFromDeleteList(${index})" class="w-10 h-10 flex-shrink-0 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 rounded-full flex items-center justify-center">
                        <span class="material-icons-outlined">delete</span>
                    </button>
                </div>
            `;
        }).join('');
        continueBtn.classList.remove('hidden');
    }
}

function removeProductFromDeleteList(index) {
    const removed = deleteProductList.splice(index, 1);
    showToast(`Șters: ${removed[0].product.name_ro || removed[0].sku}`);
    renderDeleteProductList();
}


function handleDeleteLocationScan(locationKey) {
    deleteLocation = locationKey;
    goToDeleteStep(3);
}

// MODIFICARE: Afișează cantitatea
function renderDeleteConfirmPage() {
    let productHtml = deleteProductList.map(item => {
        return `<li><span class="font-bold text-red-600">${item.quantity} x</span> ${item.product.name_ro || item.sku}</li>`
    }).join('');

    document.getElementById('delete-confirm-product').innerHTML = `<ul class="list-disc list-inside">${productHtml}</ul>`;
    document.getElementById('delete-confirm-location').innerHTML = formatLocation(deleteLocation, true);
}

// MODIFICARE: Logica de ștergere
async function saveDeleteProduct() {
    if (deleteProductList.length === 0 || !deleteLocation) {
        showToast("Date invalide. Încearcă din nou.", true);
        return;
    }

    showLoading(true);
    const inventory = loadFromLocalStorage('inventoryLocations');
    
    const deletionPromises = [];
    let totalItemsDeleted = 0;
    let skusAffected = 0;

    for (const item of deleteProductList) {
        const sku = item.sku;
        const quantityToRequestDeletion = item.quantity;
        
        // Verifică dacă SKU-ul există și are locația specificată
        if (inventory[sku] && inventory[sku][deleteLocation]) {
            skusAffected++;
            const currentQuantityOnLocation = inventory[sku][deleteLocation];
            
            let actualQuantityToDelete;
            
            if (quantityToRequestDeletion >= currentQuantityOnLocation) {
                // Utilizatorul vrea să șteargă mai mult sau exact cât există. Ștergem locația.
                actualQuantityToDelete = currentQuantityOnLocation;
                delete inventory[sku][deleteLocation];
                if (Object.keys(inventory[sku]).length === 0) {
                    delete inventory[sku]; // Șterge și SKU-ul dacă nu mai are locații
                }
            } else {
                // Utilizatorul vrea să șteargă mai puțin. Facem scăderea.
                actualQuantityToDelete = quantityToRequestDeletion;
                inventory[sku][deleteLocation] = currentQuantityOnLocation - actualQuantityToDelete;
            }
            
            totalItemsDeleted += actualQuantityToDelete;
            
            // Trimitem la webhook cantitatea reală ștearsă
            deletionPromises.push(
                sendStorageUpdate(sku, deleteLocation, "scadere", actualQuantityToDelete)
            );
        }
        // Dacă inventory[sku][deleteLocation] nu există, nu facem nimic, SKU-ul e ignorat.
    }
    
    if (skusAffected === 0) {
        showToast("Niciunul dintre produsele selectate nu a fost găsit în locația scanată.", true);
        showLoading(false);
        return;
    }
    
    saveToLocalStorage('inventoryLocations', inventory);
    await Promise.all(deletionPromises);
    
    showLoading(false);
    showToast(`Șterse ${totalItemsDeleted} buc. din ${deleteLocation}`);
    resetDeleteFlow(true); 
}

function handleCancelDeleteFlow() {
    // Verifică dacă suntem la Pasul 1 (lista de produse)
    const step1Active = !document.getElementById('delete-step-1-products').classList.contains('hidden');
    
    if (step1Active) {
        // Dacă suntem la pasul 1, ieșim de tot (comportamentul vechi)
        resetDeleteFlow(true);
    } else {
        // Dacă suntem la pasul 1b, 2, or 3, ne întoarcem la pasul 1 (lista de produse)
        // și resetăm produsul scanat curent (dacă există)
        currentScannedProductForDelete = null;
        goToDeleteStep(1);
    }
}

async function quickDeleteProductBySku(sku) {
    // 1. Verifică dacă suntem în pasul de confirmare (Step 3) - dacă da, ignoră
    if (!document.getElementById('delete-step-3-confirm').classList.contains('hidden')) {
        return;
    }

    const product = await getProductDetails(sku);
    
    const existingItem = deleteProductList.find(item => item.sku === sku);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        deleteProductList.push({
            sku: sku,
            product: product,
            quantity: 1
        });
    }
    
    renderDeleteProductList();
    showToast(`Selectat pt ștergere: ${product.name_ro || sku}`);

    // Revenim la lista principală dacă eram în alt pas intermediar
    if (document.getElementById('delete-step-1-products').classList.contains('hidden')) {
        goToDeleteStep(1);
    }
}

// Expun funcțiile necesare global
window.resetDeleteFlow = resetDeleteFlow;
window.goToDeleteStep = goToDeleteStep;
window.handleDeleteProductScan = handleDeleteProductScan;
window.confirmDeleteQuantity = confirmDeleteQuantity; // MODIFICARE
window.removeProductFromDeleteList = removeProductFromDeleteList;
window.handleDeleteLocationScan = handleDeleteLocationScan;
window.saveDeleteProduct = saveDeleteProduct;
window.handleCancelDeleteFlow = handleCancelDeleteFlow;
window.quickDeleteProductBySku = quickDeleteProductBySku;
