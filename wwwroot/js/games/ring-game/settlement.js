// =========================================================
// RING GAME - SETTLEMENT & BALANCE ENGINE
// =========================================================

/**
* FINANCIAL & DEBT SIMPLIFICATION CALCULATIONS
*/
function getPlayerNetBalance(playerId) {
    if (!state.game) return 0;
    let net = 0;
    state.game.players.forEach(other => {
        if (other.id === playerId) return;
        const owedToMe = state.game.ledger[other.id]?.[playerId] || 0;
        const iOweThem = state.game.ledger[playerId]?.[other.id] || 0;
        net += (owedToMe - iOweThem);
    });
    return +net.toFixed(2);
}


/**
    * Returns remaining direct debts between each pair of players.
    *
    * Exit-settlement payments are subtracted from the historical
    * pairwise ledger so completed payments are not displayed again.
    */
function getPairwiseNetDebts() {
    if (!state.game) return [];

    const debts = [];
    const players = state.game.players;

    const exitSettlements =
        Array.isArray(state.game.exitSettlements)
            ? state.game.exitSettlements
            : [];

    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {

            const playerA = players[i];
            const playerB = players[j];

            const bOwesA =
                state.game.ledger[playerB.id]?.[playerA.id] || 0;

            const aOwesB =
                state.game.ledger[playerA.id]?.[playerB.id] || 0;

            /*
                * Positive means B owes A.
                * Negative means A owes B.
                */
            let difference = bOwesA - aOwesB;

            /*
                * Subtract payments already completed through
                * player exit settlements.
                */
            exitSettlements.forEach(exitSettlement => {
                const transactions =
                    Array.isArray(exitSettlement.transactions)
                        ? exitSettlement.transactions
                        : [];

                transactions.forEach(transaction => {

                    /*
                        * B paid A, reducing how much B still owes A.
                        */
                    if (
                        transaction.fromPlayerId === playerB.id &&
                        transaction.toPlayerId === playerA.id
                    ) {
                        difference -= transaction.amount;
                    }

                    /*
                        * A paid B, reducing how much A still owes B.
                        */
                    if (
                        transaction.fromPlayerId === playerA.id &&
                        transaction.toPlayerId === playerB.id
                    ) {
                        difference += transaction.amount;
                    }
                });
            });

            difference = +difference.toFixed(2);

            if (difference > 0.005) {
                debts.push({
                    from: playerB,
                    to: playerA,
                    amount: difference
                });
            } else if (difference < -0.005) {
                debts.push({
                    from: playerA,
                    to: playerB,
                    amount: Math.abs(difference)
                });
            }
        }
    }

    return debts.sort((a, b) => b.amount - a.amount);
}


/**
    * Returns a player's remaining unsettled balance.
    *
    * The pairwise ledger is preserved as the complete game history.
    * Exit settlements are applied as adjustments so payments made
    * when someone leaves are not included again at final settlement.
    */
function getAdjustedPlayerNetBalance(playerId) {
    if (!state.game) return 0;

    let net = getPlayerNetBalance(playerId);

    const exitSettlements = Array.isArray(state.game.exitSettlements)
        ? state.game.exitSettlements
        : [];

    exitSettlements.forEach(exitSettlement => {
        const transactions = Array.isArray(exitSettlement.transactions)
            ? exitSettlement.transactions
            : [];

        transactions.forEach(transaction => {

            /*
                * A payment reduces the payer's debt.
                *
                * Example:
                * Raw balance = -$2.00
                * Paid amount =  $2.00
                * New balance =  $0.00
                */
            if (transaction.fromPlayerId === playerId) {
                net += transaction.amount;
            }

            /*
                * A received payment satisfies part of the recipient's credit.
                *
                * Example:
                * Raw balance = +$2.00
                * Received    =  $2.00
                * New balance =  $0.00
                */
            if (transaction.toPlayerId === playerId) {
                net -= transaction.amount;
            }
        });
    });

    return +net.toFixed(2);
}


