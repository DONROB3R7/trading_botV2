const botConfig = require("../backend/config/botConfig");

class BotManager {

    constructor() {

        // ============================================================
        // STATIC BOTS
        // ============================================================

        this.bots = new Map();


        // ============================================================
        // BOT FACTORIES
        //
        // Example:
        //
        // pricev1 -> createPriceV1(symbol)
        //
        // This allows multiple independent instances:
        //
        // POLUSDT -> pricev1 instance
        // BTCUSDT -> pricev1 instance
        // ETHUSDT -> pricev1 instance
        // ============================================================

        this.botFactories = new Map();


        // ============================================================
        // ACTIVE BOT
        //
        // Kept for compatibility with the old global system.
        // ============================================================

        this.activeBot = null;


        // ============================================================
        // SYMBOL -> BOT ASSIGNMENTS
        //
        // Example:
        //
        // BTCUSDT -> pricev1
        // ETHUSDT -> orderbookv3
        // ============================================================

        this.symbolAssignments = new Map();


        // ============================================================
        // SYMBOL -> BOT INSTANCE
        //
        // Example:
        //
        // POLUSDT -> Price V1 instance
        // BTCUSDT -> Price V1 instance
        //
        // Every symbol has its own runtime state.
        // ============================================================

        this.botInstances = new Map();
    }


    // ============================================================
    // BOT REGISTRATION
    // STATIC BOT
    // ============================================================

    registerBot(
        name,
        bot
    ) {

        const config =
            botConfig.bots[name];


        if (
            config &&
            config.enabled === false
        ) {

            console.log(
                `[BotManager] Disabled: ${name}`
            );

            return;
        }


        this.bots.set(
            name,
            bot
        );


        console.log(
            `[BotManager] Registered: ${name}`
        );
    }


    // ============================================================
    // BOT FACTORY REGISTRATION
    // ============================================================

    registerBotFactory(
        name,
        factory
    ) {

        const config =
            botConfig.bots[name];


        if (
            config &&
            config.enabled === false
        ) {

            console.log(
                `[BotManager] Disabled: ${name}`
            );

            return;
        }


        if (
            typeof factory !== "function"
        ) {

            throw new Error(
                `Bot factory for ${name} must be a function`
            );
        }


        this.botFactories.set(
            name,
            factory
        );


        console.log(
            `[BotManager] Registered factory: ${name}`
        );
    }


    // ============================================================
    // LIST BOTS
    // ============================================================

    listBots() {

        const names =
            new Set([
                ...this.bots.keys(),
                ...this.botFactories.keys(),
            ]);


        return Array.from(
            names
        );
    }


    // ============================================================
    // GET STATIC BOT
    // ============================================================

    getBot(name) {

        return this.bots.get(
            name
        );
    }


    // ============================================================
    // GET BOT FACTORY
    // ============================================================

    getBotFactory(name) {

        return this.botFactories.get(
            name
        );
    }


    // ============================================================
    // BOT STATUS
    // ============================================================

    getBotStatusData(bot) {

        if (
            !bot
        ) {

            return null;
        }


        if (
            typeof bot.getStatus ===
            "function"
        ) {

            return bot.getStatus();
        }


        return {

            name:
                bot.name,

            version:
                bot.version,

            status:
                bot.status,

        };
    }


    // ============================================================
    // BOT INFO
    // ============================================================

    getBotInfo(name) {

        const bot =
            this.getBot(name);


        const factory =
            this.getBotFactory(name);


        if (
            !bot &&
            !factory
        ) {

            throw new Error(
                `Bot not found: ${name}`
            );
        }


        const config =
            botConfig.bots[name] || {};


        return {

            name,

            version:
                config.version ||
                bot?.version ||
                "unknown",

            status:
                bot?.status ||
                "factory",

            enabled:
                config.enabled !== false,

            active:
                this.activeBot === name,

            statusData:
                bot
                    ? this.getBotStatusData(bot)
                    : null,

            instances:
                this.getInstancesForBot(
                    name
                ),

        };
    }


    // ============================================================
    // CREATE BOT INSTANCE
    // ============================================================
    //
    // Example:
    //
    // createBotInstance(
    //     "pricev1",
    //     "POLUSDT"
    // );
    //
    // ============================================================

    createBotInstance(
        botName,
        symbol
    ) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {

            throw new Error(
                "Symbol is required"
            );
        }


        // --------------------------------------------------------
        // CHECK EXISTING INSTANCE
        // --------------------------------------------------------

        const existingInstance =
            this.botInstances.get(
                cleanSymbol
            );


