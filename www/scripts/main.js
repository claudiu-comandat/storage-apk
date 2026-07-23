// scripts/main.js

// --- Inițializare ---
document.addEventListener("DOMContentLoaded", () => {
    // Încarcă stocul și apoi preia comenzile (funcții din api.js)
    loadInitialStorage();
    showPage('page-dashboard');

    // Listener pentru a închide căutarea dacă se dă click în afara ei
    document.getElementById('app-container').addEventListener('click', (e) => {
        const searchForm = document.getElementById('search-form');
        const resultsContainer = document.getElementById('find-results');

        // Verifică dacă click-ul a fost în afara zonei de search
        if (searchForm && !searchForm.contains(e.target) &&
            resultsContainer && !resultsContainer.contains(e.target)) {
            toggleSearchFocus(false);
        }
    });

    // Event Listeners pentru Căutare
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', searchProducts);
        searchInput.addEventListener('focus', () => toggleSearchFocus(true));
    }

    // Setează starea inițială a footer-ului
    setupPickingPageFooter(false);

    // Verifică dacă există o versiune nouă de APK publicată pe GitHub
    window.checkForAppUpdate();
});

// --- Logică Settings / Test Print ---

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
        window.renderLogsPanel();
        const versionEl = document.getElementById('settings-app-version');
        if (versionEl) versionEl.textContent = window.APP_VERSION_CODE || '?';
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function testPrint() {
    const testUrl = "https://easysales1.fra1.digitaloceanspaces.com/trendyol/shipments/11888/4497757301.pdf";
    showToast("Descărcare și printare test...", false);
    try {
        const zplString = await window.downloadAndConvertAwb(testUrl);
        await window.NativePrinter.print(zplString);
        showToast("✓ Print test trimis cu succes!", false);
    } catch (e) {
        console.error("Eroare Test Print:", e);
        showToast("Eroare la printare: " + (e.message || "Unknown error"), true);
    }
}

// Expunem funcțiile global
async function reprintLastAwb() {
    const lastZpl = localStorage.getItem('last_printed_zpl');
    if (!lastZpl) {
        showToast("Nu există AWB salvat în memorie pentru retipărire.", true);
        return;
    }

    try {
        showToast("Se trimite ultimul AWB la imprimantă...", false);
        await window.NativePrinter.print(lastZpl);
        showToast("✓ Retipărire trimisă cu succes!", false);
    } catch (e) {
        console.error("Eroare Retipărire:", e);
        showToast("Eroare la printare: " + (e.message || "Unknown error"), true);
    }
}

// Expunem funcțiile global
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.testPrint = testPrint;
window.reprintLastAwb = reprintLastAwb;

async function calibratePrinter() {
    if (!confirm('Atenție: imprimanta va avansa 2-3 etichete pentru a-și calibra senzorul. Continui?')) return;
    showToast('Calibrare în curs...', false);
    try {
        // ^MNY = Media Tracking Gap/Notch | ~JC = Auto-Calibrate senzor
        // ^JUS = Salvare permanentă în NVRAM (supraviețuiește repornirii)
        const calibCmd = '^XA^MNY^JUS^XZ\r\n^XA~JC^XZ';
        await window.NativePrinter.print(calibCmd);
        showToast('✅ Calibrare completă trimisă! Așteaptă finalizarea.', false);
    } catch (e) {
        console.error('Eroare calibrare:', e);
        showToast('Eroare calibrare: ' + (e.message || 'Unknown error'), true);
    }
}

window.calibratePrinter = calibratePrinter;
