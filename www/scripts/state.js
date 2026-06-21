// --- Constante API ---
window.STORAGE_WEBHOOK_URL = "https://automatizare.comandat.ro/webhook/storage-update";
window.GET_STORAGE_WEBHOOK_URL = "https://automatizare.comandat.ro/webhook/get-storage";
window.GET_ORDERS_WEBHOOK_URL = "https://processes.comandat.ro/webhook/8ba5359d-8ecd-4576-b44c-934ac4b661e2";
window.REFRESH_TOKEN_WEBHOOK = "https://automatizare.comandat.ro/webhook/refresh-easysales-print-access";
window.PRINT_AWB_WEBHOOK = "https://automatizare.comandat.ro/webhook/print-awb-easysales";
window.GENERATE_AWB_WEBHOOK = "https://automatizare.comandat.ro/webhook/generate-awb-easysales";

// --- Starea Aplicației ---
window.qrScanner = null;
// MODIFICAT: Added 'picking' mode
window.currentScanMode = null; // 'product', 'location', 'find', 'delete_product', 'delete_location', 'picking'

// NOU: Stare pentru camere
window.availableCameras = [];
window.currentCameraIndex = 0;

// Stare "Adaugă Produs"
window.scannedProductList = [];
window.scannedLocation = null;
window.currentScannedProduct = null; 

// Stare "Șterge Produs"
window.deleteProductList = [];
window.deleteLocation = null;
window.currentScannedProductForDelete = null;

// Stare Dashboard
window.isOrderNotificationHidden = false;

// Stare Comenzi
window.liveOrders = []; 

// Stare Picking
window.pickingRoutes = [];
window.currentRouteIndex = 0;
window.currentStopIndex = 0;

// NOU: Stare pentru urmărirea progresului pe comenzi
// Folosit pentru a determina când o comandă este completă
window.globalPickedItems = new Map(); // Key: SKU, Value: Total Qty Picked in this session
window.processedOrderIds = new Set(); // IDs of orders already sent to print
