// =========================================================
// POOL PLATFORM - APPLICATION CONTROLLER
// =========================================================


// ---------------------------------------------------------
// Application Configuration
// ---------------------------------------------------------

const APP_VERSION = '0.5.5';


// ---------------------------------------------------------
// Main Render Controller
// ---------------------------------------------------------

/**
 * MAIN RENDER CONTROLLER
 */
function render() {

    const root =
        document.getElementById('app-root');

    const headerActions =
        document.getElementById('header-actions');

    const subtitle =
        document.getElementById('header-subtitle');


    if (
        !root ||
        !headerActions ||
        !subtitle
    ) {

        console.error(
            'Application shell is missing required UI elements.'
        );

        return;
    }


    /*
     * Shared account/profile button.
     */
    const accountButton = `
        <button
            type="button"
            onclick="openProfile()"
            class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
        >
            ${currentProfile
            ? escapeHTML(currentProfile.display_name)
            : 'Account'
        }
        </button>
    `;


    /*
     * ---------------------------------------------------------
     * PLATFORM HOME
     * ---------------------------------------------------------
     */
    if (platformView === 'home') {

        subtitle.textContent =
            `Pool Platform • v${APP_VERSION}`;

        headerActions.innerHTML =
            accountButton;

        root.innerHTML =
            renderPlatformHome();

        return;
    }


    /*
     * ---------------------------------------------------------
     * PROFILE
     * ---------------------------------------------------------
     */
    if (platformView === 'profile') {

        subtitle.textContent =
            'Profile & Account';

        headerActions.innerHTML = `
            <button
                type="button"
                onclick="openHome()"
                class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
            >
                Home
            </button>
        `;

        root.innerHTML =
            renderProfileView();

        return;
    }


    /*
     * ---------------------------------------------------------
     * RING GAME
     * ---------------------------------------------------------
     */

    const rulesButton = `
        <button
            type="button"
            onclick="openRulesModal()"
            class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
        >
            <span class="text-emerald-400 font-black">?</span>
            Rules
        </button>
    `;


    const playersButton = `
        <button
            type="button"
            onclick="openManagePlayersModal()"
            class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
        >
            Players
        </button>
    `;


    /*
     * Active Ring Game.
     */
    if (
        state.view === 'live' &&
        state.game
    ) {

        /*
         * Once a match has started, the match itself is
         * authoritative. Do not use this device's old setup
         * configuration to describe the live game.
         */
        const liveFormat =
            state.game.format ||
            state.config.format;


        const activePlayerCount =
            state.game.players.filter(
                player =>
                    player.active !== false &&
                    !player.eliminated
            ).length;


        const isOnlineViewer =
            state.game.isOnline &&
            state.config.onlineRole === 'player';


        subtitle.textContent =
            `${liveFormat.toUpperCase()} • ${activePlayerCount} Players`;


        /*
         * Joined online players get read-only match controls.
         * The host keeps all game-management actions.
         */
        headerActions.innerHTML =
            isOnlineViewer
                ? `
                    ${rulesButton}
                    ${accountButton}

                    <button
                        type="button"
                        onclick="requestLeaveActiveGame()"
                        class="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-semibold text-xs transition"
                    >
                        Leave Game
                    </button>
                `
                : `
                    ${rulesButton}
                    ${playersButton}
                    ${accountButton}

                    <button
                        type="button"
                        onclick="openEndGameModal()"
                        class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow"
                    >
                        Settle Up
                    </button>

                    <button
                        type="button"
                        onclick="confirmResetModal()"
                        class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-semibold text-xs transition"
                    >
                        New Game
                    </button>
                `;


        root.innerHTML =
            renderLiveView();

        return;
    }


    /*
     * Ring Game setup.
     */
    subtitle.textContent =
        `Billiards Ring Game Tracker • v${APP_VERSION}`;


    headerActions.innerHTML = `
        <button
            type="button"
            onclick="openHome()"
            class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-semibold text-xs transition"
        >
            Home
        </button>

        ${rulesButton}
        ${accountButton}
    `;


    root.innerHTML =
        renderSetupView();


    const startBtn =
        document.getElementById(
            'start-match-btn'
        );


    if (startBtn) {

        startBtn.onclick =
            null;


        startBtn.addEventListener(
            'click',
            event => {

                event.preventDefault();

                startMatch();

            }
        );
    }
}


// ---------------------------------------------------------
// Initial Application Startup
// ---------------------------------------------------------

/*
 * Show the interface immediately.
 */
render();


/*
 * Restore any existing Supabase login session.
 *
 * loadCurrentUser() already loads the user's profile,
 * so we do not create/check the profile a second time here.
 */
void loadCurrentUser();


// ---------------------------------------------------------
// Authentication Lifecycle
// ---------------------------------------------------------

/*
 * React only to actual authentication changes.
 */
supabaseClient.auth.onAuthStateChange(
    async (event, session) => {

        console.log(
            'Auth state changed:',
            event
        );

        /*
        * The user returned through a password-recovery link.
        *
        * Supabase has established a temporary authenticated
        * recovery session. Open Profile so the user can enter
        * and confirm a new password.
        */
        if (event === 'PASSWORD_RECOVERY') {

            currentUser =
                session?.user || null;


            if (currentUser) {

                await loadCurrentProfile();

            }


            previousPlatformView =
                'home';

            platformView =
                'profile';


            render();


            showToast(
                'Enter a new password to finish account recovery.',
                'info'
            );


            return;
        }

        /*
         * User signed out.
         */
        if (event === 'SIGNED_OUT') {

            currentUser = null;
            currentProfile = null;

            render();

            return;
        }


        /*
         * User signed in or returned from an authentication flow.
         */
        if (event === 'SIGNED_IN') {

            currentUser =
                session?.user || null;

            if (currentUser) {

                await loadCurrentProfile();


                /*
                 * Only create a profile if one truly does
                 * not exist after loading it.
                 */
                if (!currentProfile) {

                    await ensureCurrentUserProfile();

                    await loadCurrentProfile();
                }
            }

            render();
        }
    }
);


// ---------------------------------------------------------
// Application Resume
// ---------------------------------------------------------

document.addEventListener(
    'visibilitychange',
    async () => {

        if (
            document.visibilityState === 'visible' &&
            currentUser &&
            state.config.isOnline
        ) {
            await restoreOnlineLobby();
        }

    }
);