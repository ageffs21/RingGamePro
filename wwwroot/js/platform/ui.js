// =========================================================
// PLATFORM - USER INTERFACE & NAVIGATION
// =========================================================


// ---------------------------------------------------------
// Platform View State
// ---------------------------------------------------------

let platformView = 'home';
// 'home' | 'profile' | 'ring-game'

let previousPlatformView = 'home';

// ---------------------------------------------------------
// Platform Navigation
// ---------------------------------------------------------

/**
 * Navigate to a Platform-level application view.
 */
function navigateToPlatformView(view) {

    const validViews = [
        'home',
        'profile',
        'ring-game'
    ];


    if (!validViews.includes(view)) {

        console.warn(
            'Unknown Platform view:',
            view
        );

        return;
    }


    platformView =
        view;


    render();
}


/**
 * Join an online session using the code entered
 * on the Platform Home screen.
 *
 * Ring Game is currently the only supported
 * joinable session type.
 */
async function submitPlatformJoinCode() {

    const input =
        document.getElementById(
            'platform-join-code'
        );


    if (!input) {
        return;
    }


    const joinCode =
        input.value
            .trim()
            .toUpperCase();


    if (!joinCode) {

        showToast(
            'Enter a join code.',
            'warning'
        );

        input.focus();

        return;
    }


    await joinOnlineGameByCode(
        joinCode
    );


    /*
     * A successful Ring Game join sets the
     * online-game identity in state.config.
     */
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
 * Open the Pool Platform home screen.
 */
function openHome() {

    navigateToPlatformView(
        'home'
    );
}


/**
 * Open the current user's profile screen.
 */
function openProfile() {

    /*
     * Remember where Profile was opened from so the user
     * can return to the same application context.
     */
    if (platformView !== 'profile') {

        previousPlatformView =
            platformView;
    }


    navigateToPlatformView(
        'profile'
    );
}


/**
 * Return from Profile to the Platform view that opened it.
 */
function returnFromProfile() {

    const returnView =
        previousPlatformView ||
        'home';


    navigateToPlatformView(
        returnView
    );
}


/**
 * Open the Ring Game feature.
 */
function openRingGame() {

    navigateToPlatformView(
        'ring-game'
    );
}


// ---------------------------------------------------------
// Home View
// ---------------------------------------------------------

/**
 * Render the Pool Platform home screen.
 */
function renderPlatformHome() {

    const displayName =
        currentProfile?.display_name ||
        'Player';


    return `
        <div class="space-y-5">

            <div>
                <div class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Pool Platform
                </div>

                <h2 class="text-2xl font-extrabold text-white mt-1">
                    Welcome, ${escapeHTML(displayName)}
                </h2>

                <p class="text-sm text-slate-400 mt-1">
                    Choose what you want to do.
                </p>
            </div>

            ${renderActiveGameCard()}

            <div class="grid gap-3 sm:grid-cols-2">

                <button
                    type="button"
                    onclick="openRingGame()"
                    class="text-left rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5 hover:border-emerald-500/60 transition"
                >
                    <div class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Game
                    </div>

                    <div class="text-xl font-extrabold text-white mt-1">
                        Ring Game
                    </div>

                    <div class="text-sm text-slate-400 mt-2">
                        Start a local game or create an online lobby.
                    </div>
                </button>


                <button
                    type="button"
                    disabled
                    class="text-left rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5 opacity-60 cursor-not-allowed"
                >
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Coming Soon
                    </div>

                    <div class="text-xl font-extrabold text-white mt-1">
                        Tournaments
                    </div>

                    <div class="text-sm text-slate-400 mt-2">
                        Tournament registration, brackets, and live matches.
                    </div>
                </button>

            </div>


            <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5">

                <div class="text-xs font-bold uppercase tracking-wider text-blue-400">
                    Join
                </div>

                <div class="text-lg font-extrabold text-white mt-1">
                    Join an Online Session
                </div>

                <p class="text-sm text-slate-400 mt-1">
                    Enter the 6-character join code.
                </p>


                <div class="flex gap-2 mt-4">

                    <input
                        id="platform-join-code"
                        type="text"
                        maxlength="6"
                        autocomplete="off"
                        autocapitalize="characters"
                        placeholder="ABC123"
                        class="flex-1 min-w-0 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-3 text-center font-mono font-bold tracking-[0.2em] text-white uppercase"
                    />

                    <button
                        type="button"
                        onclick="submitPlatformJoinCode()"
                        class="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-sm transition"
                    >
                        Join
                    </button>

                </div>


                <button
                    type="button"
                    onclick="openQrScanner()"
                    class="w-full mt-3 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-200 font-bold text-sm transition"
                >
                    Scan QR Code
                </button>

            </div>


            <button
                type="button"
                onclick="openProfile()"
                class="w-full rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-4 text-left hover:border-slatefelt-500 transition"
            >
                <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Account
                </div>

                <div class="font-bold text-white mt-1">
                    Profile & Account
                </div>

                <div class="text-sm text-slate-400 mt-1">
                    Manage your display name, password, and account.
                </div>
            </button>

        </div>
    `;
}


// ---------------------------------------------------------
// Profile View
// ---------------------------------------------------------

/**
 * Render the initial Platform profile screen.
 *
 * Account-editing controls will be added after the
 * Platform navigation flow is established.
 */
function renderProfileView() {

    if (!currentUser) {

        return `
            <div class="max-w-lg mx-auto">

                <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-6">

                    <div class="text-xs font-bold uppercase tracking-wider text-blue-400">
                        Profile
                    </div>

                    <h2 class="text-xl font-extrabold text-white mt-1">
                        Sign In Required
                    </h2>

                    <p class="text-sm text-slate-400 mt-2">
                        Sign in to manage your Pool Platform profile.
                    </p>

                    <button
                        type="button"
                        onclick="openAccountModal()"
                        class="w-full mt-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                    >
                        Sign In
                    </button>

                    <div class="flex justify-end">
                        <button
                            type="button"
                            onclick="returnFromProfile()"
                            class="text-sm font-bold text-slate-400 hover:text-white transition"
                        >
                            ← Back
                        </button>
                    </div>

                </div>

            </div>
        `;
    }


    const displayName =
        currentProfile?.display_name ||
        'Player';


    return `
        <div class="max-w-lg mx-auto space-y-4">

            <div>
                <div class="flex justify-end">
                    <button
                        type="button"
                        onclick="returnFromProfile()"
                        class="text-sm font-bold text-slate-400 hover:text-white transition"
                    >
                        ← Back
                    </button>
                </div>

                <div class="text-xs font-bold uppercase tracking-wider text-blue-400 mt-4">
                    Profile
                </div>

                <h2 class="text-2xl font-extrabold text-white mt-1">
                    ${escapeHTML(displayName)}
                </h2>
            </div>


            <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5">

                <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Display Name
                </div>

                <input
                    id="profile-display-name"
                    type="text"
                    maxlength="30"
                    value="${escapeHTML(displayName)}"
                    class="w-full mt-3 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white font-medium"
                />

                <button
                    type="button"
                    onclick="submitProfileDisplayName()"
                    class="w-full mt-3 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition"
                >
                    Save Display Name
                </button>

            </div>


            <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5">

                <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Email
                </div>

                <div class="text-sm text-slate-200 mt-1 break-all">
                    ${escapeHTML(currentUser.email || '')}
                </div>

            </div>


           <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5">

                <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Account Security
                </div>

                <div class="text-base font-bold text-white mt-1">
                    Change Password
                </div>

                <input
                    id="profile-new-password"
                    type="password"
                    autocomplete="new-password"
                    placeholder="New password"
                    class="w-full mt-3 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white"
                />

                <input
                    id="profile-confirm-password"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Confirm new password"
                    class="w-full mt-2 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white"
                />

                <button
                    type="button"
                    onclick="submitPasswordChange()"
                    class="w-full mt-3 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-sm transition"
                >
                    Change Password
                </button>

            </div>

            <div class="rounded-2xl bg-slatefelt-900 border border-slatefelt-700 p-5">

                <div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Account
                </div>

                <button
                    type="button"
                    onclick="signOutUser()"
                    class="w-full mt-3 py-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-extrabold text-sm transition"
                >
                    Sign Out
                </button>

            </div>

        </div>
    `;
}


// ---------------------------------------------------------
// My Active Game View
// ---------------------------------------------------------

/**
 * Render the current Ring Game card when this device
 * has an active game in progress.
 */
function renderActiveGameCard() {

    if (!state.game) {
        return '';
    }


    const activePlayers =
        state.game.players.filter(
            player =>
                player.active !== false &&
                !player.eliminated
        );


    const gameType =
        state.game.format
            ? state.game.format.toUpperCase()
            : 'RING GAME';


    const onlineLabel =
        state.game.isOnline
            ? 'Online'
            : 'Local';


    return `
        <div class="rounded-2xl bg-emerald-950/20 border border-emerald-500/30 p-5">

            <div class="flex items-start justify-between gap-3">

                <div>

                    <div class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        My Active Game
                    </div>

                    <div class="text-xl font-extrabold text-white mt-1">
                        ${gameType}
                    </div>

                    <div class="text-sm text-slate-400 mt-1">
                        Rack #${state.game.rackNumber}
                        • ${activePlayers.length} Players
                        • ${onlineLabel}
                    </div>

                </div>


                <div class="w-3 h-3 rounded-full bg-emerald-400 mt-1"></div>

            </div>


            ${state.game.isOnline &&
            state.game.joinCode
            ? `
                        <div class="mt-3 text-xs text-slate-400">
                            Join Code:
                            <span class="font-mono font-bold text-white">
                                ${escapeHTML(state.game.joinCode)}
                            </span>
                        </div>
                    `
            : ''
        }


            <button
                type="button"
                onclick="openRingGame()"
                class="w-full mt-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition"
            >
                Return to Game
            </button>

        </div>
    `;
}