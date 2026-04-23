function handlePanicKey(event) {
    const panicKey = localStorage.getItem('panicKey') || '`';
    const panicUrl = localStorage.getItem('panicUrl') || 'https://www.google.com';

    if (event.key === panicKey) {
        event.preventDefault();
        window.location.href = panicUrl;
    }
}
function safeGet(id) {
    return document.getElementById(id) || null;
}
function displayCurrentPanicKey() {
    const el = safeGet('currentPanicKey');
    if (!el) return;

    const panicKey = localStorage.getItem('panicKey') || '`';
    el.textContent = `your key: '${panicKey}'`;
}
function changePanicKey() {
    const instruction = safeGet('instruction');
    if (!instruction) return; 

    instruction.textContent = 'click any key to change:';
    function captureKeyPress(event) {
        const newPanicKey = event.key;
        localStorage.setItem('panicKey', newPanicKey);
        alert(`panic key set to: '${newPanicKey}'`);
        window.removeEventListener('keydown', captureKeyPress);
        instruction.textContent = '(updated successfully)';
        displayCurrentPanicKey();
    }
    window.addEventListener('keydown', captureKeyPress);
}

function displayCurrentPanicUrl() {
    const urlText = safeGet('currentPanicUrl');
    const urlInput = safeGet('panicUrlInput');

    if (!urlText || !urlInput) return;

    const panicUrl = localStorage.getItem('panicUrl') || 'https://www.google.com';

    urlText.textContent = `your url: ${panicUrl}`;
    urlInput.value = panicUrl;
}
function savePanicUrl() {
    const urlInput = safeGet('panicUrlInput');
    if (!urlInput) return;

    let newUrl = urlInput.value.trim();
    if (!newUrl) {
        alert('enter a valid link');
        return;
    }
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
        newUrl = 'https://' + newUrl;
    }
    localStorage.setItem('panicUrl', newUrl);
    alert(`url saved: ${newUrl}`);
    displayCurrentPanicUrl();
}
window.addEventListener('keydown', handlePanicKey);
window.onload = function () {
    displayCurrentPanicKey();
    displayCurrentPanicUrl();
};
