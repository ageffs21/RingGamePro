/**
* PWA BOOTSTRAP: Inline App Icon (SVG + Canvas PNG), Dynamic Manifest, & Offline Service Worker
*/
(function initOfflinePWA() {
    // Disable service worker caching while developing locally.
    const isDevelopment =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';
    if (isDevelopment) {
        // Remove any previously registered service workers.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => {
                    registration.unregister();
                });
            });
        }
        // Let the normal app finish loading before showing the message.
        window.addEventListener('load', () => {
            setTimeout(() => {
                showToast('Development Mode', 'info');
            }, 500);
        });
        return;
    }
    // Published version
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('./service-worker.js')
                .then(() => {

                    setTimeout(() => {
                        showToast('Offline Ready', 'success');
                    }, 500);
                })
                .catch(error => {
                    console.error(
                        'Service worker registration failed:',
                        error
                    );
                    setTimeout(() => {
                        showToast(
                            'Offline mode unavailable',
                            'warning'
                        );
                    }, 500);
                });
        });
    }
})();