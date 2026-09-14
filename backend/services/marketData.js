const weex = require("./weex");

const marketData = {

    // =========================
    // GET KLINES
    // =========================

    async getKlines(
        symbol,
        interval = "1m",
        limit = 1000
    ) {
        if (!symbol) {
            throw new Error(
                "Symbol is required"
            );
        }

        const data =
            await weex.request({
                method: "GET",

                path:
                    "/capi/v3/market/klines",

                query: {
                    symbol:
                        symbol
                            .trim()
                            .toUpperCase(),

                    interval,

                    limit:
                        Number(limit),
                },

                privateRequest: false,
            });

        return data;
    },


    // =========================
    // GET NORMALIZED KLINES
    // =========================

    async getCandles(
        symbol,
        interval = "1m",
        limit = 1000
    ) {
        const data =
            await this.getKlines(
                symbol,
                interval,
                limit
            );

        if (!Array.isArray(data)) {
            return [];
        }

        return data
            .map((raw) => {

                if (
                    !Array.isArray(raw) ||
                    raw.length < 5
                ) {
                    return null;
                }

                return {
                    time:
                        Number(raw[0]),

                    open:
                        Number(raw[1]),

                    high:
                        Number(raw[2]),

                    low:
                        Number(raw[3]),

                    close:
                        Number(raw[4]),

                    volume:
                        Number(raw[5] || 0),
                };
            })
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.time - b.time
            );
    },
};

module.exports = marketData;