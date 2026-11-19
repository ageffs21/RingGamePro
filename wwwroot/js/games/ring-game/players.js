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
                              onclick="copyJoinCode(state.config?.joinCode)"
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
    await disconnectSessionChannels();


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
