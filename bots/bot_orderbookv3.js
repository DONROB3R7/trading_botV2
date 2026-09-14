const bot = {
    name: "orderbookv3",
    version: "3.0.0",

    status: "stopped",

    start() {
        if (this.status === "running") {
            return;
        }

        this.status = "running";

        console.log(`[${this.name}] Started`);
    },

    stop() {
        if (this.status === "stopped") {
            return;
        }

        this.status = "stopped";

        console.log(`[${this.name}] Stopped`);
    },

    getStatus() {
        return this.status;
    },

    getInfo() {
        return {
            name: this.name,
            version: this.version,
            status: this.status,
        };
    },
};

module.exports = bot;