// =========================================================
// RING GAME - SETTLEMENT & BALANCE ENGINE
// =========================================================


// ---------------------------------------------------------
// Player Balance Calculations
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Pairwise Debt Calculations
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Settlement Simplification
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// Player Exit Settlement
// ---------------------------------------------------------

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



// ---------------------------------------------------------
// Final Settlement UI
// ---------------------------------------------------------

function openEndGameModal() {
    if (!state.game) return;

    const simplified = getSimplifiedSettlements();
    const pairwise = getPairwiseNetDebts();

    const exitSettlements =
        Array.isArray(state.game.exitSettlements)
            ? state.game.exitSettlements
            : [];


    /*
        * Build player statistics.
        *
        * gameNet:
        *   Complete historical result from actual game play.
        *
        * remainingNet:
        *   Amount still requiring settlement after any exit
        *   settlements that have already been paid.
        */
    const statsByPlayer = {};

    state.game.players.forEach(player => {
        statsByPlayer[player.id] = {
            id: player.id,
            name: player.name,

            ballsCount: 0,
            racksBroken: 0,

            gameNet:
                getPlayerNetBalance(player.id),

            remainingNet:
                getAdjustedPlayerNetBalance(player.id),

            active:
                player.active !== false,

            settledOnExit:
                player.settledOnExit === true,

            leftAtRack:
                player.leftAtRack || null
        };
    });


    /*
        * Count racks broken and money balls made.
        */
    state.game.racks.forEach(rack => {

        if (statsByPlayer[rack.breakerId]) {
            statsByPlayer[rack.breakerId].racksBroken += 1;
        }

        rack.pocketedBalls.forEach(pocketedBall => {

            if (statsByPlayer[pocketedBall.shooterId]) {
                statsByPlayer[pocketedBall.shooterId]
                    .ballsCount += 1;
            }

        });
    });


    const totalBallsPocketed =
        state.game.racks.reduce(
            (sum, rack) =>
                sum + rack.pocketedBalls.length,
            0
        );


    /*
        * Rank the standings by the actual game result.
        * A player who already settled still keeps the
        * winnings/losses earned during play.
        */
    const rankedPlayers =
        Object.values(statsByPlayer)
            .sort(
                (a, b) =>
                    b.gameNet - a.gameNet
            );


    /*
        * ---------------------------------------------------------
        * FINAL SETTLEMENT MODAL
        * ---------------------------------------------------------
        */
    const html = `
            <div class="p-5 sm:p-6">


                <!-- Header -->
                <div class="flex items-center justify-between border-b border-slatefelt-700 pb-4">

                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Match Summary
                    </span>

                    <h2 class="text-xl font-extrabold text-white mt-0.5">
                    Final Settlement
                    </h2>
                </div>

                <button
                    onclick="closeModal()"
                    class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slatefelt-800"
                >
                    <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                    </svg>
                </button>

                </div>


                <!-- Match Totals -->
                <div class="grid grid-cols-2 gap-3 my-4">

                <div class="bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">

                    <div class="text-xs text-slate-400">
                    Racks Played
                    </div>

                    <div class="text-xl font-extrabold text-white font-mono mt-0.5">
                    ${state.game.rackNumber}
                    </div>

                </div>


                <div class="bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">

                    <div class="text-xs text-slate-400">
                    Money Balls Pocketed
                    </div>

                    <div class="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                    ${totalBallsPocketed}
                    </div>

                </div>

                </div>


                <!-- Final Standings -->
                <div class="mb-5">

                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Final Standings
                </h3>

                <div class="space-y-2">

                    ${rankedPlayers.map((player, idx) => {

        const gameNetColor =
            player.gameNet > 0.005
                ? 'text-emerald-400'
                : player.gameNet < -0.005
                    ? 'text-rose-400'
                    : 'text-slate-300';


        const remainingColor =
            player.remainingNet > 0.005
                ? 'text-emerald-400'
                : player.remainingNet < -0.005
                    ? 'text-rose-400'
                    : 'text-slate-400';


        const stackText =
            state.game.useBuyIn
                ? `Stack: ${formatMoney(
                    state.game.buyInAmount +
                    player.gameNet
                )}`
                : '';


        return `
                        <div
                        class="bg-slatefelt-850 px-3.5 py-3 rounded-xl border ${player.settledOnExit
                ? 'border-blue-500/30'
                : 'border-slatefelt-700/60'
            }"
                        >

                        <div class="flex items-start justify-between gap-3">

                            <div class="flex items-start gap-2.5 min-w-0">

                            <span
                                class="w-6 h-6 rounded-full bg-slatefelt-700 text-xs font-bold flex items-center justify-center text-slate-200 shrink-0"
                            >
                                ${idx + 1}
                            </span>


                            <div class="min-w-0">

                                <div class="font-semibold text-sm text-white flex flex-wrap items-center gap-2">

                                <span>
                                    ${escapeHTML(player.name)}
                                </span>

                                ${player.settledOnExit
                ? `
                                        <span
                                        class="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[9px] font-bold uppercase tracking-wider"
                                        >
                                        Settled & Left
                                        </span>
                                    `
                : ''
            }

                                </div>


                                <div class="text-[11px] text-slate-400 mt-0.5">

                                ${player.ballsCount}
                                money ball${player.ballsCount === 1
                ? ''
                : 's'
            }

                                &bull;

                                ${player.racksBroken}
                                break${player.racksBroken === 1
                ? ''
                : 's'
            }

                                ${stackText
                ? ` &bull; ${stackText}`
                : ''
            }

                                </div>


                                ${player.settledOnExit
                ? `
                                    <div class="text-[11px] text-blue-300 mt-1">
                                        Settled when leaving Rack #${player.leftAtRack || '?'
                }
                                    </div>
                                    `
                : ''
            }

                            </div>

                            </div>


                            <!-- Player Financial Result -->
                            <div class="text-right shrink-0">

                            <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                                Game Result
                            </div>

                            <div class="font-mono font-bold text-base ${gameNetColor}">
                                ${formatMoney(
                player.gameNet,
                true
            )}
                            </div>


                            ${Math.abs(
                player.remainingNet
            ) > 0.005

                ? `
                                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold mt-1">
                                    Remaining
                                    </div>

                                    <div class="font-mono font-bold text-xs ${remainingColor}">
                                    ${formatMoney(
                    player.remainingNet,
                    true
                )}
                                    </div>
                                `

                : `
                                    <div class="text-[10px] ${player.settledOnExit
                    ? 'text-blue-300'
                    : 'text-slate-400'
                } font-bold mt-1">

                                    ${player.settledOnExit
                    ? 'Paid'
                    : 'Square'
                }

                                    </div>
                                `
            }

                            </div>

                        </div>

                        </div>
                    `;

    }).join('')}

                </div>

                </div>


                <!-- Previously Completed Exit Settlements -->
                ${exitSettlements.length > 0
            ? `
                    <div class="mb-5">

                        <h3 class="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">
                        Already Settled
                        </h3>


                        <div class="space-y-3">

                        ${exitSettlements.map(exitSettlement => {

                const transactions =
                    Array.isArray(
                        exitSettlement.transactions
                    )
                        ? exitSettlement.transactions
                        : [];


                return `
                            <div
                                class="bg-blue-950/20 border border-blue-500/30 rounded-xl p-3.5"
                            >

                                <div class="flex items-center justify-between gap-3 mb-2">

                                <div>

                                    <div class="font-bold text-blue-200 text-sm">
                                    ✓ ${escapeHTML(
                    exitSettlement.playerName
                )} settled and left
                                    </div>

                                    <div class="text-[11px] text-slate-400 mt-0.5">
                                    Rack #${exitSettlement.rackNumber ||
                    '?'
                    }
                                    </div>

                                </div>


                                <div class="font-mono font-bold text-blue-300">

                                    ${formatMoney(
                        Math.abs(
                            exitSettlement.netAmount ||
                            0
                        )
                    )}

                                </div>

                                </div>


                                ${transactions.length === 0
                        ? `
                                    <div class="text-xs text-slate-400">
                                        Player was already even.
                                        No payment was required.
                                    </div>
                                    `

                        : `
                                    <div
                                        class="space-y-1.5 pt-2 border-t border-blue-500/20"
                                    >

                                        ${transactions.map(transaction => `

                                        <div
                                            class="flex items-center justify-between gap-3 text-xs"
                                        >

                                            <span class="text-slate-300">

                                            ${escapeHTML(
                            transaction.fromPlayerName
                        )}

                                            <span class="text-slate-500 mx-1">
                                                paid
                                            </span>

                                            ${escapeHTML(
                            transaction.toPlayerName
                        )}

                                            </span>


                                            <span class="font-mono font-bold text-blue-300">

                                            ${formatMoney(
                            transaction.amount
                        )}

                                            </span>

                                        </div>

                                        `).join('')}

                                    </div>
                                    `
                    }

                            </div>
                            `;

            }).join('')}

                        </div>

                    </div>
                    `

            : ''
        }


                <!-- Remaining Payouts -->
                <div class="mb-5">

                <div class="flex items-start justify-between gap-2 mb-2">

                    <div>

                    <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Remaining Payouts
                    </h3>

                    <p class="text-[11px] text-slate-400 mt-0.5">
                        Excludes payments already completed when players left.
                    </p>

                    </div>


                    <button
                    onclick="copySettlementSummary()"
                    class="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0"
                    >

                    <svg
                        class="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                    </svg>

                    Copy Text

                    </button>

                </div>


                ${simplified.length === 0
            ? `
                        <div
                        class="bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl p-4 text-center text-sm text-slate-400"
                        >
                        Everyone is square! No remaining payouts needed.
                        </div>
                    `

            : `
                        <div class="space-y-2">

                        ${simplified.map(settlement => `

                            <div
                            class="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl"
                            >

                            <div class="text-sm text-slate-200">

                                <span class="font-bold text-rose-300">
                                ${escapeHTML(
                settlement.from.name
            )}
                                </span>

                                <span class="text-slate-400 mx-1.5">
                                pays
                                </span>

                                <span class="font-bold text-emerald-300">
                                ${escapeHTML(
                settlement.to.name
            )}
                                </span>

                            </div>


                            <span
                                class="font-mono font-extrabold text-emerald-400 text-base"
                            >
                                ${formatMoney(
                settlement.amount
            )}
                            </span>

                            </div>

                        `).join('')}

                        </div>
                    `
        }

                </div>


                <!-- Remaining Direct Pairwise Debts -->
                ${pairwise.length > 0
            ? `
                    <details
                        class="mb-5 bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl p-3"
                    >

                        <summary
                        class="text-xs font-semibold text-slate-300 cursor-pointer select-none"
                        >
                        View Remaining Direct Debts
                        (${pairwise.length})
                        </summary>


                        <div
                        class="mt-2.5 space-y-1.5 pt-2 border-t border-slatefelt-700/60"
                        >

                        ${pairwise.map(debt => `

                            <div
                            class="flex justify-between text-xs text-slate-300"
                            >

                            <span>
                                ${escapeHTML(
                debt.from.name
            )}
                                &rarr;
                                ${escapeHTML(
                debt.to.name
            )}
                            </span>

                            <span
                                class="font-mono font-semibold text-slate-200"
                            >
                                ${formatMoney(
                debt.amount
            )}
                            </span>

                            </div>

                        `).join('')}

                        </div>

                    </details>
                    `

            : ''
        }


                <!-- Action Buttons -->
                <div class="flex flex-col sm:flex-row gap-2.5 pt-2">

                <button
                    onclick="closeModal()"
                    class="flex-1 py-3 px-4 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 text-slate-200 font-semibold text-sm transition"
                >
                    Back to Table
                </button>


                <button
                    onclick="resetToSetup()"
                    class="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition shadow-lg"
                >
                    End Match & New Setup
                </button>

                </div>


            </div>
            `;


    openModal(html);
}


function copySettlementSummary() {
    if (!state.game) return;
    const simplified = getSimplifiedSettlements();
    const lines = [
        `🎱 RingGame Pro Settlement (${state.game.format.toUpperCase()} - ${state.game.rackNumber} Racks)`,
        '-----------------------------------'
    ];
    state.game.players.forEach(p => {
        const net = getAdjustedPlayerNetBalance(p.id);
        lines.push(`${p.name}: ${formatMoney(net, true)}`);
    });
    lines.push('');
    lines.push('💸 Settle Up:');
    if (simplified.length === 0) {
        lines.push('All square ($0)!');
    } else {
        simplified.forEach(s => {
            lines.push(`• ${s.from.name} pays ${s.to.name} ${formatMoney(s.amount)}`);
        });
    }


    const text = lines.join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Settlement summary copied to clipboard!', 'success');
    } catch (err) {
        showToast('Unable to copy text.', 'warning');
    }
    document.body.removeChild(textarea);
}