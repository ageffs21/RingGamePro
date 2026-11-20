// =========================================================
// RING GAME - USER INTERFACE
// =========================================================


// ---------------------------------------------------------
// UI State & Navigation
// ---------------------------------------------------------

let activeTab = 'table'; // 'table' | 'racks' | 'ledger' | 'history'


/**
 * Change the active live-game tab and redraw the
 * Ring Game interface.
 */
function switchTab(tab) {
    activeTab = tab;
    render();
}


// ---------------------------------------------------------
// Setup View
// ---------------------------------------------------------

/**
 * Render the Ring Game setup screen.
 *
 * Hosts and offline players can configure the roster,
 * shooting order, format, money balls, and buy-in rules.
 * Joined online participants receive a read-only view of
 * the authoritative lobby configuration.
 */
function renderSetupView() {
    const cfg = state.config;
    const isOnlineParticipant =
        cfg.isOnline &&
        cfg.onlineRole !== 'host';


    // Set the highest available ball based on the selected format.
    let maxBall = 15;

    if (cfg.format === '9-ball') {
        maxBall = 9;
    } else if (cfg.format === '10-ball') {
        maxBall = 10;
    }

    // Build the available ball list and remove balls
    // that are already configured as money balls.
    const availableBalls = Array.from(
        { length: maxBall },
        (_, i) => i + 1
    ).filter(n =>
        !cfg.moneyBalls.some(mb => mb.ball === n)
    );


    return `
            <div class="space-y-6 max-w-3xl mx-auto">
                <div class="bg-gradient-to-br from-slatefelt-850 to-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                <h2 class="text-lg sm:text-xl font-extrabold text-white">New Ring Game Setup</h2>
                <p class="text-xs sm:text-sm text-slate-400 mt-1">
                    Configure players, shooting rotation, money balls, and per-ball stakes before breaking Rack #1.
                </p>
                </div>

                <!-- Online Lobby -->
                <section class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg mb-5">

                  ${cfg.isOnline
            ? `
                        <div class="flex flex-wrap items-center justify-between gap-4">

                            <div>
                            <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                                Online Lobby
                            </div>

                            <h3 class="text-base font-bold text-white mt-1">
                                Players can join before the match starts
                            </h3>

                            <div class="text-xs text-slate-400 mt-2">
                                Join Code
                            </div>

                            <div class="font-mono font-extrabold text-2xl tracking-[0.18em] text-white mt-1">
                                ${escapeHTML(cfg.joinCode || '')}
                            </div>
                            </div>

                            <div class="flex flex-col sm:flex-row gap-2">

                              <button
                                onclick="copyJoinCode(state.config?.joinCode)"
                                class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition"
                              >
                                Copy Code
                              </button>

                              <button
                                onclick="refreshLobbyPlayers()"
                                class="px-4 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-600 text-white text-sm font-bold transition"
                              >
                                Refresh Players
                              </button>

                            </div>

                              <div class="mt-4 flex justify-center">

                                    <div
                                        id="setup-join-qr"
                                        class="bg-white p-2 rounded-xl"
                                    ></div>

                                </div>

                                <div class="text-center text-[11px] text-slate-500 mt-2">
                                    Scan to join
                                </div>   

                        </div>

                        <p class="text-xs text-slate-400 mt-3">
                            Keep this screen open while players join.
                            Set or randomize the shooting order before starting the match.
                        </p>

                        ${cfg.onlineRole === 'host'
                ? `
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">

                                <button
                                    onclick="openSetupGuestModal()"
                                    ${cfg.players.length >= 12 ? 'disabled' : ''}
                                    class="py-2.5 px-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 disabled:pointer-events-none border border-amber-500/40 text-amber-300 text-sm font-bold transition"
                                >
                                    + Add Guest
                                </button>

                                <button
                                    onclick="confirmAbandonOnlineLobby()"
                                    class="py-2.5 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 text-rose-300 text-sm font-bold transition"
                                >
                                    Abandon Lobby
                                </button>

                                </div>
                            `
                : `
                                <div class="mt-4">

                                <div class="px-3 py-2.5 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs text-blue-300 mb-2">
                                    Waiting for the host to finalize the shooting order and start the match.
                                </div>

                                <button
                                    onclick="confirmLeaveOnlineLobby()"
                                    class="w-full py-2.5 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/40 text-rose-300 text-sm font-bold transition"
                                >
                                    Leave Lobby
                                </button>

                                </div>
                            `
            }
                        `

            : currentUser
                ? `
                        <div class="space-y-4">

                          <div class="flex flex-wrap items-center justify-between gap-4">

                            <div>

                              <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                                Online Game
                              </div>

                              <h3 class="text-base font-bold text-white mt-1">
                                Play With Other PoolApp Users
                              </h3>

                              <p class="text-xs text-slate-400 mt-1">
                                Create a new lobby or join an existing game.
                              </p>

                            </div>


                            <button
                              onclick="createSetupOnlineLobby()"
                              class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition"
                            >
                              Create Online Lobby
                            </button>

                          </div>


                          <div class="border-t border-slatefelt-700 pt-4">

                            <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                              Join Existing Game
                            </div>


                            <div class="flex gap-2">

                              <input
                                id="join-game-code"
                                type="text"
                                maxlength="6"
                                placeholder="ABC123"
                                oninput="this.value = this.value.toUpperCase()"
                                class="flex-1 min-w-0 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-white font-mono font-extrabold uppercase tracking-widest"
                              />


                              <button
                                onclick="submitRingGameJoinCode()"
                                class="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-extrabold transition"
                              >
                                Join Game
                              </button>

                            </div>

                          </div>

                        </div>
                      `

                : `
                        <div>
                        <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                            Online Game
                        </div>

                        <div class="text-sm font-bold text-white mt-1">
                            Sign in to create an online lobby
                        </div>
                        </div>
                    `
        }

                </section>

                <section class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                    <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Step 1</span>
                    <h3 class="text-base font-bold text-white">
                      ${cfg.isOnline
            ? 'Lobby & Shooting Order'
            : 'Players & Shooting Rotation'
        }
                    </h3>
                    </div>

                    ${!cfg.isOnline ? `
                      <div class="flex items-center gap-1.5 bg-slatefelt-950 p-1 rounded-xl border border-slatefelt-700/80 overflow-x-auto whitespace-nowrap">

                        ${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `
                          <button
                            onclick="setPlayerCount(${n})"
                            class="w-8 h-8 flex-none rounded-lg text-xs font-bold transition ${cfg.playerCount === n
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white hover:bg-slatefelt-800'
            }"
                          >
                            ${n}
                          </button>
                        `).join('')}

                      </div>

                    ` : `

                      <div class="px-3 py-2 rounded-xl bg-blue-950/25 border border-blue-500/30 text-xs text-blue-300 font-bold whitespace-nowrap">
                        ${cfg.players.length} / 12 Joined
                      </div>

                    `}

                </div>

                ${!isOnlineParticipant ? `
                    <div class="flex items-center justify-between bg-slatefelt-850/80 px-3.5 py-2.5 rounded-xl border border-slatefelt-700/60">
                        <span class="text-xs text-slate-300">Drag rows or use arrows to set order, or draw pills:</span>
                        <button
                        onclick="randomizePlayerOrder()"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Randomize Order
                        </button>
                    </div>
                ` : '' }

                <div class="space-y-2">
                    ${cfg.players.map((p, idx) => `
                        <div
                            draggable="${!isOnlineParticipant}"
                            ${!isOnlineParticipant
                                                    ? `
                                    ondragstart="handleDragStart(event, ${idx})"
                                    ondragover="handleDragOver(event)"
                                    ondrop="handleDrop(event, ${idx})"
                                  `
                                                    : ''
                            }
                        class="flex items-center gap-2.5 bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-2.5 transition hover:border-slate-500">
                        ${!isOnlineParticipant ? `
                            <div
                                class="cursor-grab text-slate-500 hover:text-slate-300 px-1"
                                title="Drag to reorder"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 8h16M4 16h16"
                                    />
                                </svg>
                            </div>
                        ` : ''}
                        <div class="w-7 h-7 rounded-lg ${idx === 0 ? 'bg-emerald-500 text-slate-950' : 'bg-slatefelt-700 text-slate-200'} font-mono font-extrabold text-xs flex items-center justify-center shrink-0">
                        ${idx === 0 ? '1st' : '#' + (idx + 1)}
                        </div>
                        <input
                            type="text"
                            value="${escapeHTML(p.name)}"
                            ${!isOnlineParticipant
                                                    ? `oninput="updatePlayerName(${idx}, this.value)"`
                                                    : 'readonly'
                                                }
                            placeholder="Player ${idx + 1}"
                            class="flex-1 min-w-0 bg-slatefelt-950 border border-slatefelt-700 rounded-lg px-3 py-2 text-sm text-white font-medium
                                ${isOnlineParticipant
                                                    ? 'cursor-default text-slate-300'
                                                    : ''
                                }"
                        />
                        ${!isOnlineParticipant ? `
                            <div class="flex items-center gap-1">

                                <button
                                    onclick="movePlayerOrder(${idx}, -1)"
                                    ${idx === 0 ? 'disabled' : ''}
                                    class="p-2 rounded-lg bg-slatefelt-800 hover:bg-slatefelt-700 disabled:opacity-30 text-slate-300 transition"
                                    title="Move Up"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M5 15l7-7 7 7"
                                        />
                                    </svg>
                                </button>

                                <button
                                    onclick="movePlayerOrder(${idx}, 1)"
                                    ${idx === cfg.players.length - 1 ? 'disabled' : ''}
                                    class="p-2 rounded-lg bg-slatefelt-800 hover:bg-slatefelt-700 disabled:opacity-30 text-slate-300 transition"
                                    title="Move Down"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 9l-7 7-7-7"
                                        />
                                    </svg>
                                </button>

                            </div>
                        ` : ''}
                    </div>
                    `).join('')}
                </div>
                </section>

                ${!isOnlineParticipant ? `

                <section class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg space-y-4">
                <div>
                    <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Step 2</span>
                    <h3 class="text-base font-bold text-white">Game Format & Money Balls</h3>
                </div>


                <div class="grid grid-cols-3 gap-2">
                    ${[
                { id: '9-ball', label: '9-Ball Ring', sub: '5 & 9 Money' },
                { id: '10-ball', label: '10-Ball Ring', sub: '5 & 10 Money' },
                { id: 'custom', label: 'Custom Rules', sub: 'Any Money Balls' }
            ].map(f => `
                    <button
                        onclick="setGameFormat('${f.id}')"
                        class="p-3 rounded-xl border text-left transition ${cfg.format === f.id ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slatefelt-850 border-slatefelt-700/70 text-slate-400 hover:text-slate-200'}">
                        <div class="font-bold text-xs sm:text-sm">${f.label}</div>
                        <div class="text-[11px] opacity-75 mt-0.5">${f.sub}</div>
                    </button>
                    `).join('')}
                </div>


                <div class="space-y-2.5 pt-1">
                    <div class="flex items-center justify-between">
                    <label class="text-xs font-semibold text-slate-300">Active Money Balls (Paid by every other player)</label>
                    </div>


                    ${cfg.moneyBalls.map((mb, idx) => `
                    <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3">
                        <div class="flex items-center gap-3">
                        ${renderPoolBallHTML(mb.ball, 'w-10 h-10', 'w-5 h-5 text-xs')}
                        <div>
                            <div class="font-bold text-sm text-white">${mb.ball}-Ball</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">Money Ball</div>
                        </div>
                        </div>


                        <div class="flex items-center gap-2 ml-auto">
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono font-bold text-sm">$</span>
                            <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            value="${mb.value}"
                            oninput="updateMoneyBallValue(${idx}, this.value)"
                            class="w-24 bg-slatefelt-950 border border-slatefelt-700 rounded-lg pl-7 pr-2.5 py-2 text-right font-mono font-bold text-sm text-white"
                            />
                        </div>
                        <button
                            onclick="removeMoneyBall(${idx})"
                            class="p-2 rounded-lg bg-slatefelt-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition"
                            title="Remove Money Ball">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                        </div>
                    </div>
                    `).join('')}


                    ${availableBalls.length > 0 ? `
                    <div class="flex items-center gap-2 pt-1">
                        <select id="add-ball-select" class="flex-1 bg-slatefelt-950 border border-slatefelt-700 rounded-xl px-3 py-2.5 text-sm text-slate-200">
                        ${availableBalls.map(n => `<option value="${n}">${n} Ball</option>`).join('')}
                        </select>
                        <button
                        onclick="addCustomMoneyBall(document.getElementById('add-ball-select').value)"
                        class="px-4 py-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-600 text-white text-sm font-bold transition">
                        + Add Ball
                        </button>
                    </div>
                    ` : ''}
                </div>
                </section>


                <section class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg space-y-4">
                <div>
                    <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Step 3</span>
                    <h3 class="text-base font-bold text-white">Bankroll Tracking Mode</h3>
                </div>


                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                    onclick="toggleBuyIn(false)"
                    class="p-3.5 rounded-xl border text-left transition ${!cfg.useBuyIn ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slatefelt-850 border-slatefelt-700/70 text-slate-400 hover:text-slate-200'}">
                    <div class="font-bold text-sm">Open Running Tab ($0 Start)</div>
                    <p class="text-xs opacity-80 mt-1">Track pure +/- net winnings continuously with no elimination.</p>
                    </button>


                    <button
                    onclick="toggleBuyIn(true)"
                    class="p-3.5 rounded-xl border text-left transition ${cfg.useBuyIn ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slatefelt-850 border-slatefelt-700/70 text-slate-400 hover:text-slate-200'}">
                    <div class="font-bold text-sm">Starting Buy-In Stack (Knockout)</div>
                    <p class="text-xs opacity-80 mt-1">Everyone buys in for a fixed stack; players are eliminated at $0.</p>
                    </button>
                </div>


                ${cfg.useBuyIn ? `
                    <div class="flex items-center justify-between bg-slatefelt-850 border border-slatefelt-700/70 rounded-xl p-3.5">
                    <label class="text-sm font-semibold text-slate-200">Starting Stack per Player</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono font-bold text-sm">$</span>
                        <input
                        type="number"
                        min="1"
                        step="5"
                        value="${cfg.buyInAmount}"
                        oninput="updateBuyInAmount(this.value)"
                        class="w-28 bg-slatefelt-950 border border-slatefelt-700 rounded-lg pl-7 pr-3 py-2 text-right font-mono font-bold text-sm text-white"
                        />
                    </div>
                    </div>
                ` : ''}
                </section>


                <button
                id="start-match-btn"
                type="button"
                onclick="startMatch()"
                class="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base sm:text-lg tracking-tight shadow-xl transition transform active:scale-[0.99] cursor-pointer">
                Break Rack #1 & Start Ring Game &rarr;
                </button>
                ` : ''}
            </div>
            `;
}


