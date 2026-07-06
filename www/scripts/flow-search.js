// --- Logică "Găsește Produs" (Integrată pe Dashboard) ---

function toggleSearchFocus(isFocused) {
    const form = document.getElementById('search-form');
    const results = document.getElementById('find-results');
    const scanButton = document.getElementById('scan-find-button');
    const input = document.getElementById('search-input');
    
    const addProductCard = document.querySelector('a[href="#"][onclick="showPage(\'page-add-product\')"]');
    const moveProductCard = document.querySelector('a[href="#"][onclick="showPage(\'page-delete-product\')"]');

    if (isFocused) {
        // form.classList.add('focused'); // ELIMINAT
        results.classList.remove('hidden');
        scanButton.style.maxHeight = '0';
        scanButton.style.paddingTop = '0';
        scanButton.style.paddingBottom = '0';
        scanButton.style.opacity = '0';
        scanButton.style.visibility = 'hidden';
        addProductCard.style.display = 'none';
        moveProductCard.style.display = 'none';
    } else {
        if (input.value.length > 0) return; 

        // form.classList.remove('focused'); // ELIMINAT
        results.classList.add('hidden');
        results.innerHTML = '';
        scanButton.style.maxHeight = '100px';
        scanButton.style.paddingTop = '1.25rem'; 
        scanButton.style.paddingBottom = '1.25rem';
        scanButton.style.opacity = '1';
        scanButton.style.visibility = 'visible';
        addProductCard.style.display = 'block';
        moveProductCard.style.display = 'block';
        input.value = '';
    }
}

function handleFindScan(sku) {
    document.getElementById('search-input').value = sku;
    toggleSearchFocus(true);
    searchProducts();
}

async function searchProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const resultsContainer = document.getElementById('find-results');
    resultsContainer.innerHTML = '';
    toggleSearchFocus(true);
    
    if (searchTerm.length < 1) {
        resultsContainer.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark text-center p-4">Începe să tastezi pentru a căuta...</p>`;
        return;
    }

    const inventory = loadFromLocalStorage('inventoryLocations');
    let productDB = loadFromLocalStorage('productDatabase');
    let foundItems = [];
    
    const skusInInventory = Object.keys(inventory);
    const skusToFetch = skusInInventory.filter(sku => !productDB[sku]);

    if (skusToFetch.length > 0) {
        const productMap = await fetchProductDetailsBatch(skusToFetch); // Acum e rapidă și locală
        productDB = { ...productDB, ...productMap };
    }

    for (const sku of skusInInventory) {
        let match = false;
        const product = productDB[sku]; // Va fi placeholder-ul
        
        if (sku.toLowerCase().includes(searchTerm)) match = true;
        // Verificăm și name_ro/name_en, care acum sunt tot SKU-ul
        if (product.name_ro && product.name_ro.toLowerCase().includes(searchTerm)) match = true;
        if (product.name_en && product.name_en.toLowerCase().includes(searchTerm)) match = true;
        
        if (match) {
            foundItems.push({
                sku: sku,
                product: product,
                locations: inventory[sku]
            });
        }
    }
    
    renderSearchResults(foundItems);
}

function renderSearchResults(items) {
    const resultsContainer = document.getElementById('find-results');
    if (items.length === 0) {
        resultsContainer.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark text-center p-4">Niciun produs găsit.</p>`;
        return;
    }
    resultsContainer.innerHTML = items.map(item => {
        const locationsHtml = Object.keys(item.locations).map(locKey => `
            <li class="flex justify-between items-center text-sm">
                <span>${formatLocation(locKey)}</span>
                <span class="font-bold text-primary text-base">Cant: ${item.locations[locKey]}</span>
            </li>
        `).join('');
        return `
            <div class="bg-card-light dark:bg-card-dark rounded-2xl p-5 shadow-lg animate-slide-in">
                <h3 class="text-lg font-bold text-text-light dark:text-text-dark font-mono">${item.sku}</h3>
                
                <h4 class="text-sm font-semibold text-subtext-light dark:text-subtext-dark mb-2 border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">Locații:</h4>
                <ul class="space-y-2 text-text-light dark:text-text-dark">${locationsHtml}</ul>
            </div>
        `;
    }).join('');
}

// ExpuN funcțiile necesare global
window.toggleSearchFocus = toggleSearchFocus;
window.handleFindScan = handleFindScan;
window.searchProducts = searchProducts;
