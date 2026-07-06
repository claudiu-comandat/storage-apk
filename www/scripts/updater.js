// scripts/updater.js
// Auto-update APK: verifică GitHub Releases, oferă buton de instalare a versiunii noi.
// Android nu permite instalare complet silențioasă (fără MDM) - utilizatorul confirmă instalarea o dată.

const UPDATE_REPO = 'claudiu-comandat/storage-apk';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min - evită limita de rate GitHub API
const LAST_CHECK_KEY = 'lastUpdateCheckAt';

async function checkForAppUpdate(force = false) {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return; // relevant doar pe device

    const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    if (!force && Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

    try {
        const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
        if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
        const release = await res.json();

        const remoteVersion = parseInt(String(release.tag_name || '').replace(/\D/g, ''), 10);
        const localVersion = window.APP_VERSION_CODE || 0;
        if (!remoteVersion || remoteVersion <= localVersion) return;

        const apkAsset = (release.assets || []).find(a => a.name.endsWith('.apk'));
        if (!apkAsset) return;

        showUpdateBanner(remoteVersion, apkAsset.browser_download_url);
    } catch (e) {
        console.warn('[Updater] Verificare update eșuată:', e);
    }
}

function showUpdateBanner(version, apkUrl) {
    const banner = document.getElementById('update-banner');
    if (!banner) return;
    document.getElementById('update-banner-text').textContent = `Actualizare disponibilă (v${version})`;
    banner.dataset.apkUrl = apkUrl;
    banner.classList.remove('hidden');
}

function base64FromArrayBuffer(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
}

async function installPendingUpdate() {
    const banner = document.getElementById('update-banner');
    const apkUrl = banner && banner.dataset.apkUrl;
    if (!apkUrl) return;

    const btn = document.getElementById('update-banner-btn');
    const originalLabel = btn.textContent;
    btn.textContent = 'Se descarcă...';
    btn.disabled = true;

    try {
        const res = await fetch(apkUrl);
        if (!res.ok) throw new Error(`Descărcare eșuată: ${res.status}`);
        const buffer = await res.arrayBuffer();
        const base64 = base64FromArrayBuffer(buffer);

        const { Filesystem, FileOpener } = window.Capacitor.Plugins;
        const written = await Filesystem.writeFile({
            path: 'update.apk',
            data: base64,
            directory: 'CACHE',
        });

        btn.textContent = 'Se instalează...';
        await FileOpener.open({
            filePath: written.uri,
            contentType: 'application/vnd.android.package-archive',
        });

        banner.classList.add('hidden');
    } catch (e) {
        console.error('[Updater] Eroare instalare update:', e);
        showToast('Eroare la actualizare: ' + e.message, true);
        btn.textContent = originalLabel;
        btn.disabled = false;
    }
}

window.checkForAppUpdate = checkForAppUpdate;
window.installPendingUpdate = installPendingUpdate;
