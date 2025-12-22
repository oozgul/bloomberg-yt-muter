// Bloomberg Muter - Final Corrected Version
console.log('Bloomberg Muter: Content Script Loading...');

let isMutedByExt = false;
let lastMatchTime = 0;
let missCount = 0;
let scanTimer = null;
let enforcerTimer = null;
let manualOverride = false;
let overrideTimer = null;

const DEFAULT_SETTINGS = {
    keywords: 'MOMENTARILY',
    scanTime: 4
};

let CONFIG = { ...DEFAULT_SETTINGS };

// Initialize Storage
chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
    if (chrome.runtime?.id) {
        CONFIG.keywords = items.keywords.split(',').map(k => k.trim().toUpperCase());
        CONFIG.scanTime = parseInt(items.scanTime);
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && chrome.runtime?.id) {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            CONFIG.keywords = items.keywords.split(',').map(k => k.trim().toUpperCase());
            CONFIG.scanTime = parseInt(items.scanTime);
        });
    }
});

function createToast() {
    if (document.getElementById('muter-toast')) return;
    const t = document.createElement('div');
    t.id = 'muter-toast';
    t.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: #000000;
        color: #ff8000;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        font-size: 18px;
        border: 2px solid #ff8000;
        border-radius: 4px;
        z-index: 100000;
        opacity: 0;
        transition: opacity 0.3s;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 0 15px rgba(255, 128, 0, 0.4);
        text-transform: uppercase;
    `;
    t.onclick = handleManualUnmute;
    document.body.appendChild(t);
}

function handleManualUnmute() {
    console.log('!!! Muter: Manual Unmute Triggered.');
    isMutedByExt = false;
    manualOverride = true;
    const v = document.querySelector('video');
    if (v) v.muted = false;
    stopEnforcer();
    updateToast('⚠️ MANUAL UNMUTE ACTIVE (1m)', true);
    if (overrideTimer) clearTimeout(overrideTimer);
    overrideTimer = setTimeout(() => {
        manualOverride = false;
        updateToast('', false);
    }, 60000);
}

function updateToast(msg, show) {
    const t = document.getElementById('muter-toast');
    if (t) {
        t.innerText = msg;
        t.style.opacity = show ? '1' : '0';
    }
}

function startEnforcer() {
    if (enforcerTimer) return;
    enforcerTimer = setInterval(() => {
        const v = document.querySelector('video');
        if (isMutedByExt && v && !v.muted && !manualOverride) {
            v.muted = true;
        }
    }, 100);
}

function stopEnforcer() {
    if (enforcerTimer) {
        clearInterval(enforcerTimer);
        enforcerTimer = null;
    }
}

async function doScan() {
    // 1. Check if extension is still connected
    if (!chrome.runtime?.id) {
        console.warn('Bloomberg Muter: Context lost. Stopping.');
        if (scanTimer) clearInterval(scanTimer);
        return;
    }

    if (manualOverride) return;

    const v = document.querySelector('video');
    if (!v || v.paused) return;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    try {
        ctx.drawImage(v, 0, 0, 640, 360);
        const img = ctx.getImageData(0, 0, 640, 360);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] + d[i + 1] + d[i + 2]) / 3;
            d[i] = d[i + 1] = d[i + 2] = gray > 145 ? 255 : 0;
        }
        ctx.putImageData(img, 0, 0);

        // 2. Wrap messaging in a guard to catch "Context Invalidated"
        const p = chrome.runtime.sendMessage({
            action: 'OCR_FRAME',
            imageData: canvas.toDataURL('image/jpeg', 0.8)
        });

        // Handle the response if it's a promise (MV3)
        if (p && p.then) {
            p.then(res => {
                handleOcrResponse(res, v);
            }).catch(err => {
                if (err.message.includes('context invalidated')) {
                    clearInterval(scanTimer);
                }
            });
        }
    } catch (e) {
        // This catches the synchronous error if sendMessage is called when context is gone
        if (e.message.includes('context invalidated')) {
            clearInterval(scanTimer);
        }
    }
}

function handleOcrResponse(res, v) {
    if (!chrome.runtime?.id) return;

    const raw = (res && res.text) ? res.text.toUpperCase() : '';
    const found = CONFIG.keywords.find(word => raw.includes(word.trim().toUpperCase()));

    if (found && !manualOverride) {
        missCount = 0;
        lastMatchTime = Date.now();
        if (!isMutedByExt) {
            isMutedByExt = true;
            v.muted = true;
            startEnforcer();
        }
        updateToast(`MUTED: BREAK DETECTED`, true);
    } else if (isMutedByExt && !manualOverride) {
        missCount++;
        const sinceMatch = (Date.now() - lastMatchTime) / 1000;
        const readyToUnmute = sinceMatch > CONFIG.scanTime || missCount >= 3;
        if (readyToUnmute) {
            isMutedByExt = false;
            v.muted = false;
            stopEnforcer();
            updateToast('', false);
        }
    }
}

createToast();
scanTimer = setInterval(doScan, 2000);
console.log('Bloomberg Muter Ready.');
