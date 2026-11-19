// =========================================================
// PLATFORM - ONLINE SESSIONS & REALTIME CONNECTIVITY
// =========================================================

let onlineLobbyChannel = null;
let onlineGameChannel = null;


/**
 * Generate a short human-readable session join code.
 *
 * Ambiguous characters such as O/0 and I/1 are intentionally
 * omitted so codes are easier to read.
 */
function generateJoinCode(length = 6) {

    const characters =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let code = '';

    for (let i = 0; i < length; i++) {
        code += characters[
            Math.floor(
                Math.random() * characters.length
            )
        ];
    }

    return code;
}


/**
 * Copy a session join code to the clipboard.
 *
 * The join code is supplied by the caller so this helper can
 * be reused by Ring Game lobbies, active games, tournaments,
 * leagues, and other future online sessions.
 */
async function copyJoinCode(code) {

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