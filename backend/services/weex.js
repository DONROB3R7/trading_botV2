const config = require("../config/config");

const weex = {
    getConfig() {
        return {
            apiKey: config.weex.apiKey,
            apiSecret: config.weex.apiSecret,
            apiPassphrase: config.weex.apiPassphrase,
        };
    },

    isConfigured() {
        return Boolean(
            config.weex.apiKey &&
            config.weex.apiSecret &&
            config.weex.apiPassphrase
        );
    },
};

module.exports = weex;