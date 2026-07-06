// scripts/printer.js

// 1. Setare Worker pentru PDF.js (obligatoriu pentru randare)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ============================================================================
// LOGICA DE PROCESARE IMAGINE ȘI CONVERSIE ZPL
// ============================================================================

const autoCropCanvas = (sourceCanvas) => {
    const ctx = sourceCanvas.getContext('2d');
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const pixels = ctx.getImageData(0, 0, w, h).data;

    let top = 0, bottom = h - 1, left = 0, right = w - 1;

    const isDark = (idx) => {
        const lum = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        return pixels[idx + 3] > 50 && lum < 240;
    };

    topSearch: for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) { if (isDark((y * w + x) * 4)) { top = y; break topSearch; } }
    }
    bottomSearch: for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) { if (isDark((y * w + x) * 4)) { bottom = y; break bottomSearch; } }
    }
    leftSearch: for (let x = 0; x < w; x++) {
        for (let y = top; y <= bottom; y++) { if (isDark((y * w + x) * 4)) { left = x; break leftSearch; } }
    }
    rightSearch: for (let x = w - 1; x >= 0; x--) {
        for (let y = top; y <= bottom; y++) { if (isDark((y * w + x) * 4)) { right = x; break rightSearch; } }
    }

    if (bottom < top || right < left) return sourceCanvas;

    const padding = 15;
    top = Math.max(0, top - padding);
    bottom = Math.min(h - 1, bottom + padding);
    left = Math.max(0, left - padding);
    right = Math.min(w - 1, right + padding);

    const cropW = right - left;
    const cropH = bottom - top;

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;

    const cropCtx = croppedCanvas.getContext('2d');
    cropCtx.drawImage(sourceCanvas, left, top, cropW, cropH, 0, 0, cropW, cropH);

    return croppedCanvas;
};

const compressZPLHex = (hex) => {
    let compressed = '';
    let count = 1;

    for (let i = 1; i <= hex.length; i++) {
        if (hex[i] === hex[i - 1] && count < 419) {
            count++;
        } else {
            if (count > 2) {
                let zCount = Math.floor(count / 400);
                let remainder = count % 400;
                let tens = Math.floor(remainder / 20);
                let ones = remainder % 20;

                for (let z = 0; z < zCount; z++) compressed += 'z';
                if (tens > 0) compressed += String.fromCharCode(103 + tens - 1);
                if (ones > 0) compressed += String.fromCharCode(71 + ones - 1);

                compressed += hex[i - 1];
            } else {
                for (let t = 0; t < count; t++) compressed += hex[i - 1];
            }
            count = 1;
        }
    }
    return compressed;
};

const convertCanvasToZPL = (canvas) => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const bpr = Math.ceil(w / 8);
    let hex = '';

    for (let y = 0; y < h; y++) {
        for (let col = 0; col < bpr; col++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const px = col * 8 + bit;
                if (px < w) {
                    const i = (y * w + px) * 4;
                    const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                    if (pixels[i + 3] > 50 && lum < 180) byte |= (1 << (7 - bit));
                }
            }
            hex += byte.toString(16).padStart(2, '0').toUpperCase();
        }
    }

    const totalBytes = bpr * h;
    const compressedHex = compressZPLHex(hex);

    console.log(`[ZPL Compress] Dimensiune Brută: ${hex.length} -> Comprimată la: ${compressedHex.length}`);
    return `^XA\r\n^PW${w}\r\n^LL${h}\r\n^LH0,0\r\n^FO0,0^GFA,${totalBytes},${totalBytes},${bpr},${compressedHex}^FS\r\n^XZ\r\n`;
};

// Transformă Buffer-ul de PDF în String ZPL
window.renderPdfToZpl = async (buffer) => {
    console.log('[Printer] Randare PDF și decupare margini albe...');
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);

    const vpNative = page.getViewport({ scale: 2.0 });
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = Math.round(vpNative.width);
    sourceCanvas.height = Math.round(vpNative.height);
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.fillStyle = 'white';
    sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    await page.render({ canvasContext: sourceCtx, viewport: vpNative }).promise;

    const croppedCanvas = autoCropCanvas(sourceCanvas);

    // PLASARE PE ETICHETA 102x148mm la 203dpi (816x1183 dots)
    const LABEL_W = 816;
    const LABEL_H = 1183;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = LABEL_W;
    finalCanvas.height = LABEL_H;
    const ctx = finalCanvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, LABEL_W, LABEL_H);

    const scaleW = LABEL_W / croppedCanvas.width;
    const scaleH = LABEL_H / croppedCanvas.height;
    const finalScale = Math.min(scaleW, scaleH);

    const drawW = croppedCanvas.width * finalScale;
    const drawH = croppedCanvas.height * finalScale;

    const dx = (LABEL_W - drawW) / 2;
    const dy = (LABEL_H - drawH) / 2;
    ctx.drawImage(croppedCanvas, dx, dy, drawW, drawH);

    console.log(`[Printer] Randare completată. Se convertește la ZPL...`);
    return convertCanvasToZPL(finalCanvas);
};