/**
* Calculates the remaining settlement transactions between players.
*
* Exit settlements that have already been paid are accounted for
* through getAdjustedPlayerNetBalance(), preventing players from
* being charged or paid twice.
*/
function getSimplifiedSettlements() {
    if (!state.game) return [];

    const debtors = [];
    const creditors = [];

    state.game.players.forEach(player => {
        const net = getAdjustedPlayerNetBalance(player.id);

        if (net < -0.005) {
            debtors.push({
                player: player,
                amount: Math.abs(net)
            });
        } else if (net > 0.005) {
            creditors.push({
                player: player,
                amount: net
            });
        }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements = [];

    let debtorIndex = 0;
    let creditorIndex = 0;

    while (
        debtorIndex < debtors.length &&
        creditorIndex < creditors.length
    ) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];

        const transfer = +Math.min(
            debtor.amount,
            creditor.amount
        ).toFixed(2);

        if (transfer > 0.005) {
            settlements.push({
                from: debtor.player,
                to: creditor.player,
                amount: transfer
            });
        }

        debtor.amount = +(
            debtor.amount - transfer
        ).toFixed(2);

        creditor.amount = +(
            creditor.amount - transfer
        ).toFixed(2);

        if (debtor.amount <= 0.005) {
            debtorIndex++;
        }

        if (creditor.amount <= 0.005) {
            creditorIndex++;
        }
    }

    return settlements;
}


/**
* Calculates the payments involving one player at the moment
* that player leaves the game.
*/
function getPlayerExitSettlement(playerId) {
    if (!state.game) return [];

    const player = getPlayerById(playerId);
    if (!player) return [];

    const playerNet = getAdjustedPlayerNetBalance(playerId);

    // Player is already even.
    if (Math.abs(playerNet) <= 0.005) {
        return [];
    }

    const transactions = [];

    /*
        * Departing player owes money.
        */
    if (playerNet < 0) {
        let remaining = Math.abs(playerNet);

        const creditors = state.game.players
            .filter(p =>
                p.id !== playerId &&
                p.active !== false
            )
            .map(p => ({
                player: p,
                amount: Math.max(
                    0,
                    getAdjustedPlayerNetBalance(p.id)
                )
            }))
            .filter(item => item.amount > 0.005)
            .sort((a, b) => b.amount - a.amount);

        creditors.forEach(creditor => {
            if (remaining <= 0.005) return;

            const amount = +Math.min(
                remaining,
                creditor.amount
            ).toFixed(2);

            if (amount > 0.005) {
                transactions.push({
                    fromPlayerId: player.id,
                    fromPlayerName: player.name,
                    toPlayerId: creditor.player.id,
                    toPlayerName: creditor.player.name,
                    amount: amount
                });

                remaining = +(remaining - amount).toFixed(2);
            }
        });
    }


    /*
        * Departing player is owed money.
        */
    if (playerNet > 0) {
        let remaining = playerNet;

        const debtors = state.game.players
            .filter(p =>
                p.id !== playerId &&
                p.active !== false
            )
            .map(p => ({
                player: p,
                amount: Math.abs(
                    Math.min(
                        0,
                        getAdjustedPlayerNetBalance(p.id)
                    )
                )
            }))
            .filter(item => item.amount > 0.005)
            .sort((a, b) => b.amount - a.amount);

        debtors.forEach(debtor => {
            if (remaining <= 0.005) return;

            const amount = +Math.min(
                remaining,
                debtor.amount
            ).toFixed(2);

            if (amount > 0.005) {
                transactions.push({
                    fromPlayerId: debtor.player.id,
                    fromPlayerName: debtor.player.name,
                    toPlayerId: player.id,
                    toPlayerName: player.name,
                    amount: amount
                });

                remaining = +(remaining - amount).toFixed(2);
            }
        });
    }

    return transactions;
}