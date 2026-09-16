# WEEX Bot Lab

WEEX Bot Lab is a modular trading-bot project built from scratch with:

- React frontend
- Node.js backend
- Bot Manager
- Independent strategy modules
- Centralized WEEX API service
- Live trading execution
- WEEX-based trade history for the Trading dashboard

The project is designed to keep trading strategies separate from the backend and UI.

---

# 1. Project Architecture

text
WEEX Bot Lab
│
├── frontend/
│   └── React dashboard
│
├── backend/
│   ├── config/
│   │   ├── config.js
│   │   └── botConfig.js
│   │
│   ├── services/
│   │   ├── weex.js
│   │   └── tradingExecutor.js
│   │
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
├── .env
├── .env.example
└── .gitignore
`

---

# 2. Main Components

## React Frontend

The React application is the dashboard and control layer.

Responsibilities:

* Display bot status
* Start and stop bots
* Select trading symbols
* Display Price V1 information
* Display live WEEX positions
* Display Bot Lab trade history
* Display per-coin performance
* Display P&L
* Display active trades

The frontend does NOT communicate directly with WEEX.

It communicates with the Node backend.

---

# 3. Node Backend

The Node backend is the central coordinator.

Main responsibilities:

* API endpoints
* Bot Manager communication
* Trading execution
* WEEX communication
* Position information
* Trade-history cache
* Configuration
* Dashboard data

The backend is the source of truth for the frontend.

---

# 4. Bot Manager

The Bot Manager controls strategy modules.

Example:

text
Bot Manager
    │
    ├── Price V1
    │      ├── POL
    │      ├── CAKE
    │      └── INJ
    │
    └── Order Book V3


A strategy is isolated from the others.

Adding a new strategy should normally mean creating another bot file inside:

text
bots/


Example:

text
bots/
├── bot_pricev1.js
├── bot_orderbookv3.js
└── bot_newstrategy.js


---

# 5. Price V1

Price V1 is an independent strategy module.

The strategy can run multiple symbols independently.

Each symbol receives its own Price V1 instance.

Example:

text
Price V1
    │
    ├── POL
    ├── CAKE
    ├── INJ
    └── JUP


Price V1 session settings are controlled dynamically through the backend.

Current settings include:

text
TREND_CANDLES
ENTRY_WINDOWS
TREND_REQUIRED
ENTRY_REQUIRED
ENTRY_CONFIRMATIONS_REQUIRED
CYCLE_LENGTH
HISTORY_LIMIT
KLINE_LIMIT
REFRESH_BUFFER_MS


Settings are applied when a new Price V1 instance is created.

Running instances are not silently changed in the middle of a cycle.

---

# 6. Order Book V3

Order Book V3 is maintained as its own independent strategy module.

It does not share strategy logic with Price V1.

The Bot Manager decides which bot is running.

---

# 7. WEEX Service

File:

text
backend/services/weex.js


This is the general WEEX communication layer.

Responsibilities:

* Public WEEX requests
* Private/signed WEEX requests
* Market data
* Klines
* Order book
* Exchange information
* Trading symbols
* Account information
* Positions
* Orders
* TP/SL orders
* Order history

The WEEX service does NOT contain:

* Strategy logic
* Price V1 logic
* Order Book strategy logic
* Reversal decisions
* Bot Manager logic

It only communicates with WEEX.

---

# 8. Trading Executor

File:

text
backend/services/tradingExecutor.js


This module handles actual trading execution.

Responsibilities include:

* Position verification
* Quantity calculation
* Exchange quantity rules
* Opening LONG positions
* Opening SHORT positions
* Closing positions
* Reversals
* Same-direction protection
* TP/SL protection
* Order previews
* Trading status

The executor always verifies the live WEEX position.

---

# 9. Trading Risk Configuration

Current configuration:

text
MAX_MARGIN_USDT = 1 USDT
LEVERAGE        = 10x
TARGET NOTIONAL ≈ 10 USDT


TP/SL:

text
TAKE PROFIT = 3%
STOP LOSS  = 2%
TRIGGER     = MARK_PRICE


These values are stored in:

text
backend/config/config.js


They should not be silently changed by strategy code.

---

# 10. TP / SL Safety

The execution sequence is:

text
OPEN MARKET ORDER
        ↓
CONFIRM LIVE WEEX POSITION
        ↓
READ CONFIRMED avgPrice
        ↓
CALCULATE TP
        ↓
CALCULATE SL
        ↓
PLACE TP
        ↓
PLACE SL
        ↓
POSITION PROTECTED


TP/SL is calculated from the confirmed WEEX average entry price.

The LONG logic is:

text
LONG
    TP = Entry + 3%
    SL = Entry - 2%


The SHORT logic is:

text
SHORT
    TP = Entry - 3%
    SL = Entry + 2%


WEEX price-step rules are applied before the trigger orders are sent.

If TP/SL protection fails after an entry, the executor attempts an emergency close.

---

# 11. Trade History Architecture

The Trading dashboard uses WEEX order history as the source of truth.

We do NOT depend on a local Bot Lab-only trade recorder.

The system works like this:

text
WEEX
 │
 │ one history request
 ↓
Node trade-history cache
 │
 ├── active trades
 │
 └── completed trades
        ↓
   React dashboard


The React dashboard does not ask WEEX directly.

---

# 12. One-Minute History Scanner

Trade history is refreshed every:

text
60 seconds


The system performs approximately:

text
1 WEEX history request / minute


It does NOT make:

text
1 request per coin


or:

text
100+ requests per minute


This keeps the system simple and avoids unnecessary WEEX traffic.

---

# 13. WEEX Session Clock

When the backend starts, the trade-history system performs one WEEX server-time request.

The backend calculates:

text
WEEX server time
        -
Node local time
        =
clock offset


After that, synchronized WEEX time is calculated locally:

text
WEEX synchronized time
=
Date.now() + clock offset


The WEEX clock is NOT requested every minute.

It is synchronized once during backend startup.

---

# 14. Trading Session Start

Each backend startup creates a new Trading history session.

Example:

text
BOT START
2026-09-15 22:35:04


The session begins at the synchronized WEEX timestamp.

Only orders created after that moment are included.

Therefore:

text
OLD TRADE
21:00
    ↓
IGNORED

BOT START
22:35
    ↓
SESSION START

NEW TRADE
22:40
    ↓
INCLUDED


This means restarting the backend creates a fresh Trading history session.

---

# 15. Trade Pairing

WEEX order history contains individual orders.

The backend converts those orders into trades.

Conceptually:

text
OPEN
    ↓
CLOSE
    ↓
COMPLETED TRADE


Example:

text
CAKEUSDT
SHORT

ENTRY
2.2437

EXIT
2.1990


The backend creates:

text
Symbol       CAKEUSDT
Side         SHORT
Entry        2.2437
Exit         2.1990
P&L          calculated locally
Result       WIN


The system also keeps still-open trades as active trades.

---

# 16. Trade History Cache

Trade history is kept in backend memory.

The cache contains:

text
orders
activeTrades
completedTrades
updatedAt
sessionStartTime
clockOffset


The cache is reset when the backend restarts.

No database is currently required.

---

# 17. Dashboard Trading Section

The Trading dashboard can display:

## Live Positions

Information comes from the live WEEX position endpoint.

Example:

text
COIN
SIDE
SIZE
LEVERAGE
MARGIN
OPEN VALUE
UNREALIZED PNL


## Active Trades

Trades currently detected as open by the history cache.

## Coin Performance

Per-coin statistics:

text
COIN
TRADES
LONG
SHORT
WINS
LOSSES
WIN RATE
P&L


## Trade History

Completed trades:

text
TIME
COIN
SIDE
ENTRY
EXIT
P&L
RESULT


---

# 18. P&L

The current trade-history P&L is calculated from entry and exit prices.

LONG:

text
P&L =
(Exit - Entry) × Quantity


SHORT:

text
P&L =
(Entry - Exit) × Quantity


This is a gross price-difference calculation.

It does not currently attempt to reproduce every WEEX account adjustment such as:

* trading fees
* funding
* other account-income adjustments

Therefore the dashboard P&L and WEEX realized account P&L may differ slightly.

---

# 19. Important Source of Truth Rules

The system should preserve these principles.

## Live Position

For current live positions:

text
WEEX position = source of truth


Do not replace live WEEX verification with local state.

## Trade History

For historical trades:

text
WEEX order history = source of truth


Do not fabricate trades from frontend state.

## Strategy State

For strategies:

text
Bot instance = strategy state


The strategy remains independent from the Trading dashboard.

---

# 20. Frontend Data Flow

The frontend follows this model:

text
React
  ↓
Node API
  ↓
Backend cache/services
  ↓
WEEX


The browser should not contain WEEX API credentials.

Private WEEX authentication stays inside Node.

---

# 21. Environment Variables

The backend reads WEEX credentials from:

text
.env


Example:

text
WEEX_API_KEY=your_key
WEEX_API_SECRET=your_secret
WEEX_API_PASSPHRASE=your_passphrase
BACKEND_PORT=3001


Never commit the real `.env` file.

Use:

text
.env.example


for safe documentation.

---

# 22. Starting the Project

Start the backend:

powershell
cd D:\trading_bot_v2_react
node backend/server.js


Start the frontend from its directory:

powershell
cd D:\trading_bot_v2_react\frontend
npm run dev


---

# 23. Syntax Checks

Before starting the bot after an important change:

powershell
node --check backend/services/weex.js


and:

powershell
node --check backend/services/tradingExecutor.js


To verify the executor can load:

powershell
node -e "require('./backend/services/tradingExecutor.js'); console.log('EXECUTOR LOAD OK')"


Expected:

text
EXECUTOR LOAD OK


---

# 24. Expected Trade History Startup Logs

A normal startup should look similar to:

text
[TradeHistory] WEEX clock synced.
[TradeHistory] Session starts at ...
[TradeHistory] Refreshed WEEX history: ... orders, ... active, ... completed.


The WEEX clock should be synchronized once during backend startup.

Every minute afterward, only the history refresh should run:

text
[TradeHistory] Refreshed WEEX history: ...


The system should not synchronize the WEEX clock again every minute.

---

# 25. Current Design Philosophy

Keep the project simple.

Prefer:

text
ONE request
ONE cache
ONE source of truth
ONE clear responsibility


Avoid unnecessary systems that duplicate the same information.

Especially avoid:

text
WEEX history
        +
Bot local history
        +
frontend history
        +
separate reconciliation system


when WEEX history already provides the required information.

---

# 26. Development Rules

When changing the project:

1. Make the smallest practical change.
2. Keep strategies independent.
3. Keep WEEX communication inside `weex.js`.
4. Keep execution logic inside `tradingExecutor.js`.
5. Keep React focused on UI.
6. Keep Bot Manager responsible for bots.
7. Do not put secrets in React.
8. Do not silently change trading risk settings.
9. Verify syntax before restarting the bot.
10. Check actual logs before making another change.

---

# 27. Current Project Goal

The goal of WEEX Bot Lab is to provide a clean foundation where new trading ideas can be added independently.

Example future structure:

text
bots/
├── bot_pricev1.js
├── bot_orderbookv3.js
├── bot_strategy3.js
├── bot_strategy4.js
└── ...


Each strategy should be able to run without rewriting the core backend.

The long-term architecture is:

text
                 ┌─────────────────┐
                 │ React Dashboard │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │   Node Server  │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
        Bot Manager   Trade History  Execution
             │            │            │
       ┌─────┴─────┐      │            │
       ▼           ▼      ▼            ▼
   Price V1   OrderBook  WEEX        WEEX
                         History      Orders


The architecture should remain modular so new strategies can be added without rewriting the entire system.



This README now documents the **current Lab architecture**, including the one-request-per-minute trade-history cache and the WEEX-synchronized session clock. The current executor already separates live execution from position/history concerns, so the README reflects that separation.

