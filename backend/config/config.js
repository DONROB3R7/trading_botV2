require("dotenv").config({
    path: "../../.env",
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
};