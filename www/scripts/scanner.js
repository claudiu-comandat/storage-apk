// --- Logică Scaner QR (cu nimiq/qr-scanner) ---
// Folosim din nou biblioteca originală
import QrScanner from './qr-scanner.min.js';

/**
 * Funcție adaptor pentru a trimite rezultatul scanării
 * în formatul așteptat de funcția ta existentă onScanSuccess.
 */
function onScanSuccessAdapter(result) {
    // result este un obiect: { data: "...", cornerPoints: [...] }
    onScanSuccess(result.data, result);
}

/**
 * Funcție adaptor pentru erori.
 */
function onScanError(error) {
    // Ignorăm "No QR code found" complet (fără consolă, fără toast)
    if (error === QrScanner.NO_QR_CODE_FOUND) {
        return;
    }
    
    // Pentru alte erori, le afișăm doar în consolă, FĂRĂ toast (pop-up)
    console.error("Eroare QrScanner (non-fatal):", error);
    // showToast(`Eroare scanare: ${error}`, true); // <- Am comentat această linie
}

/**
 * Aplică zoom-ul curent pe track-ul video activ
 */
async function applyZoom() {
    try {
        if (qrScanner && qrScanner.$video && qrScanner.$video.srcObject) {
            const track = qrScanner.$video.srcObject.getVideoTracks()[0];
            const capabilities = track.getCapabilities();

            if ('zoom' in capabilities) {
                const targetZoom = 2; // Zoom 2x
                const maxZoom = capabilities.zoom.max;
                const minZoom = capabilities.zoom.min || 1;
                
                const zoomValue = Math.max(minZoom, Math.min(targetZoom, maxZoom));
                
                await track.applyConstraints({ advanced: [{ zoom: zoomValue }] });
                console.log(`Zoom aplicat: ${zoomValue} (Max: ${maxZoom}, Min: ${minZoom})`);
            } else {
                console.log("Camera nu suportă zoom (capabilities.zoom).");
            }
        }
    } catch (zoomErr) {
        console.warn("Eroare la aplicarea zoom-ului:", zoomErr);
    }
}

async function startScanner(mode) {
    currentScanMode = mode;
    document.getElementById('scanner-modal').classList.add('active');
    
    const videoElem = document.getElementById('qr-video');
    if (!videoElem) {
        console.error("Elementul <video id='qr-video'> nu a fost găsit.");
        stopScanner();
        return;
    }

    // --- MODIFICARE: Selectare cameră "Ultra" ---
    let preferredCamId = null;
    const targetLabelUltra = "ultra";
    const targetLabelSuper = "superangurlar";

    try {
        const cameras = await QrScanner.listCameras(true);
        
        // --- Logare în consolă (păstrată pentru debug) ---
        console.log("--- Camere Disponibile ---");
        cameras.forEach((cam, index) => {
            console.log(`[${index}]: ${cam.label} (ID: ${cam.id})`);
        });
        console.log("---------------------------");

        if (cameras.length > 0) {
            // 1. Căutăm "ultra"
            let targetCamera = cameras.find(cam => 
                cam.label.toLowerCase().includes(targetLabelUltra)
            );

            if (targetCamera) {
                // Am găsit "ultra"
                preferredCamId = targetCamera.id;
                console.log(`Găsit camera "ultra". Se folosește: ${targetCamera.label}`);
            } else {
                // 2. Căutăm "superangurlar"
                targetCamera = cameras.find(cam => 
                    cam.label.toLowerCase().includes(targetLabelSuper)
                );
                if (targetCamera) {
                    preferredCamId = targetCamera.id;
                    console.log(`Găsit camera "superangurlar". Se folosește: ${targetCamera.label}`);
                } else {
                    // 3. Fallback: Căutăm ultima cameră de SPATE
                    const rearCameras = cameras.filter(cam => 
                        /rear|back|environment/i.test(cam.label) && 
                        !/front|user/i.test(cam.label)
                    );
                    
                    if (rearCameras.length > 0) {
                        // Folosim ultima cameră de spate (adesea telephoto sau ultrawide)
                        targetCamera = rearCameras[rearCameras.length - 1];
                        preferredCamId = targetCamera.id;
                        console.log(`Nicio cameră "ultra" sau "superangurlar" găsită. Fallback la ultima cameră spate: ${targetCamera.label}`);
                    } else {
                        // 4. Fallback final
                        preferredCamId = 'environment';
                        console.log("Nicio cameră specifică găsită. Se folosește default 'environment'.");
                    }
                }
            }
        } else {
            preferredCamId = 'environment';
            console.warn("Nicio cameră nu a fost găsită. Se folosește 'environment'.");
        }
        
    } catch (e) {
        console.error("Eroare la listarea camerelor, se folosește 'environment'.", e);
        preferredCamId = 'environment'; // Fallback
    }
    // --- SFÂRȘIT MODIFICARE ---


    // Inițializează scannerul
    qrScanner = new QrScanner(
        videoElem,
        onScanSuccessAdapter,
        {
            onDecodeError: onScanError,
            // highlightScanRegion: true, // Comentat pentru scanare full-screen
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
            preferredCamera: preferredCamId
        }
    );

    qrScanner.setInversionMode('both');

    try {
        await qrScanner.start();
        await applyZoom(); // Aplică zoom la pornire
    } catch (err) {
        console.error("Eroare la pornirea QrScanner (nimiq):", err);
        showToast("Eroare la pornirea camerei. Verifică permisiunile.", true);
        stopScanner();
    }
}

function stopScanner() {
    if (qrScanner) {
        qrScanner.destroy();
        qrScanner = null;
    }
    document.getElementById('scanner-modal').classList.remove('active');
}

/**
 * Funcția originală onScanSuccess (MODIFICATĂ)
 */
function onScanSuccess(decodedText, decodedResult) {
    stopScanner();
    
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    // START MODIFICARE
    if (currentScanMode === 'product') {
        handleProductScan(decodedText);
    } else if (currentScanMode === 'location') {
        handleLocationScan(decodedText);
    } else if (currentScanMode === 'find') {
        handleFindScan(decodedText);
    } else if (currentScanMode === 'delete_product') {
        handleDeleteProductScan(decodedText);
    } else if (currentScanMode === 'delete_location') {
        handleDeleteLocationScan(decodedText);
    } else if (currentScanMode === 'picking') {
        handlePickingScan(decodedText);
    } else if (currentScanMode === 'retur_awb') {
        handleReturAwbScan(decodedText);
    }
    // FINAL MODIFICARE
}

// Expun funcțiile necesare global
window.startScanner = startScanner;
window.stopScanner = stopScanner;
// Am șters 'window.switchCamera'
