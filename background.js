// Background Service Worker
let creating; // A global promise to avoid concurrency issues

async function setupOffscreenDocument(path) {
    if (!chrome.offscreen) {
        console.error('Offscreen API not available');
        return;
    }

    // Check if it already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        // If it exists but we are here, something might be stale. 
        // During extension reload, contexts should be gone, but let's be safe.
        return;
    }

    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['BLOBS', 'DOM_PARSER'], // Added DOM_PARSER just in case
            justification: 'OCR processing for Bloomberg Muter',
        });

        try {
            await creating;
        } catch (error) {
            if (!error.message.startsWith('Only a single offscreen')) {
                console.error('Failed to create offscreen document:', error);
            }
        } finally {
            creating = null;
        }
    }
}

chrome.runtime.onInstalled.addListener(() => {
    setupOffscreenDocument('offscreen.html').catch(e => console.error('onInstalled setup failed:', e));
});

chrome.runtime.onStartup.addListener(() => {
    setupOffscreenDocument('offscreen.html').catch(e => console.error('onStartup setup failed:', e));
});

// Also check when a message comes in, just in case
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ENSURE_OFFSCREEN') {
        setupOffscreenDocument('offscreen.html')
            .then(() => sendResponse(true))
            .catch(e => {
                console.error('ENSURE_OFFSCREEN failed:', e);
                sendResponse(false);
            });
        return true;
    }
});
