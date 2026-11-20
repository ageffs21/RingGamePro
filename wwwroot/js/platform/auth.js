// =========================================================
// PLATFORM - AUTHENTICATION & PROFILES
// =========================================================


// ---------------------------------------------------------
// Authentication State
// ---------------------------------------------------------

let currentUser = null;
let currentProfile = null;


// ---------------------------------------------------------
// Session & Profile Restoration
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Account Creation
// ---------------------------------------------------------

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


    currentUser =
        data.user;

    await ensureCurrentUserProfile(
        cleanName
    );

    await loadCurrentProfile();

    showToast(
        `Welcome, ${cleanName}!`,
        'success'
    );

    closeModal();
    render();
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


// ---------------------------------------------------------
// Sign In & Sign Out
// ---------------------------------------------------------

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


/**
 * Sign out of PoolApp.
 */
async function signOutUser() {

    await disconnectSessionChannels();

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


// ---------------------------------------------------------
// Profile Management
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Account Modal
// ---------------------------------------------------------

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

                        <button
                            type="button"
                            onclick="submitForgotPassword()"
                            class="w-full mt-2 py-2 text-sm font-bold text-blue-400 hover:text-blue-300 transition"
                        >
                            Forgot Password?
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


// ---------------------------------------------------------
// Password Management
// ---------------------------------------------------------

/**
 * Change the password for the currently signed-in user.
 */
async function updateAccountPassword(
    newPassword,
    confirmPassword
) {

    if (!currentUser) {

        showToast(
            'Sign in before changing your password.',
            'warning'
        );

        return false;
    }


    if (
        !newPassword ||
        !confirmPassword
    ) {

        showToast(
            'Enter and confirm your new password.',
            'warning'
        );

        return false;
    }


    if (newPassword.length < 8) {

        showToast(
            'Password must be at least 8 characters.',
            'warning'
        );

        return false;
    }


    if (newPassword !== confirmPassword) {

        showToast(
            'Passwords do not match.',
            'warning'
        );

        return false;
    }


    const { error } =
        await supabaseClient.auth.updateUser({
            password:
                newPassword
        });


    if (error) {

        console.error(
            'Could not change password:',
            error
        );

        showToast(
            'Could not change your password.',
            'danger'
        );

        return false;
    }


    showToast(
        'Password changed successfully.',
        'success'
    );


    return true;
}


/**
 * Submit the password-change form from the Profile screen.
 */
async function submitPasswordChange() {

    const passwordInput =
        document.getElementById(
            'profile-new-password'
        );


    const confirmInput =
        document.getElementById(
            'profile-confirm-password'
        );


    if (
        !passwordInput ||
        !confirmInput
    ) {
        return;
    }


    const changed =
        await updateAccountPassword(
            passwordInput.value,
            confirmInput.value
        );


    if (!changed) {
        return;
    }


    passwordInput.value = '';
    confirmInput.value = '';
}


/**
 * Send a password-recovery email to the supplied address.
 */
async function sendPasswordResetEmail(
    email
) {

    const cleanEmail =
        String(email || '')
            .trim()
            .toLowerCase();


    if (!cleanEmail) {

        showToast(
            'Enter your email address first.',
            'warning'
        );

        return false;
    }


    /*
     * Return recovery links to the same deployed application.
     */
    const redirectUrl =
        `${window.location.origin}${window.location.pathname}`;


    const { error } =
        await supabaseClient.auth
            .resetPasswordForEmail(
                cleanEmail,
                {
                    redirectTo:
                        redirectUrl
                }
            );


    if (error) {

        console.error(
            'Could not send password reset email:',
            error
        );

        showToast(
            'Could not send the password reset email.',
            'danger'
        );

        return false;
    }


    showToast(
        'Password reset email sent. Check your inbox.',
        'success'
    );


    return true;
}


/**
 * Submit a password-reset request using the email
 * entered on the sign-in form.
 */
async function submitForgotPassword() {

    const emailInput =
        document.getElementById(
            'signin-email'
        );


    if (!emailInput) {

        console.error(
            'Sign-in email field was not found.'
        );

        return;
    }


    const email =
        emailInput.value
            .trim();


    if (!email) {

        showToast(
            'Enter your email address first.',
            'warning'
        );

        emailInput.focus();

        return;
    }


    await sendPasswordResetEmail(
        email
    );
}