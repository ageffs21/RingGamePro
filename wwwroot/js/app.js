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


const APP_VERSION = '0.5.5';


/*
* Current Supabase Realtime lobby subscription.
*/
let onlineLobbyChannel = null;
let onlineGameChannel = null;
let activeTab = 'table'; // 'table' | 'racks' | 'ledger' | 'history'
let dragSourceIndex = null;
let editingRackNumber = null;


/**
* Generate a short human-readable game join code.
*
* Ambiguous characters such as O/0 and I/1 are intentionally
* omitted so codes are easier to read across a pool table.
*/
function generateJoinCode(length = 6) {

    const characters =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let code = '';

    for (let i = 0; i < length; i++) {

        code +=
            characters[
            Math.floor(
                Math.random() *
                characters.length
            )
            ];
    }

    return code;
}


/**
 * Create an online game lobby from the Match Setup screen.
 *
 * The Ring Game itself has not started yet. Players can join
 * this lobby and the host can set/randomize shooting order
 * before pressing Start Match.
 */
async function createCloudGame() {

    if (!currentUser || !currentProfile) {

        showToast(
            'Sign in to create an online game.',
            'warning'
        );

        return false;
    }


    /*
     * Lobby already exists.
     */
    if (
        state.config.isOnline &&
        state.config.onlineGameId
    ) {
        return true;
    }


    for (let attempt = 0; attempt < 5; attempt++) {

        const joinCode =
            generateJoinCode();


        const {
            data: gameData,
            error: gameError
        } =
            await supabaseClient
                .from('games')
                .insert({

                    host_id:
                        currentUser.id,

                    join_code:
                        joinCode,

                    game_type:
                        'ring',

                    /*
                     * The match has not started yet.
                     */
                    status:
                        'waiting'

                })
                .select()
                .single();


        if (gameError) {

            /*
             * Duplicate join code.
             */
            if (gameError.code === '23505') {
                continue;
            }

            console.error(
                'Could not create online game lobby:',
                gameError
            );

            showToast(
                'Could not create online game.',
                'danger'
            );

            return false;
        }


        /*
         * Add the signed-in host as the first lobby player.
         */
        const {
            error: playerError
        } =
            await supabaseClient
                .from('game_players')
                .insert({

                    game_id:
                        gameData.id,

                    user_id:
                        currentUser.id,

                    display_name:
                        currentProfile.display_name,

                    shooting_order:
                        1,

                    status:
                        'active'

                });


        if (playerError) {

            console.error(
                'Could not add host to online lobby:',
                playerError
            );

            showToast(
                'Lobby created, but host could not be added.',
                'danger'
            );

            return false;
        }


        /*
         * Save the lobby identity in setup configuration.
         */
        state.config.onlineGameId = gameData.id;
        state.config.joinCode = joinCode;
        state.config.isOnline = true;
        state.config.onlineRole = 'host';

        /*
         * Load the actual game_players rows back from Supabase.
         * This ensures the host also uses the authoritative database
         * participation ID instead of a temporary lobby ID.
         */
        await loadOnlineLobbyRoster(
            gameData.id
        );


        /*
         * Watch for registered users and guests joining or leaving.
         */
        await subscribeToOnlineLobby(
            gameData.id
        );

        await subscribeToOnlineGame(
            gameData.id
        );


        saveState();
        render();


        showToast(
            `Online lobby ready: ${joinCode}`,
            'success'
        );

        return true;
    }


    showToast(
        'Could not generate a unique game code.',
        'danger'
    );

    return false;
}


/**
* Mark the current online game as completed in Supabase.
*/
async function completeCurrentCloudGame(
    cloudGameId,
    finalGameState
) {

    if (!cloudGameId) {
        return true;
    }


    const { error } =
        await supabaseClient
            .from('games')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                game_state: finalGameState
            })
            .eq(
                'id',
                cloudGameId
            );


    if (error) {

        console.error(
            'Could not complete cloud game:',
            error
        );

        showToast(
            'Match ended locally, but the online game could not be marked complete.',
            'warning'
        );

        return false;
    }


    return true;
}


/**
* Create an online lobby from the Match Setup screen.
*/
async function createSetupOnlineLobby() {

    if (!currentUser || !currentProfile) {
        showToast(
            'Sign in before creating an online lobby.',
            'warning'
        );

        return;
    }

    /*
     * Prevent accidentally creating a second lobby.
     */
    if (
        state.config.isOnline &&
        state.config.onlineGameId
    ) {
        showToast(
            `Online lobby already active: ${state.config.joinCode}`,
            'info'
        );

        return;
    }


    showToast(
        'Creating online lobby...',
        'info'
    );


    const success =
        await createCloudGame();


    if (!success) {
        return;
    }


    /*
     * Redraw Setup so the button changes into
     * the Join Code display.
     */
    render();
}


/**
 * Subscribe to player changes for the current online lobby.
 *
 * Whenever someone joins, leaves, or is updated, reload the
 * authoritative roster from Supabase and redraw Setup.
 */
async function subscribeToOnlineLobby(gameId) {

    if (!gameId) {
        return;
    }


    /*
     * Remove an earlier subscription before creating another.
     */
    if (onlineLobbyChannel) {

        await supabaseClient.removeChannel(
            onlineLobbyChannel
        );

        onlineLobbyChannel = null;
    }


    onlineLobbyChannel =
        supabaseClient
            .channel(
                `online-lobby-${gameId}`
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'game_players',
                    filter: `game_id=eq.${gameId}`
                },
                async (payload) => {
                    /*
                     * A registered player is requesting to join an
                     * online match that is already in progress.
                     */
                    if (
                        state.view === 'live' &&
                        state.config.onlineRole === 'host' &&
                        payload.eventType === 'INSERT' &&
                        payload.new?.status === 'pending'
                    ) {

                        openActiveGameJoinRequestModal(
                            payload.new
                        );

                        return;
                    }


                    /*
                    * If this device's registered player was marked as left
                    * by the host, finish the departure on this device.
                    */
                    if (
                        state.view === 'live' &&
                        state.config.onlineRole === 'player' &&
                        payload.eventType === 'UPDATE' &&
                        payload.new?.user_id === currentUser?.id &&
                        payload.new?.status === 'left'
                    ) {

                        const currentParticipant =
                            state.game?.players?.find(
                                player =>
                                    player.userId ===
                                    currentUser.id
                            );


                        if (currentParticipant) {

                            await handleOnlinePlayerDeparture(
                                state.game,
                                currentParticipant
                            );
                        }

                        return;
                    }

                    /*
                     * If an active player requested to leave during
                     * a live match, only the host handles settlement.
                     */
                    if (
                        state.view === 'live' &&
                        state.config.onlineRole === 'host' &&
                        payload.eventType === 'UPDATE' &&
                        payload.new?.leave_requested_at &&
                        payload.new?.status === 'active'
                    ) {

                        const leavingUserId =
                            payload.new.user_id;


                        const leavingPlayer =
                            state.game.players.find(
                                player =>
                                    player.userId ===
                                    leavingUserId
                            );


                        if (leavingPlayer) {

                            openLeavePlayerModal(
                                leavingPlayer.id
                            );

                            showToast(
                                `${leavingPlayer.name} requested to leave the game.`,
                                'info'
                            );
                        }
                    }


                    /*
                     * During the waiting lobby, continue keeping the
                     * participant roster synchronized.
                     */
                    if (state.view === 'setup') {

                        await loadOnlineLobbyRoster(
                            gameId
                        );

                        render();
                    }
                }
            )
            .subscribe((status, err) => {

                console.log(
                    'Online lobby subscription:',
                    status,
                    err
                );


                if (status === 'SUBSCRIBED') {

                    showToast(
                        'Live lobby connected.',
                        'success'
                    );

                    return;
                }


                if (status === 'CHANNEL_ERROR') {

                    console.error(
                        'Online lobby channel error:',
                        err
                    );

                    showToast(
                        'Live lobby connection error.',
                        'danger'
                    );

                    return;
                }


                if (status === 'TIMED_OUT') {

                    console.error(
                        'Online lobby connection timed out:',
                        err
                    );

                    showToast(
                        'Live lobby connection timed out.',
                        'warning'
                    );

                    return;
                }


                if (status === 'CLOSED') {

                    console.warn(
                        'Online lobby channel closed.',
                        err
                    );
                }

            });
}


/**
* Listen for changes to the online game's status.
*
* This allows joined players to detect when the host
* starts the match.
*/
async function subscribeToOnlineGame(gameId) {

    if (!gameId) {
        return;
    }


    /*
     * Remove any previous game subscription.
     */
    if (onlineGameChannel) {

        await supabaseClient.removeChannel(
            onlineGameChannel
        );

        onlineGameChannel = null;
    }


    onlineGameChannel =
        supabaseClient
            .channel(
                `online-game-${gameId}`
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'games',
                    filter: `id=eq.${gameId}`
                },
                async (payload) => {

                    console.log(
                        'Online game changed:',
                        payload
                    );


                    const updatedGame =
                        payload.new;


                    if (
                        updatedGame.status === 'completed' &&
                        state.config.onlineRole === 'player'
                    ) {

                        await handleCompletedOnlineGame(
                            updatedGame
                        );

                        return;
                    }


                    /*
                    * The host started the match.
                    */
                    if (
                        updatedGame.status === 'active' &&
                        state.config.onlineRole === 'player'
                    ) {

                        /*
                            * The host has started the match.
                            * The complete authoritative Ring Game state
                            * is stored in games.game_state.
                            */
                        if (!updatedGame.game_state) {

                            console.warn(
                                'Game started but no game_state was received.'
                            );

                            return;
                        }


                        const incomingGameState =
                            updatedGame.game_state;


                        /*
                         * Determine whether the host has settled and removed
                         * this authenticated player.
                         */
                        const currentParticipant =
                            incomingGameState.players.find(
                                player =>
                                    player.userId ===
                                    currentUser?.id
                            );


                        if (
                            currentParticipant &&
                            currentParticipant.active === false
                        ) {

                            await handleOnlinePlayerDeparture(
                                incomingGameState,
                                currentParticipant
                            );

                            return;
                        }

                        const isEnteringLiveGame =
                            state.view !== 'live';


                        /*
                         * Remember the tab the participant is currently viewing.
                         *
                         * Live cloud updates should refresh the data without
                         * forcing the participant back to the Live Table.
                         */
                        const currentViewingTab =
                            activeTab;


                        /*
                         * Apply the host's newest authoritative game state.
                         */
                        state.game =
                            updatedGame.game_state;


                        state.game.cloudGameId =
                            gameId;

                        state.game.joinCode =
                            updatedGame.join_code ||
                            state.config.joinCode;

                        state.game.isOnline =
                            true;


                        state.view =
                            'live';


                        /*
                         * Only force Live Table when entering the match for
                         * the first time.
                         *
                         * After that, preserve whichever viewing tab the
                         * participant selected.
                         */
                        activeTab =
                            isEnteringLiveGame
                                ? 'table'
                                : currentViewingTab;


                        saveState();

                        render();


                        /*
                            * Only announce the initial transition into the match.
                            * Ordinary scoring updates should update silently.
                            */
                        if (isEnteringLiveGame) {

                            showToast(
                                'The host started the match.',
                                'success'
                            );
                        }


                        console.log(
                            'Joined live game:',
                            gameId
                        );
                    }

                }
            )
            .subscribe((status, err) => {
                console.log(
                    'Online game subscription:',
                    status,
                    err
                );
            });
}


