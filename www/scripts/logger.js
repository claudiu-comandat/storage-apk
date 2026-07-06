// scripts/logger.js
// Jurnal local (localStorage) al request-urilor AWB / Factură, păstrat 2 ore.

const LOGS_KEY = 'appRequestLogs';
const LOG_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 ore

const LOG_TYPE_LABELS = {
    awb: { label: 'AWB', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    invoice: { label: 'Factură', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

function maskAuthHeader(headers) {
    if (!headers || !headers.Authorization) return headers;
    const v = headers.Authorization;
    return { ...headers, Authorization: v.length > 14 ? `${v.slice(0, 10)}...${v.slice(-4)}` : '***' };
}

function pruneOldLogs(logs) {
    const cutoff = Date.now() - LOG_MAX_AGE_MS;
    return logs.filter(l => l.ts >= cutoff);
}

function getLogs() {
    const logs = loadFromLocalStorage(LOGS_KEY, []);
    const pruned = pruneOldLogs(logs);
    if (pruned.length !== logs.length) saveToLocalStorage(LOGS_KEY, pruned);
    return pruned;
}

// entry: { type: 'awb'|'invoice', success, request: {method,url,headers,body}, response: {status,body}, error, message }
function addLog(entry) {
    const logs = pruneOldLogs(loadFromLocalStorage(LOGS_KEY, []));
    logs.push({
        ts: Date.now(),
        type: entry.type,
        success: entry.success !== false,
        message: entry.message || null,
        request: entry.request ? { ...entry.request, headers: maskAuthHeader(entry.request.headers) } : null,
        response: entry.response || null,
        error: entry.error || null,
    });
    saveToLocalStorage(LOGS_KEY, logs);
    renderLogsPanel();
}

function formatLogTime(ts) {
    return new Date(ts).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bodyToText(body) {
    if (body === undefined || body === null || body === '') return null;
    return typeof body === 'string' ? body : JSON.stringify(body);
}

function renderLogsPanel() {
    const container = document.getElementById('logs-panel-list');
    const countEl = document.getElementById('logs-panel-count');
    if (!container) return; // Modalul de setări nu e randat momentan

    const logs = getLogs().sort((a, b) => b.ts - a.ts);
    if (countEl) countEl.textContent = `${logs.length} în ultimele 2 ore`;

    if (logs.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">Niciun request AWB/Factură în ultimele 2 ore.</p>`;
        return;
    }

    container.innerHTML = logs.map((log, idx) => {
        const typeInfo = LOG_TYPE_LABELS[log.type] || { label: log.type, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
        const statusColor = log.success ? 'text-green-400' : 'text-red-400';
        const statusText = log.success ? '✓ OK' : '✗ EROARE';
        const detailsId = `log-details-${idx}`;

        const reqLines = [];
        if (log.request) {
            reqLines.push(`${log.request.method} ${log.request.url}`);
            if (log.request.headers) reqLines.push(`Headers: ${JSON.stringify(log.request.headers)}`);
            const reqBody = bodyToText(log.request.body);
            if (reqBody) reqLines.push(`Body: ${reqBody}`);
        }
        const resLines = [];
        if (log.response) {
            resLines.push(`Status: ${log.response.status}`);
            const resBody = bodyToText(log.response.body);
            if (resBody) resLines.push(`Body: ${resBody}`);
        }

        const detailText = [
            reqLines.length ? `REQUEST\n${reqLines.join('\n')}` : '',
            resLines.length ? `RESPONSE\n${resLines.join('\n')}` : '',
            log.error ? `EROARE\n${log.error}` : '',
        ].filter(Boolean).join('\n\n');

        return `
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg mb-2 overflow-hidden">
                <button type="button" onclick="toggleLogDetails('${detailsId}')" class="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-left">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${typeInfo.color} shrink-0">${typeInfo.label}</span>
                        <span class="text-xs font-mono text-gray-400 shrink-0">${formatLogTime(log.ts)}</span>
                        <span class="text-xs font-bold ${statusColor} truncate">${statusText}</span>
                    </div>
                    <span class="material-icons-outlined text-base text-gray-400 shrink-0">expand_more</span>
                </button>
                <div id="${detailsId}" class="hidden px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700">${escapeHtml(detailText)}</div>
            </div>
        `;
    }).join('');
}

function toggleLogDetails(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
}

window.addLog = addLog;
window.getLogs = getLogs;
window.renderLogsPanel = renderLogsPanel;
window.toggleLogDetails = toggleLogDetails;

// ponytail: fără framework de test în proiect; verificare minimă rulabilă manual din consolă (window.__testLogger()).
window.__testLogger = function () {
    localStorage.removeItem(LOGS_KEY);
    addLog({ type: 'awb', success: true, request: { method: 'POST', url: 'http://test', headers: { Authorization: 'Bearer abcdefghijklmnop' } }, response: { status: 200, body: 'ok' } });
    addLog({ type: 'invoice', success: false, request: { method: 'POST', url: 'http://test2' }, error: 'boom' });
    const stale = { ts: Date.now() - LOG_MAX_AGE_MS - 1000, type: 'awb', success: true };
    saveToLocalStorage(LOGS_KEY, [...loadFromLocalStorage(LOGS_KEY, []), stale]);

    const logs = getLogs();
    console.assert(logs.length === 2, 'vechi (>2h) trebuia eliminat la citire', logs);
    console.assert(logs.some(l => l.type === 'invoice' && !l.success), 'log-ul de eroare factură lipsește');
    console.assert(logs[0].request.headers.Authorization.indexOf('abcdefghijklmnop') === -1, 'token-ul nu a fost mascat');
    console.log('[logger self-test] OK', logs);
};