        if (
            existingInstance &&
            existingInstance.botName ===
                botName
        ) {

            return existingInstance.bot;
        }


        // --------------------------------------------------------
        // BOT FACTORY
        // --------------------------------------------------------

        const factory =
            this.getBotFactory(
                botName
            );


        if (factory) {

            const bot =
                factory(
                    cleanSymbol
                );


            if (!bot) {

                throw new Error(
                    `Bot factory returned no bot for ${cleanSymbol}`
                );
            }


            this.botInstances.set(
                cleanSymbol,
                {

                    symbol:
                        cleanSymbol,

                    botName,

                    bot,

                }
            );


            console.log(
                `[BotManager] Created ${botName} instance for ${cleanSymbol}`
            );


            return bot;
        }


        // --------------------------------------------------------
        // STATIC BOT
        // --------------------------------------------------------

        const staticBot =
            this.getBot(
                botName
            );


        if (staticBot) {

            /*
             * Static bots are still supported.
             *
             * They are not yet truly independent
             * per-symbol bots.
             */

            this.botInstances.set(
                cleanSymbol,
                {

                    symbol:
                        cleanSymbol,

                    botName,

                    bot:
                        staticBot,

                }
            );


            console.log(
                `[BotManager] Assigned static ${botName} to ${cleanSymbol}`
            );


            return staticBot;
        }


