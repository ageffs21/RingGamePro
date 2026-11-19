// =========================================================
// RING GAME - STATE & LOCAL STORAGE
// =========================================================

const STORAGE_KEY = 'ringgame_pro_state_v1';

/**
* Default Application State
*/
function getDefaultState() {
    return {
        view: 'setup', // 'setup' | 'live'
        config: {
            onlineGameId: null,
            joinCode: null,
            isOnline: false,
            onlineRole: null,
            playerCount: 4,
            players: [
                { id: 'p1', name: 'Player 1' },
                { id: 'p2', name: 'Player 2' },
                { id: 'p3', name: 'Player 3' },
                { id: 'p4', name: 'Player 4' }
            ],
            format: '10-ball', // '9-ball' | '10-ball' | 'custom'
            moneyBalls: [
                { ball: 5, value: 0.25 },
                { ball: 10, value: 0.50 }
            ],
            useBuyIn: false,
            buyInAmount: 20
        },
        game: null
    };
}


function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.config) return parsed;
        }
    } catch (e) {
        console.error('Failed to load saved state:', e);
    }
    return getDefaultState();
}


function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}


let state = loadState();


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
     * Capture the cloud ID before clearing state.game.
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
     * Mark the online database record completed.
     */
    if (cloudGameId) {
        await completeCurrentCloudGame(
            cloudGameId,
            finalGameState
        );
    }


    /*
     * Remove the completed local match.
     */
    state.game = null;

    state.view = 'setup';

    activeTab = 'table';


    /*
     * Clear the old online lobby.
     *
     * This is the part that prevents the next game from
     * automatically reusing the previous lobby.
     */
    state.config.isOnline = false;

    state.config.onlineGameId = null;

    state.config.joinCode = null;

    state.config.onlineRole = null;

    /*
     * Restore the signed-in user as Player 1.
     */
    if (
        currentUser &&
        currentProfile &&
        state.config.players.length > 0
    ) {
        state.config.players[0].name =
            currentProfile.display_name;

        state.config.players[0].userId =
            currentUser.id;

        state.config.players[0].isGuest =
            false;
    }


    saveState();

    closeModal();

    render();


    showToast(
        'Match completed.',
        'success'
    );
}