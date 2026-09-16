const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
});

module.exports = {
    server: {
        port: process.env.BACKEND_PORT || 3001,
    },

    weex: {
        apiKey: process.env.WEEX_API_KEY || "",
        apiSecret: process.env.WEEX_API_SECRET || "",
        apiPassphrase: process.env.WEEX_API_PASSPHRASE || "",
    },

    // ============================================================
    // TRADING / RISK
    // ============================================================

    trading: {
        // Maximum margin used for one new position.
        MAX_MARGIN_USDT: 1,

        // WEEX leverage.
        LEVERAGE: 10,
    },

    // ============================================================
    // TP / SL
    // ============================================================
    //
    // IMPORTANT:
    //
    // false = WEEX Bot does NOT manage TP/SL
    //
    // true = WEEX Bot is allowed to manage TP/SL
    //
    // Change these values here instead of modifying
    // trading logic or weex.js.
    //
    // ============================================================

    tpSl: {
        ENABLED: true,

        TAKE_PROFIT_PERCENT: 3.0,

        STOP_LOSS_PERCENT: 2.0,

        TRIGGER_TYPE: "MARK_PRICE",
    },
};