        throw new Error(
            `Bot not found: ${botName}`
        );
    }


    // ============================================================
    // REMOVE BOT INSTANCE
    // ============================================================

    removeBotInstance(symbol) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        const instance =
            this.botInstances.get(
                cleanSymbol
            );


        if (!instance) {
            return;
        }


        if (
            instance.bot &&
            typeof instance.bot.stop ===
                "function"
        ) {

            instance.bot.stop();
        }


        this.botInstances.delete(
            cleanSymbol
        );


        console.log(
            `[BotManager] Removed instance: ${cleanSymbol}`
        );
    }


    // ============================================================
    // START BOT FOR SYMBOL
    // ============================================================
    //
    // Example:
    //
    // startBotForSymbol(
    //     "POLUSDT",
    //     "pricev1"
    // );
    //
    // ============================================================

    startBotForSymbol(
        symbol,
        botName
    ) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {

            throw new Error(
                "Symbol is required"
            );
        }


        if (!botName) {

            throw new Error(
                "Bot name is required"
            );
        }


        // --------------------------------------------------------
        // CREATE / GET INSTANCE
        // --------------------------------------------------------

        const bot =
            this.createBotInstance(
                botName,
                cleanSymbol
            );


        // --------------------------------------------------------
        // START
        // --------------------------------------------------------

        if (
            typeof bot.start ===
            "function"
        ) {

            bot.start();
        }


        // --------------------------------------------------------
        // SAVE ASSIGNMENT
        // --------------------------------------------------------

        this.symbolAssignments.set(
            cleanSymbol,
            botName
        );


        console.log(
            `[BotManager] Started ${botName} for ${cleanSymbol}`
        );


        return bot;
    }


    // ============================================================
    // STOP BOT FOR SYMBOL
    // ============================================================

    stopBotForSymbol(symbol) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        const instance =
            this.botInstances.get(
                cleanSymbol
            );


        if (!instance) {

            throw new Error(
                `No bot instance for ${cleanSymbol}`
            );
        }


        if (
            instance.bot &&
            typeof instance.bot.stop ===
                "function"
        ) {

            instance.bot.stop();
        }


        console.log(
            `[BotManager] Stopped bot for ${cleanSymbol}`
        );


        return instance.bot;
    }


    // ============================================================
    // GET BOT INSTANCE FOR SYMBOL
    // ============================================================

    getBotInstance(symbol) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        const instance =
            this.botInstances.get(
                cleanSymbol
            );


        if (!instance) {
            return null;
        }


        return instance.bot;
    }


    // ============================================================
    // GET INSTANCES FOR BOT
    // ============================================================

    getInstancesForBot(
        botName
    ) {

        const instances = [];


        for (
            const [
                symbol,
                instance
            ]
            of this.botInstances
        ) {

            if (
                instance.botName !==
                botName
            ) {

                continue;
            }


            instances.push({

                symbol,

                status:
                    instance.bot?.status ||
                    "unknown",

                statusData:
                    this.getBotStatusData(
                        instance.bot
                    ),

            });
        }


        return instances;
    }


    // ============================================================
    // SYMBOL -> BOT ASSIGNMENT
    // ============================================================

    assignBotToSymbol(
        symbol,
        botName
    ) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        if (!cleanSymbol) {

            throw new Error(
                "Symbol is required"
            );
        }


        // --------------------------------------------------------
        // REMOVE ASSIGNMENT
        // --------------------------------------------------------

        if (
            botName === null ||
            botName === "none" ||
            botName === ""
        ) {

            /*
             * If an instance exists,
             * stop and remove it.
             */

            this.removeBotInstance(
                cleanSymbol
            );


            this.symbolAssignments.delete(
                cleanSymbol
            );


            console.log(
                `[BotManager] ${cleanSymbol} -> NONE`
            );


            return null;
        }


        // --------------------------------------------------------
        // CHECK BOT
        // --------------------------------------------------------

        const bot =
            this.getBot(
                botName
            );


        const factory =
            this.getBotFactory(
                botName
            );


        if (
            !bot &&
            !factory
        ) {

            throw new Error(
                `Bot not found: ${botName}`
            );
        }


        // --------------------------------------------------------
        // SAVE ASSIGNMENT
        // --------------------------------------------------------

        this.symbolAssignments.set(
            cleanSymbol,
            botName
        );


        console.log(
            `[BotManager] ${cleanSymbol} -> ${botName}`
        );


        return botName;
    }


    // ============================================================
    // GET BOT FOR SYMBOL
    // ============================================================

    getBotForSymbol(symbol) {

        const cleanSymbol =
            String(symbol || "")
                .trim()
                .toUpperCase();


        return (
            this.symbolAssignments.get(
                cleanSymbol
            ) ||
            null
        );
    }


    // ============================================================
    // GET SYMBOL ASSIGNMENTS
    // ============================================================

    getSymbolAssignments() {

        const assignments = {};


        for (
            const [
                symbol,
                botName
            ]
            of this.symbolAssignments
        ) {

            assignments[symbol] =
                botName;
        }


        return assignments;
    }


    // ============================================================
    // GLOBAL BOT START
    // ============================================================
    //
    // OLD SYSTEM
    //
    // Kept so existing dashboard controls
    // do not immediately break.
    //
    // New multi-symbol system uses:
    //
    // startBotForSymbol()
    //
    // ============================================================

    startBot(name) {

        const bot =
            this.getBot(name);


        if (!bot) {

            throw new Error(
                `Bot not found: ${name}`
            );
        }


        if (this.activeBot) {

            throw new Error(
                `Bot already running: ${this.activeBot}`
            );
        }


        if (
            typeof bot.start ===
            "function"
        ) {

            bot.start();
        }


        this.activeBot =
            name;


        console.log(
            `[BotManager] Started: ${name}`
        );
    }


    // ============================================================
    // GLOBAL BOT STOP
    // ============================================================

    stopBot(name) {

        const bot =
            this.getBot(name);


        if (!bot) {

            throw new Error(
                `Bot not found: ${name}`
            );
        }


        if (
            typeof bot.stop ===
            "function"
        ) {

            bot.stop();
        }


        if (
            this.activeBot ===
            name
        ) {

            this.activeBot =
                null;
        }


        console.log(
            `[BotManager] Stopped: ${name}`
        );
    }


    // ============================================================
    // FULL STATUS
    // ============================================================

    getStatus() {

        const botNames =
            this.listBots();


        const bots =
            botNames.map(
                (name) => {

                    const config =
                        botConfig.bots[
                            name
                        ] || {};


                    const staticBot =
                        this.getBot(
                            name
                        );


                    return {

                        name,

                        version:
                            config.version ||
                            staticBot?.version ||
                            "unknown",

                        status:
                            staticBot?.status ||
                            "factory",

                        enabled:
                            config.enabled !== false,

                        active:
                            this.activeBot ===
                            name,

                        statusData:
                            staticBot
                                ? this.getBotStatusData(
                                    staticBot
                                )
                                : null,

                        instances:
                            this.getInstancesForBot(
                                name
                            ),

                    };
                }
            );


        // --------------------------------------------------------
        // INSTANCE STATUS
        // --------------------------------------------------------

        const instances = {};


        for (
            const [
                symbol,
                instance
            ]
            of this.botInstances
        ) {

            instances[symbol] = {

                bot:
                    instance.botName,

                status:
                    instance.bot?.status ||
                    "unknown",

                statusData:
                    this.getBotStatusData(
                        instance.bot
                    ),

            };
        }


        return {

            activeBot:
                this.activeBot,

            bots,

            symbolAssignments:
                this.getSymbolAssignments(),

            instances,

        };
    }
}


module.exports =
    BotManager;