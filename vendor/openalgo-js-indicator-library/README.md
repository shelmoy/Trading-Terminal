# OpenAlgo JS Indicator Library

**497 chart indicators for the OpenAlgo `/trading` terminal**, ported from Pine
Script onto the [openalgo-charts](https://github.com/marketcalls/openalgo-charts)
custom indicator contract.

They are plain JavaScript files. There is no build step, no Node.js, and no
restart: drop them in a folder, reopen the indicator picker, and they are there
with generated settings dialogs, legend rows and saved-layout persistence.

Every one of them is a port of somebody else's work. See
[ATTRIBUTION.md](ATTRIBUTION.md) for who wrote what and
[LICENSING.md](LICENSING.md) for what you may do with it.

**Using these in your own OpenAlgo carries no obligations at all** under any of
the licences here: they are triggered by distributing software, not by running
it. The licence split below matters only if you redistribute.

---

## Install into OpenAlgo

### Where the files go

```
<your OpenAlgo install>/strategies/indicators/
```

That is the folder `blueprints/custom_indicators.py` serves at
`/custom-indicators/`, and it sits beside `strategies/scripts/` where Python
strategies live. It is gitignored by OpenAlgo on purpose, so what you put there
is yours and a `git pull` will not touch it.

### Standard install

```bash
git clone https://github.com/marketcalls/openalgo-js-indicator-library.git
cd openalgo-js-indicator-library

# All 497, flattened into the folder OpenAlgo serves:
cp indicators/*/*.js /path/to/openalgo/strategies/indicators/
```

Windows PowerShell:

```powershell
Copy-Item indicators\*\*.js -Destination C:\path\to\openalgo\strategies\indicators\
```

Prefer a subset? Copy one licence directory, or single files:

```bash
cp indicators/MIT/*.js              /path/to/openalgo/strategies/indicators/   # 408
cp indicators/MIT/oa-supertrend.js  /path/to/openalgo/strategies/indicators/   # just one
```

### Docker

`strategies/` is kept on a named volume (`openalgo_strategies:/app/strategies`),
so indicators survive a container rebuild. Copy into the running container:

```bash
docker cp indicators/. <container>:/app/strategies/indicators/
```

Or mount this repository and copy from inside. Either way the destination is
`/app/strategies/indicators/`.

### Then

1. Open `/trading`.
2. Click **Indicators**.
3. They are in the picker, grouped by category.

**No restart, no rebuild, no page reload.** The catalogue re-reads the folder
every time the picker opens, and an edited file is re-imported because its URL
carries the file's modification time. A reload is only needed for a chart that
was already open before the app itself changed.

### Removing them

Delete the files. The picker stops listing them the next time it opens.

```bash
cd /path/to/openalgo/strategies/indicators
rm oa-*.js          # every indicator from this library shares the oa- prefix
```

Anything you removed while it was on a chart simply stops being offered; a saved
layout that referenced it draws nothing for that entry rather than breaking.

---

## Requirements

| | |
|---|---|
| OpenAlgo | any version whose `/trading` terminal loads custom indicators |
| openalgo-charts | **2.3.2 or later** for the library as shipped |

Every file was validated against openalgo-charts **2.3.2** and re-validated
against **2.4.0**. Nothing here requires a 2.4.0-only feature, so the library
works on either pin.

Two things worth knowing before you file a bug:

- **Ids are namespaced `oa-`** so none of them can shadow one of the 102
  built-ins. A custom module registers after the built-ins, so an unprefixed id
  colliding with `rsi` or `macd` would silently override it. These do not.
- **Indicators are not sandboxed.** They run on the app origin with your
  logged-in session and can reach `/api/v1/`. That is the same trust model as
  OpenAlgo's Python strategy host, which already runs code you supply, but it
  means you should read an indicator from an untrusted source before installing
  it, exactly as you would any script you are about to run. Every file here
  carries its upstream source URL in its header so you can compare.

---

## What is in the library

497 indicators across 21 picker categories:

| Category | Count | Category | Count | Category | Count |
|---|---:|---|---:|---|---:|
| Oscillators | 47 | Volatility | 28 | Cycles | 16 |
| Moving Averages | 45 | Volume | 27 | Reversals | 10 |
| Numerics | 41 | Errors | 27 | Price Core | 7 |
| Filters | 40 | ICT | 24 | Meridian | 7 |
| Trends IIR | 36 | Dynamics | 20 | Highlighters | 5 |
| Trends FIR | 34 | Momentum | 18 | Forecasts | 2 |
| Statistics | 33 | Channels | 29 | Custom | 1 |

Categories are created at runtime from what each descriptor declares, so
installing these adds those groups to your picker rail. A fresh OpenAlgo shows
only the built-in Trend, Momentum, Volatility and Volume, plus Custom.

---

## Honest limitations

These are ports, and some things do not cross from Pine Script to a chart
descriptor. Where a feature could not be expressed it was left out and recorded,
never faked.

- **Multi-symbol screeners are not chart studies.** Roughly a dozen ICT and
  momentum scripts scan a pasted list of up to 40 tickers with
  `request.security`. A chart study is handed one symbol's bars and `calc` runs
  every animation frame, so those scan only the symbol on screen. The symbol
  list input and the results table are absent.
- **Cross-symbol studies are reduced.** Ratio, beta, correlation and
  cointegration studies that compared against another instrument compare against
  a second price source of the same instrument instead. The maths is exercisable;
  it is not what the source meant.
- **A plot cannot be drawn past the last bar.** A column is one value per bar.
  Displaced clouds and forward projections are shifted back onto existing bars.
  (openalgo-charts 2.4.0 adds `plot.offset` for exactly this, and a later pass
  can restore them.)
- **Higher timeframes are folded, not fetched.** A study wanting the daily high
  on a 5-minute chart folds the chart's own bars. That is usually *more* correct
  than the original, because a request against an unclosed higher-timeframe bar
  returns that whole bar's high, which is lookahead.
- **Dashboard geometry, theme colour inputs and per-plot width inputs are
  dropped.** The chart generates colour, opacity, thickness and line style per
  plot, and owns table placement.

Three sources were not ported at all: two are pure cross-symbol ratios with
nothing left once the second instrument is removed (`prs`, `beta`), and one is a
four-line empty strategy template.

---

## Licence: read this before redistributing

**This repository is not single-licensed, and it cannot be.** A port is a
derivative work, so each file carries the licence of the Pine Script it was
ported from. GPL-3.0 and MPL-2.0 are copyleft and neither permits relicensing to
MIT.

| Directory | Files | Licence | Upstream |
|---|---:|---|---|
| `indicators/MIT/` | 408 | MIT | mihakralj/pinescript |
| `indicators/GPL-3.0/` | 57 | **GPL-3.0** | everget/tradingview-pinescript-indicators |
| `indicators/MPL-2.0/` | 32 | **MPL-2.0** | ArunKBhaskar, sukesan7, CedInvest |

The repository's own files (this README, the tooling, the porting work on the
MIT set) are MIT: see [LICENSE](LICENSE). Full texts are in
[LICENSE-GPL-3.0.txt](LICENSE-GPL-3.0.txt) and
[LICENSE-MPL-2.0.txt](LICENSE-MPL-2.0.txt), and each directory carries its own
copy so a directory copied out takes its licence with it.

