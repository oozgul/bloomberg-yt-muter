// Offscreen OCR Agent
let worker = null;

async function init() {
    console.log('Offscreen: Init v4 (PSM Optimization)');
    try {
        const rootPath = chrome.runtime.getURL('/');

        worker = await Tesseract.createWorker('eng', 1, {
            workerPath: rootPath + 'worker.min.js',
            corePath: rootPath + 'tesseract-core.wasm.js',
            langPath: rootPath,
            cacheMethod: 'none',
            gzip: true,
            workerBlobURL: false,
            parameters: {
                // PSM 11: Sparse text. Find as much text as possible in no particular order.
                // This is great for scattered strings like "PROGRAM WILL RESUME"
                tessedit_pageseg_mode: '11',
                // Restrict character set to avoid misinterpreting letters as noise/symbols
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
            },
            logger: m => {
                if (m.status === 'recognizing' && m.progress === 1) {
                    // console.log('[Tesseract] Done');
                }
            }
        });
        console.log('Offscreen: Worker Ready (Optimized)');
    } catch (e) {
        console.error('Offscreen: Init Failed', e);
    }
}

init();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'OCR_FRAME') {
        handleOCR(msg.imageData, sendResponse);
        return true;
    }
});

async function handleOCR(imageData, sendResponse) {
    if (!worker) {
        await init();
        if (!worker) {
            sendResponse({ error: 'Worker not ready' });
            return;
        }
    }

    try {
        const { data: { text } } = await worker.recognize(imageData);
        // Basic normalization, but content.js will do the heavy fuzzy matching
        const normalized = text.trim().toUpperCase();
        sendResponse({ text: normalized });
    } catch (e) {
        console.error('Offscreen: Recog Error', e);
        sendResponse({ error: e.message });
    }
}
