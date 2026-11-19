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


function openActiveGameJoinRequestModal(pendingPlayer) {
    const safePlayerId =
        escapeJavaScriptString(pendingPlayer.id);

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
                    onclick="declineActiveGameJoinRequest('${safePlayerId}')"
                    class="py-3 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 font-bold text-sm"
                >
                    Decline
                </button>


                <button
                    type="button"
                    onclick="approveActiveGameJoinRequest('${safePlayerId}')"
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
 * Convert the currently running local Ring Game into an
 * active online game.
 *
 * This does not create a waiting setup lobby. The current
 * Ring Game state is published immediately so additional
 * players can request to join the live match.
 */
async function makeCurrentGameOnline() {

    if (!state.game) {
        showToast(
            'No active Ring Game is available.',
            'warning'
        );

        return;
    }


    /*
     * The game is already online. Open the existing
     * player-management screen instead of creating
     * another cloud game.
     */
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


    /*
     * Try several join codes in the unlikely event that
     * a generated code is already in use.
     */
    for (let attempt = 0; attempt < 5; attempt++) {

        const joinCode =
            generateJoinCode();


        /*
         * Create the cloud game directly as active.
         *
         * A running local Ring Game must not be published
         * as a waiting setup lobby.
         */
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

                    status:
                        'active'
                })
                .select()
                .single();


        if (gameError) {

            /*
             * Generate another code when this one already
             * exists.
             */
            if (gameError.code === '23505') {
                continue;
            }

            console.error(
                'Could not create active online game:',
                gameError
            );

            showToast(
                'Could not create the online game.',
                'danger'
            );

            return;
        }


        /*
         * Add the signed-in host as the first active
         * cloud participant.
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
                'Could not add the host to the active game:',
                playerError
            );


            /*
             * The cloud game cannot be used without its
             * host participation row. Mark the incomplete
             * cloud record as cancelled.
             */
            await supabaseClient
                .from('games')
                .update({
                    status:
                        'cancelled',

                    completed_at:
                        new Date().toISOString()
                })
                .eq(
                    'id',
                    gameData.id
                );


            showToast(
                'The online game was created, but the host could not be added.',
                'danger'
            );

            return;
        }


        /*
         * Attach the existing local Ring Game to the new
         * cloud session.
         */
        state.config.onlineGameId =
            gameData.id;

        state.config.joinCode =
            joinCode;

        state.config.isOnline =
            true;

        state.config.onlineRole =
            'host';


        state.game.cloudGameId =
            gameData.id;

        state.game.joinCode =
            joinCode;

        state.game.isOnline =
            true;


        /*
         * Publish the complete current Ring Game state.
         *
         * Players joining this active game will request
         * host approval and then receive this state.
         */
        const {
            error: publishError
        } =
            await supabaseClient
                .from('games')
                .update({
                    game_state:
                        state.game
                })
                .eq(
                    'id',
                    gameData.id
                );


        if (publishError) {

            console.error(
                'Could not publish the active Ring Game state:',
                publishError
            );


            /*
             * Roll the local game back to offline mode.
             */
            state.config.onlineGameId =
                null;

            state.config.joinCode =
                null;

            state.config.isOnline =
                false;

            state.config.onlineRole =
                null;

            state.game.cloudGameId =
                null;

            state.game.joinCode =
                null;

            state.game.isOnline =
                false;


            await supabaseClient
                .from('games')
                .update({
                    status:
                        'cancelled',

                    completed_at:
                        new Date().toISOString()
                })
                .eq(
                    'id',
                    gameData.id
                );


            saveState();

            showToast(
                'Could not publish the live Ring Game.',
                'danger'
            );

            return;
        }


        /*
         * Listen for join requests, leave requests, and
         * changes to the active cloud game.
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
            `Online game ready: ${joinCode}`,
            'success'
        );

        openManagePlayersModal();

        return;
    }


    showToast(
        'Could not generate a unique game code.',
        'danger'
    );
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

        const connected =
            await connectToOnlineRingGame(
                gameData
            );


        if (!connected) {

            showToast(
                'Could not reconnect to the game.',
                'danger'
            );

            return;
        }


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


    const connected =
        await connectToOnlineRingGame(
            gameData
        );


    if (!connected) {

        showToast(
            'You joined the game, but could not connect to the lobby.',
            'warning'
        );

        return;
    }


    showToast(
        `Joined game ${joinCode}.`,
        'success'
    );
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
    * Return this device to a clean offline
    * Ring Game setup.
    */
    resetRingGameToOfflineSetup();

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


    // Disconnect realtime.
    await disconnectSessionChannels();

    // Reset local Ring Game.
    resetRingGameToOfflineSetup();

    saveState();

    closeModal();

    render();

    showToast(
        'You left the online lobby.',
        'info'
    );
}


