
// spaRouter.js
// ✅ Client-Side Routing (SPA Transitions)

export function setupClientSideRouting() {
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-spa]');
        if (link && link.href) {
            e.preventDefault();
            const url = new URL(link.href);
            const path = url.pathname;

            history.pushState({ path }, '', path);

            if (window.sendPatch) {
                window.sendPatch('navigate', [path]);
            } else {
                console.warn("SPA navigate failed: sendPatch not available");
            }
        }
    });

    window.addEventListener('popstate', (event) => {
        const path = event.state?.path || window.location.pathname;
        if (window.sendPatch) {
            window.sendPatch('navigate', [path]);
        }
    });
}
