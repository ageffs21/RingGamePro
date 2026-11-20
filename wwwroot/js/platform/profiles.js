// =========================================================
// PLATFORM - USER PROFILES
// =========================================================


// ---------------------------------------------------------
// Display Name
// ---------------------------------------------------------

/**
 * Update the signed-in user's Platform display name.
 *
 * The permanent profile and any current Ring Game
 * participation records are updated. Completed historical
 * participation records remain unchanged.
 */
async function updateProfileDisplayName(
    displayName
) {

    if (
        !currentUser ||
        !currentProfile
    ) {

        showToast(
            'Sign in before updating your profile.',
            'warning'
        );

        return false;
    }


    const cleanName =
        String(displayName || '')
            .trim();


    if (!cleanName) {

        showToast(
            'Enter a display name.',
            'warning'
        );

        return false;
    }


    if (cleanName.length > 30) {

        showToast(
            'Display name must be 30 characters or fewer.',
            'warning'
        );

        return false;
    }


    /*
     * Update the permanent Platform profile.
     */
    const {
        error: profileError
    } =
        await supabaseClient
            .from('profiles')
            .update({
                display_name:
                    cleanName
            })
            .eq(
                'id',
                currentUser.id
            );


    if (profileError) {

        console.error(
            'Could not update display name:',
            profileError
        );

        showToast(
            'Could not update your display name.',
            'danger'
        );

        return false;
    }


    /*
     * Update this user's current Ring Game participation.
     *
     * Only active or pending participation rows are changed.
     * Completed and historical participation records retain
     * the name used when those sessions were played.
     */
    const {
        error: participationError
    } =
        await supabaseClient
            .from('game_players')
            .update({
                display_name:
                    cleanName
            })
            .eq(
                'user_id',
                currentUser.id
            )
            .in(
                'status',
                [
                    'active',
                    'pending'
                ]
            );


    if (participationError) {

        console.error(
            'Profile updated, but current Ring Game participation could not be updated:',
            participationError
        );

        showToast(
            'Profile updated, but the current game name could not be synchronized.',
            'warning'
        );
    }


    /*
     * Reload the authoritative Platform profile.
     */
    await loadCurrentProfile();


    /*
     * Update the locally cached setup roster immediately.
     */
    if (
        Array.isArray(
            state.config?.players
        )
    ) {

        state.config.players.forEach(
            player => {

                if (
                    player.userId ===
                    currentUser.id
                ) {
                    player.name =
                        cleanName;
                }

            }
        );
    }


    /*
     * Update the locally cached live Ring Game immediately.
     *
     * If this device is the host, publish the updated
     * authoritative game state. If this device is a player,
     * the host's realtime roster handler will publish it.
     */
    if (
        Array.isArray(
            state.game?.players
        )
    ) {

        state.game.players.forEach(
            player => {

                if (
                    player.userId ===
                    currentUser.id
                ) {
                    player.name =
                        cleanName;
                }

            }
        );
    }


    if (
        state.game?.isOnline &&
        state.config.onlineRole === 'host'
    ) {

        await saveAndSyncGame();

    } else {

        saveState();
    }


    render();


    showToast(
        participationError
            ? 'Display name updated. Current game synchronization may be delayed.'
            : 'Display name updated.',
        participationError
            ? 'warning'
            : 'success'
    );


    return true;
}


/**
 * Read and submit the display-name field from the
 * Platform profile screen.
 */
async function submitProfileDisplayName() {

    const input =
        document.getElementById(
            'profile-display-name'
        );


    if (!input) {
        return;
    }


    await updateProfileDisplayName(
        input.value
    );
}