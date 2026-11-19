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