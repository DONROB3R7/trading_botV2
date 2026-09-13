const bot = {
    name: "orderbookv3",
    version: "3.0.0",

    status: "stopped",

    start() {
        this.status = "running";

        console.log(`[${this.name}] Started`);
    },

    stop() {
        this.status = "stopped";

        console.log(`[${this.name}] Stopped`);
    },

    getStatus() {
        return {
            name: this.name,
            version: this.version,
            status: this.status,
        };
    },
};

module.exports = bot;