// =========================================================
// RING GAME - RACK EDITOR
// =========================================================


// ---------------------------------------------------------
// Editor State
// ---------------------------------------------------------

let editingRackNumber = null;


// ---------------------------------------------------------
// Rack Editor Modal
// ---------------------------------------------------------

function openEditRackModal(rackNumber) {
    if (!state.game) return;
    const rack = state.game.racks.find(r => r.rackNumber === rackNumber);
    if (!rack) return;
    editingRackNumber = rackNumber;
    renderEditRackModalContent();
}


function renderEditRackModalContent() {
    const g = state.game;
    const rack = g.racks.find(r => r.rackNumber === editingRackNumber);
    if (!rack) return;

    /*
    * Only players who participated in this rack can be
    * assigned as breaker or shooter.
    */
    const eligiblePlayers =
        g.players.filter(player => {

            const joinedAtRack =
                player.joinedAtRack || 1;

            const leftAtRack =
                player.leftAtRack;

            return (
                joinedAtRack <= rack.rackNumber &&
                (
                    leftAtRack === null ||
                    leftAtRack === undefined ||
                    leftAtRack >= rack.rackNumber
                )
            );
        });


    const unpocketedBalls = g.moneyBalls.filter(
        mb => !rack.pocketedBalls.some(pb => pb.ball === mb.ball)
    );


    const html = `
            <div class="p-5 sm:p-6">
                <div class="flex items-center justify-between border-b border-slatefelt-700 pb-4">
                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-blue-400">Rack Adjustment</span>
                    <h2 class="text-xl font-extrabold text-white mt-0.5">Edit Rack #${rack.rackNumber}</h2>
                </div>
                <button onclick="closeModal()" class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slatefelt-800">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                </div>


                <div class="mt-4 bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3.5">
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Rack Breaker</label>
                <select
                    onchange="updateRackBreaker(${rack.rackNumber}, this.value)"
                    class="w-full bg-slatefelt-950 border border-slatefelt-700 rounded-lg px-3 py-2 text-sm text-white font-semibold">
                    ${eligiblePlayers.map(p => `
                    <option value="${p.id}" ${p.id === rack.breakerId ? 'selected' : ''}>${escapeHTML(p.name)}</option>
                    `).join('')}
                </select>
                </div>


                <div class="mt-4">
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Pocketed Money Balls in Rack #${rack.rackNumber}
                </h3>


                ${rack.pocketedBalls.length === 0 ? `
                    <div class="p-4 text-center bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl text-xs text-slate-400">
                    No money balls logged in Rack #${rack.rackNumber}.
                    </div>
                ` : `
                    <div class="space-y-2.5">
                    ${rack.pocketedBalls.map((pb, idx) => `
                        <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">
                        <div class="flex items-center gap-2.5">
                            ${renderPoolBallHTML(pb.ball, 'w-9 h-9', 'w-4 h-4 text-[11px]')}
                            <div>
                            <div class="font-bold text-sm text-white">${pb.ball}-Ball</div>
                            <div class="text-[11px] text-emerald-400 font-mono">${formatMoney(pb.value)} / player</div>
                            </div>
                        </div>


                        <div class="flex items-center gap-2 ml-auto">
                            <select
                            onchange="reassignPocketedBallShooter(${rack.rackNumber}, ${idx}, this.value)"
                            class="bg-slatefelt-950 border border-slatefelt-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white font-semibold">
                            ${eligiblePlayers.map(p => `
                                <option value="${p.id}" ${p.id === pb.shooterId ? 'selected' : ''}>${escapeHTML(p.name)}</option>
                            `).join('')}
                            </select>


                            <button
                            onclick="deletePocketedBallFromRack(${rack.rackNumber}, ${idx})"
                            class="p-2 rounded-lg bg-slatefelt-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition"
                            title="Remove / Mark Unpocketed">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                        </div>
                    `).join('')}
                    </div>
                `}
                </div>


                ${unpocketedBalls.length > 0 ? `
                <div class="mt-4 pt-4 border-t border-slatefelt-700/70">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Add Missed Money Ball to Rack #${rack.rackNumber}
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <select id="edit-rack-add-ball" class="sm:col-span-5 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-semibold">
                        ${unpocketedBalls.map(mb => `<option value="${mb.ball}">${mb.ball}-Ball (${formatMoney(mb.value)}/ea)</option>`).join('')}
                    </select>
                    <select id="edit-rack-add-player" class="sm:col-span-5 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white font-semibold">
                        ${eligiblePlayers.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
                    </select>
                    <button
                        onclick="addMissedBallToRack(${rack.rackNumber})"
                        class="sm:col-span-2 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm transition">
                        + Add
                    </button>
                    </div>
                </div>
                ` : ''}


                <div class="mt-6 pt-3 border-t border-slatefelt-700/70 flex justify-end">
                <button onclick="closeModal()" class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition">
                    Done & Save Changes
                </button>
                </div>
            </div>
            `;


    openModal(html);
}


// ---------------------------------------------------------
// Rack Breaker
// ---------------------------------------------------------

async function updateRackBreaker(rackNumber, newBreakerId) {
    const rack = state.game.racks.find(r => r.rackNumber === rackNumber);

    if (!rack) return;

    const breaker =
        state.game.players.find(
            player =>
                player.id === newBreakerId &&
                (player.joinedAtRack || 1) <= rackNumber &&
                (
                    player.leftAtRack === null ||
                    player.leftAtRack === undefined ||
                    player.leftAtRack >= rackNumber
                )
        );


    if (!breaker) {

        showToast(
            'That player did not participate in this rack.',
            'warning'
        );

        return;
    }

    pushSnapshot();
    rack.breakerId = newBreakerId;
    await saveAndSyncGame();
    render();
    renderEditRackModalContent();
    showToast(`Updated Rack #${rackNumber} breaker.`, 'info');
}


// ---------------------------------------------------------
// Pocketed Money Balls
// ---------------------------------------------------------

async function reassignPocketedBallShooter(rackNumber, pocketIndex, newShooterId) {
    const rack = state.game.racks.find(r => r.rackNumber === rackNumber);
    if (!rack || !rack.pocketedBalls[pocketIndex]) return;

    const shooter =
        state.game.players.find(
            player =>
                player.id === newShooterId &&
                (player.joinedAtRack || 1) <= rackNumber &&
                (
                    player.leftAtRack === null ||
                    player.leftAtRack === undefined ||
                    player.leftAtRack >= rackNumber
                )
        );

    if (!shooter) {

        showToast(
            'That player did not participate in this rack.',
            'warning'
        );

        return;
    }

    pushSnapshot();
    const entry = rack.pocketedBalls[pocketIndex];
    entry.shooterId = newShooterId;
    recalculateAllBalancesFromRacks();


    state.game.history.unshift({
        id: Date.now(),
        type: 'rack_edit',
        rack: rackNumber,
        description: `Reassigned ${entry.ball}-Ball in Rack #${rackNumber} to ${shooter.name}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    await saveAndSyncGame();
    render();
    renderEditRackModalContent();
    showToast(`Reassigned ${entry.ball}-Ball & recalculated balances.`, 'success');
}


async function deletePocketedBallFromRack(rackNumber, pocketIndex) {
    const rack = state.game.racks.find(r => r.rackNumber === rackNumber);
    if (!rack || !rack.pocketedBalls[pocketIndex]) return;
    pushSnapshot();
    const [removed] = rack.pocketedBalls.splice(pocketIndex, 1);
    recalculateAllBalancesFromRacks();


    state.game.history.unshift({
        id: Date.now(),
        type: 'rack_edit',
        rack: rackNumber,
        description: `Removed ${removed.ball}-Ball from Rack #${rackNumber}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });


    await saveAndSyncGame();
    render();
    renderEditRackModalContent();
    showToast(`Removed ${removed.ball}-Ball from Rack #${rackNumber}.`, 'info');
}


// ---------------------------------------------------------
// Missing Money Balls
// ---------------------------------------------------------

async function addMissedBallToRack(rackNumber) {
    const rack = state.game.racks.find(r => r.rackNumber === rackNumber);
    if (!rack) return;
    const ballSelect = document.getElementById('edit-rack-add-ball');
    const playerSelect = document.getElementById('edit-rack-add-player');
    if (!ballSelect || !playerSelect) return;


    const ballNum = parseInt(ballSelect.value, 10);
    const shooterId = playerSelect.value;
    const mbConfig = state.game.moneyBalls.find(m => m.ball === ballNum);
    if (!mbConfig) {
        return;
    }

    const shooter =
        state.game.players.find(
            player =>
                player.id === shooterId &&
                (player.joinedAtRack || 1) <= rackNumber &&
                (
                    player.leftAtRack === null ||
                    player.leftAtRack === undefined ||
                    player.leftAtRack >= rackNumber
                )
        );


    if (!shooter) {

        showToast(
            'That player did not participate in this rack.',
            'warning'
        );

        return;
    }


    pushSnapshot();
    rack.pocketedBalls.push({
        id: 'pb_edit_' + Date.now(),
        ball: ballNum,
        value: mbConfig.value,
        shooterId,
        totalCollected: 0,
        breakdown: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });


    recalculateAllBalancesFromRacks();

    state.game.history.unshift({
        id: Date.now(),
        type: 'rack_edit',
        rack: rackNumber,
        description: `Added missed ${ballNum}-Ball in Rack #${rackNumber} for ${shooter.name}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });


    await saveAndSyncGame();
    render();
    renderEditRackModalContent();
    showToast(`Added ${ballNum}-Ball to Rack #${rackNumber} & updated balances.`, 'success');
}