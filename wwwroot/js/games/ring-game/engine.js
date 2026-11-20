// =========================================================
// RING GAME - LIVE GAME ENGINE
// =========================================================

// ---------------------------------------------------------
// Game State Helpers
// ---------------------------------------------------------

/**
* LIVE GAME ENGINE
*/
function getCurrentRack() {
    if (!state.game || !state.game.racks || state.game.racks.length === 0) return null;
    return state.game.racks[state.game.racks.length - 1];
}


function getPlayerById(id) {
    if (!state.game) return null;
    return state.game.players.find(p => p.id === id) || null;
}


function getActivePlayerIndices() {
    if (!state.game) return [];

    return state.game.players
        .map((p, idx) =>
            !p.eliminated && p.active !== false
                ? idx
                : -1
        )
        .filter(idx => idx !== -1);
}


function getNextActiveIndex(fromIndex) {
    const total = state.game.players.length;

    for (let step = 1; step <= total; step++) {
        const candidate = (fromIndex + step) % total;
        const player = state.game.players[candidate];

        if (
            !player.eliminated &&
            player.active !== false
        ) {
            return candidate;
        }
    }

    return fromIndex;
}


// ---------------------------------------------------------
// Undo Snapshots
// ---------------------------------------------------------

function pushSnapshot() {

    if (!state.game) {
        return;
    }


    const snapshot = {

        rackNumber:
            state.game.rackNumber,

        players:
            structuredClone(
                state.game.players
            ),

        currentShooterIndex:
            state.game.currentShooterIndex,

        previousShooterIndex:
            state.game.previousShooterIndex,

        canPassBack:
            state.game.canPassBack,

        racks:
            structuredClone(
                state.game.racks
            ),

        ledger:
            structuredClone(
                state.game.ledger
            ),

        history:
            structuredClone(
                state.game.history
            )

    };


    state.game.snapshots.push(
        snapshot
    );


    /*
     * Limit undo history so long matches do not grow
     * local state indefinitely.
     */
    if (
        state.game.snapshots.length > 50
    ) {
        state.game.snapshots.shift();
    }
}


function undoLastAction() {
    if (!state.game || state.game.snapshots.length === 0) {
        showToast('Nothing to undo.', 'warning');
        return;
    }
    const prev = state.game.snapshots.pop();
    state.game.rackNumber = prev.rackNumber;
    state.game.players = prev.players;
    state.game.currentShooterIndex = prev.currentShooterIndex;
    state.game.previousShooterIndex = prev.previousShooterIndex;
    state.game.canPassBack = prev.canPassBack;
    state.game.racks = prev.racks;
    state.game.ledger = prev.ledger;
    state.game.history = prev.history;


    saveAndSyncGame();
    render();
    showToast('Last action undone.', 'info');
}


// ---------------------------------------------------------
// Balance Reconstruction
// ---------------------------------------------------------

/**
 * Recalculate the pairwise ledger and elimination statuses
 * from all recorded money-ball activity.
 *
 * Each pocket record preserves the players who were
 * financially active when that ball was made. This prevents
 * later joins or departures from changing historical balances.
 */
