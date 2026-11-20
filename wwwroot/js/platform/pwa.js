// =========================================================
// PLATFORM - PWA & OFFLINE SUPPORT
// =========================================================

/**
 * Configure service-worker behavior for development
 * and published versions of the application.
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

        navigator.serviceWorker
            .getRegistrations()
            .then(registrations => {

                registrations.forEach(
                    registration => {
                        registration.unregister();
                    }
                );
            })
            .catch(error => {

                console.warn(
                    'Could not clear development service workers:',
                    error
                );
            });
    }
})();