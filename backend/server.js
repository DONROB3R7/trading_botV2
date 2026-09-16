const express = require("express");
const cors = require("cors");

const config = require("./config/config");
const botConfig = require("./config/botConfig");

const weex = require("./services/weex");
const tradingExecutor = require("./services/tradingExecutor");

const botManager = require("../bot-manager");

const app = express();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json());


// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "ok",
        service: "WEEX Bot Lab backend",
        timestamp: new Date().toISOString(),
    });
});


// ============================================================
// GENERAL STATUS
// ============================================================

app.get("/api/status", (req, res) => {
    try {
        res.json({
            success: true,

            server: {
                running: true,
                port: config.server.port,
            },

            weex: {
                configured:
                    Boolean(config.weex.apiKey) &&
                    Boolean(config.weex.apiSecret) &&
                    Boolean(config.weex.apiPassphrase),
            },

            trading: {
                maxMarginUsdt:
                    config.trading.MAX_MARGIN_USDT,

                leverage:
                    config.trading.LEVERAGE,
            },

            tpSl: {
                enabled:
                    config.tpSl.ENABLED,

                takeProfitPercent:
                    config.tpSl.TAKE_PROFIT_PERCENT,

                stopLossPercent:
                    config.tpSl.STOP_LOSS_PERCENT,

                triggerType:
                    config.tpSl.TRIGGER_TYPE,
            },

            botManager:
                botManager.getStatus(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ============================================================
// WEEX CONNECTION TEST
// ============================================================

app.get("/api/weex/test", async (req, res) => {
    try {
        const account =
            await weex.getAccount();

        res.json({
            success: true,
            connected: true,
            account,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            connected: false,
            error: error.message,
        });
    }
});


// ============================================================
// WEEX LIVE POSITIONS
// ============================================================

app.get("/api/weex/positions", async (req, res) => {
    try {
        const positions =
            await weex.getPositions();

        res.json({
            success: true,
            positions,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ============================================================
// TRADING EXECUTOR - READ ONLY POSITION
// ============================================================

app.get(
    "/api/trading/executor/:symbol",
    async (req, res) => {
        try {
            const symbol =
                req.params.symbol;

            const result =
                await tradingExecutor.getLivePosition(
                    symbol
                );

            res.json({
                success: true,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// TRADING PREVIEW - READ ONLY
//
// Example:
//
// GET /api/trading/preview/UNIUSDT.P/LONG
//
// This NEVER sends an order.
// ============================================================

app.get(
    "/api/trading/preview/:symbol/:action",
    async (req, res) => {
        try {
            const {
                symbol,
                action,
            } = req.params;

            const result =
                await tradingExecutor.buildOrderPreview(
                    symbol,
                    action
                );

            res.json({
                success: true,
                liveExecution: false,
                orderSent: false,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                liveExecution: false,
                orderSent: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// TP / SL PREVIEW - READ ONLY
//
// IMPORTANT:
//
// This route ONLY runs the existing buildOrderPreview()
// calculation.
//
// It does NOT place:
// - market orders
// - TP orders
// - SL orders
// - close orders
// - reversal orders
//
// Example:
//
// GET /api/trading/tpsl-preview/BTCUSDT/LONG
// GET /api/trading/tpsl-preview/BTCUSDT/SHORT
//
// The calculation uses the current WEEX market price and
// current WEEX symbol rules.
//
// ============================================================

app.get(
    "/api/trading/tpsl-preview/:symbol/:side",
    async (req, res) => {
        try {
            const {
                symbol,
                side,
            } = req.params;

            const normalizedSide =
                String(side || "")
                    .trim()
                    .toUpperCase();

            if (
                normalizedSide !== "LONG" &&
                normalizedSide !== "SHORT"
            ) {
                return res.status(400).json({
                    success: false,
                    liveExecution: false,
                    orderSent: false,
                    error:
                        "side must be LONG or SHORT.",
                });
            }

            const result =
                await tradingExecutor.buildOrderPreview(
                    symbol,
                    normalizedSide
                );

            res.json({
                success: true,

                liveExecution:
                    false,

                orderSent:
                    false,

                symbol:
                    tradingExecutor.normalizeSymbol(
                        symbol
                    ),

                side:
                    normalizedSide,

                configuration: {
                    takeProfitPercent:
                        config.tpSl.TAKE_PROFIT_PERCENT,

                    stopLossPercent:
                        config.tpSl.STOP_LOSS_PERCENT,

                    triggerType:
                        config.tpSl.TRIGGER_TYPE,
                },

                tpSl:
                    result.tpSl || null,

                market:
                    result.market || null,

                exchangeRules:
                    result.exchangeRules || null,
            });
        } catch (error) {
            console.error(
                "[TP/SL PREVIEW] Error:",
                error.message
            );

            res.status(500).json({
                success: false,
                liveExecution: false,
                orderSent: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// BOT LAB TRADE HISTORY
// ============================================================
//
// This is BOT-COLLECTED trade history.
// It does NOT read WEEX exchange order history.
//
// completedTrades = completed Bot Lab positions
// activeTrades    = Bot Lab positions currently being tracked
// ============================================================

app.get("/api/trading/history", (req, res) => {
    try {
        const completedTrades =
            tradingExecutor.getTradeHistory();

        const activeTrades =
            tradingExecutor.getActiveTrades();

        const wins =
            completedTrades.filter(
                (trade) =>
                    trade.result === "WIN"
            ).length;

        const losses =
            completedTrades.filter(
                (trade) =>
                    trade.result === "LOSS"
            ).length;

        const breakeven =
            completedTrades.filter(
                (trade) =>
                    trade.result === "BREAKEVEN"
            ).length;

        const totalTrades =
            completedTrades.length;

        const realizedPnl =
            completedTrades.reduce(
                (total, trade) =>
                    total +
                    Number(trade.pnl || 0),
                0
            );

        const winRate =
            totalTrades > 0
                ? (wins / totalTrades) * 100
                : 0;

        // ====================================================
        // PER COIN PERFORMANCE
        // ====================================================

        const coinMap = new Map();

        for (const trade of completedTrades) {
            const symbol =
                String(
                    trade.symbol || ""
                )
                    .trim()
                    .toUpperCase();

            if (!symbol) {
                continue;
            }

            if (!coinMap.has(symbol)) {
                coinMap.set(symbol, {
                    symbol,
                    totalTrades: 0,
                    longTrades: 0,
                    shortTrades: 0,
                    wins: 0,
                    losses: 0,
                    breakeven: 0,
                    pnl: 0,
                });
            }

            const coin =
                coinMap.get(symbol);

            coin.totalTrades += 1;

            if (trade.side === "LONG") {
                coin.longTrades += 1;
            }

            if (trade.side === "SHORT") {
                coin.shortTrades += 1;
            }

            if (trade.result === "WIN") {
                coin.wins += 1;
            }

            if (trade.result === "LOSS") {
                coin.losses += 1;
            }

            if (
                trade.result ===
                "BREAKEVEN"
            ) {
                coin.breakeven += 1;
            }

            coin.pnl +=
                Number(trade.pnl || 0);
        }

        const perCoin =
            Array.from(
                coinMap.values()
            )
                .map((coin) => ({
                    ...coin,

                    winRate:
                        coin.totalTrades > 0
                            ? (
                                coin.wins /
                                coin.totalTrades
                            ) *
                            100
                            : 0,
                }))
                .sort(
                    (a, b) =>
                        b.pnl - a.pnl
                );

        res.json({
            success: true,

            summary: {
                totalTrades,
                wins,
                losses,
                breakeven,
                winRate,
                realizedPnl,
                activeTrades:
                    activeTrades.length,
            },

            activeTrades,

            completedTrades,

            perCoin,
        });
    } catch (error) {
        console.error(
            "[Trading History] Error:",
            error
        );

        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ============================================================
// LIVE TRADING EXECUTION
//
// IMPORTANT:
//
// This endpoint can send REAL orders.
//
// It requires:
//
// {
//     "symbol": "UNIUSDT.P",
//     "signal": "LONG",
//     "confirm": true
// }
//
// Without confirm:true:
//
// NO ORDER IS SENT.
// ============================================================

app.post(
    "/api/trading/execute",
    async (req, res) => {
        try {
            const {
                symbol,
                signal,
                confirm,
            } = req.body || {};

            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    error:
                        "symbol is required.",
                });
            }

            if (!signal) {
                return res.status(400).json({
                    success: false,
                    error:
                        "signal is required.",
                });
            }

            // ------------------------------------------------
            // SAFETY BLOCK
            // ------------------------------------------------

            if (confirm !== true) {
                return res.status(400).json({
                    success: false,

                    liveExecution: false,

                    orderSent: false,

                    warning:
                        "LIVE EXECUTION BLOCKED. Set confirm:true to explicitly allow a real order.",

                    requested: {
                        symbol:
                            tradingExecutor.normalizeSymbol(
                                symbol
                            ),

                        signal:
                            tradingExecutor.normalizeSignal(
                                signal
                            ),
                    },
                });
            }

            // ------------------------------------------------
            // REAL EXECUTION
            // ------------------------------------------------

            const result =
                await tradingExecutor.executeSignal(
                    symbol,
                    signal
                );

            res.json({
                success:
                    result.success,

                liveExecution:
                    true,

                orderSent:
                    result.orderSent || false,

                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                liveExecution: true,
                orderSent: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// PROTECT EXISTING POSITION
//
// IMPORTANT:
//
// This endpoint ONLY applies TP/SL to an already-open
// position.
//
// It does NOT open a position.
// It does NOT close a position.
// It does NOT reverse a position.
//
// POST body:
//
// {
//     "symbol": "UNIUSDT.P",
//     "confirm": true
// }
//
// Without confirm:true:
//
// NO TP/SL ORDER IS SENT.
// ============================================================

app.post(
    "/api/trading/protect",
    async (req, res) => {
        try {
            const {
                symbol,
                confirm,
            } = req.body || {};

            // ------------------------------------------------
            // SYMBOL CHECK
            // ------------------------------------------------

            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    error:
                        "symbol is required.",
                });
            }

            // ------------------------------------------------
            // SAFETY BLOCK
            // ------------------------------------------------

            if (confirm !== true) {
                return res.status(400).json({
                    success: false,

                    liveExecution: false,

                    orderSent: false,

                    warning:
                        "TP/SL PROTECTION BLOCKED. Set confirm:true to explicitly allow protection.",

                    requested: {
                        symbol:
                            tradingExecutor.normalizeSymbol(
                                symbol
                            ),
                    },
                });
            }

            // ------------------------------------------------
            // LIVE TP/SL PROTECTION
            // ------------------------------------------------

            const result =
                await tradingExecutor.protectExistingPosition(
                    symbol
                );

            res.json({
                success:
                    result.success,

                liveExecution:
                    true,

                orderSent:
                    result.success &&
                    result.action === "PROTECT",

                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                liveExecution: true,
                orderSent: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// EXECUTION STATUS
// ============================================================

app.get(
    "/api/trading/execution-status",
    (req, res) => {
        try {
            const status =
                tradingExecutor.getExecutionStatus();

            res.json({
                success: true,
                execution: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// BOT CONFIG / AVAILABLE BOTS
// ============================================================
//
// BotManager does not have getAvailableBots().
// listBots() is the correct API.
//

app.get("/api/bots/config", (req, res) => {
    try {
        const names =
            botManager.listBots();

        res.json({
            success: true,
            bots: names,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ============================================================
// PRICE V1 SESSION SETTINGS
//
// GET
//     /api/bots/pricev1/settings
//
// Returns the CURRENT session settings.
//
// These start from the defaults in botConfig.js.
// ============================================================

app.get(
    "/api/bots/pricev1/settings",
    (req, res) => {
        try {
            const settings =
                botConfig.getPriceV1Settings();

            res.json({
                success: true,

                settings,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// APPLY PRICE V1 SESSION SETTINGS
//
// POST
//     /api/bots/pricev1/settings
//
// Example body:
//
// {
//     "TREND_CANDLES": 200,
//     "ENTRY_WINDOWS": [15, 20, 30, 60],
//     "TREND_REQUIRED": 53,
//     "ENTRY_REQUIRED": 50,
//     "ENTRY_CONFIRMATIONS_REQUIRED": 3,
//     "CYCLE_LENGTH": 10,
//     "HISTORY_LIMIT": 500,
//     "KLINE_LIMIT": 1000,
//     "REFRESH_BUFFER_MS": 1200
// }
//
// Only supplied fields are changed.
// ============================================================

app.post(
    "/api/bots/pricev1/settings",
    (req, res) => {
        try {
            const incoming =
                req.body || {};

            const allowedKeys = [
                "TREND_CANDLES",
                "ENTRY_WINDOWS",
                "TREND_REQUIRED",
                "ENTRY_REQUIRED",
                "ENTRY_CONFIRMATIONS_REQUIRED",
                "CYCLE_LENGTH",
                "HISTORY_LIMIT",
                "KLINE_LIMIT",
                "REFRESH_BUFFER_MS",
            ];

            const settings = {};

            for (
                const key of allowedKeys
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        incoming,
                        key
                    )
                ) {
                    settings[key] =
                        incoming[key];
                }
            }

            // ------------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------------

            if (
                Object.prototype.hasOwnProperty.call(
                    settings,
                    "TREND_CANDLES"
                )
            ) {
                const value =
                    Number(
                        settings.TREND_CANDLES
                    );

                if (
                    !Number.isInteger(value) ||
                    value < 1
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "TREND_CANDLES must be a positive integer.",
                    });
                }

                settings.TREND_CANDLES =
                    value;
            }


            if (
                Object.prototype.hasOwnProperty.call(
                    settings,
                    "ENTRY_WINDOWS"
                )
            ) {
                if (
                    !Array.isArray(
                        settings.ENTRY_WINDOWS
                    ) ||
                    settings.ENTRY_WINDOWS.length ===
                        0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "ENTRY_WINDOWS must be a non-empty array.",
                    });
                }

                const windows =
                    settings.ENTRY_WINDOWS.map(
                        Number
                    );

                if (
                    windows.some(
                        (value) =>
                            !Number.isInteger(
                                value
                            ) ||
                            value < 1
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "ENTRY_WINDOWS must contain positive integers only.",
                    });
                }

                if (
                    new Set(windows).size !==
                    windows.length
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "ENTRY_WINDOWS cannot contain duplicates.",
                    });
                }

                settings.ENTRY_WINDOWS =
                    windows;
            }


            const positiveIntegerFields = [
                "ENTRY_CONFIRMATIONS_REQUIRED",
                "CYCLE_LENGTH",
                "HISTORY_LIMIT",
                "KLINE_LIMIT",
                "REFRESH_BUFFER_MS",
            ];

            for (
                const key of positiveIntegerFields
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        settings,
                        key
                    )
                ) {
                    const value =
                        Number(
                            settings[key]
                        );

                    if (
                        !Number.isInteger(
                            value
                        ) ||
                        value < 1
                    ) {
                        return res.status(400).json({
                            success: false,
                            error:
                                `${key} must be a positive integer.`,
                        });
                    }

                    settings[key] =
                        value;
                }
            }


            const percentageFields = [
                "TREND_REQUIRED",
                "ENTRY_REQUIRED",
            ];

            for (
                const key of percentageFields
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        settings,
                        key
                    )
                ) {
                    const value =
                        Number(
                            settings[key]
                        );

                    if (
                        !Number.isFinite(
                            value
                        ) ||
                        value < 0 ||
                        value > 100
                    ) {
                        return res.status(400).json({
                            success: false,
                            error:
                                `${key} must be a number between 0 and 100.`,
                        });
                    }

                    settings[key] =
                        value;
                }
            }


            const updatedSettings =
                botConfig.setPriceV1Settings(
                    settings
                );


            console.log(
                "[PriceV1] Session settings updated:",
                updatedSettings
            );


            res.json({
                success: true,

                settings:
                    updatedSettings,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// RESET PRICE V1 SESSION SETTINGS
//
// POST
//     /api/bots/pricev1/settings/reset
//
// Restores the defaults from botConfig.js.
// ============================================================

app.post(
    "/api/bots/pricev1/settings/reset",
    (req, res) => {
        try {
            const settings =
                botConfig.resetPriceV1Settings();

            console.log(
                "[PriceV1] Session settings reset to defaults."
            );

            res.json({
                success: true,

                settings,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// BOT STATUS
// ============================================================

app.get("/api/bots/status", (req, res) => {
    try {
        res.json({
            success: true,
            status:
                botManager.getStatus(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// ============================================================
// START STATIC BOT
// ============================================================

app.post(
    "/api/bots/:botName/start",
    async (req, res) => {
        try {
            const botName =
                req.params.botName;

            await botManager.startBot(
                botName
            );

            const status =
                botManager.getStatus();

            res.json({
                success: true,
                botName,
                status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// STOP STATIC BOT
// ============================================================

app.post(
    "/api/bots/:botName/stop",
    async (req, res) => {
        try {
            const botName =
                req.params.botName;

            await botManager.stopBot(
                botName
            );

            const status =
                botManager.getStatus();

            res.json({
                success: true,
                botName,
                status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// MARKET SYMBOLS
//
// Used by the frontend when selecting a real WEEX symbol.
// ============================================================

app.get(
    "/api/market/symbols",
    async (req, res) => {
        try {
            const symbols =
                await weex.getTradingSymbols();

            res.json({
                success: true,
                symbols,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// ASSIGN BOT TO SYMBOL
//
// Example:
//
// {
//     "symbol": "POLUSDT",
//     "botName": "pricev1"
// }
//
// To remove assignment:
//
// {
//     "symbol": "POLUSDT",
//     "botName": null
// }
// ============================================================

app.post(
    "/api/bots/assign",
    async (req, res) => {
        try {
            const {
                symbol,
                botName,
            } = req.body || {};

            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    error:
                        "symbol is required.",
                });
            }

            const result =
                await botManager.assignBotToSymbol(
                    symbol,
                    botName
                );

            res.json({
                success: true,
                result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// START BOT FOR SYMBOL
//
// Example:
//
// {
//     "symbol": "POLUSDT",
//     "botName": "pricev1"
// }
//
// IMPORTANT:
//
// Do NOT return the raw bot instance.
// A bot contains a setInterval() timer.
// Returning it directly causes circular JSON errors.
//
// Instead we return the serialized BotManager status.
// ============================================================

app.post(
    "/api/bots/start-symbol",
    async (req, res) => {
        try {
            const {
                symbol,
                botName,
            } = req.body || {};

            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    error:
                        "symbol is required.",
                });
            }

            if (!botName) {
                return res.status(400).json({
                    success: false,
                    error:
                        "botName is required.",
                });
            }

            await botManager.startBotForSymbol(
                symbol,
                botName
            );

            const cleanSymbol =
                String(symbol)
                    .trim()
                    .toUpperCase();

            const botStatus =
                botManager.getStatus();

            const symbolInstance =
                botStatus.instances?.[
                    cleanSymbol
                ] || null;

            res.json({
                success: true,

                botName,

                symbol:
                    cleanSymbol,

                runningBot:
                    symbolInstance,
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// STOP BOT FOR SYMBOL
//
// Example:
//
// {
//     "symbol": "POLUSDT"
// }
// ============================================================

app.post(
    "/api/bots/stop-symbol",
    async (req, res) => {
        try {
            const {
                symbol,
            } = req.body || {};

            if (!symbol) {
                return res.status(400).json({
                    success: false,
                    error:
                        "symbol is required.",
                });
            }

            await botManager.stopBotForSymbol(
                symbol
            );

            const cleanSymbol =
                String(symbol)
                    .trim()
                    .toUpperCase();

            const managerStatus =
                botManager.getStatus();

            res.json({
                success: true,

                symbol:
                    cleanSymbol,

                botManager:
                    managerStatus,
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// BOT INSTANCES
//
// BotManager does not have getAllInstances().
//
// getStatus().instances already contains the
// serialization-safe instance information.
// ============================================================

app.get(
    "/api/bots/instances",
    (req, res) => {
        try {
            const status =
                botManager.getStatus();

            res.json({
                success: true,
                instances:
                    status.instances || {},
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);


// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error:
            `Route not found: ${req.method} ${req.originalUrl}`,
    });
});


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
    console.error(
        "[SERVER ERROR]",
        error
    );

    res.status(500).json({
        success: false,
        error:
            error.message ||
            "Internal server error.",
    });
});


// ============================================================
// START SERVER
// ============================================================

app.listen(
    config.server.port,
    () => {

        console.log("");

        console.log(
            "============================================"
        );

        console.log(
            `WEEX Bot Lab backend running on http://localhost:${config.server.port}`
        );

        console.log(
            "WEEX API configured:",
            Boolean(
                config.weex.apiKey &&
                config.weex.apiSecret &&
                config.weex.apiPassphrase
            )
                ? "YES"
                : "NO"
        );

        console.log(
            "Trading executor: READY"
        );

        console.log(
            "Live execution endpoint: READY"
        );

        console.log(
            "Live execution: CONNECTED TO API, NOT CONNECTED TO BOTS"
        );

        console.log(
            "TP/SL protection endpoint: READY"
        );

        console.log(
            "TP/SL preview endpoint: READY"
        );

        console.log(
            "Price V1 session settings: READY"
        );

        console.log(
            "============================================"
        );

        console.log("");
    }
);