Every file also carries machine-readable SPDX tags
(`SPDX-License-Identifier: MIT`, `GPL-3.0-only` or `MPL-2.0`) beside the prose,
so a licence scanner reports the same answer a reader would.
[LICENSING.md](LICENSING.md) explains the whole arrangement, including what
each licence asks of you and why OpenAlgo being AGPL-3.0 makes all three
compatible.

**Using them in your own OpenAlgo is unaffected** by any of this. Running
software imposes no obligation under any of the three licences. The distinction
matters when you *redistribute*: copying a GPL-3.0 indicator into a product you
ship, or into a repository you relicense, carries that licence with it.

Every file states its own source URL, upstream repository and licence in its
header, and that header is authoritative for that file. If you find one that is
wrong, it is a bug and worth reporting.

---

## Credits

The indicators are the work of their original authors:

- **[mihakralj](https://github.com/mihakralj/pinescript)** for the largest and
  most systematic Pine Script indicator collection, 408 of these.
- **[Alex Orekhov (everget)](https://github.com/everget/tradingview-pinescript-indicators)**
  for the moving-average, band and highlighter families.
- **[Arun K Bhaskar](https://github.com/ArunKBhaskar/PineScript)** for the ICT
  and momentum setups.
- **[sukesan7](https://github.com/sukesan7/meridian-indicators)** for the
  Meridian futures and options studies.
- **[CedInvest](https://github.com/CedInvest/sm-radar-pine)** for SM Radar.

Built for [OpenAlgo](https://github.com/marketcalls/openalgo) on
[openalgo-charts](https://github.com/marketcalls/openalgo-charts).