// ============================================================================
// FUNCȚII EXPUSE PENTRU FLUXUL APLICAȚIEI (Awb Download & Print Bridge)
// ============================================================================

// Această funcție descarcă PDF-ul ocolind CORS dacă rulează în APK (Capacitor)
// CapacitorHttp (activat global în capacitor.config.json) interceptează automat
// toate request-urile fetch/XHR și le rulează prin HTTP nativ Android (bypass CORS).
window.downloadAndConvertAwb = async (url) => {
    let arrayBuffer;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        console.log('[Printer] Descarcare PDF via CapacitorHttp nativ (Bypass CORS)...');
        // Pe platforma nativă, CapacitorHttp este activat global și interceptează fetch().
        // Folosim totuși plugin-ul direct pentru a controla responseType explicit.
        try {
            const { CapacitorHttp } = window.Capacitor.Plugins;
            const response = await CapacitorHttp.get({
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'Accept': 'application/pdf,application/octet-stream,*/*'
                }
            });

            // CapacitorHttp returnează data ca string base64 când responseType='arraybuffer'
            const data = response.data;
            if (typeof data === 'string') {
                // Răspuns base64 – decodăm
                const binaryString = window.atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                arrayBuffer = bytes.buffer;
            } else {
                // Răspuns deja ArrayBuffer (unele versiuni de plugin)
                arrayBuffer = data;
            }
        } catch (e) {
            console.warn('[Printer] CapacitorHttp direct a eșuat, fallback fetch:', e);
            const response = await fetch(url);
            arrayBuffer = await response.arrayBuffer();
        }
    } else {
        console.log('[Printer] Descarcare PDF via Fetch standard (browser – poate da eroare CORS)...');
        const response = await fetch(url);
        arrayBuffer = await response.arrayBuffer();
    }

    return await window.renderPdfToZpl(arrayBuffer);
};

// ============================================================================
// NATIVE PRINTER – Bridge ZPL → Bluetooth SPP (Zebra ZQ521)
// Deleghează la window.BluetoothPrinter din bluetooth.js
// ============================================================================

window.NativePrinter = {
    /**
     * Trimite un string ZPL la imprimanta Zebra prin Bluetooth Classic SPP.
     * Dacă nu există conexiune activă, încearcă auto-reconectarea cu MAC-ul salvat.
     * @param {string} zplString
     */
    print: async function (zplString) {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            console.log('[NativePrinter] Pregătire trimitere ZPL prin Bluetooth nativ...');

            if (!window.BluetoothPrinter) {
                throw new Error('Modulul BluetoothPrinter nu este inițializat. Verifică că bluetooth.js este încărcat.');
            }

            // Verifică dacă există conexiune activă
            const connected = await window.BluetoothPrinter.isConnected();
            if (!connected) {
                const savedMac = localStorage.getItem('bt_printer_mac');
                if (!savedMac) {
                    throw new Error('Nicio imprimantă Bluetooth configurată. Deschide Setările și conectează-te la Zebra ZQ521.');
                }
                console.log('[NativePrinter] Reconectare automată la', savedMac, '...');
                await window.BluetoothPrinter.connect(savedMac);
            }

            localStorage.setItem('last_printed_zpl', zplString);
            await window.BluetoothPrinter.printZpl(zplString);
            console.log('[NativePrinter] ✓ ZPL trimis cu succes la imprimantă.');
        } else {
            // Mod browser – simulăm printarea în consolă
            localStorage.setItem('last_printed_zpl', zplString);
            console.log('[NativePrinter] Mod browser – simulare printare ZPL:');
            console.log(zplString.substring(0, 150) + '... [trunchiat]');
            if (window.showToast) showToast('Browser: ZPL generat. Pe Android se va printa via Bluetooth.');
        }
    }
};
