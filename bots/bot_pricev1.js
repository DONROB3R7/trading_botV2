const weex = require("../backend/services/weex");

const tradingExecutor = require("../backend/services/tradingExecutor");

const botConfig = require("../backend/config/botConfig");


// ============================================================
// PRICE V1 BOT
// ============================================================
//
// PRICE + EXECUTION CONNECTION
//
// STRATEGY:
//
// TREND
//   Configured candle window
//   >= configured directional strength
//
// ENTRY / PULLBACK
//   Configured entry windows
//   >= configured directional strength
//
// PULLBACK CONFIRMATION
//   LONG trend  -> configured number of SHORT entries = LONG
//   SHORT trend -> configured number of LONG entries  = SHORT
//
// CYCLE
//   Configured number of one-minute snapshots
//   Existing final LONG / SHORT voting logic remains unchanged.
//
// EXECUTION:
//
//   COMPLETED CYCLE LONG
//       -> tradingExecutor.executeSignal(LONG)
//
//   COMPLETED CYCLE SHORT
//       -> tradingExecutor.executeSignal(SHORT)
//
//   COMPLETED CYCLE NEUTRAL
//       -> NO ORDER
//
// IMPORTANT:
//
//   Price V1 does NOT:
//
//   - calculate WEEX quantity
//   - place WEEX orders
//   - calculate TP / SL
//   - manage position state
//   - sign API requests
//   - use order book
//
//   tradingExecutor owns all live execution.
//
// ============================================================


