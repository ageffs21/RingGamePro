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