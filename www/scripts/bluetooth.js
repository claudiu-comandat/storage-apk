// scripts/bluetooth.js
// Modul pentru Bluetooth Classic SPP – comunicare cu imprimanta Zebra ZQ521
// Folosește cordova-plugin-bluetooth-serial via window.bluetoothSerial (injectat de Capacitor/Cordova)

const BT_MAC_KEY = 'bt_printer_mac';
const BT_STATE_KEY = 'bt_printer_connected';

// ============================================================================
// STARE INTERNĂ
// ============================================================================

let _isConnected = false;
let _currentMac = null;

// Referință la plugin-ul Bluetooth Serial (injectat nativ de Cordova/Capacitor)
const getBtPlugin = () => {
    if (window.bluetoothSerial) return window.bluetoothSerial;
    return null;
};

// ============================================================================
// API PUBLIC – expus pe window.BluetoothPrinter
// ============================================================================

window.BluetoothPrinter = {

    /**
     * Cere permisiunile BLUETOOTH_CONNECT și BLUETOOTH_SCAN pe Android 12+.
     * Folosește @capacitor-community/bluetooth-le pentru a declanșa dialogul nativ.
     * @returns {Promise<void>}
     */
    requestPermissions: async function () {
        if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
            return;
        }

        const { BluetoothLe } = window.Capacitor.Plugins;
        if (!BluetoothLe) {
            console.warn('[BT] Capacitor BluetoothLe plugin nu este disponibil pentru cererea de permisiuni.');
            return;
        }

        try {
            console.log('[BT] Se cer permisiunile Bluetooth folosind Capacitor BluetoothLe...');
            // Asta va cere automat BLUETOOTH_CONNECT și BLUETOOTH_SCAN pe Android 12+
            await BluetoothLe.initialize();

            // Pentru siguranță extra, apelăm metoda explicită (dacă e expusă)
            if (BluetoothLe.requestPermissions) {
                await BluetoothLe.requestPermissions();
            }

            console.log('[BT] Permisiuni Bluetooth acordate!');
        } catch (e) {
            console.warn('[BT] Atentionare la cererea permisiunilor LE:', e);
            // Nu dam throw, pentru ca unele telefoane dau reject desi permisiunea exista.
            // Lasam functia list() din plugin-ul Serial sa incerce.
        }
    },

    /**
     * Returnează lista dispozitivelor Bluetooth Classic paired cu Android-ul.
     * @returns {Promise<Array<{name: string, address: string}>>}
     */
    listPairedDevices: async function () {
        // Cerem permisiunile înainte de orice acces Bluetooth
        await window.BluetoothPrinter.requestPermissions();
        return new Promise((resolve, reject) => {
            const bt = getBtPlugin();
            if (!bt) {
                console.warn('[BT] Plugin bluetoothSerial nu este disponibil (browser mode).');
                // Simulare pentru browser – returnăm o listă demo
                resolve([
                    { name: 'Zebra ZQ521 (simulat)', address: 'AA:BB:CC:DD:EE:FF' }
                ]);
                return;
            }
            bt.list(
                (devices) => resolve(devices || []),
                (err) => reject(new Error('Eroare listare BT: ' + err))
            );
        });
    },

    /**
     * Conectare la un dispozitiv Bluetooth via adresa MAC.
     * Salvează MAC-ul în localStorage pentru auto-reconectare.
     * @param {string} macAddress
     * @returns {Promise<void>}
     */
    connect: function (macAddress) {
        return new Promise((resolve, reject) => {
            const bt = getBtPlugin();
            if (!bt) {
                console.warn('[BT] Mod simulare browser – "conectat" la', macAddress);
                _isConnected = true;
                _currentMac = macAddress;
                localStorage.setItem(BT_MAC_KEY, macAddress);
                window.BluetoothPrinter._updateStatusUI(true, macAddress);
                resolve();
                return;
            }

            // Dacă există deja o conexiune, o închidem mai întâi
            bt.disconnect(() => { }, () => { });

            console.log('[BT] Conectare la', macAddress, '...');
            bt.connect(
                macAddress,
                () => {
                    _isConnected = true;
                    _currentMac = macAddress;
                    localStorage.setItem(BT_MAC_KEY, macAddress);
                    console.log('[BT] Conectat la', macAddress);
                    window.BluetoothPrinter._updateStatusUI(true, macAddress);
                    resolve();
                },
                (err) => {
                    _isConnected = false;
                    console.error('[BT] Eroare conectare:', err);
                    window.BluetoothPrinter._updateStatusUI(false, null);
                    reject(new Error('Nu s-a putut conecta la ' + macAddress + ': ' + err));
                }
            );
        });
    },

    /**
     * Deconectare de la dispozitivul curent.
     * @returns {Promise<void>}
     */
    disconnect: function () {
        return new Promise((resolve) => {
            const bt = getBtPlugin();
            _isConnected = false;
            window.BluetoothPrinter._updateStatusUI(false, _currentMac);
            if (!bt) { resolve(); return; }
            bt.disconnect(
                () => { console.log('[BT] Deconectat.'); resolve(); },
                () => { resolve(); } // ignorăm eroarea la disconnect
            );
        });
    },

    /**
     * Trimite un string ZPL la imprimantă prin Bluetooth SPP.
     * @param {string} zplString – Codul ZPL generat de renderPdfToZpl
     * @returns {Promise<void>}
     */
    printZpl: function (zplString) {
        return new Promise((resolve, reject) => {
            const bt = getBtPlugin();
            if (!bt) {
                console.log('[BT] Mod simulare browser – ZPL primit:', zplString.substring(0, 80) + '...');
                resolve();
                return;
            }
            if (!_isConnected) {
                reject(new Error('Imprimanta nu este conectată prin Bluetooth.'));
                return;
            }
            console.log('[BT] Trimitere ZPL (' + zplString.length + ' chars) la imprimantă...');
            bt.write(
                zplString,
                () => {
                    console.log('[BT] ZPL trimis cu succes.');
                    resolve();
                },
                (err) => {
                    console.error('[BT] Eroare scriere BT:', err);
                    _isConnected = false;
                    window.BluetoothPrinter._updateStatusUI(false, _currentMac);
                    reject(new Error('Eroare trimitere date: ' + err));
                }
            );
        });
    },

    /**
     * Verifică dacă suntem conectați la imprimantă.
     * @returns {Promise<boolean>}
     */
    isConnected: function () {
        return new Promise((resolve) => {
            const bt = getBtPlugin();
            if (!bt) { resolve(_isConnected); return; }
            bt.isConnected(
                () => { _isConnected = true; resolve(true); },
                () => { _isConnected = false; resolve(false); }
            );
        });
    },

    /**
     * Încearcă auto-reconectarea la MAC-ul salvat în localStorage.
     * Apelat automat la inițializarea aplicației.
     */
    autoConnect: async function () {
        const savedMac = localStorage.getItem(BT_MAC_KEY);
        if (!savedMac) {
            console.log('[BT] Niciun MAC salvat, se sare auto-conectarea.');
            return;
        }
        console.log('[BT] Auto-conectare la MAC salvat:', savedMac);
        try {
            await window.BluetoothPrinter.connect(savedMac);
            if (window.showToast) showToast('Imprimantă Bluetooth reconectată ✓');
        } catch (e) {
            console.warn('[BT] Auto-conectare eșuată:', e.message);
            // Nu afișăm eroare – poate nu e Bluetooth-ul pornit
        }
    },

    /**
     * Actualizează UI-ul de status din settings modal.
     * @private
     */
    _updateStatusUI: function (connected, mac) {
        const dot = document.getElementById('bt-status-dot');
        const text = document.getElementById('bt-status-text');
        const macDisplay = document.getElementById('bt-saved-mac');

        if (dot) {
            dot.className = connected
                ? 'w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
                : 'w-3 h-3 rounded-full bg-red-500';
        }
        if (text) {
            text.textContent = connected ? 'Conectat' : 'Deconectat';
            text.className = connected
                ? 'text-sm font-semibold text-green-400'
                : 'text-sm font-semibold text-red-400';
        }
        if (macDisplay) {
            const saved = localStorage.getItem(BT_MAC_KEY);
            macDisplay.textContent = saved ? saved : 'Niciun dispozitiv salvat';
        }
    },

    /**
     * Golește MAC-ul salvat și deconectează.
     */
    forget: async function () {
        localStorage.removeItem(BT_MAC_KEY);
        await window.BluetoothPrinter.disconnect();
        _currentMac = null;
        window.BluetoothPrinter._updateStatusUI(false, null);
        if (window.showToast) showToast('Imprimantă uitată.');
    }
};