/**
* Copy the setup lobby's join code.
*/
async function copySetupJoinCode() {

    const code =
        state.config?.joinCode;

    if (!code) {
        showToast(
            'No join code is available.',
            'warning'
        );

        return;
    }


    try {

        await navigator.clipboard.writeText(
            code
        );

        showToast(
            `Join code ${code} copied.`,
            'success'
        );

    } catch (error) {

        console.error(
            'Could not copy join code:',
            error
        );

        showToast(
            `Join code: ${code}`,
            'info'
        );
    }
}


/**
* START GAME
*/
async function startMatch() {
    try {
        /*
        * Only the host controls the start of an online match.
        */
        if (
            state.config.isOnline &&
            state.config.onlineRole !== 'host'
        ) {

            showToast(
                'Waiting for the host to start the match.',
                'info'
            );

            return;
        }
        /*
        * Online lobbies must contain at least two actual players.
        */
        if (
            state.config.isOnline &&
            state.config.players.length < 2
        ) {
            showToast(
                'At least 2 players must join before starting.',
                'warning'
            );

            return;
        }


        /*
            * Ring Game supports a maximum of 12 active players.
            */
        if (
            state.config.isOnline &&
            state.config.players.length > 12
        ) {
            showToast(
                'Online Ring Game supports up to 12 players.',
                'warning'
            );

            return;
        }

        if (!state.config || !Array.isArray(state.config.players) || state.config.players.length < 2) {
            showToast('Please configure at least 2 players before starting.', 'warning');
            return;
        }


        const players = state.config.players.map((p, idx) => ({

            /*
                * Local ID used by the Ring Game scoring engine.
                */
            id:
                p.id || ('p' + (idx + 1)),

            name:
                (p.name || '').trim() ||
                `Player ${idx + 1}`,

            /*
                * Preserve the permanent PoolApp identity from
                * the setup/lobby roster.
                *
                * Shooting order must never determine identity.
                */
            userId:
                p.userId || null,

            isGuest:
                p.isGuest === true,

            eliminated: false,
            active: true,
            joinedAtRack: 1,
            leftAtRack: null,
            settledOnExit: false

        }));


        if (!Array.isArray(state.config.moneyBalls) || state.config.moneyBalls.length === 0) {
            showToast('Add at least one money ball before starting.', 'warning');
            return;
        }


        const moneyBalls = state.config.moneyBalls.map(mb => ({
            ball: Number(mb.ball),
            value: Math.max(0.25, Number(mb.value) || 1)
        }));


        const ledger = {};
        players.forEach(p1 => {
            ledger[p1.id] = {};
            players.forEach(p2 => {
                if (p1.id !== p2.id) ledger[p1.id][p2.id] = 0;
            });
        });


        state.game = {
            startedAt: new Date().toISOString(),
            cloudGameId: state.config.onlineGameId || null,
            joinCode: state.config.joinCode || null,
            isOnline: state.config.isOnline === true,
            format: state.config.format,
            rackNumber: 1,
            players,
            currentShooterIndex: 0,
            previousShooterIndex: null,
            canPassBack: false,
            moneyBalls,
            useBuyIn: Boolean(state.config.useBuyIn),
            buyInAmount: Math.max(1, Number(state.config.buyInAmount) || 20),
            racks: [
                {
                    rackNumber: 1,
                    breakerId: players[0].id,
                    completed: false,
                    pocketedBalls: []
                }
            ],
            ledger,
            history: [],
            snapshots: [],
            exitSettlements: []
        };


        state.view = 'live';
        activeTab = 'table';

        saveState();


        /*
            * For an online match, publish the finalized game state
            * and change the cloud game's status from waiting to active.
            */
        if (
            state.game.isOnline &&
            state.game.cloudGameId &&
            state.config.onlineRole === 'host'
        ) {

            const {
                error: cloudStartError
            } =
                await supabaseClient
                    .from('games')
                    .update({
                        status: 'active',
                        game_state: state.game
                    })
                    .eq(
                        'id',
                        state.game.cloudGameId
                    );


            if (cloudStartError) {

                console.error(
                    'Could not start cloud game:',
                    cloudStartError
                );

                showToast(
                    'Match started locally, but cloud sync failed.',
                    'warning'
                );
            }
        }


        render();


        showToast(
            `Rack #1 started! ${players[0].name} breaks.`,
            'success'
        );
    } catch (err) {
        console.error('Error starting match:', err);
        showToast('Could not start match. Please check your setup settings.', 'danger');
    }
}


