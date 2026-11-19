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