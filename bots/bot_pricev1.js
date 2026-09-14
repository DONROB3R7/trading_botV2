
const weex = require("../backend/services/weex");

// ============================================================
// PRICE V1 BOT
// ============================================================
//
// PRICE ONLY
//
// Original Price V1 logic:
//
// TREND
//   200 candles
//   >= 53% directional strength
//
// ENTRY / PULLBACK
//   15 / 20 / 30 / 60 candles
//   >= 50% directional strength
//
// PULLBACK CONFIRMATION
//   LONG trend  -> 3 of 4 SHORT entries = LONG
//   SHORT trend -> 3 of 4 LONG entries  = SHORT
//
// CYCLE
//   10 one-minute snapshots
//   6 of 10 required for final LONG / SHORT
//
// NO:
//   Order book
//   Trading
//   TP / SL
//   Position management
// ============================================================

function createPriceV1(symbol) {

    // ========================================================
    // SYMBOL
    // ========================================================

    const cleanSymbol =
        String(symbol || "")
            .trim()
            .toUpperCase();

    if (!cleanSymbol) {
        throw new Error("Price V1 requires a symbol");
    }


    // ========================================================
    // BOT INSTANCE
    // ========================================================

    const bot = {

        // ====================================================
        // BASIC INFO
        // ====================================================

        name: "pricev1",

        version: "1.0.0",

        status: "stopped",


        // ====================================================
        // MARKET SETTINGS
        // ====================================================

        symbol: cleanSymbol,

        timeframe: "1m",


        // ====================================================
        // ORIGINAL STRATEGY SETTINGS
        // ====================================================

        TREND_CANDLES: 200,

        ENTRY_WINDOWS: [
            15,
            20,
            30,
            60,
        ],

        TREND_REQUIRED: 53,

        ENTRY_REQUIRED: 50,

        ENTRY_CONFIRMATIONS_REQUIRED: 3,

        CYCLE_LENGTH: 10,

        HISTORY_LIMIT: 500,

        KLINE_LIMIT: 1000,

        REFRESH_BUFFER_MS: 1200,


        // ====================================================
        // RUNTIME
        // ====================================================

        timer: null,

        processing: false,

        currentCandles: [],

        currentCycle: [],

        cycleHistory: [],

        lastSnapshot: null,

        lastCycle: null,

        lastError: null,


        // ====================================================
        // START
        // ====================================================

        start() {

            if (this.status === "running") {

                console.log(
                    `[${this.name}:${this.symbol}] Already running`
                );

                return;
            }


            this.status = "running";

            this.lastError = null;


            console.log(
                `[${this.name}:${this.symbol}] Started`
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

                clearInterval(this.timer);

                this.timer = null;
            }


            this.status = "stopped";


            console.log(
                `[${this.name}:${this.symbol}] Stopped`
            );
        },


        // ====================================================
        // REFRESH
        // ====================================================

        async refresh() {

            if (this.processing) {

                console.log(
                    `[${this.name}:${this.symbol}] Refresh already running`
                );

                return;
            }


            if (this.status !== "running") {

                return;
            }


            this.processing = true;


            try {

                console.log(
                    `[${this.name}:${this.symbol}] Fetching ${this.KLINE_LIMIT} candles`
                );


                // ------------------------------------------------
                // WEEX
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
                    `[${this.name}:${this.symbol}] Received ${candles.length} candles`
                );


                this.currentCandles =
                    candles;


                // ------------------------------------------------
                // NEED 201 CANDLES FOR 200-CANDLE TREND
                // ------------------------------------------------

                if (
                    candles.length <
                    this.TREND_CANDLES + 1
                ) {

                    console.log(
                        `[${this.name}:${this.symbol}] Not enough candles: ${candles.length}/${this.TREND_CANDLES + 1}`
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
                        `[${this.name}:${this.symbol}] Candle already processed`
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
                // ------------------------------------------------

                this.addSnapshotToCycle(
                    snapshot
                );


                console.log(
                    `[${this.name}:${this.symbol}] ` +
                    `CYCLE ${this.currentCycle.length}/${this.CYCLE_LENGTH} | ` +
                    `TREND ${snapshot.trend.direction} ${snapshot.trend.strength.toFixed(2)}% | ` +
                    `15=${snapshot.entries[15].direction} | ` +
                    `20=${snapshot.entries[20].direction} | ` +
                    `30=${snapshot.entries[30].direction} | ` +
                    `60=${snapshot.entries[60].direction} | ` +
                    `FINAL ${snapshot.decision}`
                );


            } catch (error) {

                this.lastError =
                    error.message;


                console.error(
                    `[${this.name}:${this.symbol}] Error: ${error.message}`
                );

            } finally {

                this.processing = false;
            }
        },


        // ====================================================
        // NORMALIZE WEEX KLINES
        // ====================================================

        normalizeCandles(rawResponse) {

            // ------------------------------------------------
            // WEEX may return:
            //
            // [
            //   [...],
            //   [...]
            // ]
            //
            // or:
            //
            // {
            //   data: [...]
            // }
            // ------------------------------------------------

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
                !Array.isArray(rawCandles)
            ) {

                return [];
            }


            const normalized = [];


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
                    Number(candle[0]);


                const open =
                    Number(candle[1]);

                const high =
                    Number(candle[2]);

                const low =
                    Number(candle[3]);

                const close =
                    Number(candle[4]);

                const volume =
                    Number(candle[5]);


                if (
                    !Number.isFinite(time) ||
                    !Number.isFinite(open) ||
                    !Number.isFinite(high) ||
                    !Number.isFinite(low) ||
                    !Number.isFinite(close)
                ) {

                    continue;
                }


                // ------------------------------------------------
                // Lightweight Charts / old browser logic uses
                // Unix SECONDS.
                //
                // WEEX can return milliseconds.
                // ------------------------------------------------

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
                        Number.isFinite(volume)
                            ? volume
                            : 0,

                });
            }


            // ------------------------------------------------
            // CHRONOLOGICAL
            // ------------------------------------------------

            normalized.sort(
                (a, b) =>
                    a.time - b.time
            );


            // ------------------------------------------------
            // REMOVE DUPLICATE TIMESTAMPS
            // ------------------------------------------------

            const unique = [];

            let lastTime = null;


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

        calculateCandleChange(candle) {

            if (!candle) {

                return null;
            }


            const open =
                Number(candle.open);

            const close =
                Number(candle.close);


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
                candles.length <= candleCount
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
                Number(current.close);

            const previousClose =
                Number(previous.close);


            if (
                !Number.isFinite(currentClose) ||
                !Number.isFinite(previousClose) ||
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
        //
        // THIS IS THE ORIGINAL PRICE V1 LOGIC.
        //
        // It measures the total percentage movement:
        //
        // UP movement
        // versus
        // DOWN movement
        //
        // Strength is the larger side as % of total movement.
        //
        // IMPORTANT:
        //
        // This function does NOT apply ENTRY_REQUIRED.
        //
        // Trend uses it with 53%.
        // Entry uses it independently with 50%.
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


            let upMovement = 0;

            let downMovement = 0;


            for (
                let i = start + 1;
                i < candles.length;
                i++
            ) {

                const previous =
                    Number(
                        candles[i - 1].close
                    );

                const current =
                    Number(
                        candles[i].close
                    );


                if (
                    !Number.isFinite(previous) ||
                    !Number.isFinite(current) ||
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
                        Math.abs(change);
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
        //
        // CRITICAL:
        //
        // Entry uses 50%.
        //
        // It does NOT use the 53% trend requirement.
        //
        // Example:
        //
        // 15 candle movement:
        // LONG 51.20%
        //
        // Entry = LONG
        //
        // Even though 51.20 < 53.
        //
        // This is exactly how the old Price V1 worked.
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
        //
        // CAVEMAN PULLBACK:
        //
        // TREND LONG
        //   need 3 SHORT entries
        //   final = LONG
        //
        // TREND SHORT
        //   need 3 LONG entries
        //   final = SHORT
        // ====================================================

        calculateEntryConfirmation(
            entries,
            trend
        ) {

            const entryList =
                Object.values(entries || {});


            let rawLongVotes = 0;

            let rawShortVotes = 0;

            let neutralVotes = 0;


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


            let longVotes = 0;

            let shortVotes = 0;

            let decision =
                "NEUTRAL";


            if (
                trend.direction ===
                "LONG"
            ) {

                // ------------------------------------------
                // LONG trend requires SHORT pullback
                // ------------------------------------------

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

                // ------------------------------------------
                // SHORT trend requires LONG pullback
                // ------------------------------------------

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
                    decision !== "NEUTRAL",

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
                    ? candle.time * 1000
                    : Date.now();


            const price =
                candle?.close ?? null;


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
            //
            // IMPORTANT:
            // Object exactly like the old browser version.
            // ------------------------------------------------

            const entries = {};


            for (
                const windowSize of
                this.ENTRY_WINDOWS
            ) {

                entries[windowSize] =
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


            let reason = "";


            if (
                candles.length <
                this.TREND_CANDLES + 1
            ) {

                reason =
                    "NOT_ENOUGH_200_CANDLES";

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
                        `LONG_TREND_${trend.strength.toFixed(2)}_PULLBACK_${this.ENTRY_CONFIRMATIONS_REQUIRED}_OF_4_SHORT`;

                } else {

                    reason =
                        `SHORT_TREND_${trend.strength.toFixed(2)}_PULLBACK_${this.ENTRY_CONFIRMATIONS_REQUIRED}_OF_4_LONG`;
                }

            } else {

                reason =
                    `${trend.direction}_TREND_PULLBACK_NOT_CONFIRMED`;
            }


            return {

                // ------------------------------------------------
                // BASIC
                // ------------------------------------------------

                timestamp:
                    new Date().toISOString(),

                candleTime,

                symbol:
                    this.symbol,

                timeframe:
                    this.timeframe,

                price,


                // ------------------------------------------------
                // PRICE MOVEMENT
                // ------------------------------------------------

                priceMovement,


                // ------------------------------------------------
                // TREND
                // ------------------------------------------------

                trend,


                // ------------------------------------------------
                // ENTRIES
                // ------------------------------------------------

                entries,


                // ------------------------------------------------
                // CONFIRMATION
                // ------------------------------------------------

                confirmation,


                // ------------------------------------------------
                // DECISION
                // ------------------------------------------------

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

                this.completeCycle();
            }
        },


        // ====================================================
        // COMPLETE CYCLE
        // ====================================================
        //
        // Original:
        //
        // LONG:
        //   longVotes > shortVotes
        //   AND longVotes >= 6
        //
        // SHORT:
        //   shortVotes > longVotes
        //   AND shortVotes >= 6
        //
        // otherwise NEUTRAL
        // ====================================================

        completeCycle() {

            const cycle =
                [...this.currentCycle];


            let longVotes = 0;

            let shortVotes = 0;

            let neutralVotes = 0;


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


            if (
                longVotes >
                shortVotes &&
                longVotes >= 6
            ) {

                decision =
                    "LONG";

            } else if (
                shortVotes >
                longVotes &&
                shortVotes >= 6
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
                    this.cycleHistory.length + 1,

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
                    [...cycle],
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
            // NEW 10-CANDLE CYCLE
            // ------------------------------------------------

            this.currentCycle = [];
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
                    this.ENTRY_WINDOWS,

                entryConfirmationsRequired:
                    this.ENTRY_CONFIRMATIONS_REQUIRED,

                cycleLength:
                    this.CYCLE_LENGTH,

                klineLimit:
                    this.KLINE_LIMIT,


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
//
// Support both:
//
// const createPriceV1 = require(...)
//
// and:
//
// const { createPriceV1 } = require(...)
// ============================================================

module.exports =
    createPriceV1;

module.exports.createPriceV1 =
    createPriceV1;

