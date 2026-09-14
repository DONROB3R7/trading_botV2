Continue my **WEEX Bot Lab** project from the previous chat.

IMPORTANT: This is a **brand-new project**, separate from my old WEEX Bot V3 project.

Project:
`D:\trading_bot_v2_react`

Architecture:

* React frontend
* Node.js backend
* Bot Manager
* Each strategy is its own bot file
* `weex.js` is a GENERAL WEEX API module only
* Strategy logic stays inside bot files
* I want a clean modular architecture so adding another bot means adding another JS bot module + its dashboard module.
* I prefer **Caveman Turbo**: one step at a time, complete-file replacements, beginner-friendly explanations.
* Do NOT give me downloadable code files. Give complete code directly in chat.
* Do NOT bring old V3 architecture into this new project unless I explicitly ask.

CURRENT PROJECT STRUCTURE:

text
D:\trading_bot_v2_react

├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── components/
│   │       └── PriceV1Panel.jsx
│   └── ...
│
├── backend/
│   ├── config/
│   │   ├── config.js
│   │   └── botConfig.js
│   ├── services/
│   │   └── weex.js
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── bots/
│   ├── bot_pricev1.js
│   └── bot_orderbookv3.js
│
├── bot-manager/
│   ├── botManager.js
│   └── index.js
│
├── README.md
├── .gitignore
├── .env.example
├── .env
└── .git/


BACKEND:

* Runs on `http://localhost:3001`
* React/Vite runs on `http://localhost:5173`
* Backend is currently working.
* WEEX public API is working.
* `weex.js` currently has public kline/orderbook/exchange info functions.
* Private WEEX API is not implemented yet.
* No real API credentials are currently being used.

CURRENT BOTS:

`bot_pricev1.js`

* Factory function
* Creates an independent bot instance per symbol.
* Symbol is passed into the factory.
* 1-minute candles.
* Fetches 1000 candles.
* 200-candle trend.
* 53% minimum directional strength.
* Entry windows: 15 / 20 / 30 / 60.
* 50% minimum entry strength.
* 3 of 4 confirmation.
* Cycle length 10.
* History 500.
* Refresh every 60 seconds.
* Stores current candles, current cycle, completed cycle history, last snapshot, etc.

`bot_orderbookv3.js`

* Static bot for now.
* Basic start/stop/status.
* Dashboard will be built later.

BOT MANAGER:

* Supports static bots.
* Supports bot factories.
* Supports symbol-specific instances.
* Current `botInstances` are keyed by symbol.
* `/api/market/start` starts a bot for a symbol.
* `/api/market/stop` stops a bot for a symbol.
* `/api/market/assign` assigns a bot to a symbol.
* `/api/market/assignments` returns assignments.
* `/api/market/instances` returns instances.

IMPORTANT CURRENT PROBLEM:

The Coin Manager accepted:

text
POL


instead of:

text
POLUSDT


Then the bot tried:

text
[BotManager] POL -> pricev1
[BotManager] Created pricev1 instance for POL
[pricev1:POL] Started
[pricev1:POL] Fetching 1000 candles
[BotManager] Started pricev1 for POL
[pricev1:POL] Error: WEEX HTTP 400: {"code":-1142,"msg":"Parameter 'symbol' is invalid."}


So we need to fix symbol handling.

I want the Coin Manager to use REAL WEEX trading symbols, ideally from the WEEX symbol list, instead of allowing arbitrary invalid values.

For example:

text
POLUSDT
CAKEUSDT
ALGOUSDT
BTCUSDT


NOT:

text
POL
CAKE
ALGO


Also, the Coin Manager list disappeared after the latest `App.jsx` replacement.

CURRENT FRONTEND PROBLEM:

The latest `App.jsx` was replaced to make browser refresh persistence work.

The goal was:

* Backend is source of truth for running bot instances.
* React reloads bot state from backend after browser refresh.
* Selected Price V1 symbol is stored in `localStorage`.
* Price V1 dropdown restores selected symbol after refresh.
* Running bot instances should remain represented after browser refresh.
* Do NOT use localStorage as the source of truth for actual running bots.

But after the latest replacement:

text
Coin Manager

Assign and control bot instances by symbol

Price V1
Order Book V3
ADD


appears, but the actual coin list is gone.

We suspect the frontend expects the wrong shape from:

text
/api/market/assignments


We need to inspect the CURRENT backend response before changing things.

IMPORTANT:
Do not blindly rewrite everything.

NEXT STEP:
Ask me to provide/upload my CURRENT:

text
frontend/src/App.jsx
backend/server.js


Then inspect them together and give me complete replacements.

We need to fix BOTH:

1. Real WEEX symbol validation/normalization.
2. Coin Manager list rendering.

Desired result:

text
COIN MANAGER

SYMBOL       BOT          STATUS       ACTIONS
---------------------------------------------------------
POLUSDT      pricev1      RUNNING      STOP OPEN REMOVE
CAKEUSDT     pricev1      STOPPED      START OPEN REMOVE
ALGOUSDT     pricev1      RUNNING      STOP OPEN REMOVE


And Price V1 should have:

text
SYMBOL
[ POLUSDT ▼ ]

TIMEFRAME
1m

CANDLES
1000


The Price V1 decision history should remain newest first:

text
3:19
3:18
3:17


The Price V1 dropdown should contain all currently running Price V1 instances.

Also preserve the browser-refresh persistence work.

DO NOT start adding new features yet.

Fix the current Coin Manager + symbol problem first, one step at a time.
