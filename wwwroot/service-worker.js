const CACHE_NAME = 'ringgame-pro-v5.5';

const APP_FILES = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];


/*
 * Install
 * Cache the files required to run RingGame Pro offline.
 */
self.addEventListener('install', event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
    );

    // Don't leave the updated worker waiting behind the old version.
    self.skipWaiting();
});


/*
 * Activate
 * Delete caches belonging to previous RingGame Pro versions.
 */
self.addEventListener('activate', event => {

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});


/*
 * Fetch strategy
 *
 * HTML/navigation:
 *   Network first so app updates are picked up when online.
 *
 * Other assets:
 *   Cache first because icons/static files rarely change.
 */
self.addEventListener('fetch', event => {

    const request = event.request;

    /*
     * Only handle GET requests.
     */
    if (request.method !== 'GET') {
        return;
    }


    const requestUrl =
        new URL(request.url);


    /*
     * CRITICAL:
     *
     * Only cache files that belong to RingGame Pro.
     *
     * Supabase, Google authentication, APIs, and all
     * other external requests must bypass the service
     * worker and go directly to the network.
     */
    if (requestUrl.origin !== self.location.origin) {
        return;
    }


    /*
     * Page navigation:
     *
     * Network first so the installed app gets the latest
     * RingGame Pro HTML whenever internet is available.
     *
     * Fall back to the cached app when offline.
     */
    if (request.mode === 'navigate') {

        event.respondWith(

            fetch(request)

                .then(response => {

                    const copy =
                        response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {

                            cache.put(
                                request,
                                copy
                            );

                        });

                    return response;
                })

                .catch(() => {

                    return caches.match(request)
                        .then(cached =>
                            cached ||
                            caches.match('./index.html')
                        );

                })

        );

        return;
    }


    /*
     * RingGame Pro static assets:
     *
     * Cache-first for icons and other same-origin files.
     */
    event.respondWith(

        caches.match(request)

            .then(cached => {

                if (cached) {
                    return cached;
                }


                return fetch(request)

                    .then(response => {

                        if (
                            !response ||
                            response.status !== 200
                        ) {
                            return response;
                        }


                        const copy =
                            response.clone();


                        caches.open(CACHE_NAME)
                            .then(cache => {

                                cache.put(
                                    request,
                                    copy
                                );

                            });


                        return response;
                    });

            })

    );

});