/**
 * Handle completion of an online Ring Game on a participant device.
 *
 * The final cloud game state is used to calculate settlement
 * before the local Ring Game is reset back to offline setup.
 */
async function handleCompletedOnlineGame(updatedGame) {

    const finalGameState =
        updatedGame.game_state ||
        state.game;


    if (!finalGameState) {
        return;
    }


    /*
     * Temporarily apply the authoritative final game state
     * so settlement calculations use the host's final values.
     */
    state.game =
        finalGameState;


    const currentParticipant =
        state.game.players.find(
            player =>
                player.userId ===
                currentUser?.id
        );


    /*
     * Calculate settlement BEFORE resetting state.game.
     */
    const simplified =
        getSimplifiedSettlements();

    /*
    * Disconnect this device from all realtime
    * session subscriptions.
    */
    await disconnectSessionChannels();

    /*
     * Return this device to a clean offline setup.
     *
     * currentParticipant and simplified are already stored
     * locally above, so the final settlement can still be
     * displayed after state.game is cleared.
     */
    resetRingGameToOfflineSetup();

    saveState();

    render();


    /*
     * Show the final settlement receipt after returning
     * the application to setup.
     */
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

                            ${simplified
                .map(item => `
                                        <div class="flex items-center justify-between gap-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 px-3.5 py-3">

                                            <span class="text-sm text-slate-200">
                                                ${escapeHTML(item.from.name)}
                                                <span class="text-slate-500 mx-1">
                                                    pays
                                                </span>
                                                ${escapeHTML(item.to.name)}
                                            </span>

                                            <span class="font-mono font-bold text-emerald-300">
                                                ${formatMoney(item.amount)}
                                            </span>

                                        </div>
                                    `)
                .join('')
            }

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
 * Mark an online Ring Game as completed and publish
 * its final authoritative game state.
 */
async function completeOnlineRingGame(
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
            'Could not complete online Ring Game:',
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


/**
 * Publish a newly started Ring Game to the cloud.
 *
 * Returns true when the game is local or the cloud
 * update succeeds. Returns false when cloud sync fails.
 */
async function publishStartedRingGame() {

    if (
        !state.game ||
        !state.game.isOnline ||
        !state.game.cloudGameId ||
        state.config.onlineRole !== 'host'
    ) {
        return true;
    }


    const {
        error
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


    if (error) {

        console.error(
            'Could not start cloud game:',
            error
        );

        showToast(
            'Match started locally, but cloud sync failed.',
            'warning'
        );

        return false;
    }


    return true;
}


/**
 * Attach this device's Ring Game setup state to an
 * existing online cloud game.
 */
function attachRingGameToOnlineSession(gameData) {

    if (!gameData) {
        return;
    }

    state.config.onlineGameId =
        gameData.id;

    state.config.joinCode =
        gameData.join_code;

    state.config.isOnline =
        true;

    state.config.onlineRole =
        gameData.host_id === currentUser?.id
            ? 'host'
            : 'player';
}

/**
 * Finish attaching this device to an online Ring Game.
 *
 * Reloads the authoritative lobby roster, establishes
 * realtime subscriptions, saves local state, and redraws
 * the current view.
 */
async function connectToOnlineRingGame(gameData) {

    if (!gameData?.id) {
        return false;
    }


    /*
     * Store this device's online session identity.
     */
    attachRingGameToOnlineSession(
        gameData
    );


    /*
     * Replace the cached lobby roster with the
     * authoritative Supabase roster.
     */
    const rosterLoaded =
        await loadOnlineLobbyRoster(
            gameData.id
        );


    if (!rosterLoaded) {
        return false;
    }


    /*
     * Establish realtime subscriptions for both
     * participation and game-state changes.
     */
    await subscribeToOnlineLobby(
        gameData.id
    );

    await subscribeToOnlineGame(
        gameData.id
    );


    saveState();

    render();

    return true;
}
