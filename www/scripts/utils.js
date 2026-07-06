// --- Navigare SPA ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const activePage = document.getElementById(pageId);
    if (activePage) {
        activePage.classList.add('active');
        document.getElementById('app-container').scrollTop = 0;
    }

    const bubble = document.getElementById('floating-order-bubble');
    const notifFooter = document.getElementById('notification-footer');
    
    if (pageId === 'page-dashboard') {
        setupDashboardNotification(); // Acum gestionează și footer-ul
    } else {
        bubble.classList.remove('visible');
        notifFooter.style.display = 'none'; // Ascunde footer-ul de notificare
    }

    // Resetează fluxurile la intrare
    if (pageId === 'page-add-product') {
        resetAddFlow(false);
    }
     // START MODIFICARE
     if (pageId === 'page-delete-product') {
        resetDeleteFlow(false);
    }
     // FINAL MODIFICARE
    if (pageId === 'page-picking') {
        startPickingProcess();
        setupPickingPageFooter(true); // Arată footer-ul de picking
    } else {
        setupPickingPageFooter(false); // Ascunde footer-ul de picking
    }
}

function setupPickingPageFooter(show) {
    const footer = document.getElementById('picking-footer');
    if (!footer) {
        return; // Elementul nu există pe pagina curentă, nu facem nimic.
    }

    if (show) {
        // Verifică dacă picking-ul e completat
        const pickingCompleteEl = document.getElementById('picking-complete');
        const complete = pickingCompleteEl && pickingCompleteEl.style.display !== 'none';
        footer.style.display = complete ? 'none' : 'block';
    } else {
        footer.style.display = 'none';
    }
}

// --- Logică LocalStorage ---
function loadFromLocalStorage(key, defaultValue = {}) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
}
function saveToLocalStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// --- Funcții Utilitare UI ---

/**
 * Formatează o cheie de locație (ex: "1,2,3" sau "1,2,3,4") într-un format lizibil.
 * @param {string} locationKey - Cheia locației (ex: "1,2,3" sau "1,2,3,4")
 * @param {boolean} large - Dacă să folosească formatul mare (pentru picking/confirmare)
 * @returns {string} HTML formatat
 */
function formatLocation(locationKey, large = false) {
    const parts = locationKey.split(',');
    
    if (large) {
        // --- Format MARE ---
        if (parts.length === 3) {
            // Format vechi (Rand, Deschidere, Poliță)
            return `
                <span class="block">Rand: <span class="text-4xl">${parts[0]}</span></span>
                <span class="block">Deschidere: <span class="text-4xl">${parts[1]}</span></span>
                <span class="block">Poliță: <span class="text-4xl">${parts[2]}</span></span>
            `;
        } else if (parts.length === 4) {
            // Format nou (cu Cutie)
            return `
                <span class="block">Rand: <span class="text-4xl">${parts[0]}</span></span>
                <span class="block">Deschidere: <span class="text-4xl">${parts[1]}</span></span>
                <span class="block">Poliță: <span class="text-4xl">${parts[2]}</span></span>
                <span class="block text-primary">Cutie: <span class="text-4xl">${parts[3]}</span></span>
            `;
        }
    } else {
        // --- Format MIC (pentru liste) ---
        if (parts.length === 3) {
            // Format vechi
            return `Rand: <span class="font-bold">${parts[0]}</span>, Deschidere: <span class="font-bold">${parts[1]}</span>, Poliță: <span class="font-bold">${parts[2]}</span>`;
        } else if (parts.length === 4) {
            // Format nou (cu Cutie) - am adăugat text-primary pentru a evidenția cutia
            return `Rand: <span class="font-bold">${parts[0]}</span>, Deschidere: <span class="font-bold">${parts[1]}</span>, Poliță: <span class="font-bold">${parts[2]}</span>, <span class="font-bold text-primary">Cutie: ${parts[3]}</span>`;
        }
    }
    
    // Fallback dacă formatul e necunoscut
    return locationKey;
}


function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#E53E3E' : '#007AFF';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading(isLoading) {
    document.getElementById('loading-overlay').style.display = isLoading ? 'flex' : 'none';
}

// ExpuN funcțiile necesare global
window.showPage = showPage;
window.setupPickingPageFooter = setupPickingPageFooter;
window.loadFromLocalStorage = loadFromLocalStorage;
window.saveToLocalStorage = saveToLocalStorage;
window.formatLocation = formatLocation;
window.showToast = showToast;
window.showLoading = showLoading;
