// =========================================================
// RING GAME - STATE & LOCAL STORAGE
// =========================================================

// ---------------------------------------------------------
// Constants
// ---------------------------------------------------------
const STORAGE_KEY = 'ringgame_pro_state_v1';


// ---------------------------------------------------------
// Default State Builders
// ---------------------------------------------------------
/**
 * Create the default four-player Ring Game setup roster.
 *
 * When includeCurrentUser is true and authentication is
 * available, the signed-in user becomes Player 1.
 *
 * When false, the roster remains authentication-neutral.
 */
function createDefaultRingGamePlayers(
    includeCurrentUser = true
) {

    const useCurrentUser =
        Boolean(
            includeCurrentUser &&
            currentUser &&
            currentProfile
        );


    return [
        {
            id: 'p1',

            name:
                useCurrentUser
                    ? currentProfile.display_name
                    : 'Player 1',

            userId:
                useCurrentUser
                    ? currentUser.id
                    : null,

            isGuest:
                !useCurrentUser
        },

        {
            id: 'p2',
            name: 'Player 2',
            userId: null,
            isGuest: true
        },

        {
            id: 'p3',
            name: 'Player 3',
            userId: null,
            isGuest: true
        },

        {
            id: 'p4',
            name: 'Player 4',
            userId: null,
            isGuest: true
        }
    ];
}


/**
* Default Application State
*/
function getDefaultState() {

    return {

        view: 'setup',

        config: {

            onlineGameId: null,
            joinCode: null,
            isOnline: false,
            onlineRole: null,

            playerCount: 4,

            /*
             * Initial application state is intentionally
             * authentication-neutral. The authenticated
             * profile is applied after Supabase restores
             * the user session.
             */
            players:
                createDefaultRingGamePlayers(false),

            format:
                '10-ball',

            moneyBalls: [
                {
                    ball: 5,
                    value: 0.25
                },
                {
                    ball: 10,
                    value: 0.50
                }
            ],

            useBuyIn: false,
            buyInAmount: 20
        },

        game: null
    };
}


// ---------------------------------------------------------
// Local Storage
// ---------------------------------------------------------
/**
 * Load Ring Game state from local storage.
 *
 * Saved state is merged with the current defaults so older
 * saved versions automatically receive newly added settings.
 */
function loadState() {

    try {

        const raw =
            localStorage.getItem(STORAGE_KEY);


        if (!raw) {
            return getDefaultState();
        }


        const parsed =
            JSON.parse(raw);


        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !parsed.config ||
            typeof parsed.config !== 'object'
        ) {

            console.warn(
                'Saved Ring Game state is invalid. Using defaults.'
            );

            return getDefaultState();
        }


        /*
         * Start with today's known-good state structure.
         */
        const defaults =
            getDefaultState();


        /*
         * Merge the saved configuration over current defaults.
         *
         * This preserves existing user settings while ensuring
         * newly introduced config properties are available.
         */
        const mergedConfig = {
            ...defaults.config,
            ...parsed.config
        };


        /*
         * Players require a valid array.
         */
        if (
            !Array.isArray(mergedConfig.players) ||
            mergedConfig.players.length === 0
        ) {

            mergedConfig.players =
                defaults.config.players;

            mergedConfig.playerCount =
                defaults.config.playerCount;
        }


        /*
         * Money balls also require a valid array.
         */
        if (
            !Array.isArray(mergedConfig.moneyBalls) ||
            mergedConfig.moneyBalls.length === 0
        ) {

            mergedConfig.moneyBalls =
                defaults.config.moneyBalls;
        }


        return {
            ...defaults,
            ...parsed,

            config:
                mergedConfig,

            /*
             * Preserve a valid saved live game.
             * Otherwise there is no active game.
             */
            game:
                parsed.game &&
                    typeof parsed.game === 'object'
                    ? parsed.game
                    : null
        };

    } catch (error) {

        console.error(
            'Failed to load saved Ring Game state:',
            error
        );

        return getDefaultState();
    }
}


function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}


// ---------------------------------------------------------
// State Initialization
// ---------------------------------------------------------
let state = loadState();


// ---------------------------------------------------------
// Reset & Match Lifecycle
// ---------------------------------------------------------
/**
 * Return Ring Game to a clean offline setup state.
 *
 * This only resets local Ring Game/session state.
 * Cloud completion, cancellation, settlements, and
 * realtime disconnection remain the responsibility
 * of the caller.
 */
function resetRingGameToOfflineSetup() {

    state.game = null;

    state.view = 'setup';

    state.config.isOnline = false;
    state.config.onlineGameId = null;
    state.config.joinCode = null;
    state.config.onlineRole = null;

    state.config.playerCount = 4;

    state.config.players =
        createDefaultRingGamePlayers();

    activeTab = 'table';
}


function confirmResetModal() {
    const html = `
            <div class="p-6">
                <h2 class="text-lg font-extrabold text-white">Start a New Game?</h2>
                <p class="text-sm text-slate-400 mt-1.5">This will clear the current rack progress and balances and return you to the setup screen.</p>
                <div class="flex gap-3 mt-6">
                <button onclick="closeModal()" class="flex-1 py-2.5 px-4 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 text-slate-200 font-semibold text-sm">
                    Cancel
                </button>
                <button onclick="resetToSetup()" class="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm">
                    Yes, Reset Game
                </button>
                </div>
            </div>
            `;
    openModal(html);
}


async function resetToSetup() {

    /*
     * Capture the cloud identity before resetting
     * the local Ring Game.
     */
    const cloudGameId =
        state.game?.cloudGameId ||
        state.config?.onlineGameId ||
        null;


    const finalGameState =
        state.game
            ? structuredClone(state.game)
            : null;


    /*
     * Complete the corresponding cloud game first.
     */
    if (cloudGameId) {

        await completeOnlineRingGame(
            cloudGameId,
            finalGameState
        );

    }


    /*
     * Return this device to a clean Ring Game setup.
     */
    resetRingGameToOfflineSetup();


    saveState();

    closeModal();

    render();


    showToast(
        'Match completed.',
        'success'
    );
}