/**
* ACCOUNT / SIGN-IN MODAL
*/
function openAccountModal() {

    /*
     * If already signed in, show the current account.
     */
    if (currentUser) {

        const displayName =
            currentProfile?.display_name ||
            currentUser.email ||
            'Player';

        openModal(`
                    <div class="p-5 sm:p-6">

                        <div class="flex items-start justify-between gap-4 mb-5">

                            <div>
                                <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                                    PoolApp Account
                                </div>

                                <h2 class="text-xl font-extrabold text-white">
                                    ${escapeHTML(displayName)}
                                </h2>
                            </div>

                            <button
                                onclick="closeModal()"
                                class="shrink-0 w-9 h-9 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-bold transition"
                            >
                                ✕
                            </button>

                        </div>


                        <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl p-4 mb-4">

                            <div class="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                                Signed In As
                            </div>

                            <div class="text-sm text-white mt-1">
                                ${escapeHTML(currentUser.email || '')}
                            </div>

                        </div>


                        <button
                            onclick="signOutUser()"
                            class="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition"
                        >
                            Sign Out
                        </button>

                    </div>
                `);

        return;
    }


    /*
     * Signed-out view.
     */
    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="flex items-start justify-between gap-4 mb-5">

                        <div>
                            <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                                PoolApp Account
                            </div>

                            <h2 class="text-xl font-extrabold text-white">
                                Sign In
                            </h2>

                            <p class="text-xs text-slate-400 mt-1">
                                Sign in to save games, stats and tournament history.
                            </p>
                        </div>

                        <button
                            onclick="closeModal()"
                            class="shrink-0 w-9 h-9 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-bold transition"
                        >
                            ✕
                        </button>

                    </div>


                    <!-- Sign In -->
                    <section class="mb-6">

                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                            Existing Account
                        </h3>


                        <label class="block text-xs text-slate-400 font-semibold mb-1.5">
                            Email
                        </label>

                        <input
                            id="signin-email"
                            type="email"
                            autocomplete="email"
                            placeholder="you@example.com"
                            class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 mb-3"
                        />


                        <label class="block text-xs text-slate-400 font-semibold mb-1.5">
                            Password
                        </label>

                        <input
                            id="signin-password"
                            type="password"
                            autocomplete="current-password"
                            placeholder="Password"
                            class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 mb-3"
                        />


                        <button
                            onclick="submitSignIn()"
                            class="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition"
                        >
                            Sign In
                        </button>

                    </section>


                    <div class="flex items-center gap-3 my-5">

                        <div class="h-px bg-slatefelt-700 flex-1"></div>

                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            New Player
                        </span>

                        <div class="h-px bg-slatefelt-700 flex-1"></div>

                    </div>


                    <!-- Create Account -->
                    <section>

                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                            Create Account
                        </h3>


                        <label class="block text-xs text-slate-400 font-semibold mb-1.5">
                            Display Name
                        </label>

                        <input
                            id="signup-name"
                            type="text"
                            maxlength="30"
                            autocomplete="nickname"
                            placeholder="Andrew"
                            class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 mb-3"
                        />


                        <label class="block text-xs text-slate-400 font-semibold mb-1.5">
                            Email
                        </label>

                        <input
                            id="signup-email"
                            type="email"
                            autocomplete="email"
                            placeholder="you@example.com"
                            class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 mb-3"
                        />


                        <label class="block text-xs text-slate-400 font-semibold mb-1.5">
                            Password
                        </label>

                        <input
                            id="signup-password"
                            type="password"
                            autocomplete="new-password"
                            placeholder="Create a password"
                            class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 mb-3"
                        />


                        <button
                            onclick="submitCreateAccount()"
                            class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition"
                        >
                            Create Account
                        </button>

                    </section>


                    <p class="text-[11px] text-slate-500 text-center mt-5">
                        You can still play Ring Game without creating an account.
                    </p>

                </div>
            `);
}


async function submitSignIn() {

    const email =
        document.getElementById('signin-email')?.value || '';

    const password =
        document.getElementById('signin-password')?.value || '';

    await signInUser(
        email,
        password
    );
}


async function submitCreateAccount() {

    const displayName =
        document.getElementById('signup-name')?.value || '';

    const email =
        document.getElementById('signup-email')?.value || '';

    const password =
        document.getElementById('signup-password')?.value || '';

    await createAccount(
        email,
        password,
        displayName
    );
}


function openManagePlayersModal() {
    if (!state.game) return;

    const activePlayers = state.game.players.filter(
        player => player.active !== false
    );

    const inactivePlayers = state.game.players.filter(
        player => player.active === false
    );

    openModal(`
            <div class="p-5 sm:p-6">

                <!-- Header -->
                <div class="flex items-start justify-between gap-4 mb-5">
                <div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                    Live Game
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                    Manage Players
                    </h2>
                </div>

                <button
                    onclick="closeModal()"
                    class="shrink-0 w-9 h-9 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-bold transition"
                >
                    ✕
                </button>
                </div>


                <!-- Online Game -->
                <section class="mb-6">

                  ${state.game.isOnline
            ? `
                        <div class="bg-blue-950/25 border border-blue-500/40 rounded-xl p-4">

                          <div class="flex items-center justify-between gap-3">

                            <div>
                              <div class="text-[10px] font-bold uppercase tracking-wider text-blue-300">
                                Online Game
                              </div>

                              <div class="text-xs text-slate-400 mt-1">
                                Join Code
                              </div>

                              <div class="font-mono font-extrabold text-2xl tracking-[0.18em] text-white mt-1">
                                ${escapeHTML(state.game.joinCode || '')}
                              </div>
                            </div>

                            <button
                              onclick="copyGameJoinCode()"
                              class="shrink-0 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                            >
                              Copy Code
                            </button>

                          </div>

                          <p class="text-[11px] text-slate-400 mt-3">
                            Registered players will soon be able to use this code
                            or scan a QR code to join this match.
                          </p>

                        </div>
                      `
            : currentUser
                ? `
                          <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl p-4">

                            <div class="text-sm font-bold text-white">
                              Play Online
                            </div>

                            <p class="text-xs text-slate-400 mt-1 mb-3">
                              Create an online match so other PoolApp users can join.
                            </p>

                            <button
                              onclick="makeCurrentGameOnline()"
                              class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm transition"
                            >
                              Make This Game Online
                            </button>

                          </div>
                        `
                : `
                          <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl p-4">

                            <div class="text-sm font-bold text-white">
                              Online Game
                            </div>

                            <p class="text-xs text-slate-400 mt-1">
                              Sign in to create a joinable online match.
                            </p>

                          </div>
                        `
        }

                </section>


                <!-- Active Players -->
                <section class="mb-6">

                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Active Players
                </h3>

                <div class="space-y-2">

            ${activePlayers.map(player => {

            const net = getAdjustedPlayerNetBalance(player.id);

            return `
                <div class="flex items-center justify-between gap-3 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-3">

                    <div class="min-w-0">
                    <div class="font-bold text-white truncate">
                        ${player.name}
                    </div>

                    <div class="text-xs ${net > 0.005
                    ? 'text-emerald-400'
                    : net < -0.005
                        ? 'text-rose-400'
                        : 'text-slate-400'
                }">
                        ${formatMoney(net, true)}
                    </div>
                    </div>

                    <button
                    onclick="openLeavePlayerModal('${player.id}')"
                    class="shrink-0 px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 text-xs font-bold transition"
                    >
                    Leave Game
                    </button>

                </div>
                `;
        }).join('')}

                </div>

                </section>


                <!-- Add Player -->
                <section class="mb-6">

                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Add Player
                </h3>

                <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl p-3">

                    <label class="block text-xs text-slate-400 font-semibold mb-2">
                    Player Name
                    </label>

                    <input
                    id="live-add-player-name"
                    type="text"
                    maxlength="30"
                    placeholder="Enter player name"
                    class="w-full bg-slatefelt-900 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />

                    <button
                    onclick="addPlayerToLiveGame()"
                    class="w-full mt-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition"
                    >
                    + Add to Game
                    </button>

                </div>

                </section>


                ${inactivePlayers.length > 0 ? `

                <!-- Players Who Left -->
                <section>

                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Players Who Left
                    </h3>

                    <div class="space-y-2">

                    ${inactivePlayers.map(player => `
                        <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-3">

                        <div class="flex items-center justify-between gap-3">

                            <div class="font-bold text-slate-300">
                            ${player.name}
                            </div>

                            <div class="text-[10px] uppercase font-bold text-slate-500">
                            Left Game
                            </div>

                        </div>

                        <div class="text-xs text-slate-500 mt-1">
                            Left during Rack #${player.leftAtRack || '?'}
                        </div>

                        </div>
                    `).join('')}

                    </div>

                </section>

                ` : ''}

            </div>
            `);
}

/**
* Convert the current local Ring Game into an online game.
*/
async function makeCurrentGameOnline() {

    if (!state.game) return;

    if (state.game.isOnline) {
        openManagePlayersModal();
        return;
    }

    if (!currentUser || !currentProfile) {
        showToast(
            'Sign in before creating an online game.',
            'warning'
        );

        return;
    }

    showToast(
        'Creating online game...',
        'info'
    );

    const success =
        await createCloudGame();

    if (!success) {
        return;
    }

    render();

    openManagePlayersModal();
}


/**
 * Copy the current game's join code.
 */
async function copyGameJoinCode() {

    const code =
        state.game?.joinCode;

    if (!code) {
        showToast(
            'No join code is available.',
            'warning'
        );

        return;
    }

    try {

        await navigator.clipboard.writeText(
            code
        );

        showToast(
            `Join code ${code} copied.`,
            'success'
        );

    } catch (error) {

        console.error(
            'Could not copy join code:',
            error
        );

        showToast(
            `Join code: ${code}`,
            'info'
        );
    }
}


/**
* Join an existing online lobby using its six-character code.
*/
async function joinOnlineGameByCode() {

    if (!currentUser || !currentProfile) {

        showToast(
            'Sign in before joining an online game.',
            'warning'
        );

        return;
    }


    const input =
        document.getElementById(
            'join-game-code'
        );

    const joinCode =
        (input?.value || '')
            .trim()
            .toUpperCase();


    if (joinCode.length !== 6) {

        showToast(
            'Enter the 6-character join code.',
            'warning'
        );

        return;
    }


    showToast(
        'Finding game...',
        'info'
    );


    /*
     * Find a waiting game with this code.
     */
    const {
        data: gameData,
        error: gameError
    } =
        await supabaseClient
            .from('games')
            .select('*')
            .eq(
                'join_code',
                joinCode
            )
            .in(
                'status',
                [
                    'waiting',
                    'active'
                ]
            )
            .maybeSingle();


    if (gameError) {

        console.error(
            'Could not find online game:',
            gameError
        );

        showToast(
            'Could not look up that game.',
            'danger'
        );

        return;
    }


    if (!gameData) {

        showToast(
            'No available game was found with that code.',
            'warning'
        );

        return;
    }

    /*
     * A waiting lobby can be joined immediately.
     * An active match requires host approval.
     */
    const isActiveGame =
        gameData.status === 'active';


    /*
     * Load the existing lobby roster.
     */
    const {
        data: existingPlayers,
        error: playersError
    } =
        await supabaseClient
            .from('game_players')
            .select('*')
            .eq(
                'game_id',
                gameData.id
            )
            .eq(
                'status',
                'active'
            )
            .order(
                'shooting_order',
                {
                    ascending: true
                }
            );


    if (playersError) {

        console.error(
            'Could not load lobby players:',
            playersError
        );

        showToast(
            'Could not load the game lobby.',
            'danger'
        );

        return;
    }


    /*
     * Don't allow more than 12 players.
     */
    if (existingPlayers.length >= 12) {

        showToast(
            'That game already has 12 players.',
            'warning'
        );

        return;
    }


    /*
     * Don't join twice.
     */
    const alreadyJoined =
        existingPlayers.some(
            player =>
                player.user_id ===
                currentUser.id
        );


    if (alreadyJoined) {

        /*
         * Attach this phone to the existing lobby first.
         */
        state.config.onlineGameId =
            gameData.id;

        state.config.joinCode =
            gameData.join_code;

        state.config.isOnline =
            true;

        state.config.onlineRole =
            gameData.host_id === currentUser.id
                ? 'host'
                : 'player';


        /*
         * Then load the authoritative roster.
         */
        await loadOnlineLobbyRoster(
            gameData.id
        );


        /*
         * Listen for future roster changes.
         */
        await subscribeToOnlineLobby(
            gameData.id
        );


        /*
         * Listen for the host starting/completing the game.
         */
        await subscribeToOnlineGame(
            gameData.id
        );


        saveState();

        render();


        showToast(
            'You have already joined this game.',
            'info'
        );

        return;
    }


    /*
     * New player goes at the end of the current order.
     */
    const shootingOrder =
        existingPlayers.length + 1;


    const {
        error: insertError
    } =
        await supabaseClient
            .from('game_players')
            .insert({

                game_id:
                    gameData.id,

                user_id:
                    currentUser.id,

                display_name:
                    currentProfile.display_name,

                shooting_order:
                    isActiveGame
                        ? null
                        : shootingOrder,

                status:
                    isActiveGame
                        ? 'pending'
                        : 'active'

            });


    if (insertError) {

        console.error(
            'Could not join online game:',
            insertError
        );

        showToast(
            'Could not join the game.',
            'danger'
        );

        return;
    }


    /*
     * This phone is now attached to that lobby.
     */
    state.config.onlineGameId =
        gameData.id;

    state.config.joinCode =
        gameData.join_code;

    state.config.isOnline =
        true;

    state.config.onlineRole =
        gameData.host_id === currentUser.id
            ? 'host'
            : 'player';


    /*
     * Pull the authoritative lobby roster from Supabase.
     */
    await loadOnlineLobbyRoster(
        gameData.id
    );

    /*
    * Listen for future players joining, leaving,
    * or being added by the host.
    */
    await subscribeToOnlineLobby(
        gameData.id
    );


    /*
     * Listen for changes to the game itself,
     * such as the host starting the match.
     */
    await subscribeToOnlineGame(
        gameData.id
    );

    saveState();

    render();


    showToast(
        `Joined game ${joinCode}.`,
        'success'
    );
}


function openActiveGameJoinRequestModal(
    pendingPlayer
) {

    if (
        !pendingPlayer ||
        !pendingPlayer.id
    ) {
        return;
    }


    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-1">
                        Join Request
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                        ${escapeHTML(pendingPlayer.display_name)} Wants to Join
                    </h2>

                    <p class="text-sm text-slate-400 mt-2">
                        The match is already in progress.
                        Approving this request will add the player
                        to the end of the current shooting rotation.
                    </p>


                    <div class="mt-4 rounded-xl bg-slatefelt-950 border border-slatefelt-700 p-4">

                        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            New Player
                        </div>

                        <div class="text-base font-bold text-white mt-1">
                            ${escapeHTML(pendingPlayer.display_name)}
                        </div>

                        <div class="text-xs text-slate-400 mt-1">
                            Starts at $0.00 and owes nothing for money balls made before joining.
                        </div>

                    </div>


                    <div class="grid grid-cols-2 gap-2 mt-5">

                        <button
                            type="button"
                            onclick="declineActiveGameJoinRequest('${pendingPlayer.id}')"
                            class="py-3 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-bold text-sm"
                        >
                            Decline
                        </button>


                        <button
                            type="button"
                            onclick="approveActiveGameJoinRequest('${pendingPlayer.id}')"
                            class="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                        >
                            Approve & Add
                        </button>

                    </div>

                </div>
            `);
}


