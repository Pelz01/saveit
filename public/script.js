const $ = (id) => document.getElementById(id);
const form = $('searchForm');
const input = $('urlInput');
const btn = $('searchBtn');
const clearBtn = $('clearBtn');

// Clear Button Logic
const toggleClear = () => {
    if (input.value.length > 0) {
        clearBtn.classList.add('is-visible');
    } else {
        clearBtn.classList.remove('is-visible');
    }
};

input.addEventListener('input', toggleClear);

clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
    toggleClear();
});

// State management
// State management
let loadingInterval;
const loadingMessages = [
    'RESOLVING HOST...',
    'HANDSHAKE...',
    'EXTRACTING_METADATA...',
    'PARSING_MANIFEST...',
    'BUFFERING...'
];

const startLoadingSequence = () => {
    const textEl = $('loadingText');
    let i = 0;
    textEl.textContent = loadingMessages[0];

    loadingInterval = setInterval(() => {
        i = (i + 1) % loadingMessages.length;
        textEl.textContent = loadingMessages[i];
    }, 800); // Change text every 800ms
};

const setState = (state) => {
    ['loading', 'error', 'result'].forEach(id => $(id).classList.remove('is-visible'));
    if (state) $(state).classList.add('is-visible');

    btn.disabled = state === 'loading';
    btn.textContent = state === 'loading' ? 'PROCESSING' : 'Get';

    // Handle Loading Sequence
    if (state === 'loading') {
        startLoadingSequence();
    } else {
        clearInterval(loadingInterval);
    }
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    setState('loading');

    try {
        // Step 1: Get Info
        const res = await fetch('/api/grabh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const info = data.data;

        // Populate UI
        $('thumb').src = info.thumbnail;
        $('title').textContent = info.title.replace(/[^\w\s]/gi, ''); // Clean title
        $('duration').textContent = info.duration_string;
        $('source').textContent = info.extractor.toUpperCase();

        // Setup Download Button
        const safeTitle = info.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const dlUrl = `/api/download?url=${encodeURIComponent(url)}&title=${safeTitle}`;

        const dlBtn = $('downloadBtn');
        dlBtn.href = dlUrl;
        dlBtn.setAttribute('download', `${safeTitle}.mp4`); // Handle Direct Download Click to avoid navigation

        dlBtn.onclick = (e) => {
            // Optional: You could allow default behavior or handle blob download here
            // implementing a simple direct download for now
        };

        setState('result');
    } catch (err) {
        $('errorMsg').textContent = err.message || 'Failed to fetch video.';
        setState('error');
    }
});

// Copy Link functionality
$('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(input.value);
    const original = $('copyBtn').textContent;
    $('copyBtn').textContent = 'Copied!';
    setTimeout(() => $('copyBtn').textContent = original, 2000);
});
