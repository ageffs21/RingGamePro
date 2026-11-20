// =========================================================
// PLATFORM - QR JOINING
// =========================================================

// ---------------------------------------------------------
// QR Scanner State
// ---------------------------------------------------------

let qrScannerStream = null;
let qrScannerActive = false;

/**
 * Open the Platform QR scanner and request the rear camera.
 */
async function openQrScanner() {

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        showToast(
            'Camera access is not available on this device.',
            'warning'
        );

        return;
    }


    if (!('BarcodeDetector' in window)) {

        showToast(
            'QR scanning is not supported by this browser yet.',
            'warning'
        );

        return;
    }


    openModal(`
        <div class="p-5 sm:p-6">

            <div class="text-xs font-bold uppercase tracking-wider text-blue-400">
                Join Online
            </div>

            <h2 class="text-xl font-extrabold text-white mt-1">
                Scan QR Code
            </h2>

            <p class="text-sm text-slate-400 mt-2">
                Point the camera at a Pool Platform join QR code.
            </p>


            <div class="mt-4 overflow-hidden rounded-2xl bg-black border border-slatefelt-700">

                <video
                    id="qr-scanner-video"
                    autoplay
                    muted
                    playsinline
                    class="w-full aspect-square object-cover"
                ></video>

            </div>


            <div
                id="qr-scanner-status"
                class="text-center text-sm text-slate-400 mt-3"
            >
                Starting camera...
            </div>


            <button
                type="button"
                onclick="closeQrScanner()"
                class="w-full mt-4 py-3 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-200 font-bold text-sm"
            >
                Cancel
            </button>

        </div>
    `);


    const video =
        document.getElementById(
            'qr-scanner-video'
        );


    const status =
        document.getElementById(
            'qr-scanner-status'
        );


    if (!video) {
        closeModal();
        return;
    }


    try {

        qrScannerStream =
            await navigator.mediaDevices
                .getUserMedia({
                    video: {
                        facingMode: {
                            ideal: 'environment'
                        }
                    },
                    audio: false
                });


        video.srcObject =
            qrScannerStream;


        await video.play();


        qrScannerActive =
            true;


        if (status) {
            status.textContent =
                'Looking for QR code...';
        }


        await scanQrVideo(
            video
        );

    } catch (error) {

        console.error(
            'Could not start QR scanner:',
            error
        );


        if (status) {

            status.textContent =
                'Camera could not be started.';

        }


        showToast(
            'Camera permission is required to scan a QR code.',
            'warning'
        );
    }
}

/**
 * Continuously inspect the camera feed for a QR code.
 */
async function scanQrVideo(
    video
) {

    const detector =
        new BarcodeDetector({
            formats: [
                'qr_code'
            ]
        });


    while (qrScannerActive) {

        try {

            const barcodes =
                await detector.detect(
                    video
                );


            if (barcodes.length > 0) {

                const rawValue =
                    barcodes[0].rawValue;


                await handleScannedJoinQr(
                    rawValue
                );


                return;
            }

        } catch (error) {

            console.warn(
                'QR scan frame failed:',
                error
            );
        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    150
                )
        );
    }
}

/**
 * Handle a QR value produced by the scanner.
 */
async function handleScannedJoinQr(
    rawValue
) {

    let joinCode = null;


    try {

        const url =
            new URL(
                rawValue
            );


        joinCode =
            url.searchParams.get(
                'join'
            );

    } catch {

        /*
         * Allow a raw six-character join code too.
         */
        joinCode =
            rawValue;
    }


    joinCode =
        String(joinCode || '')
            .trim()
            .toUpperCase();


    if (joinCode.length !== 6) {

        showToast(
            'That QR code is not a valid Pool Platform join code.',
            'warning'
        );

        return;
    }


    closeQrScanner();


    await joinOnlineGameByCode(
        joinCode
    );


    if (
        state.config.isOnline &&
        state.config.onlineGameId
    ) {

        platformView =
            'ring-game';

        render();
    }
}


/**
 * Stop the QR scanner and release the camera.
 */
function stopQrScannerCamera() {

    qrScannerActive =
        false;


    if (qrScannerStream) {

        qrScannerStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });


        qrScannerStream =
            null;
    }
}


/**
 * Close the QR scanner.
 */
function closeQrScanner() {

    stopQrScannerCamera();

    closeModal();
}


/**
 * Stop the QR scanner and release the camera.
 */
function stopQrScannerCamera() {

    qrScannerActive =
        false;


    if (qrScannerStream) {

        qrScannerStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });


        qrScannerStream =
            null;
    }
}


/**
 * Close the QR scanner.
 */
function closeQrScanner() {

    stopQrScannerCamera();

    closeModal();
}

// ---------------------------------------------------------
// QR Join State
// ---------------------------------------------------------

let pendingJoinCode = null;

/**
 * Capture a join code from the current application URL.
 */
function captureJoinCodeFromUrl() {

    const joinCode =
        getJoinCodeFromUrl();


    if (!joinCode) {
        return null;
    }


    pendingJoinCode =
        joinCode;


    clearJoinCodeFromUrl();


    return joinCode;
}

/**
 * Process a join code captured from a QR/deep link.
 *
 * If authentication has not been restored yet, the code
 * remains pending until sign-in completes.
 */