function recalculateAllBalancesFromRacks() {
    if (!state.game) return;

    const g = state.game;

    /*
    * Reset every player's elimination status and rebuild
    * the complete pairwise ledger.
    */
    g.players.forEach(player => {
        player.eliminated = false;
        g.ledger[player.id] = {};

        g.players.forEach(other => {
            if (player.id !== other.id) {
                g.ledger[player.id][other.id] = 0;
            }
        });
    });


    /*
    * Reprocess every pocketed money ball in
    * chronological order.
    */
    g.racks.forEach(rack => {
        rack.pocketedBalls.forEach(entry => {
            const shooter = getPlayerById(entry.shooterId);

            if (!shooter) {
                return;
            }

            /*
            * Older pocket records may not contain eligiblePlayerIds.
            * Fall back to all players to preserve compatibility with
            * matches created before participation tracking was added.
            */
            const eligiblePlayerIds =
                Array.isArray(entry.eligiblePlayerIds) &&
                    entry.eligiblePlayerIds.length > 0
                    ? entry.eligiblePlayerIds
                    : g.players.map(player => player.id);


            /*
            * Current active/inactive status is intentionally ignored.
            * A player who later leaves still owes for money balls made
            * while that player was participating.
            */
            const activePayers = g.players.filter(player =>
                eligiblePlayerIds.includes(player.id) &&
                player.id !== shooter.id &&
                player.eliminated !== true
            );

            let totalCollected = 0;
            const breakdown = [];


            activePayers.forEach(payer => {
                let amountOwed = entry.value;

                /*
                * In buy-in mode, players cannot lose more than the
                * amount remaining in their stack.
                */
                if (g.useBuyIn) {
                    const payerNet = getPlayerNetBalance(payer.id);
                    const remainingStack = g.buyInAmount + payerNet;

                    if (remainingStack <= amountOwed) {
                        amountOwed = Math.max(0, remainingStack);
                        payer.eliminated = true;
                    }
                }


                if (amountOwed > 0) {
                    /*
                    * Defensive initialization for older saved games or
                    * players who joined after the game started.
                    */
                    if (!g.ledger[payer.id]) {
                        g.ledger[payer.id] = {};
                    }

                    if (typeof g.ledger[payer.id][shooter.id] !== 'number') {
                        g.ledger[payer.id][shooter.id] = 0;
                    }


                    g.ledger[payer.id][shooter.id] = +(
                        g.ledger[payer.id][shooter.id] + amountOwed
                    ).toFixed(2);

                    totalCollected = +(
                        totalCollected + amountOwed
                    ).toFixed(2);

                    breakdown.push({
                        payerId: payer.id,
                        payerName: payer.name,
                        amount: amountOwed
                    });
                }
            });


            entry.totalCollected = totalCollected;
            entry.breakdown = breakdown;
        });
    });
}


// ---------------------------------------------------------
// Shooter Rotation
// ---------------------------------------------------------

function nextShooter() {
    if (!state.game) return;
    const activeIndices = getActivePlayerIndices();
    if (activeIndices.length <= 1) {
        showToast('Only one active player remaining!', 'warning');
        return;
    }


    pushSnapshot();
    const prevIdx = state.game.currentShooterIndex;
    const nextIdx = getNextActiveIndex(prevIdx);


    state.game.previousShooterIndex = prevIdx;
    state.game.currentShooterIndex = nextIdx;
    state.game.canPassBack = true;


    state.game.history.unshift({
        id: Date.now(),
        type: 'turn',
        rack: state.game.rackNumber,
        fromName: state.game.players[prevIdx].name,
        toName: state.game.players[nextIdx].name,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });


    saveAndSyncGame();
    render();
}


function passShotBack() {
    if (
        !state.game ||
        !state.game.canPassBack ||
        state.game.previousShooterIndex === null
    ) {
        showToast('No previous shot available to pass back.', 'warning');
        return;
    }

    const currentIdx = state.game.currentShooterIndex;
    const targetIdx = state.game.previousShooterIndex;
    const targetPlayer = state.game.players[targetIdx];

    // The previous shooter may have left the game or
    // been eliminated since the previous shot.
    if (
        !targetPlayer ||
        targetPlayer.eliminated ||
        targetPlayer.active === false
    ) {
        state.game.previousShooterIndex = null;
        state.game.canPassBack = false;

        saveState();
        render();

        showToast(
            'The previous shooter is no longer active.',
            'warning'
        );

        return;
    }

    pushSnapshot();

    state.game.currentShooterIndex = targetIdx;
    state.game.previousShooterIndex = null;
    state.game.canPassBack = false;

    state.game.history.unshift({
        id: Date.now(),
        type: 'pass_back',
        rack: state.game.rackNumber,
        fromName: state.game.players[currentIdx].name,
        toName: targetPlayer.name,
        timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })
    });

    saveAndSyncGame();
    render();

    showToast(
        `Shot passed back to ${targetPlayer.name}!`,
        'info'
    );
}


// ---------------------------------------------------------
// Money Ball Scoring
// ---------------------------------------------------------

