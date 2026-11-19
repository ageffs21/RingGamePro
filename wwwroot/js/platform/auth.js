/*
* ---------------------------------------------------------
* USER AUTHENTICATION STATE
* ---------------------------------------------------------
*/
let currentUser = null;
let currentProfile = null;

/*
* ---------------------------------------------------------
* USER AUTHENTICATION
* ---------------------------------------------------------
*/
/**
 * Load the current signed-in user and that user's profile.
 */
async function loadCurrentUser() {
    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        console.error('Could not load Supabase session:', error);
        return;
    }

    currentUser = session?.user || null;

    if (currentUser) {

        await loadCurrentProfile();

        /*
         * If this phone was already attached to an online lobby,
         * reload its authoritative cloud state.
         */
        await restoreOnlineLobby();

    } else {

        currentProfile = null;
    }

    render();
}


/**
 * Load the signed-in user's PoolApp profile.
 */
async function loadCurrentProfile() {
    if (!currentUser) {
        currentProfile = null;
        return;
    }

    const { data, error } =
        await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

    if (error) {
        console.error(
            'Could not load profile:',
            error
        );

        return;
    }

    currentProfile = data || null;


    /*
     * During ordinary offline setup, Player 1 represents
     * the signed-in user.
     *
     * Do NOT modify the roster during an online lobby.
     * Supabase game_players is authoritative in online mode.
     */
    if (
        currentProfile &&
        state.view === 'setup' &&
        !state.config.isOnline &&
        Array.isArray(state.config.players) &&
        state.config.players.length > 0
    ) {
        state.config.players[0].name =
            currentProfile.display_name;

        state.config.players[0].userId =
            currentUser.id;

        state.config.players[0].isGuest =
            false;

        saveState();
    }
}


/**
 * Create a new PoolApp account.
 */
async function createAccount(
    email,
    password,
    displayName
) {
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanEmail || !password || !cleanName) {
        showToast(
            'Name, email, and password are required.',
            'warning'
        );

        return;
    }

    const { data, error } =
        await supabaseClient.auth.signUp({
            email: cleanEmail,
            password: password,
            options: {
                data: {
                    display_name: cleanName
                },
                emailRedirectTo:
                    window.location.origin
            }
        });

    if (error) {
        console.error('Account creation failed:', error);

        showToast(
            error.message || 'Could not create account.',
            'danger'
        );

        return;
    }


    /*
     * If email confirmation is enabled, Supabase may
     * create the user without creating an active session yet.
     */
    if (!data.session) {
        showToast(
            'Account created. Check your email to confirm your account.',
            'success'
        );

        closeModal();
        return;
    }


    currentUser = data.user;

    await ensureCurrentUserProfile(cleanName);

    showToast(
        `Welcome, ${cleanName}!`,
        'success'
    );

    closeModal();
    render();
}


/**
 * Sign into an existing PoolApp account.
 */
async function signInUser(email, password) {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
        showToast(
            'Email and password are required.',
            'warning'
        );

        return;
    }

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email: cleanEmail,
            password: password
        });

    if (error) {
        console.error('Sign in failed:', error);

        showToast(
            error.message || 'Could not sign in.',
            'danger'
        );

        return;
    }

    currentUser = data.user;

    await ensureCurrentUserProfile();

    await loadCurrentProfile();

    closeModal();
    render();

    showToast(
        `Welcome back${currentProfile?.display_name
            ? `, ${currentProfile.display_name}`
            : ''
        }!`,
        'success'
    );
}


/**
 * Ensure the authenticated account has a profiles row.
 */
async function ensureCurrentUserProfile(displayName = '') {
    if (!currentUser) return;

    /*
     * First see whether the profile already exists.
     */
    const { data: existingProfile, error: readError } =
        await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

    if (readError) {
        console.error(
            'Could not check user profile:',
            readError
        );

        return;
    }

    if (existingProfile) {
        currentProfile = existingProfile;
        return;
    }


    /*
     * OAuth providers such as Google will eventually provide
     * the display name through user metadata.
     */
    const profileName =
        displayName.trim() ||
        currentUser.user_metadata?.display_name ||
        currentUser.user_metadata?.full_name ||
        currentUser.email?.split('@')[0] ||
        'Player';


    const { data, error } =
        await supabaseClient
            .from('profiles')
            .insert({
                id: currentUser.id,
                display_name: profileName
            })
            .select()
            .single();

    if (error) {
        console.error(
            'Could not create user profile:',
            error
        );

        showToast(
            'Signed in, but the player profile could not be created.',
            'warning'
        );

        return;
    }

    currentProfile = data;
}


/**
 * Sign out of PoolApp.
 */
async function signOutUser() {
    const { error } =
        await supabaseClient.auth.signOut();

    if (error) {
        console.error('Sign out failed:', error);

        showToast(
            'Could not sign out.',
            'danger'
        );

        return;
    }

    currentUser = null;
    currentProfile = null;

    closeModal();
    render();

    showToast(
        'Signed out successfully.',
        'info'
    );
}