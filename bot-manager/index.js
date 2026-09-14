const BotManager = require("./botManager");

const createPriceV1 =
    require("../bots/bot_pricev1");

const orderBookBot =
    require("../bots/bot_orderbookv3");


// ============================================================
// BOT MANAGER
// ============================================================

const botManager =
    new BotManager();


// ============================================================
// REGISTER BOT FACTORIES
// ============================================================
//
// Price V1 is now a factory.
//
// It can create:
//
// POLUSDT → Price V1
// BTCUSDT → Price V1
// ETHUSDT → Price V1
//
// Each symbol gets its own independent instance.
//
// ============================================================

botManager.registerBotFactory(
    "pricev1",
    createPriceV1
);


// ============================================================
// REGISTER STATIC BOTS
// ============================================================
//
// OrderBook V3 is still registered the old way
// for now.
//
// We will convert it to symbol-based instances
// later.
//
// ============================================================

botManager.registerBot(
    orderBookBot.name,
    orderBookBot
);


module.exports =
    botManager;

