const express = require("express");
const cors = require("cors");

const config = require("./config/config");
const botConfig = require("./config/botConfig");
const weex = require("./services/weex");
const botManager = require("../bot-manager");

const app = express();

const PORT =
    config.server.port;

app.use(cors());
app.use(express.json());


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            status:
                "ok",

            timestamp:
                new Date().toISOString(),
        });
    }
);


// ============================================================
// SYSTEM STATUS
// ============================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            status:
                "online",

            project:
                "WEEX Bot Lab",

            backend:
                "Node.js",

            port:
                PORT,

            weexConfigured:
                weex.isConfigured(),

        });
    }
);


// ============================================================
// BOT CONFIG
// ============================================================

app.get(
    "/api/config/bots",
    (req, res) => {

        res.json({

            bots:
                botConfig.bots,

        });
    }
);


// ============================================================
// BOT LIST
// ============================================================

app.get(
    "/api/bots",
    (req, res) => {

        res.json({

            bots:
                botManager.listBots(),

        });
    }
);


// ============================================================
// BOT STATUS
// ============================================================

app.get(
    "/api/bots/status",
    (req, res) => {

        res.json(
            botManager.getStatus()
        );
    }
);


// ============================================================
// SINGLE BOT
// ============================================================

app.get(
    "/api/bots/:name",
    (req, res) => {

        try {

            const bot =
                botManager.getBotInfo(
                    req.params.name
                );

            res.json({

                bot,

            });

        } catch (error) {

            res.status(404).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// GLOBAL START BOT
// ============================================================
//
// OLD / COMPATIBILITY SYSTEM
//
// This is kept for static bots.
//
// Coin Manager uses:
//
// POST /api/market/start
//
// ============================================================

app.post(
    "/api/bots/:name/start",
    (req, res) => {

        try {

            botManager.startBot(
                req.params.name
            );

            res.json({

                success:
                    true,

                message:
                    `Bot started: ${req.params.name}`,

                status:
                    botManager.getStatus(),

            });

        } catch (error) {

            res.status(400).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// GLOBAL STOP BOT
// ============================================================
//
// OLD / COMPATIBILITY SYSTEM
//
// Coin Manager uses:
//
// POST /api/market/stop
//
// ============================================================

app.post(
    "/api/bots/:name/stop",
    (req, res) => {

        try {

            botManager.stopBot(
                req.params.name
            );

            res.json({

                success:
                    true,

                message:
                    `Bot stopped: ${req.params.name}`,

                status:
                    botManager.getStatus(),

            });

        } catch (error) {

            res.status(400).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// WEEX MARKET SYMBOLS
// ============================================================

app.get(
    "/api/market/symbols",
    async (req, res) => {

        try {

            const raw =
                await weex.getTradingSymbols();

            let symbols = [];


            // ----------------------------------------------------
            // WEEX MAY RETURN ARRAY DIRECTLY
            // ----------------------------------------------------

            if (
                Array.isArray(raw)
            ) {

                symbols =
                    raw;
            }


            // ----------------------------------------------------
            // OR WRAPPED IN DATA
            // ----------------------------------------------------

            else if (
                Array.isArray(raw?.data)
            ) {

                symbols =
                    raw.data;
            }


            // ----------------------------------------------------
            // NORMALIZE SYMBOLS
            // ----------------------------------------------------

            symbols =
                symbols
                    .map((item) => {

                        if (
                            typeof item ===
                            "string"
                        ) {

                            return item
                                .trim()
                                .toUpperCase();
                        }


                        return (
                            item.symbol ||
                            item.instId ||
                            item.symbolName ||
                            ""
                        )
                            .trim()
                            .toUpperCase();

                    })
                    .filter(Boolean);


            // ----------------------------------------------------
            // REMOVE DUPLICATES
            // ----------------------------------------------------

            symbols =
                [
                    ...new Set(symbols)
                ];


            // ----------------------------------------------------
            // SORT
            // ----------------------------------------------------

            symbols.sort();


            res.json({

                success:
                    true,

                count:
                    symbols.length,

                symbols,

            });

        } catch (error) {

            console.error(
                "[Market] Symbol error:",
                error.message
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// SYMBOL ASSIGNMENTS
// ============================================================

app.get(
    "/api/market/assignments",
    (req, res) => {

        res.json({

            success:
                true,

            assignments:
                botManager
                    .getSymbolAssignments(),

        });
    }
);


// ============================================================
// ASSIGN BOT TO SYMBOL
// ============================================================
//
// Example:
//
// {
//     "symbol": "POLUSDT",
//     "bot": "pricev1"
// }
//
// Or:
//
// {
//     "symbol": "POLUSDT",
//     "bot": null
// }
//
// Assignment does NOT start the bot.
//
// ============================================================

app.post(
    "/api/market/assign",
    (req, res) => {

        try {

            const {
                symbol,
                bot
            } = req.body;


            const assignedBot =
                botManager.assignBotToSymbol(
                    symbol,
                    bot
                );


            res.json({

                success:
                    true,

                symbol:
                    String(symbol)
                        .trim()
                        .toUpperCase(),

                bot:
                    assignedBot,

                assignments:
                    botManager
                        .getSymbolAssignments(),

            });

        } catch (error) {

            console.error(
                "[Market] Assignment error:",
                error.message
            );

            res.status(400).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// START BOT FOR SYMBOL
// ============================================================
//
// THIS IS THE NEW COIN MANAGER START SYSTEM.
//
// Example:
//
// POLUSDT + pricev1
//
// creates:
//
// PriceV1("POLUSDT")
//
// and starts that independent instance.
//
// ============================================================

app.post(
    "/api/market/start",
    (req, res) => {

        try {

            const {
                symbol,
                bot
            } = req.body;


            const cleanSymbol =
                String(symbol || "")
                    .trim()
                    .toUpperCase();


            if (!cleanSymbol) {

                throw new Error(
                    "Symbol is required"
                );
            }


            if (!bot) {

                throw new Error(
                    "Bot is required"
                );
            }


            // ----------------------------------------------------
            // MAKE SURE SYMBOL IS ASSIGNED
            // ----------------------------------------------------

            const assignedBot =
                botManager.getBotForSymbol(
                    cleanSymbol
                );


            if (
                assignedBot !== bot
            ) {

                botManager.assignBotToSymbol(
                    cleanSymbol,
                    bot
                );
            }


            // ----------------------------------------------------
            // START SPECIFIC SYMBOL INSTANCE
            // ----------------------------------------------------

            const instance =
                botManager.startBotForSymbol(
                    cleanSymbol,
                    bot
                );


            res.json({

                success:
                    true,

                message:
                    `${bot} started for ${cleanSymbol}`,

                symbol:
                    cleanSymbol,

                bot,

                statusData:
                    botManager
                        .getBotInstance(
                            cleanSymbol
                        )
                        ?.getStatus?.() ||
                    null,

                assignments:
                    botManager
                        .getSymbolAssignments(),

            });

        } catch (error) {

            console.error(
                "[Market] Start error:",
                error.message
            );

            res.status(400).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// STOP BOT FOR SYMBOL
// ============================================================
//
// Example:
//
// POLUSDT
//
// stops only:
//
// PriceV1("POLUSDT")
//
// It does NOT stop CAKEUSDT.
//
// ============================================================

app.post(
    "/api/market/stop",
    (req, res) => {

        try {

            const {
                symbol
            } = req.body;


            const cleanSymbol =
                String(symbol || "")
                    .trim()
                    .toUpperCase();


            if (!cleanSymbol) {

                throw new Error(
                    "Symbol is required"
                );
            }


            const bot =
                botManager
                    .getBotForSymbol(
                        cleanSymbol
                    );


            if (!bot) {

                throw new Error(
                    `No bot assigned to ${cleanSymbol}`
                );
            }


            const instance =
                botManager
                    .stopBotForSymbol(
                        cleanSymbol
                    );


            res.json({

                success:
                    true,

                message:
                    `${bot} stopped for ${cleanSymbol}`,

                symbol:
                    cleanSymbol,

                bot,

                statusData:
                    instance?.getStatus?.() ||
                    null,

            });

        } catch (error) {

            console.error(
                "[Market] Stop error:",
                error.message
            );

            res.status(400).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// BOT INSTANCES
// ============================================================
//
// Returns all symbol-specific bot instances.
//
// Example:
//
// POLUSDT -> pricev1 -> running
// CAKEUSDT -> pricev1 -> running
//
// ============================================================

app.get(
    "/api/market/instances",
    (req, res) => {

        try {

            const status =
                botManager.getStatus();


            res.json({

                success:
                    true,

                instances:
                    status.instances,

            });

        } catch (error) {

            console.error(
                "[Market] Instance status error:",
                error.message
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// SINGLE SYMBOL BOT INSTANCE
// ============================================================
//
// Example:
//
// GET /api/market/instances/POLUSDT
//
// ============================================================

app.get(
    "/api/market/instances/:symbol",
    (req, res) => {

        try {

            const cleanSymbol =
                String(req.params.symbol || "")
                    .trim()
                    .toUpperCase();


            const botName =
                botManager
                    .getBotForSymbol(
                        cleanSymbol
                    );


            const instance =
                botManager
                    .getBotInstance(
                        cleanSymbol
                    );


            res.json({

                success:
                    true,

                symbol:
                    cleanSymbol,

                bot:
                    botName,

                running:
                    Boolean(
                        instance &&
                        instance.status ===
                            "running"
                    ),

                statusData:
                    instance?.getStatus?.() ||
                    null,

            });

        } catch (error) {

            console.error(
                "[Market] Single instance error:",
                error.message
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message,

            });
        }
    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `WEEX Bot Lab backend running on http://localhost:${PORT}`
        );

    }
);