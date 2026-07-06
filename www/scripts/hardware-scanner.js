let scanBuffer = "";
let lastKeyTime = 0;

document.addEventListener("keydown", (e) => {
    const now = Date.now();
    scanBuffer = now - lastKeyTime > 300 ? "" : scanBuffer;
    lastKeyTime = now;

    if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (scanBuffer.length > 1) processHardwareScan(scanBuffer);
        scanBuffer = "";
        return;
    }

    if (!["Unidentified", "Shift", "Control"].includes(e.key)) scanBuffer += e.key;
});

const processHardwareScan = async (code) => {
    const cleanCode = code.trim().toUpperCase();
    const pageId = document.querySelector(".page.active")?.id;
    const isProduct = cleanCode.startsWith("B");
    const isLoc = /^\d+,/.test(cleanCode);

    const search = () => {
        const input = document.getElementById("search-input");
        if (input) input.value = cleanCode;
        window.searchProducts?.();
        window.toggleSearchFocus?.(true);
        if (pageId !== "page-dashboard") {
            window.showPage?.("page-dashboard");
            setTimeout(() => { 
                window.toggleSearchFocus?.(true); 
                window.searchProducts?.(); 
            }, 100);
        }
    };

    const handlers = {
        "page-picking": () => window.handlePickingScan?.(cleanCode),
        "page-add-product": () => isProduct ? window.quickAddProductBySku?.(cleanCode) : 
            (isLoc && window.scannedProductList?.length ? window.handleLocationScan?.(cleanCode) : window.showToast?.("Adaugă produse în listă înainte de a scana locația.", true)),
        "page-delete-product": () => isProduct ? window.quickDeleteProductBySku?.(cleanCode) : 
            (isLoc && window.deleteProductList?.length ? window.handleDeleteLocationScan?.(cleanCode) : window.showToast?.("Scanează produse înainte de a scana locația.", true))
    };

    handlers[pageId] ? await handlers[pageId]() : (isProduct && search());
};