function scoreMoneyBall(ballObj) {
    if (!state.game) return;
    const activeIndices = getActivePlayerIndices();
    if (activeIndices.length <= 1) {
        showToast('Game over — only 1 player remains.', 'warning');
        return;
    }


    const currentRack = getCurrentRack();
    if (!currentRack) return;


    if (currentRack.pocketedBalls.some(pb => pb.ball === ballObj.ball)) {
        showToast(`The ${ballObj.ball}-ball was already pocketed in Rack #${currentRack.rackNumber}.`, 'warning');
        return;
    }


    pushSnapshot();


    const shooterIdx = state.game.currentShooterIndex;
    const shooter = state.game.players[shooterIdx];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });


    const pocketRecord = {
        id: 'pb_' + Date.now() + '_' + ballObj.ball,
        ball: ballObj.ball,
        value: ballObj.value,
        shooterId: shooter.id,

        // Preserve the players participating when this ball was made.
        // This prevents later joins or departures from changing old balances.
        eligiblePlayerIds: state.game.players
            .filter(player =>
                player.active !== false &&
                player.eliminated !== true
            )
            .map(player => player.id),

        totalCollected: 0,
        breakdown: [],
        timestamp: timeStr
    };


    currentRack.pocketedBalls.push(pocketRecord);
    recalculateAllBalancesFromRacks();


    state.game.canPassBack = false;
    state.game.previousShooterIndex = null;


    const eventEntry = {
        id: Date.now(),
        type: 'money_ball',
        rack: state.game.rackNumber,
        shooterId: shooter.id,
        shooterName: shooter.name,
        ball: ballObj.ball,
        ballValue: ballObj.value,
        totalCollected: pocketRecord.totalCollected,
        breakdown: pocketRecord.breakdown,
        timestamp: timeStr
    };


    state.game.history.unshift(eventEntry);


    const allMoneyBallsPocketed = state.game.moneyBalls.every(mb =>
        currentRack.pocketedBalls.some(pb => pb.ball === mb.ball)
    );


    if (allMoneyBallsPocketed && getActivePlayerIndices().length > 1) {
        advanceToNextRackInternal(shooterIdx, `All money balls cleared! ${shooter.name} collected +${formatMoney(pocketRecord.totalCollected)} & breaks Rack #${state.game.rackNumber + 1}!`);
    } else {
        const remainingCount = state.game.moneyBalls.length - currentRack.pocketedBalls.length;
        saveAndSyncGame();
        render();
        showToast(
            `${shooter.name} pocketed the ${ballObj.ball}-ball (+${formatMoney(pocketRecord.totalCollected)})! ${remainingCount} money ball${remainingCount === 1 ? '' : 's'} left in rack.`,
            'success'
        );
    }
}


// ---------------------------------------------------------
// Rack Advancement
// ---------------------------------------------------------

function advanceToNextRackInternal(breakerIdx, customToastMsg) {
    const g = state.game;
    const currentRack = getCurrentRack();
    if (currentRack) {
        currentRack.completed = true;
    }


    const nextRackNum = g.rackNumber + 1;
    const breaker = g.players[breakerIdx];


    g.rackNumber = nextRackNum;
    g.currentShooterIndex = breakerIdx;
    g.previousShooterIndex = null;
    g.canPassBack = false;


    g.racks.push({
        rackNumber: nextRackNum,
        breakerId: breaker.id,
        completed: false,
        pocketedBalls: []
    });


    g.history.unshift({
        id: Date.now() + 1,
        type: 'new_rack',
        rack: nextRackNum,
        breakerName: breaker.name,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });


    saveAndSyncGame();
    render();
    if (customToastMsg) {
        showToast(customToastMsg, 'success');
    }
}


function confirmManualNextRack() {

    if (!state.game) {
        return;
    }


    const selected =
        document.querySelector(
            'input[name="next-breaker-radio"]:checked'
        );


    const selectedIndex =
        selected
            ? parseInt(selected.value, 10)
            : state.game.currentShooterIndex;


    const breaker =
        state.game.players[selectedIndex];


    if (
        !breaker ||
        breaker.eliminated ||
        breaker.active === false
    ) {

        showToast(
            'Select an active player to break the next rack.',
            'warning'
        );

        return;
    }


    closeModal();

    pushSnapshot();


    advanceToNextRackInternal(
        selectedIndex,
        `Rack #${state.game.rackNumber + 1} started! ${breaker.name} breaks.`
    );
}