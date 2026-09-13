class BotManager {
    constructor() {
        this.bots = new Map();
        this.activeBot = null;
    }

    registerBot(name, bot) {
        this.bots.set(name, bot);

        console.log(
            `[BotManager] Registered: ${name}`
        );
    }

    listBots() {
        return Array.from(this.bots.keys());
    }

    getBot(name) {
        return this.bots.get(name);
    }

    getBotInfo(name) {
        const bot = this.getBot(name);

        if (!bot) {
            throw new Error(
                `Bot not found: ${name}`
            );
        }

        return {
            name: bot.name,
            version: bot.version,
            status: bot.status,
            active: this.activeBot === bot.name,
        };
    }

    startBot(name) {
        const bot = this.getBot(name);

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

        if (typeof bot.start === "function") {
            bot.start();
        }

        this.activeBot = name;

        console.log(
            `[BotManager] Started: ${name}`
        );
    }

    stopBot(name) {
        const bot = this.getBot(name);

        if (!bot) {
            throw new Error(
                `Bot not found: ${name}`
            );
        }

        if (typeof bot.stop === "function") {
            bot.stop();
        }

        if (this.activeBot === name) {
            this.activeBot = null;
        }

        console.log(
            `[BotManager] Stopped: ${name}`
        );
    }

    getStatus() {
        const bots = Array.from(
            this.bots.values()
        ).map((bot) => ({
            name: bot.name,
            version: bot.version,
            status: bot.status,
            active: this.activeBot === bot.name,
        }));

        return {
            activeBot: this.activeBot,
            bots,
        };
    }
}

module.exports = BotManager;