async function approveActiveGameJoinRequest(
    gamePlayerId
) {

    if (
        !state.game ||
        !state.game.cloudGameId ||
        state.config.onlineRole !== 'host'
    ) {
        return;
    }


    /*
     * Fetch the pending participation row.
     */
    const {
        data: pendingPlayer,
        error: pendingError
    } =
        await supabaseClient
            .from('game_players')
            .select('*')
            .eq(
                'id',
                gamePlayerId
            )
            .eq(
                'game_id',
                state.game.cloudGameId
            )
            .eq(
                'status',
                'pending'
            )
            .maybeSingle();


    if (
        pendingError ||
        !pendingPlayer
    ) {

        console.error(
            'Could not load pending player:',
            pendingError
        );

        showToast(
            'Could not approve this player.',
            'danger'
        );

        return;
    }


    /*
     * Don't exceed the Ring Game player limit.
     */
    const activePlayerCount =
        state.game.players.filter(
            player =>
                player.active !== false
        ).length;


    if (activePlayerCount >= 12) {

        showToast(
            'This game already has 12 active players.',
            'warning'
        );

        return;
    }


    /*
     * Build the same player structure used by the live
     * Ring Game engine.
     */
    const newPlayer = {

        id:
            pendingPlayer.id,

        userId:
            pendingPlayer.user_id,

        name:
            pendingPlayer.display_name,

        isGuest:
            false,

        eliminated:
            false,

        active:
            true,

        joinedAtRack:
            state.game.rackNumber,

        leftAtRack:
            null,

        settledOnExit:
            false

    };


    /*
     * Add to the end of the current shooting rotation.
     */
    state.game.players.push(
        newPlayer
    );


    /*
     * Extend the pairwise ledger.
     *
     * The new player starts at zero and therefore owes
     * nothing from money balls made before joining.
     */
    state.game.ledger[newPlayer.id] =
    {};


    state.game.players.forEach(
        otherPlayer => {

            if (
                otherPlayer.id === newPlayer.id
            ) {
                return;
            }


            state.game.ledger[
                newPlayer.id
            ][
                otherPlayer.id
            ] = 0;


            if (
                !state.game.ledger[
                otherPlayer.id
                ]
            ) {
                state.game.ledger[
                    otherPlayer.id
                ] = {};
            }


            state.game.ledger[
                otherPlayer.id
            ][
                newPlayer.id
            ] = 0;
        }
    );


    /*
     * Record the join in match history.
     */
    state.game.history.unshift({

        id:
            Date.now(),

        type:
            'player_joined',

        rack:
            state.game.rackNumber,

        playerId:
            newPlayer.id,

        playerName:
            newPlayer.name,

        timestamp:
            new Date().toLocaleTimeString(
                [],
                {
                    hour: '2-digit',
                    minute: '2-digit'
                }
            )

    });


    /*
     * Activate the player's cloud participation and
     * assign the new shooting-order position.
     */
    const {
        error: activationError
    } =
        await supabaseClient
            .from('game_players')
            .update({

                status:
                    'active',

                shooting_order:
                    state.game.players.length

            })
            .eq(
                'id',
                pendingPlayer.id
            )
            .eq(
                'game_id',
                state.game.cloudGameId
            );


    if (activationError) {

        console.error(
            'Could not activate joining player:',
            activationError
        );


        /*
         * Roll back the local addition because cloud
         * approval failed.
         */
        state.game.players =
            state.game.players.filter(
                player =>
                    player.id !== newPlayer.id
            );


        delete state.game.ledger[
            newPlayer.id
        ];


        state.game.players.forEach(
            player => {

                if (
                    state.game.ledger[
                    player.id
                    ]
                ) {
                    delete state.game.ledger[
                        player.id
                    ][
                        newPlayer.id
                    ];
                }

            }
        );


        state.game.history =
            state.game.history.filter(
                event =>
                    event.playerId !==
                    newPlayer.id
            );


        showToast(
            'Could not add the player to the live game.',
            'danger'
        );

        return;
    }


    /*
     * Publish the updated live game to every participant.
     */
    await saveAndSyncGame();


    closeModal();

    render();


    showToast(
        `${newPlayer.name} joined the game.`,
        'success'
    );
}


async function declineActiveGameJoinRequest(
    gamePlayerId
) {

    if (
        !state.game ||
        state.config.onlineRole !== 'host'
    ) {
        return;
    }


    const { error } =
        await supabaseClient
            .from('game_players')
            .update({
                status: 'left',
                left_at: new Date().toISOString()
            })
            .eq(
                'id',
                gamePlayerId
            )
            .eq(
                'game_id',
                state.game.cloudGameId
            )
            .eq(
                'status',
                'pending'
            );


    if (error) {

        console.error(
            'Could not decline active-game join request:',
            error
        );

        showToast(
            'Could not decline the join request.',
            'danger'
        );

        return;
    }


    closeModal();


    showToast(
        'Join request declined.',
        'info'
    );
}


/**
* Load the current online lobby roster from Supabase.
*/
async function loadOnlineLobbyRoster(gameId) {

    if (!gameId) {
        return false;
    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from('game_players')
            .select('*')
            .eq(
                'game_id',
                gameId
            )
            .eq(
                'status',
                'active'
            )
            .order(
                'shooting_order',
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            'Could not load online lobby roster:',
            error
        );

        return false;
    }


    state.config.players =
        data.map(player => ({

            /*
             * game_players.id is ideal as the lobby ID
             * because it uniquely identifies this person's
             * participation in this particular match.
             */
            id:
                player.id,

            userId:
                player.user_id,

            name:
                player.display_name,

            isGuest:
                !player.user_id

        }));


    state.config.playerCount =
        state.config.players.length;


    saveState();

    return true;
}


async function refreshLobbyPlayers() {

    const gameId =
        state.config.onlineGameId;

    if (!gameId) {

        showToast(
            'No online lobby is active.',
            'warning'
        );

        return;
    }


    const success =
        await loadOnlineLobbyRoster(
            gameId
        );


    if (!success) {

        showToast(
            'Could not refresh lobby.',
            'danger'
        );

        return;
    }


    render();


    showToast(
        `${state.config.players.length} players in lobby.`,
        'success'
    );
}


/**
* Restore the current online lobby after the app loads
* or returns from the background.
* Supabase is authoritative for the lobby roster.
*/
async function restoreOnlineLobby() {

    if (
        !currentUser ||
        !state.config.isOnline ||
        !state.config.onlineGameId
    ) {
        return;
    }

    const gameId =
        state.config.onlineGameId;


    /*
     * Verify the cloud game still exists and determine
     * its current status and this user's role.
     */
    const {
        data: gameData,
        error: gameError
    } =
        await supabaseClient
            .from('games')
            .select('*')
            .eq('id', gameId)
            .maybeSingle();


    if (gameError) {

        console.error(
            'Could not restore online game:',
            gameError
        );

        return;
    }


    /*
     * The saved local lobby no longer represents a
     * waiting/active cloud game.
     */
    if (
        !gameData ||
        gameData.status === 'completed' ||
        gameData.status === 'cancelled'
    ) {

        state.config.isOnline = false;
        state.config.onlineGameId = null;
        state.config.joinCode = null;
        state.config.onlineRole = null;

        saveState();
        render();

        return;
    }


    state.config.joinCode =
        gameData.join_code;

    state.config.onlineRole =
        gameData.host_id === currentUser.id
            ? 'host'
            : 'player';


    /*
     * Always replace the locally cached roster with
     * the current Supabase roster.
     */
    await loadOnlineLobbyRoster(
        gameId
    );


    /*
     * Re-establish Realtime after app/background lifecycle changes.
     */
    await subscribeToOnlineLobby(
        gameId
    );

    await subscribeToOnlineGame(
        gameId
    );


    saveState();
    render();
}


