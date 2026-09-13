const BotManager = require("./botManager");

const priceBot = require("../bots/bot_pricev1");
const orderBookBot = require("../bots/bot_orderbookv3");

const botManager = new BotManager();

botManager.registerBot(priceBot.name, priceBot);
botManager.registerBot(orderBookBot.name, orderBookBot);

module.exports = botManager;