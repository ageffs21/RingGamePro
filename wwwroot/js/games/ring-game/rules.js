// =========================================================
// RING GAME - RULES
// =========================================================

function openRulesModal() {
    openModal(`
            <div class="p-5 sm:p-6">

                <!-- Header -->
                <div class="flex items-start justify-between gap-4 mb-5">
                <div>
                    <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                    How to Play
                    </div>
                    <h2 class="text-xl font-extrabold text-white">
                    🎱 Ring Game Rules
                    </h2>
                </div>

                <button
                    onclick="closeModal()"
                    class="shrink-0 w-9 h-9 rounded-xl bg-slatefelt-800 hover:bg-slatefelt-700 border border-slatefelt-700 text-slate-300 hover:text-white font-bold transition"
                    aria-label="Close Rules"
                >
                    ✕
                </button>
                </div>


                <!-- Objective -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-emerald-400 mb-2">
                    Objective
                </h3>

                <p class="text-sm text-slate-300 leading-relaxed">
                    Ring Game is played in a fixed shooting rotation. Players earn
                    money by legally pocketing designated money balls. Each rack 
                    continues until all designated money balls have been legally pocketed.
                </p>
                </section>


                <!-- Shooting Order -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-emerald-400 mb-2">
                    Shooting Order
                </h3>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    Players shoot in the order established before the game begins.
                    </li>

                    <li>
                    After a player's turn ends, play moves to the next player
                    in the rotation.
                    </li>

                    <li>
                    In 9-Ball and 10-Ball, the lowest-numbered ball on the
                    table must be contacted first on a legal shot.
                    </li>
                </ul>
                </section>


                <!-- Money Balls -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-amber-400 mb-2">
                    💰 Money Balls
                </h3>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    <strong class="text-white">
                        All money balls must be called ball and pocket.
                    </strong>
                    </li>

                    <li>
                    A money ball only counts when legally pocketed in the
                    called pocket.
                    </li>

                    <li>
                    Each money ball may have a different value.
                    </li>

                    <li>
                    When a player legally pockets a money ball, every other
                    active player owes that player the configured value.
                    </li>
                </ul>

                <div class="mt-3 rounded-xl bg-slatefelt-950 border border-slatefelt-700 p-3">
                    <div class="text-xs font-bold text-slate-200 mb-1">
                    Example
                    </div>

                    <p class="text-xs text-slate-400 leading-relaxed">
                    With four players and the 5 Ball worth $0.25, a player
                    who legally pockets the called 5 Ball collects $0.25
                    from each of the other three players, for a total of
                    <strong class="text-emerald-400">$0.75</strong>.
                    </p>
                </div>
                </section>


                <!-- Break -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-emerald-400 mb-2">
                    💥 The Break
                </h3>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    Money balls pocketed on the break do not count for
                    payment and are spotted.
                    </li>

                    <li>
                    <strong class="text-white">
                        The breaker continues shooting only after a legal break
                        in which a ball is pocketed.
                    </strong>
                    </li>

                    <li>
                    If the breaker continues, 9-Ball and 10-Ball play proceeds
                    using the lowest-numbered legal object ball.
                    </li>
                </ul>
                </section>


                <!-- No Safeties -->
                <section class="mb-5 rounded-xl bg-rose-950/30 border border-rose-500/30 p-4">
                <h3 class="text-sm font-bold text-rose-300 mb-2">
                    🚫 No Intentional Safeties
                </h3>

                <p class="text-sm text-slate-200 leading-relaxed mb-3">
                    <strong>Intentional safety play is not allowed in Ring Game.</strong>
                </p>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    Every shot must be a legitimate attempt to legally
                    pocket a ball.
                    </li>

                    <li>
                    A player may not intentionally play safe simply to leave
                    the incoming player a difficult shot.
                    </li>

                    <li>
                    If a genuine attempt to pocket a ball accidentally leaves
                    the incoming player safe, that is allowed.
                    </li>

                    <li>
                    When there is a question about intent, the other players
                    make the judgment call.
                    </li>

                    <li>
                    The standard is whether the shooter made a full,
                    legitimate attempt to legally pocket a ball rather than
                    intentionally playing a defensive shot.
                    </li>
                </ul>
                </section>


                <!-- Table Scratch -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-amber-400 mb-2">
                    ⚠️ Table Scratch
                </h3>

                <p class="text-sm text-slate-300 leading-relaxed mb-2">
                    A table scratch occurs when the shooter fails to complete
                    a legal shot without pocketing the cue ball.
                </p>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    The cue ball remains where it comes to rest.
                    </li>

                    <li>
                    The incoming player shoots the cue ball as-is.
                    </li>
                </ul>
                </section>


                <!-- Cue Ball Scratch -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-amber-400 mb-2">
                    ⚪ Cue-Ball Scratch
                </h3>

                <ul class="space-y-2 text-sm text-slate-300 leading-relaxed list-disc pl-5">
                    <li>
                    When the cue ball is pocketed, the incoming player
                    shoots from the kitchen.
                    </li>

                    <li>
                    If the next legal object ball is also in the kitchen,
                    that ball is spotted.
                    </li>

                    <li>
                    The incoming player then proceeds with the legal shot.
                    </li>
                </ul>
                </section>


                <!-- End Game -->
                <section class="mb-5">
                <h3 class="text-sm font-bold text-emerald-400 mb-2">
                    🏁 End of the Game
                </h3>

                <p class="text-sm text-slate-300 leading-relaxed">
                    Pocketing the 9 Ball or 10 Ball does not necessarily end
                    the Ring Game.
                </p>

                <p class="text-sm text-white font-bold leading-relaxed mt-2">
                    Pocketing all designated money balls completes the current rack. 
                    Continue playing racks until the players choose to settle up and end the Ring Game.
                </p>
                </section>


                <!-- Other Rules -->
                <section class="mb-6">
                <h3 class="text-sm font-bold text-emerald-400 mb-2">
                    Other Rules
                </h3>

                <p class="text-sm text-slate-300 leading-relaxed">
                    For legal hits, rail requirements, combinations, fouls,
                    and situations not specifically modified by these Ring
                    Game rules, normal BCA rules apply.
                </p>
                </section>


                <!-- Close -->
                <button
                onclick="closeModal()"
                class="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition shadow"
                >
                Got It
                </button>

            </div>
            `);
}