# OpenAlgo Trading Terminal & Scalper Platform

<div align="center">

![OpenAlgo Trading Terminal](https://img.shields.io/badge/OpenAlgo-v1.0.7-blue?style=for-the-badge&logo=python)
![Latency Engine](https://img.shields.io/badge/Latency-0--1ms-brightgreen?style=for-the-badge)
![Supported Brokers](https://img.shields.io/badge/Brokers-36%20Supported-orange?style=for-the-badge)
![License](https://img.shields.io/badge/License-AGPL%20v3.0-purple?style=for-the-badge)

**Open Source, Self-Hosted Algorithmic Trading Platform, Real-Time Charting & Ultra-Fast Options Scalper**

[Quick Start](#-quick-start-installation) • [Broker Setup](#-broker-api-setup-guide) • [Scalper Terminal](#-scalper-mode--trading-surfaces) • [0–1ms Latency](#-01-ms-latency-architecture) • [Python SDK](#-python-sdk-integration)

</div>

---

## 🌟 What is OpenAlgo?

**OpenAlgo** is a self-hosted algorithmic trading platform and broker bridge built on **Python Flask + React 19**. It provides a unified API contract across **36 broker plugins** (Kotak Neo, Zerodha, Angel One, Fyers, Upstox, Dhan, Delta Exchange, etc.) along with a dedicated high-performance **Scalper Terminal**, visual **Flow** strategy builder, in-browser **Python Strategy Host**, and comprehensive **Options Trading Suite**.

---

## ⚡ 0–1 ms Latency Architecture

OpenAlgo features a sub-millisecond in-memory caching engine designed for high-frequency scalpers and real-time execution:

| Operation | Standard Latency | Optimized Latency | Speedup |
| :--- | :--- | :--- | :--- |
| **History Data (In-Process / SDK)** | 700 – 1,200 ms | **`0.00 ms` – `0.01 ms`** (< 10 µs) | **~70,000× faster** |
| **History Data (Over HTTP Loopback)** | 1,241 ms | **`6.52 ms`** | **~190× faster** |
| **Expiry Lookup (`get_expiry_dates`)** | 38 – 60 ms | **`0.006 ms`** | **~6,300× faster** |
| **Option Chain Strike Ladder** | 1,000 – 1,350 ms | **`0.005 ms`** | **~260,000× faster** |
| **Spot & Option Quotes (`get_quotes`)** | 120 – 150 ms | **`0.006 ms`** | **~20,000× faster** |
| **Multi-Quote Query (`get_multiquotes`)** | 150 – 250 ms | **`0.64 ms`** | **~300× faster** |
| **Scalper Tab Switch** | 1,500 – 3,000 ms | **`0 ms`** (Kept in DOM) | **Instant (Zero re-render)** |

---

## 🚀 Quick Start: Installation Guide

The repository includes pre-built and pre-compressed frontend assets in `frontend/dist/`. **You do not need Node.js or npm to run OpenAlgo** — only Python 3.11+ or 3.12+ is required.

### Option A: 1-Click Launch on Windows (Recommended)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/shelmoy/Trading-Terminal.git
   cd Trading-Terminal
   ```
2. Copy `.sample.env` to `.env`:
   ```cmd
   copy .sample.env .env
   ```
3. Double-click **`start_openalgo.bat`** (or run `.\start_openalgo.ps1` in PowerShell).
   - The script automatically checks for `uv`, installs it if missing, boots the backend, and opens `http://127.0.0.1:5000` in your browser.

---

### Option B: Step-by-Step Manual Setup (Windows / Linux / macOS)

#### 1. Prerequisites
- **Python 3.11+ or 3.12+**: [Download Python](https://www.python.org/downloads/) *(make sure "Add Python to PATH" is checked on Windows)*.
- **Git**: [Download Git](https://git-scm.com/).
- **UV Package Manager** *(Recommended for 10x faster package resolution)*:
  ```bash
  pip install uv
  ```

#### 2. Clone the Repository
```bash
git clone https://github.com/shelmoy/Trading-Terminal.git
cd Trading-Terminal
```

#### 3. Setup Environment Configuration
```bash
# Windows Command Prompt
copy .sample.env .env

# Windows PowerShell or Linux / macOS
cp .sample.env .env
```

#### 4. Run OpenAlgo
Using `uv`:
```bash
uv run app.py
```
Or using standard Python virtual environment:
```bash
python -m venv .venv
# Activate on Windows:
.venv\Scripts\activate
# Activate on Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

#### 5. Open in Browser
Open your browser and navigate to:
```
http://127.0.0.1:5000
```
- Default Admin Username: configured on first login or via `.env`.

---

### Option C: Frontend Development (Optional)
If you wish to modify the React 19 frontend source code:
```bash
cd frontend
npm install
npm run dev     # Starts Vite development server at http://localhost:5173
npm run build   # Compiles production assets into frontend/dist
```

---

## 🔑 Broker API Setup Guide

OpenAlgo connects directly to your broker's official API. Your credentials, access tokens, and passwords are encrypted locally on your machine using **Fernet 128-bit encryption** and **Argon2** password hashing. **No data is ever sent to any third party.**

### 1. Kotak Neo Setup (Step-by-Step)

Kotak Neo provides zero-brokerage trading for youth and competitive rates with full REST and WebSocket support.

#### Step 1: Obtain Kotak Neo API Credentials
1. Log in to the [Kotak Neo Developer Portal](https://neo.kotaksecurities.com).
2. Create a new Application (e.g., `OpenAlgo-Terminal`).
3. Note down your **Consumer Key** and **Consumer Secret**.

#### Step 2: Ensure TOTP (2FA) is Active
1. In your Kotak Neo security settings, ensure Two-Factor Authentication (TOTP) is configured with Google Authenticator or Microsoft Authenticator.
2. Save your **TOTP Secret Seed Key** (a 32-character alphanumeric string shown during QR setup).

#### Step 3: Configure in OpenAlgo
You can enter credentials in two ways:
- **Via the Web Interface**: Go to **Settings** → **Broker Config** → select **Kotak Neo**, enter your Consumer Key, Consumer Secret, Mobile Number, Password/MPIN, and TOTP Key, then click **Save**.
- **Via `.env` file**:
  ```env
  BROKER_API_KEY='your_kotak_consumer_key'
  BROKER_API_SECRET='your_kotak_consumer_secret'
  ```

#### Step 4: Login and Authenticate
1. In the OpenAlgo sidebar, navigate to **Broker Login**.
2. Select **Kotak Neo**.
3. Enter your Registered Mobile Number (e.g. `+919876543210`), Password/MPIN, and TOTP.
4. Click **Login**. OpenAlgo automatically negotiates the session token and connects the real-time quote feed.

---

### 2. Downloading Master Contracts (CRITICAL FIRST STEP)

Once your broker is connected, you must download the exchange master contracts:
1. In the top navigation or sidebar, navigate to **Symbol Master** or **Download**.
2. Click **Download Master Contracts** for your desired exchanges (`NSE`, `NFO`, `BSE`, `MCX`).
3. OpenAlgo fetches and indexes contracts (strikes, lot sizes, tick sizes, freeze limits) in the local SQLite database (`symtoken.db`).
4. **Why this is critical**: The Scalper Terminal and Option Chains use these tokens for instant strike ladders and live market data.

---

### 3. Other Supported Brokers (36 Plugins)

OpenAlgo supports 36 brokers with identical API endpoints:
- **Zerodha (Kite Connect)**: Enter `API Key` and `API Secret`.
- **Angel One (SmartAPI)**: Enter `API Key`, `Client Code`, `PIN`, and `TOTP Secret`.
- **Fyers**: Enter `App ID`, `Secret Key`, and complete 2FA.
- **Upstox**: Enter `API Key`, `API Secret`, and `Redirect URL`.
- **Dhan**: Enter `Client ID` and `Access Token` (Supports Live and Sandbox).
- **Delta Exchange**: Crypto derivatives with perpetual futures and options.
- **Shoonya (Finvasia)**, **Alice Blue**, **Flattrade**, **Samco**, etc.

---

### 4. Sandbox Mode vs. Live Mode

- **Sandbox Mode**: Provides ₹1 Crore virtual capital with realistic margin checks, leverage calculations, and simulated order execution using live tick data.
- **Live Mode**: Directly executes real orders on your connected broker account.
- **Switching**: Toggle between **Live** and **Sandbox** seamlessly from the top navigation bar or inside the Scalper Terminal bottom bar.

---

## 🖥️ Scalper Mode & Trading Surfaces

OpenAlgo combines 5 distinct trading surfaces in one unified platform:

### 1. Scalper Terminal (`/scalper`)
Designed specifically for high-speed index and stock option scalpers:
- **3-Pane Synced Layout**: Displays **Spot Index Chart** (e.g. NIFTY 50), **ATM Call Option Chart**, and **ATM Put Option Chart** side-by-side.
- **Universal Toolbar**:
  - Global symbol search (auto-loads NIFTY 50 and corresponding ATM Call/Put by default).
  - Synchronized Timeframes (`1m`, `3m`, `5m`, `15m`, `1h`, `1D`).
  - Chart Types (Candlesticks, Heikin Ashi, Line, Area).
- **ATM Strike Auto-Selection**:
  - Automatically calculates ATM strike based on live spot price.
  - Quick-switch strike ladder dropdown for Call and Put options.
- **1-Click Execution Bar**:
  - Instant Buy / Sell for Call & Put with 1 click.
  - Product selection defaults to **`NRML`** (switchable to `MIS`).
  - Real-time lot size, total quantity, and estimated margin requirement display.
- **Collapsible Vertical Positions Panel**:
  - Click the **Positions** tab on the left to expand full details without losing chart context.
  - Click again to smoothly collapse back to maximum chart viewing area.
  - **Safety Controls**: The "Exit All" and action square-off buttons automatically gray out once positions are closed to prevent accidental double-clicks.
  - Commodity and Equity Derivative position breakdown.

### 2. Trading Terminal (`/trading`)
Full-screen interactive TradingView-style charting with real-time indicators, drawing tools, depth ladder, and order tickets.

### 3. Options Analytics Suite (`/tools`)
- **Strategy Builder** (`/strategybuilder`): Multi-leg payoff charts, Greeks calculation, risk profiles.
- **Option Chain** (`/optionchain`): Real-time multi-strike ladder with live Greeks, OI, and volume.
- **Max Pain & PCR** (`/maxpain`): Visual pain distribution and Put-Call ratio tracker.
- **Straddle & Strangle Charts** (`/straddle`): Dynamic ATM straddle price tracking with synthetic futures.
- **IV Smile & Vol Surface** (`/ivsmile`, `/volsurface`): 3D Implied Volatility surface modeling.

### 4. Flow Visual Builder (`/flow`)
Drag-and-drop no-code strategy creation with indicators, condition logic, risk filters, and webhook signals.

### 5. Python Strategy Host (`/python`)
Run Python algo strategies directly in OpenAlgo with process isolation, IST scheduling, and live execution logs.

---

## 🐍 Python SDK Integration

Interact programmatically with OpenAlgo from your own Python algorithms:

```python
from openalgo import OpenAlgo

# Initialize client (connects to local OpenAlgo instance)
client = OpenAlgo(
    api_key="your_openalgo_api_key",
    host="http://127.0.0.1:5000"
)

# 1. Fetch real-time quote (executes in 0.00ms via cache)
quote = client.get_quote(symbol="NIFTY", exchange="NSE_INDEX")
print(f"NIFTY LTP: {quote['data']['ltp']}")

# 2. Place an Option Scalp Order
order = client.place_order(
    strategy="OptionScalper",
    symbol="NIFTY26SEP23200CE",
    action="BUY",
    exchange="NFO",
    pricetype="MARKET",
    quantity=75,
    product="NRML"
)
print("Order placed:", order)
```

---

## 🔄 Version Control & GitHub Sync

To keep your repository updated without any flaky merge conflicts, use the included **`sync_github.bat`** script on Windows:

1. Make any code edits or custom tweaks locally.
2. Double-click **`sync_github.bat`**.
3. Enter an optional commit message (or press Enter for an auto-timestamped message).
4. The script stages all modifications, commits them, and pushes directly to `main` on your GitHub repository.

---

## 🛡️ Security & Privacy Notice

- **Zero Remote Tracking**: OpenAlgo does NOT send telemetry, logs, or credentials to any remote server. Everything is stored in your local SQLite databases.
- **Safe Environment**: Your `.env` file and all `*.db` files are strictly gitignored to guarantee zero credential leakage when pushing to GitHub.
- **Risk Disclaimer**: *Trading financial markets involves substantial risk of loss. Always test your strategies in Sandbox / Analyzer mode before deploying live capital.*

---

<div align="center">

**Built with ❤️ for algorithmic traders, scalpers, and financial developers.**

</div>
