
// debugTools.js
// ✅ Dev Console Tools for Reactive State Inspection

export function setupReactiveDebugConsole() {
    const panel = document.createElement('div');
    panel.style = 'position:fixed;bottom:0;right:0;max-height:300px;overflow:auto;background:#111;color:#0f0;padding:10px;font-family:monospace;z-index:9999;font-size:12px';
    panel.innerHTML = '<strong>Reactive State Debugger</strong><div id="reactive-state-viewer"></div>';
    document.body.appendChild(panel);

    const updateViewer = () => {
        const state = window.reactiveComponentInstance?.state || {};
        const out = Object.entries(state).map(([k, v]) => `<div><code>${k}</code>: ${JSON.stringify(v)}</div>`).join('');
        document.getElementById('reactive-state-viewer').innerHTML = out;
    };

    setInterval(updateViewer, 1000);
    window.__refreshReactiveDebug__ = updateViewer;
}
