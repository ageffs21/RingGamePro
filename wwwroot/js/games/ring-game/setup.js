let dragSourceIndex = null;


/**
 * Build the initial live Ring Game state from the
 * completed setup configuration.
 */
function createInitialRingGameState(config) {

    const players =
        config.players.map((player, index) => ({

            id:
                player.id ||
                `p${index + 1}`,

            name:
                (player.name || '').trim() ||
                `Player ${index + 1}`,

            userId:
                player.userId || null,

            isGuest:
                player.isGuest === true,

            eliminated: false,
            active: true,
            joinedAtRack: 1,
            leftAtRack: null,
            settledOnExit: false

        }));


    const moneyBalls =
        config.moneyBalls.map(moneyBall => ({

            ball:
                Number(moneyBall.ball),

            value:
                Math.max(
                    0.25,
                    Number(moneyBall.value) || 1
                )

        }));


    const ledger = {};

    players.forEach(player => {

        ledger[player.id] = {};

        players.forEach(otherPlayer => {

            if (player.id !== otherPlayer.id) {

                ledger[player.id][otherPlayer.id] = 0;

            }

        });

    });


    return {

        startedAt:
            new Date().toISOString(),

        cloudGameId:
            config.onlineGameId || null,

        joinCode:
            config.joinCode || null,

        isOnline:
            config.isOnline === true,

        format:
            config.format,

        rackNumber:
            1,

        players,

        currentShooterIndex:
            0,

        previousShooterIndex:
            null,

        canPassBack:
            false,

        moneyBalls,

        useBuyIn:
            Boolean(config.useBuyIn),

        buyInAmount:
            Math.max(
                1,
                Number(config.buyInAmount) || 20
            ),

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
}


/**
* SETUP ACTIONS
*/
function setPlayerCount(count) {
    const newCount = Math.max(2, Math.min(12, parseInt(count, 10)));
    const current = [...state.config.players];
    if (newCount > current.length) {
        for (let i = current.length; i < newCount; i++) {
            current.push({ id: 'p' + (Date.now() + i), name: `Player ${i + 1}` });
        }
    } else if (newCount < current.length) {
        current.length = newCount;
    }
    state.config.playerCount = newCount;
    state.config.players = current;
    saveState();
    render();
}


function updatePlayerName(index, name) {
    state.config.players[index].name = name;
    saveState();
}


function movePlayerOrder(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.config.players.length) return;
    const arr = state.config.players;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    saveState();
    render();
}


function randomizePlayerOrder() {
    const arr = [...state.config.players];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    state.config.players = arr;
    saveState();
    render();
    showToast('Shooting order randomized (pills drawn)!', 'success');
}


function setGameFormat(fmt) {
    state.config.format = fmt;
    if (fmt === '9-ball') {
        state.config.moneyBalls = [
            { ball: 5, value: 0.25 },
            { ball: 9, value: 0.50 }
        ];
    } else if (fmt === '10-ball') {
        state.config.moneyBalls = [
            { ball: 5, value: 0.25 },
            { ball: 10, value: 0.50 }
        ];
    }
    saveState();
    render();
}


function updateMoneyBallValue(index, val) {
    const parsed = Math.max(0.25, parseFloat(val) || 0);
    state.config.moneyBalls[index].value = parsed;
    saveState();
}


function removeMoneyBall(index) {
    if (state.config.moneyBalls.length <= 1) {
        showToast('At least one money ball is required.', 'warning');
        return;
    }
    state.config.moneyBalls.splice(index, 1);
    saveState();
    render();
}


function addCustomMoneyBall(ballNum) {
    const num = parseInt(ballNum, 10);

    // Limit the available ball numbers based on game format.
    let maxBall = 15;

    if (state.config.format === '9-ball') {
        maxBall = 9;
    } else if (state.config.format === '10-ball') {
        maxBall = 10;
    }

    if (!num || num < 1 || num > maxBall) {
        return;
    }

    // Prevent duplicate money balls.
    if (state.config.moneyBalls.some(mb => mb.ball === num)) {
        showToast(`Ball #${num} is already a money ball.`, 'warning');
        return;
    }

    state.config.moneyBalls.push({
        ball: num,
        value: 0.25
    });

    state.config.moneyBalls.sort((a, b) => a.ball - b.ball);

    saveState();
    render();
}


function toggleBuyIn(enabled) {
    state.config.useBuyIn = enabled;
    saveState();
    render();
}


function updateBuyInAmount(val) {
    state.config.buyInAmount = Math.max(1, parseFloat(val) || 20);
    saveState();
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


        // Build the initial Ring Game.
        state.game =
            createInitialRingGameState(
                state.config
            );


        state.view = 'live';
        activeTab = 'table';

        saveState();


        await publishStartedRingGame();


        render();


        showToast(
            `Rack #1 started! ${state.game.players[0].name} breaks.`,
            'success'
        );

    } catch (err) {

        console.error(
            'Error starting match:',
            err
        );

        showToast(
            'Could not start match. Please check your setup settings.',
            'danger'
        );

    }
}