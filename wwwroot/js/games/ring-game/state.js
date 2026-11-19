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