// ---------------------------------------------------------
// Live Game View
// ---------------------------------------------------------

/**
 * Render the active Ring *ame interface.
 *
 * The host cont*ols shooter rotation, scoring, und*, and
 * rack advancement. Joined *nline players receive the same
 * *ynchronized game state with gamepl*y controls disabled.
 */
function renderLiveView() {
    const g = state.game;
    /*
     * Joined online players receive a synchronized,
     * read-only view. Only the host controls gameplay.
     */
    const isOnlineViewer =
        g.isOnline &&
        state.config.onlineRole === 'player'

    const activeIndices = getActivePlayerIndices();
    const shooterIdx = g.currentShooterIndex;
    const shooter = g.players[shooterIdx];
    const onDeckIdx = getNextActiveIndex(shooterIdx);
    const onDeckPlayer = g.players[onDeckIdx];
    const otherActiveCount = Math.max(0, activeIndices.length - 1);
    const currentRack = getCurrentRack();
    const pocketedInCurrentRack = currentRack ? currentRack.pocketedBalls : [];
    const remainingBallsCount = Math.max(0, g.moneyBalls.length - pocketedInCurrentRack.length);


    const simplified = getSimplifiedSettlements();
    const pairwise = getPairwiseNetDebts();


    return `
            <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-3 bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl px-4 py-3 shadow">
                <div class="flex items-center gap-2.5">
                    <button
                    onclick="switchTab('racks')"
                    class="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-mono font-extrabold text-sm transition"
                    title="View Racks & Stats">
                    RACK #${g.rackNumber}
                    </button>
                    <div class="text-xs sm:text-sm text-slate-300">
                    <span class="font-bold text-white uppercase">${escapeHTML(g.format || state.config.format)}</span>
                    <span class="mx-1.5 text-slate-600">&bull;</span>
                    <span>${pocketedInCurrentRack.length}/${g.moneyBalls.length} Balls Made</span>
                    </div>
                </div>


                <div class="flex items-center bg-slatefelt-950 p-1 rounded-xl border border-slatefelt-700/80 w-full sm:w-auto overflow-x-auto">
                    <button
                    onclick="switchTab('table')"
                    class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === 'table' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}">
                    Live Table
                    </button>
                    <button
                    onclick="switchTab('racks')"
                    class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === 'racks' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}">
                    Racks & Stats (${g.racks.length})
                    </button>
                    <button
                    onclick="switchTab('ledger')"
                    class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === 'ledger' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}">
                    Balances
                    </button>
                    <button
                    onclick="switchTab('history')"
                    class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${activeTab === 'history' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}">
                    Log (${g.history.length})
                    </button>
                </div>
                </div>


                ${activeTab === 'table' ? `
                <div class="ring-live-grid grid grid-cols-1 gap-5">
                    <div class="ring-live-main space-y-5">
                    <div class="bg-gradient-to-br from-slatefelt-850 via-slatefelt-900 to-slatefelt-950 border-2 border-emerald-500/70 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                        <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                            At The Table
                            </div>
                            <h2 class="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
                            ${escapeHTML(shooter.name)}
                            </h2>
                            <p class="text-xs sm:text-sm text-slate-400 mt-1">
                            On Deck: <span class="font-bold text-blue-400">${escapeHTML(onDeckPlayer.name)}</span>
                            </p>
                        </div>


                        <div class="text-right">
                            <div class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                            ${g.useBuyIn ? 'Current Stack' : 'Net Balance'}
                            </div>
                            ${(() => {
                const net = getAdjustedPlayerNetBalance(shooter.id);
                const displayVal = g.useBuyIn ? (g.buyInAmount + net) : net;
                const color = net > 0 ? 'text-emerald-400' : (net < 0 ? 'text-rose-400' : 'text-white');
                return `<div class="text-2xl font-mono font-extrabold ${color} mt-0.5">${formatMoney(displayVal, !g.useBuyIn)}</div>`;
            })()}
                        </div>
                        </div>

                        ${!isOnlineViewer ? `
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 pt-4 border-t border-slatefelt-700/70">
                            <button
                                onclick="nextShooter()"
                                class="col-span-2 sm:col-span-1 py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg transition active:scale-[0.98]">
                                <span>Next Shooter</span>
                                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                            </button>


                            <button
                                onclick="passShotBack()"
                                ${!g.canPassBack ? 'disabled' : ''}
                                class="py-3 px-2.5 rounded-xl bg-slatefelt-800 hover:bg-amber-600/20 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-35 disabled:pointer-events-none border border-slatefelt-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                                title="Pass shot back if incoming player calls a safety">
                                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                <span>Pass Back</span>
                            </button>


                            ${!isOnlineViewer ? `
                            <button
                                onclick="undoLastAction()"
                                ${g.snapshots.length === 0 ? 'disabled' : ''}
                                class="py-3 px-2.5 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 disabled:opacity-35 disabled:pointer-events-none border border-slatefelt-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition">
                                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg>
                                <span>Undo</span>
                            </button>
                            ` : ''}


                            <button
                                onclick="openNextRackModal()"
                                class="col-span-2 sm:col-span-1 py-3 px-2.5 rounded-xl bg-slatefelt-800 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                                title="Re-rack and advance to next rack">
                                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                <span>Next Rack</span>
                            </button>
                            </div>
                        ` : `
                            <div class="mt-5 pt-4 border-t border-slatefelt-700/70">
                                <div class="px-3 py-2.5 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs text-blue-300 text-center font-semibold">
                                    Live View • Host controls scoring
                                </div>
                            </div>
                        `}

                    </div>


                    <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                        <div>
                            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white">Rack #${g.rackNumber} Money Balls</h3>
                            <p class="text-xs text-slate-400">
                            Play continues until all money balls are made (<span class="text-emerald-400 font-semibold">${remainingBallsCount} remaining</span>)
                            </p>
                        </div>
                        </div>


                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        ${g.moneyBalls.map(mb => {
                const pocketRecord = pocketedInCurrentRack.find(pb => pb.ball === mb.ball);
                const isPocketed = Boolean(pocketRecord);
                const pocketShooter = isPocketed ? getPlayerById(pocketRecord.shooterId) : null;
                const potTotal = mb.value * otherActiveCount;


                if (isPocketed) {
                    return `
                                <div class="relative flex items-center justify-between p-4 rounded-2xl bg-slatefelt-950/80 border border-slatefelt-800 opacity-75 select-none">
                                <div class="flex items-center gap-3.5">
                                    <div class="opacity-50 grayscale">
                                    ${renderPoolBallHTML(mb.ball, 'w-12 h-12', 'w-6 h-6 text-sm')}
                                    </div>
                                    <div>
                                    <div class="font-extrabold text-base text-slate-400 line-through">
                                        ${mb.ball}-Ball
                                    </div>
                                    <div class="text-xs text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                                        <span>✓ Made by ${escapeHTML(pocketShooter ? pocketShooter.name : 'Player')}</span>
                                    </div>
                                    </div>
                                </div>


                                <div class="text-right">
                                    <span class="inline-block px-2 py-1 rounded-lg bg-slatefelt-850 border border-slatefelt-700 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Pocketed
                                    </span>
                                </div>
                                </div>
                            `;
                }


                return `
                            <button
                              type="button"
                              ${isOnlineViewer ? 'disabled' : ''}
                              onclick='scoreMoneyBall(${JSON.stringify(mb)})'
                              class="relative flex items-center justify-between p-4 rounded-2xl bg-slatefelt-850 hover:bg-slatefelt-800 border-2 border-slatefelt-700 hover:border-emerald-500 transition transform active:scale-[0.98] shadow-md text-left disabled:opacity-60 disabled:pointer-events-none">
                                <div class="flex items-center gap-3.5">
                                ${renderPoolBallHTML(mb.ball, 'w-12 h-12', 'w-6 h-6 text-sm')}
                                <div>
                                    <div class="font-extrabold text-base text-white">
                                    ${mb.ball}-Ball
                                    </div>
                                    <div class="text-xs text-slate-400 mt-0.5">
                                    ${formatMoney(mb.value)} / player
                                    </div>
                                </div>
                                </div>


                                <div class="text-right">
                                <div class="font-mono font-extrabold text-lg text-emerald-400 transition-transform">
                                    +${formatMoney(potTotal)}
                                </div>
                                <div class="text-[10px] text-slate-400 uppercase font-semibold">Collect</div>
                                </div>
                            </button>
                            `;
            }).join('')}
                        </div>
                    </div>
                    </div>


                    <div class="ring-live-side space-y-5">
                    <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                        <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-extrabold uppercase tracking-wider text-white">Rotation & Standings</h3>
                        <span class="text-[11px] text-slate-400">${g.useBuyIn ? `Buy-in: ${formatMoney(g.buyInAmount)}` : 'Net +/-'}</span>
                        </div>


                        <div class="space-y-2">
                        ${g.players
                .map((p, idx) => ({ p, idx }))
                .filter(item => item.p.active !== false)
                .map(({ p, idx }) => {

                    const isShooter = idx === shooterIdx;
                    const isOnDeck = idx === onDeckIdx && !p.eliminated;
                    const net = getAdjustedPlayerNetBalance(p.id);
                    const stack = g.buyInAmount + net;
                    const displayVal = g.useBuyIn ? stack : net;
                    const valColor = net > 0 ? 'text-emerald-400' : (net < 0 ? 'text-rose-400' : 'text-slate-300');


                    return `
                            <div class="flex items-center justify-between p-3 rounded-xl border transition ${p.eliminated
                            ? 'bg-slatefelt-950/60 border-slatefelt-800 opacity-50'
                            : isShooter
                                ? 'bg-emerald-950/35 border-emerald-500 active-shooter-ring'
                                : isOnDeck
                                    ? 'bg-blue-950/20 border-blue-500/40'
                                    : 'bg-slatefelt-850 border-slatefelt-700/60'
                        }">
                                <div class="flex items-center gap-3 min-w-0">
                                <span class="w-6 h-6 rounded-lg font-mono text-xs font-extrabold flex items-center justify-center shrink-0 ${isShooter ? 'bg-emerald-500 text-slate-950' : 'bg-slatefelt-700 text-slate-300'
                        }">
                                    ${idx + 1}
                                </span>
                                <div class="truncate">
                                    <div class="font-bold text-sm text-white truncate flex items-center gap-2">
                                    <span>${escapeHTML(p.name)}</span>
                                    ${isShooter ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-extrabold uppercase">Shooting</span>' : ''}
                                    ${isOnDeck ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold uppercase">On Deck</span>' : ''}
                                    ${p.eliminated ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold uppercase">Busted</span>' : ''}
                                    </div>
                                    ${g.useBuyIn ? `<div class="text-[11px] text-slate-400 font-mono">Net: ${formatMoney(net, true)}</div>` : ''}
                                </div>
                                </div>


                                <div class="font-mono font-extrabold text-base ${valColor} pl-2">
                                ${formatMoney(displayVal, !g.useBuyIn)}
                                </div>
                            </div>
                            `;
                }).join('')}
                        </div>
                    </div>


                    <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                        <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-extrabold uppercase tracking-wider text-white">Who Owes Whom</h3>
                        <button onclick="switchTab('ledger')" class="text-xs font-semibold text-emerald-400 hover:underline">Full Breakdown &rarr;</button>
                        </div>


                        ${simplified.length === 0 ? `
                        <p class="text-xs text-slate-400 py-2">All players are currently even ($0).</p>
                        ` : `
                        <div class="space-y-2">
                            ${simplified.slice(0, 4).map(s => `
                            <div class="flex items-center justify-between text-xs bg-slatefelt-850 px-3 py-2 rounded-lg border border-slatefelt-700/50">
                                <div>
                                <span class="font-bold text-rose-300">${escapeHTML(s.from.name)}</span>
                                <span class="text-slate-400 mx-1">owes</span>
                                <span class="font-bold text-emerald-300">${escapeHTML(s.to.name)}</span>
                                </div>
                                <span class="font-mono font-bold text-white">${formatMoney(s.amount)}</span>
                            </div>
                            `).join('')}
                        </div>
                        `}
                    </div>
                    </div>
                </div>
                ` : ''}


                ${activeTab === 'racks' ? renderRacksAndStatsTab() : ''}


                ${activeTab === 'ledger' ? `
                <div class="max-w-3xl mx-auto space-y-5">
                    <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                        <h3 class="text-base font-extrabold text-white">Smart Settle-Up (Simplified Transfers)</h3>
                        <p class="text-xs text-slate-400">Consolidates circular debts into the minimum number of payments.</p>
                        </div>
                        <button onclick="copySettlementSummary()" class="px-3 py-1.5 rounded-lg bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-600 text-xs font-bold text-slate-200">
                        Copy Summary
                        </button>
                    </div>


                    ${simplified.length === 0 ? `
                        <div class="p-6 text-center bg-slatefelt-850 rounded-xl border border-slatefelt-700/60 text-sm text-slate-400">
                        No debts recorded yet — everyone is square!
                        </div>
                    ` : `
                        <div class="space-y-2.5">
                        ${simplified.map(s => `
                            <div class="flex items-center justify-between bg-emerald-950/25 border border-emerald-500/35 px-4 py-3 rounded-xl">
                            <div class="text-sm">
                                <span class="font-bold text-rose-300">${escapeHTML(s.from.name)}</span>
                                <span class="text-slate-400 mx-2">pays</span>
                                <span class="font-bold text-emerald-300">${escapeHTML(s.to.name)}</span>
                            </div>
                            <span class="font-mono font-extrabold text-lg text-emerald-400">${formatMoney(s.amount)}</span>
                            </div>
                        `).join('')}
                        </div>
                    `}
                    </div>


                    <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                    <h3 class="text-base font-extrabold text-white mb-1">Direct Head-to-Head Net Debts</h3>
                    <p class="text-xs text-slate-400 mb-4">Exact net balance between every individual pair of players.</p>


                    ${pairwise.length === 0 ? `
                        <p class="text-xs text-slate-400">No pairwise balances yet.</p>
                    ` : `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        ${pairwise.map(d => `
                            <div class="flex items-center justify-between bg-slatefelt-850 border border-slatefelt-700/60 px-3.5 py-2.5 rounded-xl text-sm">
                            <div>
                                <span class="font-semibold text-rose-300">${escapeHTML(d.from.name)}</span>
                                <span class="text-slate-500 mx-1.5">&rarr;</span>
                                <span class="font-semibold text-emerald-300">${escapeHTML(d.to.name)}</span>
                            </div>
                            <span class="font-mono font-bold text-white">${formatMoney(d.amount)}</span>
                            </div>
                        `).join('')}
                        </div>
                    `}
                    </div>
                </div>
                ` : ''}


                ${activeTab === 'history' ? `
                <div class="max-w-3xl mx-auto bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                    <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-base font-extrabold text-white">Rack & Shot History</h3>
                        <p class="text-xs text-slate-400">Chronological log of all money balls, turns, and pass-backs.</p>
                    </div>
                        ${!isOnlineViewer ? `
                        <button
                         onclick="undoLastAction()"
                         ${g.snapshots.length === 0 ? 'disabled' : ''}
                         class="px-3.5 py-2 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 disabled:opacity-40 text-xs font-bold text-slate-200 border border-slatefelt-600">
                         Undo Last
                        </button>
                        ` : ''}
                    </div>

                    ${g.history.length === 0 ? `
                    <div class="p-8 text-center text-sm text-slate-400 bg-slatefelt-850 rounded-xl border border-slatefelt-700/60">
                        No events logged yet in Rack #1.
                    </div>
                    ` : `
                    <div class="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                        ${g.history.map(ev => {
                    if (ev.type === 'money_ball') {
                        return `
                            <div class="flex items-center justify-between bg-slatefelt-850 border border-emerald-500/30 p-3 rounded-xl">
                                <div class="flex items-center gap-3">
                                ${renderPoolBallHTML(ev.ball, 'w-9 h-9', 'w-4 h-4 text-[11px]')}
                                <div>
                                    <div class="text-sm font-bold text-white">
                                    ${escapeHTML(ev.shooterName)} pocketed the ${ev.ball}-Ball
                                    </div>
                                    <div class="text-[11px] text-slate-400">
                                    Rack #${ev.rack} &bull; ${ev.timestamp} &bull; Paid by ${ev.breakdown.map(b => `${escapeHTML(b.payerName)} (${formatMoney(b.amount)})`).join(', ')}
                                    </div>
                                </div>
                                </div>
                                <div class="font-mono font-extrabold text-emerald-400 text-sm pl-2">
                                +${formatMoney(ev.totalCollected)}
                                </div>
                            </div>
                            `;
                    }
                    if (ev.type === 'new_rack') {
                        return `
                            <div class="flex items-center justify-between bg-amber-950/25 border border-amber-500/30 px-3.5 py-2.5 rounded-xl text-xs">
                                <span class="font-bold text-amber-300">🎱 Rack #${ev.rack} Started — ${escapeHTML(ev.breakerName)} breaks</span>
                                <span class="text-slate-400">${ev.timestamp}</span>
                            </div>
                            `;
                    }
                    if (ev.type === 'player_joined') {
                        return `
                                <div class="flex items-center justify-between bg-emerald-950/25 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs">
                                    <span class="text-emerald-300 font-medium">
                                    ${escapeHTML(ev.playerName)} joined the game
                                    </span>

                                    <span class="text-slate-500">
                                    Rack #${ev.rack} &bull; ${ev.timestamp}
                                    </span>
                                </div>
                            `;
                    }
                    if (ev.type === 'player_left') {
                        return `
                                <div class="flex items-center justify-between bg-rose-950/25 border border-rose-500/30 px-3.5 py-2 rounded-xl text-xs">
                                    <span class="text-rose-300 font-medium">
                                    ${escapeHTML(ev.playerName)} left the game
                                    </span>

                                    <span class="text-slate-500">
                                    Rack #${ev.rack} &bull; ${ev.timestamp}
                                    </span>
                                </div>
                            `;
                    }
                    if (ev.type === 'pass_back') {
                        return `
                            <div class="flex items-center justify-between bg-slatefelt-850/70 border border-slatefelt-700/60 px-3.5 py-2 rounded-xl text-xs">
                                <span class="text-amber-300 font-medium">↩ ${escapeHTML(ev.fromName)} passed shot back to ${escapeHTML(ev.toName)} (Rack #${ev.rack})</span>
                                <span class="text-slate-500">${ev.timestamp}</span>
                            </div>
                            `;
                    }
                    if (ev.type === 'rack_edit') {
                        return `
                            <div class="flex items-center justify-between bg-blue-950/25 border border-blue-500/30 px-3.5 py-2 rounded-xl text-xs">
                                <span class="text-blue-300 font-medium">✎ ${escapeHTML(ev.description)}</span>
                                <span class="text-slate-500">${ev.timestamp}</span>
                            </div>
                            `;
                    }
                    return `
                            <div class="flex items-center justify-between bg-slatefelt-850/50 border border-slatefelt-800 px-3.5 py-2 rounded-xl text-xs">
                            <span class="text-slate-400">Turn passed: ${escapeHTML(ev.fromName)} &rarr; <strong class="text-slate-200">${escapeHTML(ev.toName)}</strong> (Rack #${ev.rack})</span>
                            <span class="text-slate-500">${ev.timestamp}</span>
                            </div>
                        `;
                }).join('')}
                    </div>
                    `}
                </div>
                ` : ''}
            </div>
            `;
}


// ---------------------------------------------------------
// Rack & Statistics View
// ---------------------------------------------------------

function renderRacksAndStatsTab() {
    const g =
        state.game;

    if (!g) {
        return '';
    }


    const isOnlineViewer =
        g.isOnline &&
        state.config.onlineRole === 'player';


    const playerStats = g.players.map(p => {
        const ballCounts = {};
        g.moneyBalls.forEach(mb => { ballCounts[mb.ball] = 0; });
        let totalBalls = 0;
        let breaksCount = 0;


        g.racks.forEach(r => {
            if (r.breakerId === p.id) breaksCount += 1;
            r.pocketedBalls.forEach(pb => {
                if (pb.shooterId === p.id) {
                    totalBalls += 1;
                    ballCounts[pb.ball] = (ballCounts[pb.ball] || 0) + 1;
                }
            });
        });


        return {
            player: p,
            totalBalls,
            ballCounts,
            breaksCount,
            net: getPlayerNetBalance(p.id)
        };
    });


    const racksReversed = [...g.racks].reverse();


    return `
            <div class="max-w-4xl mx-auto space-y-6">
                <div class="bg-slatefelt-900 border border-slatefelt-700/80 rounded-2xl p-5 shadow-lg">
                <div class="flex items-center justify-between mb-3.5">
                    <div>
                    <h3 class="text-base font-extrabold text-white">Player Performance Stats</h3>
                    <p class="text-xs text-slate-400">Cumulative money balls pocketed, breaks, and net winnings across all ${g.racks.length} rack${g.racks.length === 1 ? '' : 's'}.</p>
                    </div>
                </div>


                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slatefelt-700 text-[11px] uppercase tracking-wider text-slate-400">
                        <th class="py-2.5 pr-3">Player</th>
                        <th class="py-2.5 px-2 text-center">Breaks</th>
                        ${g.moneyBalls.map(mb => `
                            <th class="py-2.5 px-2 text-center">${mb.ball}-Balls</th>
                        `).join('')}
                        <th class="py-2.5 px-2 text-center">Total Balls</th>
                        <th class="py-2.5 pl-3 text-right">Net +/-</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slatefelt-800 text-sm">
                        ${playerStats.map(st => {
        const netColor = st.net > 0 ? 'text-emerald-400' : (st.net < 0 ? 'text-rose-400' : 'text-slate-300');
        return `
                            <tr>
                            <td class="py-3 pr-3 font-bold text-white">${escapeHTML(st.player.name)}</td>
                            <td class="py-3 px-2 text-center font-mono text-slate-300">${st.breaksCount}</td>
                            ${g.moneyBalls.map(mb => `
                                <td class="py-3 px-2 text-center font-mono text-slate-200">${st.ballCounts[mb.ball] || 0}</td>
                            `).join('')}
                            <td class="py-3 px-2 text-center font-mono font-bold text-emerald-400">${st.totalBalls}</td>
                            <td class="py-3 pl-3 text-right font-mono font-extrabold ${netColor}">${formatMoney(st.net, true)}</td>
                            </tr>
                        `;
    }).join('')}
                    </tbody>
                    </table>
                </div>
                </div>


                <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                    <h3 class="text-base font-extrabold text-white">Rack-by-Rack Breakdown</h3>
                    <p class="text-xs text-slate-400">Inspect what happened in any rack or click <strong>Edit Rack</strong> to fix mistakes.</p>
                    </div>
                </div>


                ${racksReversed.map(rack => {
        const breaker = getPlayerById(rack.breakerId);
        const rackTotalPot = rack.pocketedBalls.reduce((sum, pb) => sum + (pb.totalCollected || 0), 0);
        const isCurrent = rack.rackNumber === g.rackNumber && !rack.completed;


        return `
                    <div class="bg-slatefelt-900 border ${isCurrent ? 'border-emerald-500/60' : 'border-slatefelt-700/80'} rounded-2xl p-4 sm:p-5 shadow-lg">
                        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slatefelt-800">
                        <div class="flex items-center gap-2.5">
                            <span class="px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs ${isCurrent ? 'bg-emerald-500 text-slate-950' : 'bg-slatefelt-800 text-slate-200'}">
                            RACK #${rack.rackNumber}
                            </span>
                            ${isCurrent ? '<span class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">In Progress</span>' : ''}
                            <span class="text-xs text-slate-400">
                            Breaker: <strong class="text-slate-200">${escapeHTML(breaker ? breaker.name : 'Unknown')}</strong>
                            </span>
                        </div>


                        <div class="flex items-center gap-3">
                            <span class="text-xs font-mono text-slate-300">
                                Pot: <strong class="text-emerald-400">${formatMoney(rackTotalPot)}</strong>
                            </span>

                            ${!isOnlineViewer ? `

                                <button
                                    onclick="openEditRackModal(${rack.rackNumber})"
                                    class="px-3 py-1.5 rounded-lg bg-slatefelt-800 hover:bg-blue-600/25 hover:border-blue-500/50 hover:text-blue-300 border border-slatefelt-700 text-xs font-bold text-slate-200 transition"
                                >
                                    ✎ Edit Rack
                                </button>

                            ` : ''}

                        </div>
                        </div>


                        ${rack.pocketedBalls.length === 0 ? `
                        <div class="pt-3 text-xs text-slate-500 italic">
                            No money balls pocketed in this rack yet.
                        </div>
                        ` : `
                        <div class="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            ${rack.pocketedBalls.map(pb => {
            const shooter = getPlayerById(pb.shooterId);
            return `
                                <div class="flex items-center justify-between bg-slatefelt-850 border border-slatefelt-700/60 rounded-xl p-3">
                                <div class="flex items-center gap-3">
                                    ${renderPoolBallHTML(pb.ball, 'w-9 h-9', 'w-4 h-4 text-[11px]')}
                                    <div>
                                    <div class="text-sm font-bold text-white">
                                        ${escapeHTML(shooter ? shooter.name : 'Unknown')}
                                    </div>
                                    <div class="text-[11px] text-slate-400">
                                        Made ${pb.ball}-Ball (${formatMoney(pb.value)}/ea)
                                    </div>
                                    </div>
                                </div>


                                <div class="font-mono font-extrabold text-sm text-emerald-400">
                                    +${formatMoney(pb.totalCollected)}
                                </div>
                                </div>
                            `;
        }).join('')}
                        </div>
                        `}
                    </div>
                    `;
    }).join('')}
                </div>
            </div>
            `;
}


// ---------------------------------------------------------
// Game Modals
// ---------------------------------------------------------

function openNextRackModal() {
    if (!state.game) return;
    const g = state.game;
    const currentRack = getCurrentRack();
    const activeIndices = getActivePlayerIndices();


    let defaultBreakerIdx = g.currentShooterIndex;
    if (currentRack && currentRack.pocketedBalls.length > 0) {
        const lastPocket = currentRack.pocketedBalls[currentRack.pocketedBalls.length - 1];
        const foundIdx =
            g.players.findIndex(
                player =>
                    player.id === lastPocket.shooterId &&
                    !player.eliminated &&
                    player.active !== false
            );
        if (foundIdx !== -1) defaultBreakerIdx = foundIdx;
    }


    const unpocketed = g.moneyBalls.filter(
        mb => !currentRack.pocketedBalls.some(pb => pb.ball === mb.ball)
    );


    const html = `
            <div class="p-5 sm:p-6">
                <div class="flex items-center justify-between border-b border-slatefelt-700 pb-4">
                <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Rack Transition</span>
                    <h2 class="text-xl font-extrabold text-white mt-0.5">Advance to Rack #${g.rackNumber + 1}</h2>
                </div>
                <button onclick="closeModal()" class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slatefelt-800">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                </div>


                ${unpocketed.length > 0 ? `
                <div class="mt-4 bg-amber-950/35 border border-amber-500/40 rounded-xl p-3.5 text-xs text-amber-200">
                    <strong>Note:</strong> The ${unpocketed.map(b => b.ball + '-ball').join(', ')} ${unpocketed.length === 1 ? 'has' : 'have'} not been marked pocketed in Rack #${g.rackNumber}. Starting Rack #${g.rackNumber + 1} will leave ${unpocketed.length === 1 ? 'it' : 'them'} uncollected for this rack.
                </div>
                ` : ''}


                <div class="mt-4">
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Who Breaks Rack #${g.rackNumber + 1}?
                </label>
                <div class="space-y-2">
                    ${activeIndices.map(idx => {
        const p = g.players[idx];
        const isDefault = idx === defaultBreakerIdx;
        return `
                        <label class="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${isDefault ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slatefelt-850 border-slatefelt-700 text-slate-300 hover:border-slate-500'}">
                        <div class="flex items-center gap-3">
                            <input type="radio" name="next-breaker-radio" value="${idx}" ${isDefault ? 'checked' : ''} style="accent-color:#10b981;" class="w-4 h-4" />
                            <span class="font-bold text-sm">${escapeHTML(p.name)}</span>
                        </div>
                        ${isDefault ? '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Default</span>' : ''}
                        </label>
                    `;
    }).join('')}
                </div>
                </div>


                <div class="flex gap-3 mt-6">
                <button onclick="closeModal()" class="flex-1 py-3 px-4 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 text-slate-200 font-semibold text-sm">
                    Cancel
                </button>
                <button onclick="confirmManualNextRack()" class="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg">
                    Start Rack #${g.rackNumber + 1} &rarr;
                </button>
                </div>
            </div>
            `;
    openModal(html);
}