function createPriceV1(symbol) {

    // ========================================================
    // SYMBOL
    // ========================================================

    const cleanSymbol =
        String(symbol || "")
            .trim()
            .toUpperCase()
            .replace(/\.P$/, "");

    if (!cleanSymbol) {
        throw new Error(
            "Price V1 requires a symbol"
        );
    }


    // ========================================================
    // SESSION SETTINGS
    //
    // Get the current Price V1 session configuration.
    //
    // If the dashboard has not changed anything,
    // botConfig returns the default values.
    //
    // IMPORTANT:
    //
    // Settings are captured when the bot instance is created.
    // A running bot is NOT silently changed in the middle
    // of a cycle.
    // ========================================================

    const sessionSettings =
        botConfig.getPriceV1Settings();


    // ========================================================
    // BOT INSTANCE
    // ========================================================

    const bot = {

        // ====================================================
        // BASIC INFO
        // ====================================================

        name:
            "pricev1",

        version:
            "1.1.0",

        status:
            "stopped",


        // ====================================================
        // MARKET SETTINGS
        // ====================================================

        symbol:
            cleanSymbol,

        timeframe:
            "1m",


        // ====================================================
        // PRICE V1 STRATEGY SETTINGS
        //
        // These now come from the current session settings.
        //
        // The actual strategy logic below is unchanged.
        // ====================================================

        TREND_CANDLES:
            sessionSettings.TREND_CANDLES,

        ENTRY_WINDOWS:
            [
                ...sessionSettings.ENTRY_WINDOWS,
            ],

        TREND_REQUIRED:
            sessionSettings.TREND_REQUIRED,

        ENTRY_REQUIRED:
            sessionSettings.ENTRY_REQUIRED,

        ENTRY_CONFIRMATIONS_REQUIRED:
            sessionSettings.ENTRY_CONFIRMATIONS_REQUIRED,

        CYCLE_LENGTH:
            sessionSettings.CYCLE_LENGTH,

        HISTORY_LIMIT:
            sessionSettings.HISTORY_LIMIT,

        KLINE_LIMIT:
            sessionSettings.KLINE_LIMIT,

        REFRESH_BUFFER_MS:
            sessionSettings.REFRESH_BUFFER_MS,


        // ====================================================
        // EXECUTION SETTINGS
        // ====================================================

        // true = completed LONG/SHORT cycles can execute
        executionEnabled:
            true,

        // Prevents accidental overlapping execution calls.
        executionProcessing:
            false,

        // Last live execution result.
        lastExecution:
            null,

        // Last execution error.
        lastExecutionError:
            null,

        // Number of completed cycles that generated
        // an actual LONG or SHORT execution request.
        executionCount:
            0,


        // ====================================================
        // RUNTIME
        // ====================================================

        timer:
            null,

        processing:
            false,

        currentCandles:
            [],

        currentCycle:
            [],

        cycleHistory:
            [],

        lastSnapshot:
            null,

        lastCycle:
            null,

        lastError:
            null,


        // ====================================================
        // START
        // ====================================================

        start() {

            if (
                this.status ===
                "running"
            ) {

                console.log(
                    `[${this.name}:${this.symbol}] Already running`
                );

                return;
            }


            this.status =
                "running";

            this.lastError =
                null;


            console.log(
                `[${this.name}:${this.symbol}] Started`
            );


            console.log(
                `[${this.name}:${this.symbol}] Execution: ` +
                `${this.executionEnabled ? "ENABLED" : "DISABLED"}`
            );


            // ------------------------------------------------
            // SHOW SESSION SETTINGS
            // ------------------------------------------------

            console.log(
                `[${this.name}:${this.symbol}] Session settings:`
            );

            console.log(
                `[${this.name}:${this.symbol}] ` +
                `TREND=${this.TREND_CANDLES} candles | ` +
                `TREND_REQUIRED=${this.TREND_REQUIRED}% | ` +
                `ENTRY_REQUIRED=${this.ENTRY_REQUIRED}% | ` +
                `ENTRY_WINDOWS=${this.ENTRY_WINDOWS.join(",")} | ` +
                `CONFIRMATIONS=${this.ENTRY_CONFIRMATIONS_REQUIRED} | ` +
                `CYCLE=${this.CYCLE_LENGTH} | ` +
                `KLINES=${this.KLINE_LIMIT}`
            );


            // ------------------------------------------------
            // Immediate first calculation
            // ------------------------------------------------

            this.refresh();


            // ------------------------------------------------
            // Then check every minute
            // ------------------------------------------------

            this.timer =
                setInterval(
                    () => {
                        this.refresh();
                    },
                    60 * 1000
                );
        },


        // ====================================================
        // STOP
        // ====================================================

        stop() {

            if (this.timer) {

                clearInterval(
                    this.timer
                );

                this.timer =
                    null;
            }


            this.status =
                "stopped";


            console.log(
                `[${this.name}:${this.symbol}] Stopped`
            );
        },


        // ====================================================
        // REFRESH
        // ====================================================

        async refresh() {

            if (
                this.processing
            ) {

                console.log(
                    `[${this.name}:${this.symbol}] Refresh already running`
                );

                return;
            }


            if (
                this.status !==
                "running"
            ) {
                return;
            }


            this.processing =
                true;


            try {

                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `Fetching ${this.KLINE_LIMIT} candles`
                );


                // ------------------------------------------------
                // WEEX MARKET DATA
                // ------------------------------------------------

                const rawCandles =
                    await weex.getKlines(
                        this.symbol,
                        this.timeframe,
                        this.KLINE_LIMIT
                    );


                // ------------------------------------------------
                // NORMALIZE
                // ------------------------------------------------

                const candles =
                    this.normalizeCandles(
                        rawCandles
                    );


                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `Received ${candles.length} candles`
                );


                this.currentCandles =
                    candles;


                // ------------------------------------------------
                // NEED TREND_CANDLES + 1 CANDLES
                // ------------------------------------------------

                if (
                    candles.length <
                    this.TREND_CANDLES + 1
                ) {

                    console.log(
                        `[${this.name}:${this.symbol}] ` +
                        `Not enough candles: ` +
                        `${candles.length}/` +
                        `${this.TREND_CANDLES + 1}`
                    );

                    return;
                }


                // ------------------------------------------------
                // CALCULATE SNAPSHOT
                // ------------------------------------------------

                const snapshot =
                    this.calculateSignalSnapshot(
                        candles
                    );


                // ------------------------------------------------
                // ONE SNAPSHOT PER UNIQUE CANDLE
                // ------------------------------------------------

                if (
                    this.lastSnapshot &&
                    this.lastSnapshot.candleTime ===
                    snapshot.candleTime
                ) {

                    console.log(
                        `[${this.name}:${this.symbol}] ` +
                        `Candle already processed`
                    );

                    return;
                }


                // ------------------------------------------------
                // SAVE
                // ------------------------------------------------

                this.lastSnapshot =
                    snapshot;


                // ------------------------------------------------
                // ADD TO CYCLE
                //
                // This returns a completed cycle when the
                // configured cycle finishes.
                // ------------------------------------------------

                const completedCycle =
                    this.addSnapshotToCycle(
                        snapshot
                    );


                // ------------------------------------------------
                // DEBUG LOG
                // ------------------------------------------------

                const entryLog =
                    this.ENTRY_WINDOWS
                        .map(
                            (windowSize) =>
                                `${windowSize}=` +
                                `${
                                    snapshot
                                        .entries?.[
                                        windowSize
                                    ]?.direction ||
                                    "NEUTRAL"
                                }`
                        )
                        .join(" | ");


                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `CYCLE ${this.currentCycle.length}/${this.CYCLE_LENGTH} | ` +
                    `TREND ${snapshot.trend.direction} ` +
                    `${snapshot.trend.strength.toFixed(2)}% | ` +
                    `${entryLog} | ` +
                    `FINAL ${snapshot.decision}`
                );


                // ------------------------------------------------
                // COMPLETED CYCLE
                // ------------------------------------------------

                if (
                    completedCycle
                ) {

                    await this.handleCompletedCycle(
                        completedCycle
                    );
                }


            } catch (error) {

                this.lastError =
                    error.message;


                console.error(
                    `[${this.name}:${this.symbol}] ` +
                    `Error: ${error.message}`
                );

            } finally {

                this.processing =
                    false;
            }
        },


        // ====================================================
        // HANDLE COMPLETED CYCLE
        // ====================================================
        //
        // THIS is the bridge between Price V1 and the
        // central execution layer.
        //
        // No partial snapshot is traded.
        //
        // ONLY the final cycle decision can execute.
        // ====================================================

        async handleCompletedCycle(
            completedCycle
        ) {

            const decision =
                String(
                    completedCycle?.decision ||
                    "NEUTRAL"
                )
                    .trim()
                    .toUpperCase();


            console.log("");

            console.log(
                "============================================================"
            );

            console.log(
                `[${this.name}:${this.symbol}] COMPLETED CYCLE`
            );

            console.log(
                "============================================================"
            );

            console.log(
                "Cycle:",
                completedCycle.cycleId
            );

            console.log(
                "Decision:",
                decision
            );

            console.log(
                "Reason:",
                completedCycle.reason
            );


            // ------------------------------------------------
            // EXECUTION DISABLED
            // ------------------------------------------------

            if (
                !this.executionEnabled
            ) {

                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `Execution disabled. No order sent.`
                );


                this.lastExecution = {

                    success:
                        true,

                    liveExecution:
                        false,

                    action:
                        "NO_ACTION",

                    symbol:
                        this.symbol,

                    signal:
                        decision,

                    reason:
                        "Price V1 execution is disabled.",
                };


                return this.lastExecution;
            }


            // ------------------------------------------------
            // NEUTRAL
            // ------------------------------------------------
            //
            // NEUTRAL must never place an order.
            // The live WEEX position is simply left alone.
            // ------------------------------------------------

            if (
                decision ===
                "NEUTRAL"
            ) {

                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `FINAL DECISION NEUTRAL -> NO ACTION`
                );


                this.lastExecution = {

                    success:
                        true,

                    liveExecution:
                        false,

                    action:
                        "NO_ACTION",

                    symbol:
                        this.symbol,

                    signal:
                        "NEUTRAL",

                    reason:
                        "Completed Price V1 cycle is NEUTRAL.",
                };


                this.lastExecutionError =
                    null;


                return this.lastExecution;
            }


            // ------------------------------------------------
            // SAFETY: ONLY LONG / SHORT CAN REACH EXECUTION
            // ------------------------------------------------

            if (
                decision !== "LONG" &&
                decision !== "SHORT"
            ) {

                console.error(
                    `[${this.name}:${this.symbol}] ` +
                    `Invalid completed-cycle decision: ${decision}`
                );


                this.lastExecution = {

                    success:
                        false,

                    liveExecution:
                        false,

                    action:
                        "ERROR",

                    symbol:
                        this.symbol,

                    signal:
                        decision,

                    error:
                        `Invalid Price V1 cycle decision: ${decision}`,
                };


                this.lastExecutionError =
                    this.lastExecution.error;


                return this.lastExecution;
            }


            // ------------------------------------------------
            // PREVENT OVERLAPPING EXECUTION
            // ------------------------------------------------

            if (
                this.executionProcessing
            ) {

                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `Execution already running`
                );


                this.lastExecution = {

                    success:
                        false,

                    liveExecution:
                        true,

                    action:
                        "LOCKED",

                    symbol:
                        this.symbol,

                    signal:
                        decision,

                    reason:
                        "Price V1 execution is already running.",
                };


                return this.lastExecution;
            }


            this.executionProcessing =
                true;


            try {

                console.log("");

                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `EXECUTION SIGNAL -> ${decision}`
                );


                // ------------------------------------------------
                // CENTRAL EXECUTION ENGINE
                // ------------------------------------------------
                //
                // tradingExecutor owns:
                //
                // - live position lookup
                // - no-pyramiding
                // - reversal
                // - quantity
                // - WEEX order
                // - confirmation
                // - TP
                // - SL
                //
                // Price V1 does none of those.
                // ------------------------------------------------

                const result =
                    await tradingExecutor.executeSignal(
                        this.symbol,
                        decision,
                        {
                            source:
                                "pricev1",

                            bot:
                                this.name,

                            cycleId:
                                completedCycle.cycleId,
                        }
                    );


                this.lastExecution =
                    result;


                this.lastExecutionError =
                    result?.success
                        ? null
                        : (
                            result?.error ||
                            "Unknown execution error."
                        );


                if (
                    result?.success
                ) {

                    this.executionCount +=
                        1;


                    console.log(
                        `[${this.name}:${this.symbol}] ` +
                        `EXECUTION SUCCESS | ` +
                        `${decision}`
                    );

                } else {

                    console.error(
                        `[${this.name}:${this.symbol}] ` +
                        `EXECUTION FAILED | ` +
                        `${result?.error || "Unknown error"}`
                    );
                }


                console.log(
                    "EXECUTION RESULT:",
                    JSON.stringify(
                        result,
                        null,
                        2
                    )
                );


                return result;


            } catch (error) {

                this.lastExecutionError =
                    error.message;


                this.lastExecution = {

                    success:
                        false,

                    liveExecution:
                        true,

                    action:
                        "ERROR",

                    symbol:
                        this.symbol,

                    signal:
                        decision,

                    error:
                        error.message,
                };


                console.error(
                    `[${this.name}:${this.symbol}] ` +
                    `Execution error: ${error.message}`
                );


                return this.lastExecution;


            } finally {

                this.executionProcessing =
                    false;
            }
        },


        // ====================================================
        // NORMALIZE WEEX KLINES
        // ====================================================

        normalizeCandles(
            rawResponse
        ) {

            let rawCandles =
                rawResponse;


            if (
                rawResponse &&
                Array.isArray(
                    rawResponse.data
                )
            ) {

                rawCandles =
                    rawResponse.data;
            }


            if (
                !Array.isArray(
                    rawCandles
                )
            ) {

                return [];
            }


            const normalized =
                [];


            for (
                const candle of rawCandles
            ) {

                if (
                    !Array.isArray(candle) ||
                    candle.length < 5
                ) {

                    continue;
                }


                let time =
                    Number(
                        candle[0]
                    );


                const open =
                    Number(
                        candle[1]
                    );


                const high =
                    Number(
                        candle[2]
                    );


                const low =
                    Number(
                        candle[3]
                    );


                const close =
                    Number(
                        candle[4]
                    );


                const volume =
                    Number(
                        candle[5]
                    );


                if (
                    !Number.isFinite(time) ||
                    !Number.isFinite(open) ||
                    !Number.isFinite(high) ||
                    !Number.isFinite(low) ||
                    !Number.isFinite(close)
                ) {

                    continue;
                }


                // WEEX can return milliseconds.
                // Price V1 internally uses Unix seconds.

                if (
                    time >
                    100000000000
                ) {

                    time =
                        Math.floor(
                            time / 1000
                        );
                }


                normalized.push({

                    time,

                    open,

                    high,

                    low,

                    close,

                    volume:
                        Number.isFinite(
                            volume
                        )
                            ? volume
                            : 0,
                });
            }


            // ------------------------------------------------
            // CHRONOLOGICAL
            // ------------------------------------------------

            normalized.sort(
                (a, b) =>
                    a.time -
                    b.time
            );


            // ------------------------------------------------
            // REMOVE DUPLICATE TIMESTAMPS
            // ------------------------------------------------

            const unique =
                [];

            let lastTime =
                null;


            for (
                const candle of normalized
            ) {

                if (
                    candle.time ===
                    lastTime
                ) {

                    continue;
                }


                unique.push(
                    candle
                );


                lastTime =
                    candle.time;
            }


            return unique;
        },


        // ====================================================
        // PRICE MOVEMENT
        // ====================================================

        calculateCandleChange(
            candle
        ) {

            if (!candle) {
                return null;
            }


            const open =
                Number(
                    candle.open
                );


            const close =
                Number(
                    candle.close
                );


            if (
                !Number.isFinite(open) ||
                !Number.isFinite(close) ||
                open === 0
            ) {

                return null;
            }


            return (
                (
                    (
                        close -
                        open
                    ) /
                    open
                ) *
                100
            );
        },


        calculateLookbackChange(
            candles,
            candleCount
        ) {

            if (
                !Array.isArray(candles) ||
                candles.length <=
                candleCount
            ) {

                return null;
            }


            const current =
                candles[
                    candles.length - 1
                ];


            const previous =
                candles[
                    candles.length -
                    1 -
                    candleCount
                ];


            if (
                !current ||
                !previous
            ) {

                return null;
            }


            const currentClose =
                Number(
                    current.close
                );


            const previousClose =
                Number(
                    previous.close
                );


            if (
                !Number.isFinite(
                    currentClose
                ) ||
                !Number.isFinite(
                    previousClose
                ) ||
                previousClose === 0
            ) {

                return null;
            }


            return (
                (
                    (
                        currentClose -
                        previousClose
                    ) /
                    previousClose
                ) *
                100
            );
        },


        calculateAllPriceMovement(
            candles
        ) {

            return {

                5:
                    this.calculateLookbackChange(
                        candles,
                        5
                    ),

                10:
                    this.calculateLookbackChange(
                        candles,
                        10
                    ),

                20:
                    this.calculateLookbackChange(
                        candles,
                        20
                    ),

                60:
                    this.calculateLookbackChange(
                        candles,
                        60
                    ),
            };
        },


        // ====================================================
        // DIRECTIONAL STRENGTH
        // ====================================================

        calculateDirectionalStrength(
            candles,
            windowSize
        ) {

            if (
                !Array.isArray(candles) ||
                candles.length <
                windowSize + 1
            ) {

                return {

                    direction:
                        "NEUTRAL",

                    rawDirection:
                        "NEUTRAL",

                    strength:
                        0,

                    upMovement:
                        0,

                    downMovement:
                        0,

                    upStrength:
                        0,

                    downStrength:
                        0,

                    window:
                        windowSize,
                };
            }


            const start =
                candles.length -
                windowSize -
                1;


            let upMovement =
                0;


            let downMovement =
                0;


            for (
                let i =
                    start + 1;

                i <
                candles.length;

                i++
            ) {

                const previous =
                    Number(
                        candles[
                            i - 1
                        ].close
                    );


                const current =
                    Number(
                        candles[i]
                            .close
                    );


                if (
                    !Number.isFinite(
                        previous
                    ) ||
                    !Number.isFinite(
                        current
                    ) ||
                    previous === 0
                ) {

                    continue;
                }


                const change =
                    (
                        (
                            current -
                            previous
                        ) /
                        previous
                    ) *
                    100;


                if (
                    change > 0
                ) {

                    upMovement +=
                        change;

                } else if (
                    change < 0
                ) {

                    downMovement +=
                        Math.abs(
                            change
                        );
                }
            }


            const totalMovement =
                upMovement +
                downMovement;


            if (
                totalMovement === 0
            ) {

                return {

                    direction:
                        "NEUTRAL",

                    rawDirection:
                        "NEUTRAL",

                    strength:
                        0,

                    upMovement:
                        0,

                    downMovement:
                        0,

                    upStrength:
                        0,

                    downStrength:
                        0,

                    window:
                        windowSize,
                };
            }


            const upStrength =
                (
                    upMovement /
                    totalMovement
                ) *
                100;


            const downStrength =
                (
                    downMovement /
                    totalMovement
                ) *
                100;


            let direction =
                "NEUTRAL";


            let rawDirection =
                "NEUTRAL";


            let strength =
                0;


            if (
                upStrength >=
                downStrength
            ) {

                rawDirection =
                    "LONG";


                strength =
                    upStrength;


                if (
                    upStrength >=
                    this.TREND_REQUIRED
                ) {

                    direction =
                        "LONG";
                }

            } else {

                rawDirection =
                    "SHORT";


                strength =
                    downStrength;


                if (
                    downStrength >=
                    this.TREND_REQUIRED
                ) {

                    direction =
                        "SHORT";
                }
            }


            return {

                direction,

                rawDirection,

                strength,

                upMovement,

                downMovement,

                upStrength,

                downStrength,

                window:
                    windowSize,
            };
        },


        // ====================================================
        // TREND
        // ====================================================

        calculateTrend(
            candles
        ) {

            const result =
                this.calculateDirectionalStrength(
                    candles,
                    this.TREND_CANDLES
                );


            return {

                ...result,

                window:
                    this.TREND_CANDLES,

                required:
                    this.TREND_REQUIRED,
            };
        },


        // ====================================================
        // ENTRY
        // ====================================================

        calculateEntry(
            candles,
            windowSize
        ) {

            const result =
                this.calculateDirectionalStrength(
                    candles,
                    windowSize
                );


            let direction =
                "NEUTRAL";


            if (
                result.upMovement >
                result.downMovement &&
                result.strength >=
                this.ENTRY_REQUIRED
            ) {

                direction =
                    "LONG";

            } else if (
                result.downMovement >
                result.upMovement &&
                result.strength >=
                this.ENTRY_REQUIRED
            ) {

                direction =
                    "SHORT";
            }


            return {

                ...result,

                window:
                    windowSize,

                required:
                    this.ENTRY_REQUIRED,

                direction,
            };
        },


        // ====================================================
        // ENTRY CONFIRMATION
        // ====================================================

        calculateEntryConfirmation(
            entries,
            trend
        ) {

            const entryList =
                Object.values(
                    entries || {}
                );


            let rawLongVotes =
                0;


            let rawShortVotes =
                0;


            let neutralVotes =
                0;


            for (
                const entry of entryList
            ) {

                if (
                    entry.direction ===
                    "LONG"
                ) {

                    rawLongVotes++;

                } else if (
                    entry.direction ===
                    "SHORT"
                ) {

                    rawShortVotes++;

                } else {

                    neutralVotes++;
                }
            }


            let longVotes =
                0;


            let shortVotes =
                0;


            let decision =
                "NEUTRAL";


            if (
                trend.direction ===
                "LONG"
            ) {

                // LONG trend requires
                // SHORT pullback.

                longVotes =
                    rawShortVotes;


                shortVotes =
                    rawLongVotes;


                if (
                    rawShortVotes >=
                    this.ENTRY_CONFIRMATIONS_REQUIRED
                ) {

                    decision =
                        "LONG";
                }

            } else if (
                trend.direction ===
                "SHORT"
            ) {

                // SHORT trend requires
                // LONG pullback.

                shortVotes =
                    rawLongVotes;


                longVotes =
                    rawShortVotes;


                if (
                    rawLongVotes >=
                    this.ENTRY_CONFIRMATIONS_REQUIRED
                ) {

                    decision =
                        "SHORT";
                }
            }


            return {

                decision,

                longVotes,

                shortVotes,

                neutralVotes,

                confirmed:
                    decision !==
                    "NEUTRAL",

                rawLongVotes,

                rawShortVotes,
            };
        },


        // ====================================================
        // SIGNAL SNAPSHOT
        // ====================================================

        calculateSignalSnapshot(
            candles
        ) {

            const candle =
                candles[
                    candles.length - 1
                ];


            const candleTime =
                candle?.time
                    ? candle.time *
                      1000
                    : Date.now();


            const price =
                candle?.close ??
                null;


            // ------------------------------------------------
            // PRICE MOVEMENT
            // ------------------------------------------------

            const priceMovement =
                this.calculateAllPriceMovement(
                    candles
                );


            // ------------------------------------------------
            // TREND
            // ------------------------------------------------

            const trend =
                this.calculateTrend(
                    candles
                );


            // ------------------------------------------------
            // ENTRIES
            // ------------------------------------------------

            const entries =
                {};


            for (
                const windowSize of
                this.ENTRY_WINDOWS
            ) {

                entries[
                    windowSize
                ] =
                    this.calculateEntry(
                        candles,
                        windowSize
                    );
            }


            // ------------------------------------------------
            // CONFIRMATION
            // ------------------------------------------------

            const confirmation =
                this.calculateEntryConfirmation(
                    entries,
                    trend
                );


            // ------------------------------------------------
            // FINAL DECISION
            // ------------------------------------------------

            const decision =
                confirmation.decision;


            let reason =
                "";


            if (
                candles.length <
                this.TREND_CANDLES + 1
            ) {

                reason =
                    "NOT_ENOUGH_TREND_CANDLES";

            } else if (
                trend.direction ===
                "NEUTRAL"
            ) {

                reason =
                    `TREND_BELOW_${this.TREND_REQUIRED}%`;

            } else if (
                confirmation.confirmed
            ) {

                if (
                    trend.direction ===
                    "LONG"
                ) {

                    reason =
                        `LONG_TREND_${trend.strength.toFixed(2)}_PULLBACK_${this.ENTRY_CONFIRMATIONS_REQUIRED}_OF_${this.ENTRY_WINDOWS.length}_SHORT`;

                } else {

                    reason =
                        `SHORT_TREND_${trend.strength.toFixed(2)}_PULLBACK_${this.ENTRY_CONFIRMATIONS_REQUIRED}_OF_${this.ENTRY_WINDOWS.length}_LONG`;
                }

            } else {

                reason =
                    `${trend.direction}_TREND_PULLBACK_NOT_CONFIRMED`;
            }


            return {

                timestamp:
                    new Date().toISOString(),

                candleTime,

                symbol:
                    this.symbol,

                timeframe:
                    this.timeframe,

                price,

                priceMovement,

                trend,

                entries,

                confirmation,

                decision,

                finalDecision:
                    decision,

                reason,
            };
        },


        // ====================================================
        // ADD SNAPSHOT TO CYCLE
        // ====================================================

        addSnapshotToCycle(
            snapshot
        ) {

            this.currentCycle.push(
                snapshot
            );


            if (
                this.currentCycle.length >=
                this.CYCLE_LENGTH
            ) {

                return this.completeCycle();
            }


            return null;
        },


        // ====================================================
        // COMPLETE CYCLE
        // ====================================================

        completeCycle() {

            const cycle =
                [
                    ...this.currentCycle,
                ];


            let longVotes =
                0;


            let shortVotes =
                0;


            let neutralVotes =
                0;


            for (
                const snapshot of cycle
            ) {

                if (
                    snapshot.decision ===
                    "LONG"
                ) {

                    longVotes++;

                } else if (
                    snapshot.decision ===
                    "SHORT"
                ) {

                    shortVotes++;

                } else {

                    neutralVotes++;
                }
            }


            let decision =
                "NEUTRAL";


            // ------------------------------------------------
            // KEEP EXISTING FINAL CYCLE LOGIC UNCHANGED
            //
            // The original strategy requires 6 votes.
            // ------------------------------------------------

            if (
                longVotes >
                shortVotes &&
                longVotes >=
                6
            ) {

                decision =
                    "LONG";

            } else if (
                shortVotes >
                longVotes &&
                shortVotes >=
                6
            ) {

                decision =
                    "SHORT";
            }


            let reason;


            if (
                decision ===
                "LONG"
            ) {

                reason =
                    `CYCLE_LONG_${longVotes}_OF_${this.CYCLE_LENGTH}`;

            } else if (
                decision ===
                "SHORT"
            ) {

                reason =
                    `CYCLE_SHORT_${shortVotes}_OF_${this.CYCLE_LENGTH}`;

            } else {

                reason =
                    `CYCLE_NEUTRAL_${longVotes}L_${shortVotes}S_${neutralVotes}N`;
            }


            const firstSnapshot =
                cycle[0];


            const lastSnapshot =
                cycle[
                    cycle.length - 1
                ];


            const completedCycle = {

                cycleId:
                    this.cycleHistory.length +
                    1,

                symbol:
                    this.symbol,

                timeframe:
                    this.timeframe,

                startTime:
                    firstSnapshot?.timestamp ||
                    null,

                endTime:
                    lastSnapshot?.timestamp ||
                    null,

                completedAt:
                    new Date().toISOString(),

                endCandleTime:
                    lastSnapshot?.candleTime ||
                    null,

                candles:
                    cycle.length,

                trend:
                    lastSnapshot?.trend ||
                    null,

                entries:
                    lastSnapshot?.entries ||
                    {},

                votes: {

                    long:
                        longVotes,

                    short:
                        shortVotes,

                    neutral:
                        neutralVotes,
                },

                longVotes,

                shortVotes,

                neutralVotes,

                decision,

                finalDecision:
                    decision,

                reason,

                snapshots:
                    [
                        ...cycle,
                    ],
            };


            this.lastCycle =
                completedCycle;


            this.cycleHistory.unshift(
                completedCycle
            );


            if (
                this.cycleHistory.length >
                this.HISTORY_LIMIT
            ) {

                this.cycleHistory =
                    this.cycleHistory.slice(
                        0,
                        this.HISTORY_LIMIT
                    );
            }


            console.log(
                `[${this.name}:${this.symbol}] ` +
                `CYCLE COMPLETE | ` +
                `${decision} | ` +
                `${reason}`
            );


            // ------------------------------------------------
            // NEW CYCLE
            // ------------------------------------------------

            this.currentCycle =
                [];


            // ------------------------------------------------
            // IMPORTANT
            //
            // Return completed cycle to refresh().
            // ------------------------------------------------

            return completedCycle;
        },


        // ====================================================
        // STATUS
        // ====================================================

        getStatus() {

            return {

                name:
                    this.name,

                version:
                    this.version,

                status:
                    this.status,

                symbol:
                    this.symbol,

                timeframe:
                    this.timeframe,


                // --------------------------------------------
                // CONFIG
                // --------------------------------------------

                trendCandles:
                    this.TREND_CANDLES,

                trendRequired:
                    this.TREND_REQUIRED,

                entryRequired:
                    this.ENTRY_REQUIRED,

                entryWindows:
                    [
                        ...this.ENTRY_WINDOWS,
                    ],

                entryConfirmationsRequired:
                    this.ENTRY_CONFIRMATIONS_REQUIRED,

                cycleLength:
                    this.CYCLE_LENGTH,

                historyLimit:
                    this.HISTORY_LIMIT,

                klineLimit:
                    this.KLINE_LIMIT,

                refreshBufferMs:
                    this.REFRESH_BUFFER_MS,


                // --------------------------------------------
                // EXECUTION
                // --------------------------------------------

                executionEnabled:
                    this.executionEnabled,

                executionProcessing:
                    this.executionProcessing,

                executionCount:
                    this.executionCount,

                lastExecution:
                    this.lastExecution,

                lastExecutionError:
                    this.lastExecutionError,


                // --------------------------------------------
                // MARKET
                // --------------------------------------------

                candles:
                    this.currentCandles.length,

                currentCandles:
                    this.currentCandles,


                // --------------------------------------------
                // CURRENT SNAPSHOT
                // --------------------------------------------

                lastSnapshot:
                    this.lastSnapshot,

                price:
                    this.lastSnapshot?.price ??
                    null,

                priceMovement:
                    this.lastSnapshot?.priceMovement ??
                    null,

                trend:
                    this.lastSnapshot?.trend ??
                    null,

                entries:
                    this.lastSnapshot?.entries ??
                    {},

                decision:
                    this.lastSnapshot?.decision ??
                    "NEUTRAL",

                finalDecision:
                    this.lastSnapshot?.finalDecision ??
                    "NEUTRAL",

                reason:
                    this.lastSnapshot?.reason ??
                    "",


                // --------------------------------------------
                // CYCLE
                // --------------------------------------------

                cycleProgress:
                    this.currentCycle.length,

                currentCycle:
                    this.currentCycle,

                lastCycle:
                    this.lastCycle,

                cycleHistory:
                    this.cycleHistory,

                historyCount:
                    this.cycleHistory.length,


                // --------------------------------------------
                // ERROR
                // --------------------------------------------

                lastError:
                    this.lastError,
            };
        },
    };


    return bot;
}


// ============================================================
// EXPORT
// ============================================================

module.exports =
    createPriceV1;

module.exports.createPriceV1 =
    createPriceV1;
