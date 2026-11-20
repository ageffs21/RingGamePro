// =========================================================
// PLATFORM - QR JOINING
// =========================================================

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