function openLeavePlayerModal(playerId) {
    if (!state.game) return;

    const player = getPlayerById(playerId);

    if (!player || player.active === false) {
        return;
    }

    const activePlayers = state.game.players.filter(
        p => p.active !== false
    );

    if (activePlayers.length <= 2) {
        showToast(
            'At least 2 active players are required to continue.',
            'warning'
        );

        return;
    }

    const net = getAdjustedPlayerNetBalance(playerId);

    const transactions =
        getPlayerExitSettlement(playerId);


    let settlementHtml = '';

    if (transactions.length === 0) {

        settlementHtml = `
                <div class="bg-slatefelt-950 border border-slatefelt-700 rounded-xl p-4 text-center">
                <div class="text-sm text-slate-400">
                    No payment required.
                </div>

                <div class="text-lg font-extrabold text-white mt-1">
                    ${player.name} is even.
                </div>
                </div>
            `;

    } else {

        settlementHtml = transactions.map(tx => `
                <div class="flex items-center justify-between gap-3 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-3">

                <div class="text-sm text-slate-300">
                    <strong class="text-white">
                    ${tx.fromPlayerName}
                    </strong>

                    pays

                    <strong class="text-white">
                    ${tx.toPlayerName}
                    </strong>
                </div>

                <div class="font-extrabold text-emerald-400">
                    ${formatMoney(tx.amount)}
                </div>

                </div>
            `).join('');
    }


    openModal(`
            <div class="p-5 sm:p-6">

                <div class="flex items-start justify-between gap-4 mb-5">

                <div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                    Player Leaving
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                    ${player.name}
                    </h2>
                </div>

                <button
                    onclick="openManagePlayersModal()"
                    class="shrink-0 w-9 h-9 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-bold transition"
                >
                    ✕
                </button>

                </div>


                <div class="mb-5">
                <div class="text-xs text-slate-400">
                    Current Balance
                </div>

                <div class="text-2xl font-extrabold ${net > 0.005
            ? 'text-emerald-400'
            : net < -0.005
                ? 'text-rose-400'
                : 'text-white'
        }">
                    ${formatMoney(net, true)}
                </div>
                </div>


                <div class="mb-5">

                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Settle Before Leaving
                </h3>

                <div class="space-y-2">
                    ${settlementHtml}
                </div>

                </div>


                <div class="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 mb-5">

                <p class="text-xs text-amber-200 leading-relaxed">
                    Confirm the payments above have been settled before
                    removing this player from the active rotation.
                    The player's game history will be preserved.
                </p>

                </div>


                <div class="flex gap-2">

                <button
                    onclick="openManagePlayersModal()"
                    class="flex-1 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-bold text-sm transition"
                >
                    Cancel
                </button>

                <button
                    onclick="confirmPlayerLeave('${player.id}')"
                    class="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm transition"
                >
                    Settled & Leave
                </button>

                </div>

            </div>
            `);
}

/**
* Request permission from the host to leave an active
* online game.
*
* The player remains active until the host settles
* and confirms the departure.
*/
async function requestLeaveActiveGame() {

    if (
        !currentUser ||
        !state.game ||
        !state.game.isOnline ||
        !state.game.cloudGameId ||
        state.config.onlineRole !== 'player'
    ) {
        return;
    }


    const gameId =
        state.game.cloudGameId;


    const { error } =
        await supabaseClient
            .from('game_players')
            .update({
                leave_requested_at:
                    new Date().toISOString()
            })
            .eq(
                'game_id',
                gameId
            )
            .eq(
                'user_id',
                currentUser.id
            )
            .eq(
                'status',
                'active'
            );


    if (error) {

        console.error(
            'Could not request to leave game:',
            error
        );

        showToast(
            'Could not send leave request.',
            'danger'
        );

        return;
    }


    openPendingLeaveSettlement();
}


function openPendingLeaveSettlement() {

    if (!state.game || !currentUser) {
        return;
    }


    const player =
        state.game.players.find(
            item =>
                item.userId === currentUser.id
        );


    if (!player) {
        return;
    }


    const transactions =
        getPlayerExitSettlement(
            player.id
        );


    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                        Leave Request Sent
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                        Settle Up
                    </h2>

                    <p class="text-sm text-slate-400 mt-2">
                        This is your current settlement.
                        Complete these payments while waiting for the host to approve your departure.
                    </p>


                    ${transactions.length === 0
            ? `
                                <div class="mt-4 rounded-xl bg-slatefelt-850 border border-slatefelt-700 p-4">

                                    <div class="text-sm font-bold text-emerald-300">
                                        You are square.
                                    </div>

                                    <div class="text-xs text-slate-400 mt-1">
                                        No payment is currently required.
                                    </div>

                                </div>
                              `
            : `
                                <div class="space-y-2 mt-4">

                                    ${transactions.map(transaction => `
                                        <div class="flex items-center justify-between gap-3 rounded-xl bg-amber-950/20 border border-amber-500/30 px-3.5 py-3">

                                            <span class="text-sm text-slate-200">

                                                ${escapeHTML(transaction.fromPlayerName)}

                                                <span class="text-slate-500 mx-1">
                                                    pays
                                                </span>

                                                ${escapeHTML(transaction.toPlayerName)}

                                            </span>

                                            <span class="font-mono font-bold text-amber-300">
                                                ${formatMoney(transaction.amount)}
                                            </span>

                                        </div>
                                    `).join('')}

                                </div>
                              `
        }


                    <div class="mt-5 px-3 py-3 rounded-xl bg-blue-950/20 border border-blue-500/30">

                        <div class="flex items-center gap-2">

                            <span class="w-2 h-2 rounded-full bg-blue-400"></span>

                            <span class="text-xs font-bold text-blue-300">
                                Waiting for host approval
                            </span>

                        </div>

                        <p class="text-[11px] text-slate-400 mt-1">
                            You will remain in the live game until the host confirms that settlement is complete.
                        </p>

                    </div>


                    <button
                        onclick="closeModal()"
                        class="w-full mt-4 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-bold text-sm"
                    >
                        Return to Game
                    </button>

                </div>
            `);
}


async function confirmPlayerLeave(playerId) {
    if (!state.game) return;

    const player = getPlayerById(playerId);

    if (!player || player.active === false) {
        return;
    }


    /*
        * Recalculate the settlement one final time at confirmation.
        * Don't rely on amounts that were merely displayed earlier.
        */
    const transactions =
        getPlayerExitSettlement(playerId);


    if (!Array.isArray(state.game.exitSettlements)) {
        state.game.exitSettlements = [];
    }


    /*
        * Freeze the player's settlement at the moment of departure.
        */
    state.game.exitSettlements.push({
        id: 'exit_' + Date.now(),

        playerId: player.id,

        playerName: player.name,

        rackNumber: state.game.rackNumber,

        netAmount:
            getAdjustedPlayerNetBalance(player.id),

        transactions: transactions,

        settledAt:
            new Date().toISOString()
    });


    /*
        * Mark the player inactive.
        *
        * DO NOT remove the player from state.game.players.
        */
    player.active = false;

    player.leftAtRack =
        state.game.rackNumber;

    player.settledOnExit = true;


    /*
        * Clear pass-back state if the previous shooter
        * is the departing player.
        */
    if (
        state.game.previousShooterIndex !== null &&
        state.game.players[
            state.game.previousShooterIndex
        ]?.id === playerId
    ) {
        state.game.previousShooterIndex = null;
        state.game.canPassBack = false;
    }


    /*
        * If the player currently has the table,
        * advance immediately to the next active player.
        */
    const currentPlayer =
        state.game.players[
        state.game.currentShooterIndex
        ];

    if (currentPlayer?.id === playerId) {

        const nextIndex =
            getNextActiveIndex(
                state.game.currentShooterIndex
            );

        state.game.currentShooterIndex =
            nextIndex;

        state.game.previousShooterIndex =
            null;

        state.game.canPassBack = false;
    }


    /*
        * Record departure in the permanent history.
        */
    state.game.history.unshift({
        id: Date.now(),

        type: 'player_left',

        rack: state.game.rackNumber,

        playerId: player.id,

        playerName: player.name,

        timestamp:
            new Date().toLocaleTimeString(
                [],
                {
                    hour: '2-digit',
                    minute: '2-digit'
                }
            )
    });


    /*
     * If this is an online hosted game, update the player's
     * cloud participation row before publishing game_state.
     */
    if (
        state.game.isOnline &&
        state.game.cloudGameId &&
        state.config.onlineRole === 'host' &&
        player.userId
    ) {

        const { error: participationError } =
            await supabaseClient
                .from('game_players')
                .update({
                    status: 'left',
                    left_at: new Date().toISOString(),
                    leave_requested_at: null
                })
                .eq(
                    'game_id',
                    state.game.cloudGameId
                )
                .eq(
                    'user_id',
                    player.userId
                );


        if (participationError) {

            console.error(
                'Could not complete cloud player departure:',
                participationError
            );

            showToast(
                'Player was settled locally, but the online departure could not be completed.',
                'warning'
            );
        }
    }


    /*
     * Save locally and publish the new game state.
     *
     * The departing player is still present in state.game.players,
     * but active is now false and the exit settlement is retained.
     */
    await saveAndSyncGame();


    /*
     * Refresh the host's live screen.
     */
    render();


    /*
     * Reopen player management for the host.
     */
    openManagePlayersModal();


    showToast(
        `${player.name} settled and left the game.`,
        'success'
    );

}


function addPlayerToLiveGame() {
    if (!state.game) return;

    const input = document.getElementById('live-add-player-name');

    if (!input) return;

    const name = input.value.trim();

    if (!name) {
        showToast('Enter a player name first.', 'warning');
        return;
    }


    /*
        * Prevent duplicate active player names.
        */
    const duplicate = state.game.players.some(player =>
        player.active !== false &&
        player.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
        showToast(
            `${name} is already in the game.`,
            'warning'
        );

        return;
    }


    /*
        * Generate a unique ID that won't collide with the
        * players created when the game originally started.
        */
    const playerId =
        'p_live_' +
        Date.now() +
        '_' +
        Math.random().toString(36).slice(2, 7);


    const newPlayer = {
        id: playerId,
        name: name,

        eliminated: false,

        active: true,

        joinedAtRack: state.game.rackNumber,

        leftAtRack: null,

        settledOnExit: false
    };


    /*
        * Add the player to the permanent game player list.
        */
    state.game.players.push(newPlayer);


    /*
        * Extend the pairwise ledger.
        *
        * The new player starts at $0.00 and therefore owes
        * nothing for money balls made before joining.
        */
    state.game.ledger[playerId] = {};

    state.game.players.forEach(other => {

        if (other.id === playerId) {
            return;
        }

        /*
            * New player -> existing player
            */
        state.game.ledger[playerId][other.id] = 0;


        /*
            * Existing player -> new player
            */
        if (!state.game.ledger[other.id]) {
            state.game.ledger[other.id] = {};
        }

        state.game.ledger[other.id][playerId] = 0;
    });


    /*
        * Record the event in game history.
        */
    state.game.history.unshift({
        id: Date.now(),

        type: 'player_joined',

        rack: state.game.rackNumber,

        playerId: newPlayer.id,

        playerName: newPlayer.name,

        timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })
    });


    saveState();

    /*
        * Refresh the live game screen first so the new player
        * immediately appears in the standings and rotation.
        */
    render();

    /*
        * Refresh the player-management modal so the newly
        * added player appears immediately.
        */
    openManagePlayersModal();

    showToast(
        `${newPlayer.name} joined the game!`,
        'success'
    );
}


function openSetupGuestModal() {

    if (
        !state.config.isOnline ||
        !state.config.onlineGameId
    ) {
        return;
    }

    if (state.config.players.length >= 12) {
        showToast(
            'This lobby already has 12 players.',
            'warning'
        );
        return;
    }

    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="flex items-start justify-between gap-4 mb-5">

                        <div>
                            <div class="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                                Online Lobby
                            </div>

                            <h2 class="text-xl font-extrabold text-white">
                                Add Guest
                            </h2>
                        </div>

                        <button
                            onclick="closeModal()"
                            class="w-9 h-9 rounded-xl bg-slatefelt-800 border border-slatefelt-700 text-slate-300 font-bold"
                        >
                            ✕
                        </button>

                    </div>

                    <label class="block text-xs text-slate-400 font-semibold mb-2">
                        Guest Name
                    </label>

                    <input
                        id="setup-guest-name"
                        type="text"
                        maxlength="30"
                        placeholder="Enter player name"
                        class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-white"
                    />

                    <button
                        onclick="addGuestToOnlineLobby()"
                        class="w-full mt-3 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm transition"
                    >
                        Add Guest
                    </button>

                </div>
            `);
}