// ============================================================================
// UI HELPERS – pentru panoul de setări Bluetooth
// ============================================================================

window.openBluetoothSettings = async function () {
    const panel = document.getElementById('bt-devices-panel');
    const list = document.getElementById('bt-devices-list');
    if (!panel || !list) return;

    list.innerHTML = '<p class="text-gray-400 text-sm text-center py-4 animate-pulse">Se caută dispozitive...</p>';
    panel.classList.remove('hidden');

    try {
        const devices = await window.BluetoothPrinter.listPairedDevices();
        if (devices.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Niciun dispozitiv paired găsit.<br>Imperechează imprimanta din Setările Android.</p>';
            return;
        }

        list.innerHTML = devices.map(d => `
            <div class="flex items-center justify-between bg-gray-800/60 rounded-xl p-3 border border-gray-700">
                <div>
                    <p class="text-sm font-semibold text-white">${escapeHtml(d.name || 'Dispozitiv necunoscut')}</p>
                    <p class="text-xs text-gray-400 font-mono">${escapeHtml(d.address)}</p>
                </div>
                <button
                    onclick="connectToBtDevice('${escapeHtml(d.address)}', this)"
                    class="text-xs font-bold bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary-dark transition-colors"
                >
                    Conectează
                </button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-red-400 text-sm text-center py-4">Eroare: ${escapeHtml(e.message)}</p>`;
    }
};

window.connectToBtDevice = async function (mac, btn) {
    if (btn) {
        btn.textContent = 'Se conectează...';
        btn.disabled = true;
    }
    try {
        await window.BluetoothPrinter.connect(mac);
        if (btn) {
            btn.textContent = '✓ Conectat';
            btn.className = 'text-xs font-bold bg-green-600 text-white px-3 py-2 rounded-lg';
        }
        if (window.showToast) showToast('Conectat la imprimantă ✓');
    } catch (e) {
        if (btn) {
            btn.textContent = 'Reîncearcă';
            btn.disabled = false;
        }
        if (window.showToast) showToast('Eroare conectare: ' + e.message, true);
    }
};

// Helper pentru a escapa HTML în template strings
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================================
// AUTO-INIT – rulează când documentul e gata
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Actualizăm UI-ul cu starea inițială
    const savedMac = localStorage.getItem(BT_MAC_KEY);
    window.BluetoothPrinter._updateStatusUI(false, savedMac);
});

// Pe device Android (Capacitor), așteptăm evenimentul native 'deviceready'
document.addEventListener('deviceready', () => {
    console.log('[BT] Capacitor device ready – inițiere auto-conectare...');
    window.BluetoothPrinter.autoConnect();
}, false);