async function processPendingJoinCode() {

    if (!pendingJoinCode) {
        return false;
    }


    /*
     * Joining currently requires an authenticated profile.
     * Preserve the code until authentication is available.
     */
    if (
        !currentUser ||
        !currentProfile
    ) {

        platformView =
            'home';

        render();


        showToast(
            'Sign in to join this session.',
            'info'
        );


        openAccountModal();

        return false;
    }


    const joinCode =
        pendingJoinCode;


    /*
     * Clear before joining so repeated renders/auth events
     * do not submit the same code more than once.
     */
    pendingJoinCode =
        null;


    await joinOnlineGameByCode(
        joinCode
    );


    if (
        state.config.isOnline &&
        state.config.onlineGameId
    ) {

        platformView =
            'ring-game';

        render();

        return true;
    }


    return false;
}


// ---------------------------------------------------------
// Join URL
// ---------------------------------------------------------

/**
 * Build a URL that returns to the Platform with a join code.
 */
function buildJoinUrl(joinCode) {

    const code =
        String(joinCode || '')
            .trim()
            .toUpperCase();


    if (!code) {
        return '';
    }


    const url =
        new URL(
            window.location.origin +
            window.location.pathname
        );


    url.searchParams.set(
        'join',
        code
    );


    return url.toString();
}

// ---------------------------------------------------------
// QR Rendering
// ---------------------------------------------------------

/**
 * Render a join URL as a QR code inside the supplied element.
 */
function renderJoinQrCode(
    elementId,
    joinCode
) {

    const container =
        document.getElementById(
            elementId
        );


    if (!container) {
        return;
    }


    const joinUrl =
        buildJoinUrl(
            joinCode
        );


    if (!joinUrl) {
        return;
    }


    /*
     * Remove any QR code previously rendered
     * into this container.
     */
    container.innerHTML = '';


    new QRCode(
        container,
        {
            text:
                joinUrl,

            width:
                180,

            height:
                180,

            colorDark:
                '#000000',

            colorLight:
                '#ffffff',

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );
}

/**
 * Show a scannable QR code for a Platform join code.
 */
function openJoinQrModal(
    joinCode
) {

    const code =
        String(joinCode || '')
            .trim()
            .toUpperCase();


    if (!code) {

        showToast(
            'No join code is available.',
            'warning'
        );

        return;
    }


    openModal(`
        <div class="p-5 sm:p-6 text-center">

            <div class="text-xs font-bold uppercase tracking-wider text-blue-400">
                Join Online
            </div>

            <h2 class="text-xl font-extrabold text-white mt-1">
                Scan to Join
            </h2>

            <p class="text-sm text-slate-400 mt-2">
                Scan this QR code with another phone.
            </p>


            <div class="flex justify-center mt-5">

                <div
                    id="join-qr-code"
                    class="bg-white p-3 rounded-xl"
                ></div>

            </div>


            <div class="mt-4 text-xs uppercase tracking-wider text-slate-500 font-bold">
                Join Code
            </div>

            <div class="font-mono text-2xl font-extrabold tracking-[0.2em] text-white mt-1">
                ${escapeHTML(code)}
            </div>


            <button
                type="button"
                onclick="copyJoinCode('${escapeJavaScriptString(code)}')"
                class="w-full mt-5 py-3 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-200 font-bold text-sm"
            >
                Copy Join Code
            </button>


            <button
                type="button"
                onclick="closeModal()"
                class="w-full mt-2 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-sm"
            >
                Done
            </button>

        </div>
    `);


    /*
     * The modal HTML must exist before QRCode can render
     * into its container.
     */
    renderJoinQrCode(
        'join-qr-code',
        code
    );
}


// ---------------------------------------------------------
// Join URL Handling
// ---------------------------------------------------------

/**
 * Read a join code from the current application URL.
 */
function getJoinCodeFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const code =
        params.get('join');


    if (!code) {
        return null;
    }


    const cleanCode =
        code
            .trim()
            .toUpperCase();


    if (cleanCode.length !== 6) {
        return null;
    }


    return cleanCode;
}


/**
 * Remove the join code from the browser URL after
 * the application has processed it.
 */
function clearJoinCodeFromUrl() {

    const url =
        new URL(
            window.location.href
        );


    url.searchParams.delete(
        'join'
    );


    window.history.replaceState(
        {},
        '',
        url.toString()
    );
}

/**
 * Display a scannable QR code for an online session.
 */
function openJoinQrModal(
    joinCode
) {

    const code =
        String(joinCode || '')
            .trim()
            .toUpperCase();


    if (!code) {

        showToast(
            'No join code is available.',
            'warning'
        );

        return;
    }


    openModal(`
        <div class="p-5 sm:p-6 text-center">

            <div class="text-xs font-bold uppercase tracking-wider text-blue-400">
                Join Online
            </div>

            <h2 class="text-xl font-extrabold text-white mt-1">
                Scan to Join
            </h2>

            <p class="text-sm text-slate-400 mt-2">
                Scan this QR code with another phone.
            </p>


            <div class="flex justify-center mt-5">

                <div
                    id="join-qr-code"
                    class="bg-white p-3 rounded-xl"
                ></div>

            </div>


            <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mt-4">
                Join Code
            </div>

            <div class="font-mono text-2xl font-extrabold tracking-[0.2em] text-white mt-1">
                ${escapeHTML(code)}
            </div>


            <button
                type="button"
                onclick="copyJoinCode('${escapeJavaScriptString(code)}')"
                class="w-full mt-5 py-3 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-200 font-bold text-sm"
            >
                Copy Join Code
            </button>


            <button
                type="button"
                onclick="closeModal()"
                class="w-full mt-2 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-sm"
            >
                Done
            </button>

        </div>
    `);


    renderJoinQrCode(
        'join-qr-code',
        code
    );
}