async function addGuestToOnlineLobby() {

    const input =
        document.getElementById('setup-guest-name');

    const name =
        input?.value.trim() || '';

    if (!name) {
        showToast(
            'Enter a guest name.',
            'warning'
        );
        return;
    }

    if (state.config.players.length >= 12) {
        showToast(
            'This lobby already has 12 players.',
            'warning'
        );
        return;
    }

    const duplicate =
        state.config.players.some(
            player =>
                player.name.toLowerCase() ===
                name.toLowerCase()
        );

    if (duplicate) {
        showToast(
            `${name} is already in the lobby.`,
            'warning'
        );
        return;
    }


    const shootingOrder =
        state.config.players.length + 1;


    const {
        data,
        error
    } =
        await supabaseClient
            .from('game_players')
            .insert({
                game_id:
                    state.config.onlineGameId,

                user_id:
                    null,

                display_name:
                    name,

                shooting_order:
                    shootingOrder,

                status:
                    'active'
            })
            .select()
            .single();


    if (error) {

        console.error(
            'Could not add guest:',
            error
        );

        showToast(
            'Could not add guest to the online lobby.',
            'danger'
        );

        return;
    }


    state.config.players.push({
        id:
            data.id,

        userId:
            null,

        name:
            data.display_name,

        isGuest:
            true
    });


    state.config.playerCount =
        state.config.players.length;


    saveState();

    closeModal();

    render();


    showToast(
        `${name} added to the lobby.`,
        'success'
    );
}


function confirmAbandonOnlineLobby() {

    if (
        !state.config.isOnline ||
        !state.config.onlineGameId
    ) {
        return;
    }

    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                        Online Lobby
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                        Abandon Lobby?
                    </h2>

                    <p class="text-sm text-slate-400 mt-2 leading-relaxed">
                        This lobby has not started yet.
                        The join code will be closed and this game
                        will be marked as cancelled.
                    </p>

                    <div class="flex gap-2 mt-5">

                        <button
                            onclick="closeModal()"
                            class="flex-1 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-bold"
                        >
                            Keep Lobby
                        </button>

                        <button
                            onclick="abandonOnlineLobby()"
                            class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold"
                        >
                            Abandon
                        </button>

                    </div>

                </div>
            `);
}


async function abandonOnlineLobby() {

    const gameId =
        state.config.onlineGameId;

    if (!gameId) {
        closeModal();
        return;
    }


    /*
     * Mark the cloud lobby cancelled rather than completed.
     *
     * completed = a match was actually played.
     * cancelled = lobby was abandoned before play began.
     */
    const { error } =
        await supabaseClient
            .from('games')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString()
            })
            .eq('id', gameId);


    if (error) {

        console.error(
            'Could not abandon online lobby:',
            error
        );

        showToast(
            'Could not abandon the online lobby.',
            'danger'
        );

        return;
    }


    /*
     * Return setup to normal offline mode.
     */
    state.config.isOnline = false;
    state.config.onlineGameId = null;
    state.config.joinCode = null;
    state.config.onlineRole = null;


    /*
     * Restore a normal four-player offline setup.
     */
    state.config.playerCount = 4;

    state.config.players = [
        {
            id: 'p1',

            name:
                currentProfile?.display_name ||
                'Player 1',

            userId:
                currentUser?.id || null,

            isGuest:
                !currentUser
        },

        {
            id: 'p2',
            name: 'Player 2'
        },

        {
            id: 'p3',
            name: 'Player 3'
        },

        {
            id: 'p4',
            name: 'Player 4'
        }
    ];


    saveState();

    closeModal();

    render();


    showToast(
        'Online lobby abandoned.',
        'info'
    );
}


function confirmLeaveOnlineLobby() {

    if (
        !state.config.isOnline ||
        state.config.onlineRole !== 'player'
    ) {
        console.warn(
            'Leave Lobby blocked:',
            state.config.isOnline,
            state.config.onlineRole
        );

        return;
    }


    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                        Online Lobby
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                        Leave Lobby?
                    </h2>

                    <p class="text-sm text-slate-400 mt-2">
                        You will leave this lobby. The host and
                        remaining players can continue waiting.
                    </p>

                    <div class="flex gap-2 mt-5">

                        <button
                            onclick="closeModal()"
                            class="flex-1 py-2.5 rounded-xl bg-slatefelt-800 border border-slatefelt-700 text-slate-300 font-bold"
                        >
                            Stay
                        </button>

                        <button
                            onclick="leaveOnlineLobby()"
                            class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold"
                        >
                            Leave
                        </button>

                    </div>

                </div>
            `);
}


/**
* Show the departing player the settlement approved by
* the host, then return the device to normal setup.
*/
async function handleOnlinePlayerDeparture(
    incomingGameState,
    currentParticipant
) {

    const gameId =
        state.game?.cloudGameId ||
        state.config.onlineGameId;


    if (gameId) {

        const {
            data: cloudGame,
            error: cloudGameError
        } =
            await supabaseClient
                .from('games')
                .select('game_state')
                .eq(
                    'id',
                    gameId
                )
                .maybeSingle();


        if (cloudGameError) {

            console.error(
                'Could not load final departure settlement:',
                cloudGameError
            );

        } else if (cloudGame?.game_state) {

            incomingGameState =
                cloudGame.game_state;


            currentParticipant =
                incomingGameState.players.find(
                    player =>
                        player.userId ===
                        currentUser?.id
                ) || currentParticipant;
        }
    }

    /*
     * Find this player's final frozen exit settlement.
     */
    const exitSettlements =
        Array.isArray(
            incomingGameState.exitSettlements
        )
            ? incomingGameState.exitSettlements
            : [];


    const settlement =
        [...exitSettlements]
            .reverse()
            .find(
                item =>
                    item.playerId ===
                    currentParticipant.id
            );


    /*
     * Stop listening to the completed participation.
     */
    if (onlineLobbyChannel) {

        await supabaseClient.removeChannel(
            onlineLobbyChannel
        );

        onlineLobbyChannel = null;
    }


    if (onlineGameChannel) {

        await supabaseClient.removeChannel(
            onlineGameChannel
        );

        onlineGameChannel = null;
    }


    /*
     * Clear this device's online match state.
     */
    state.game = null;

    state.view =
        'setup';

    activeTab =
        'table';

    state.config.isOnline =
        false;

    state.config.onlineGameId =
        null;

    state.config.joinCode =
        null;

    state.config.onlineRole =
        null;


    /*
     * Restore ordinary offline setup.
     */
    state.config.playerCount =
        4;

    state.config.players = [
        {
            id: 'p1',
            name:
                currentProfile?.display_name ||
                'Player 1',
            userId:
                currentUser?.id || null,
            isGuest:
                !currentUser
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


    saveState();

    render();


    /*
     * Show the approved settlement result.
     */
    const transactions =
        Array.isArray(
            settlement?.transactions
        )
            ? settlement.transactions
            : [];


    openModal(`
               <div class="p-5 sm:p-6">

                   <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-1">
                        Settlement Complete
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                       You Left the Game
                   </h2>

                    <p class="text-sm text-slate-400 mt-2">
                       The host approved your departure and recorded
                       the following settlement.
                    </p>


                    ${transactions.length === 0
            ? `
                                <div class="mt-4 rounded-xl bg-slatefelt-850 border border-slatefelt-700 p-4 text-sm text-slate-300">
                                    You were already square. No payment was required.
                                </div>
                              `
            : `
                                <div class="space-y-2 mt-4">

                                    ${transactions.map(transaction => `
                                        <div class="flex items-center justify-between gap-3 rounded-xl bg-blue-950/20 border border-blue-500/30 px-3.5 py-3">

                                            <span class="text-sm text-slate-200">
                                                ${escapeHTML(
                transaction.fromPlayerName
            )}

                                                <span class="text-slate-500 mx-1">
                                                    pays
                                                </span>

                                                ${escapeHTML(
                transaction.toPlayerName
            )}
                                            </span>

                                            <span class="font-mono font-bold text-blue-300">
                                                ${formatMoney(
                transaction.amount
            )}
                                            </span>

                                        </div>
                                    `).join('')}

                                </div>
                              `
        }


                    <button
                        onclick="closeModal()"
                        class="w-full mt-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                    >
                        Return to Home
                    </button>

                </div>
            `);
}


async function leaveOnlineLobby() {

    if (
        !currentUser ||
        !state.config.onlineGameId ||
        state.config.onlineRole !== 'player'
    ) {
        closeModal();
        return;
    }

    const gameId =
        state.config.onlineGameId;


    const { error } =
        await supabaseClient
            .from('game_players')
            .update({
                status: 'left',
                left_at: new Date().toISOString()
            })
            .eq(
                'game_id',
                gameId
            )
            .eq(
                'user_id',
                currentUser.id
            );


    if (error) {

        console.error(
            'Could not leave online lobby:',
            error
        );

        showToast(
            'Could not leave the lobby.',
            'danger'
        );

        return;
    }


    /*
     * Disconnect this device from the cloud lobby.
     */
    if (onlineLobbyChannel) {

        await supabaseClient.removeChannel(
            onlineLobbyChannel
        );

        onlineLobbyChannel = null;
    }


    if (onlineGameChannel) {

        await supabaseClient.removeChannel(
            onlineGameChannel
        );

        onlineGameChannel = null;
    }


    /*
     * Clear lobby identity from this phone.
     */
    state.config.isOnline = false;
    state.config.onlineGameId = null;
    state.config.joinCode = null;
    state.config.onlineRole = null;


    /*
     * Restore a normal offline setup.
     */
    state.config.playerCount = 4;

    state.config.players = [
        {
            id: 'p1',
            name:
                currentProfile?.display_name ||
                'Player 1',
            userId:
                currentUser.id,
            isGuest: false
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


    saveState();

    closeModal();

    render();


    showToast(
        'You left the online lobby.',
        'info'
    );
}


async function handleCompletedOnlineGame(
    updatedGame
) {

    const finalGameState =
        updatedGame.game_state ||
        state.game;


    if (!finalGameState) {
        return;
    }


    /*
     * Store the final state long enough to calculate
     * and display the participant's settlement.
     */
    state.game =
        finalGameState;


    const currentParticipant =
        state.game.players.find(
            player =>
                player.userId ===
                currentUser?.id
        );


    const simplified =
        getSimplifiedSettlements();


    /*
     * Disconnect from the completed cloud match.
     */
    if (onlineLobbyChannel) {

        await supabaseClient.removeChannel(
            onlineLobbyChannel
        );

        onlineLobbyChannel = null;
    }


    if (onlineGameChannel) {

        await supabaseClient.removeChannel(
            onlineGameChannel
        );

        onlineGameChannel = null;
    }


    /*
     * Return this device to normal setup BEFORE the
     * final settlement receipt is displayed.
     */
    state.game = null;

    state.view = 'setup';

    activeTab = 'table';

    state.config.isOnline = false;
    state.config.onlineGameId = null;
    state.config.joinCode = null;
    state.config.onlineRole = null;

    state.config.playerCount = 4;

    state.config.players = [
        {
            id: 'p1',
            name:
                currentProfile?.display_name ||
                'Player 1',
            userId:
                currentUser?.id || null,
            isGuest:
                !currentUser
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


    saveState();

    render();


    openModal(`
                <div class="p-5 sm:p-6">

                    <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                        Match Complete
                    </div>

                    <h2 class="text-xl font-extrabold text-white">
                        Final Settlement
                    </h2>

                    ${currentParticipant
            ? `
                                <div class="mt-4 rounded-xl bg-slatefelt-950 border border-slatefelt-700 p-4">

                                    <div class="text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        ${escapeHTML(currentParticipant.name)}
                                    </div>

                                    <div class="text-sm text-slate-300 mt-1">
                                        The host has ended the match.
                                    </div>

                                </div>
                              `
            : ''
        }


                    ${simplified.length === 0
            ? `
                                <div class="mt-4 rounded-xl bg-slatefelt-850 border border-slatefelt-700 p-4 text-sm text-emerald-300">
                                    Everyone is square. No remaining payments are required.
                                </div>
                              `
            : `
                                <div class="space-y-2 mt-4">

                                    ${simplified.map(item => `
                                        <div class="flex items-center justify-between gap-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 px-3.5 py-3">

                                            <span class="text-sm text-slate-200">
                                                ${escapeHTML(item.from.name)}
                                                <span class="text-slate-500 mx-1">pays</span>
                                                ${escapeHTML(item.to.name)}
                                            </span>

                                            <span class="font-mono font-bold text-emerald-300">
                                                ${formatMoney(item.amount)}
                                            </span>

                                        </div>
                                    `).join('')}

                                </div>
                              `
        }


                    <button
                        onclick="closeModal()"
                        class="w-full mt-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                    >
                        Return to Home
                    </button>

                </div>
            `);
}

/**
* Publish the host's current Ring Game state to Supabase.
*/
async function publishOnlineGameState() {

    if (
        !state.game ||
        !state.game.isOnline ||
        !state.game.cloudGameId ||
        state.config.onlineRole !== 'host'
    ) {
        return false;
    }


    const { error } =
        await supabaseClient
            .from('games')
            .update({
                game_state: state.game
            })
            .eq(
                'id',
                state.game.cloudGameId
            );


    if (error) {

        console.error(
            'Could not publish online game state:',
            error
        );

        showToast(
            'Could not sync the online game.',
            'warning'
        );

        return false;
    }


    return true;
}


/**
* Save the local game and synchronize it to Supabase
* when this device is hosting an online match.
*/
async function saveAndSyncGame() {

    saveState();

    if (
        state.game &&
        state.game.isOnline &&
        state.config.onlineRole === 'host'
    ) {
        await publishOnlineGameState();
    }
}


function openEndGameModal() {
    if (!state.game) return;

    const simplified = getSimplifiedSettlements();
    const pairwise = getPairwiseNetDebts();

    const exitSettlements =
        Array.isArray(state.game.exitSettlements)
            ? state.game.exitSettlements
            : [];


    /*
        * Build player statistics.
        *
        * gameNet:
        *   Complete historical result from actual game play.
        *
        * remainingNet:
        *   Amount still requiring settlement after any exit
        *   settlements that have already been paid.
        */
    const statsByPlayer = {};

    state.game.players.forEach(player => {
        statsByPlayer[player.id] = {
            id: player.id,
            name: player.name,

            ballsCount: 0,
            racksBroken: 0,

            gameNet:
                getPlayerNetBalance(player.id),

            remainingNet:
                getAdjustedPlayerNetBalance(player.id),

            active:
                player.active !== false,

            settledOnExit:
                player.settledOnExit === true,

            leftAtRack:
                player.leftAtRack || null
        };
    });


    /*
        * Count racks broken and money balls made.
        */
    state.game.racks.forEach(rack => {

        if (statsByPlayer[rack.breakerId]) {
            statsByPlayer[rack.breakerId].racksBroken += 1;
        }

        rack.pocketedBalls.forEach(pocketedBall => {

            if (statsByPlayer[pocketedBall.shooterId]) {
                statsByPlayer[pocketedBall.shooterId]
                    .ballsCount += 1;
            }

        });
    });


    const totalBallsPocketed =
        state.game.racks.reduce(
            (sum, rack) =>
                sum + rack.pocketedBalls.length,
            0
        );


    /*
        * Rank the standings by the actual game result.
        * A player who already settled still keeps the
        * winnings/losses earned during play.
        */
    const rankedPlayers =
        Object.values(statsByPlayer)
            .sort(
                (a, b) =>
                    b.gameNet - a.gameNet
            );


    /*
        * ---------------------------------------------------------
        * FINAL SETTLEMENT MODAL
        * ---------------------------------------------------------
        */
    const html = `
            <div class="p-5 sm:p-6">


                <!-- Header -->
                <div class="flex items-center justify-between border-b border-slatefelt-700 pb-4">

                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Match Summary
                    </span>

                    <h2 class="text-xl font-extrabold text-white mt-0.5">
                    Final Settlement
                    </h2>
                </div>

                <button
                    onclick="closeModal()"
                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slatefelt-800"
                >
                    <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                    </svg>
                </button>

                </div>


                <!-- Match Totals -->
                <div class="grid grid-cols-2 gap-3 my-4">

                <div class="bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">

                    <div class="text-xs text-slate-400">
                    Racks Played
                    </div>

                    <div class="text-xl font-extrabold text-white font-mono mt-0.5">
                    ${state.game.rackNumber}
                    </div>

                </div>


                <div class="bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">

                    <div class="text-xs text-slate-400">
                    Money Balls Pocketed
                    </div>

                    <div class="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                    ${totalBallsPocketed}
                    </div>

                </div>

                </div>


                <!-- Final Standings -->
                <div class="mb-5">

                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Final Standings
                </h3>

                <div class="space-y-2">

                    ${rankedPlayers.map((player, idx) => {

        const gameNetColor =
            player.gameNet > 0.005
                ? 'text-emerald-400'
                : player.gameNet < -0.005
                    ? 'text-rose-400'
                    : 'text-slate-300';


        const remainingColor =
            player.remainingNet > 0.005
                ? 'text-emerald-400'
                : player.remainingNet < -0.005
                    ? 'text-rose-400'
                    : 'text-slate-400';


        const stackText =
            state.game.useBuyIn
                ? `Stack: ${formatMoney(
                    state.game.buyInAmount +
                    player.gameNet
                )}`
                : '';


        return `
                        <div
                        class="bg-slatefelt-850 px-3.5 py-3 rounded-xl border ${player.settledOnExit
                ? 'border-blue-500/30'
                : 'border-slatefelt-700/60'
            }"
                        >

                        <div class="flex items-start justify-between gap-3">

                            <div class="flex items-start gap-2.5 min-w-0">

                            <span
                                class="w-6 h-6 rounded-full bg-slatefelt-700 text-xs font-bold flex items-center justify-center text-slate-200 shrink-0"
                            >
                                ${idx + 1}
                            </span>


                            <div class="min-w-0">

                                <div class="font-semibold text-sm text-white flex flex-wrap items-center gap-2">

                                <span>
                                    ${escapeHTML(player.name)}
                                </span>

                                ${player.settledOnExit
                ? `
                                        <span
                                        class="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[9px] font-bold uppercase tracking-wider"
                                        >
                                        Settled & Left
                                        </span>
                                    `
                : ''
            }

                                </div>


                                <div class="text-[11px] text-slate-400 mt-0.5">

                                ${player.ballsCount}
                                money ball${player.ballsCount === 1
                ? ''
                : 's'
            }

                                &bull;

                                ${player.racksBroken}
                                break${player.racksBroken === 1
                ? ''
                : 's'
            }

                                ${stackText
                ? ` &bull; ${stackText}`
                : ''
            }

                                </div>


                                ${player.settledOnExit
                ? `
                                    <div class="text-[11px] text-blue-300 mt-1">
                                        Settled when leaving Rack #${player.leftAtRack || '?'
                }
                                    </div>
                                    `
                : ''
            }

                            </div>

                            </div>


                            <!-- Player Financial Result -->
                            <div class="text-right shrink-0">

                            <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                                Game Result
                            </div>

                            <div class="font-mono font-bold text-base ${gameNetColor}">
                                ${formatMoney(
                player.gameNet,
                true
            )}
                            </div>


                            ${Math.abs(
                player.remainingNet
            ) > 0.005

                ? `
                                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold mt-1">
                                    Remaining
                                    </div>

                                    <div class="font-mono font-bold text-xs ${remainingColor}">
                                    ${formatMoney(
                    player.remainingNet,
                    true
                )}
                                    </div>
                                `

                : `
                                    <div class="text-[10px] ${player.settledOnExit
                    ? 'text-blue-300'
                    : 'text-slate-400'
                } font-bold mt-1">

                                    ${player.settledOnExit
                    ? 'Paid'
                    : 'Square'
                }

                                    </div>
                                `
            }

                            </div>

                        </div>

                        </div>
                    `;

    }).join('')}

                </div>

                </div>


                <!-- Previously Completed Exit Settlements -->
                ${exitSettlements.length > 0
            ? `
                    <div class="mb-5">

                        <h3 class="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">
                        Already Settled
                        </h3>


                        <div class="space-y-3">

                        ${exitSettlements.map(exitSettlement => {

                const transactions =
                    Array.isArray(
                        exitSettlement.transactions
                    )
                        ? exitSettlement.transactions
                        : [];


                return `
                            <div
                                class="bg-blue-950/20 border border-blue-500/30 rounded-xl p-3.5"
                            >

                                <div class="flex items-center justify-between gap-3 mb-2">

                                <div>

                                    <div class="font-bold text-blue-200 text-sm">
                                    ✓ ${escapeHTML(
                    exitSettlement.playerName
                )} settled and left
                                    </div>

                                    <div class="text-[11px] text-slate-400 mt-0.5">
                                    Rack #${exitSettlement.rackNumber ||
                    '?'
                    }
                                    </div>

                                </div>


                                <div class="font-mono font-bold text-blue-300">

                                    ${formatMoney(
                        Math.abs(
                            exitSettlement.netAmount ||
                            0
                        )
                    )}

                                </div>

                                </div>


                                ${transactions.length === 0
                        ? `
                                    <div class="text-xs text-slate-400">
                                        Player was already even.
                                        No payment was required.
                                    </div>
                                    `

                        : `
                                    <div
                                        class="space-y-1.5 pt-2 border-t border-blue-500/20"
                                    >

                                        ${transactions.map(transaction => `

                                        <div
                                            class="flex items-center justify-between gap-3 text-xs"
                                        >

                                            <span class="text-slate-300">

                                            ${escapeHTML(
                            transaction.fromPlayerName
                        )}

                                            <span class="text-slate-500 mx-1">
                                                paid
                                            </span>

                                            ${escapeHTML(
                            transaction.toPlayerName
                        )}

                                            </span>


                                            <span class="font-mono font-bold text-blue-300">

                                            ${formatMoney(
                            transaction.amount
                        )}

                                            </span>

                                        </div>

                                        `).join('')}

                                    </div>
                                    `
                    }

                            </div>
                            `;

            }).join('')}

                        </div>

                    </div>
                    `

            : ''
        }


                <!-- Remaining Payouts -->
                <div class="mb-5">

                <div class="flex items-start justify-between gap-2 mb-2">

                    <div>

                    <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Remaining Payouts
                    </h3>

                    <p class="text-[11px] text-slate-400 mt-0.5">
                        Excludes payments already completed when players left.
                    </p>

                    </div>


                    <button
                    onclick="copySettlementSummary()"
                    class="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0"
                    >

                    <svg
                        class="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>

                    Copy Text

                    </button>

                </div>


                ${simplified.length === 0
            ? `
                        <div
                        class="bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl p-4 text-center text-sm text-slate-400"
                        >
                        Everyone is square! No remaining payouts needed.
                        </div>
                    `

            : `
                        <div class="space-y-2">

                        ${simplified.map(settlement => `

                            <div
                            class="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl"
                            >

                            <div class="text-sm text-slate-200">

                                <span class="font-bold text-rose-300">
                                ${escapeHTML(
                settlement.from.name
            )}
                                </span>

                                <span class="text-slate-400 mx-1.5">
                                pays
                                </span>

                                <span class="font-bold text-emerald-300">
                                ${escapeHTML(
                settlement.to.name
            )}
                                </span>

                            </div>


                            <span
                                class="font-mono font-extrabold text-emerald-400 text-base"
                            >
                                ${formatMoney(
                settlement.amount
            )}
                            </span>

                            </div>

                        `).join('')}

                        </div>
                    `
        }

                </div>


                <!-- Remaining Direct Pairwise Debts -->
                ${pairwise.length > 0
            ? `
                    <details
                        class="mb-5 bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl p-3"
                    >

                        <summary
                        class="text-xs font-semibold text-slate-300 cursor-pointer select-none"
                        >
                        View Remaining Direct Debts
                        (${pairwise.length})
                        </summary>


                        <div
                        class="mt-2.5 space-y-1.5 pt-2 border-t border-slatefelt-700/60"
                        >

                        ${pairwise.map(debt => `

                            <div
                            class="flex justify-between text-xs text-slate-300"
                            >

                            <span>
                                ${escapeHTML(
                debt.from.name
            )}
                                &rarr;
                                ${escapeHTML(
                debt.to.name
            )}
                            </span>

                            <span
                                class="font-mono font-semibold text-slate-200"
                            >
                                ${formatMoney(
                debt.amount
            )}
                            </span>

                            </div>

                        `).join('')}

                        </div>

                    </details>
                    `

            : ''
        }


                <!-- Action Buttons -->
                <div class="flex flex-col sm:flex-row gap-2.5 pt-2">

                <button
                    onclick="closeModal()"
                    class="flex-1 py-3 px-4 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 text-slate-200 font-semibold text-sm transition"
                >
                    Back to Table
                </button>


                <button
                    onclick="resetToSetup()"
                    class="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition shadow-lg"
                >
                    End Match & New Setup
                </button>

                </div>


            </div>
            `;


    openModal(html);
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


function copySettlementSummary() {
    if (!state.game) return;
    const simplified = getSimplifiedSettlements();
    const lines = [
        `🎱 RingGame Pro Settlement (${state.config.format.toUpperCase()} - ${state.game.rackNumber} Racks)`,
        '-----------------------------------'
    ];
    state.game.players.forEach(p => {
        const net = getPlayerNetBalance(p.id);
        lines.push(`${p.name}: ${formatMoney(net, true)}`);
    });
    lines.push('');
    lines.push('💸 Settle Up:');
    if (simplified.length === 0) {
        lines.push('All square ($0)!');
    } else {
        simplified.forEach(s => {
            lines.push(`• ${s.from.name} pays ${s.to.name} ${formatMoney(s.amount)}`);
        });
    }


    const text = lines.join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Settlement summary copied to clipboard!', 'success');
    } catch (err) {
        showToast('Unable to copy text.', 'warning');
    }
    document.body.removeChild(textarea);
}


function handleDragStart(e, index) {
    dragSourceIndex = index;
    e.dataTransfer.effectAllowed = 'move';
}


function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}


function handleDrop(e, targetIndex) {
    e.preventDefault();
    if (dragSourceIndex === null || dragSourceIndex === targetIndex) return;
    const list = state.config.players;
    const [moved] = list.splice(dragSourceIndex, 1);
    list.splice(targetIndex, 0, moved);
    dragSourceIndex = null;
    saveState();
    render();
}


function switchTab(tab) {
    activeTab = tab;
    render();
}


/**
* MAIN RENDER CONTROLLER
*/
function render() {
    const root = document.getElementById('app-root');
    const headerActions = document.getElementById('header-actions');
    const subtitle = document.getElementById('header-subtitle');

    // Rules button is available from every screen.
    const rulesButton = `
            <button
                onclick="openRulesModal()"
                class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
            >
                <span class="text-emerald-400 font-black">?</span>
                Rules
            </button>
            `;

    const playersButton = `
                <button
                onclick="openManagePlayersModal()"
                class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
                >
                Players
                </button>
            `;

    const accountButton = `
              <button
                onclick="openAccountModal()"
                class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-semibold text-xs transition"
              >
                ${currentProfile
            ? escapeHTML(currentProfile.display_name)
            : 'Account'
        }
              </button>
            `;

    if (state.view === 'live' && state.game) {

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
                    onclick="requestLeaveActiveGame()"
                    class="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 font-semibold text-xs transition">
                    Leave Game
                </button>

                ` : `
                ${rulesButton}
                ${playersButton}
                ${accountButton}

                <button
                    onclick="openEndGameModal()"
                    class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow"
                >
                    Settle Up
                </button>

                <button
                    onclick="confirmResetModal()"
                    class="px-3 py-1.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-semibold text-xs transition"
                >
                    New Game
                </button>
              `;


        root.innerHTML =
            renderLiveView();
    } else {

        subtitle.textContent = `Billiards Ring Game Tracker • v${APP_VERSION}`;

        headerActions.innerHTML = `
                ${rulesButton}
                ${accountButton}
            `;

        root.innerHTML = renderSetupView();

        const startBtn = document.getElementById('start-match-btn');

        if (startBtn) {
            startBtn.onclick = null;

            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                startMatch();
            });
        }
    }
}


document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') {
        closeModal();
    }
});

/*
 * ---------------------------------------------------------
 * INITIAL APPLICATION STARTUP
 * ---------------------------------------------------------
 */

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
loadCurrentUser();


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
