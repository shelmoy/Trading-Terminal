# Official chart library snapshot

Imported 22 October 2026 from
[marketcalls/openalgo-js-indicator-library](https://github.com/marketcalls/openalgo-js-indicator-library)
at commit [`556c0f07de46ec570a614b9de5d2250195c351d6`](https://github.com/marketcalls/openalgo-js-indicator-library/tree/556c0f07de46ec570a614b9de5d2250195c351d6).

## Contents and provenance

- 497 unmodified JavaScript chart descriptors across 21 categories.
- 408 MIT, 57 GPL-3.0, 32 MPL-2.0 files. Original per-file notices,
  directory licence texts, attribution and licensing documentation are retained.
- `manifest.json` records each file's id, name, category, upstream licence and
  SHA-256 of its UTF-8 text with LF line endings. This makes checkout line-ending
  conversion harmless while still detecting changed source.
- `validation-warnings.json` records all 105 warnings from the installed
  openalgo-charts 2.6.7 validator. The upstream README and sources are unchanged.

## Install or restore

From an OpenAlgo checkout with its pinned chart dependency installed or cached
by the chart-indicator skill:

```sh
node scripts/install_official_indicators.mjs
```

On a deployment without frontend development dependencies, prepare the skill's
small cache first. This downloads only the pinned chart package, with no runtime
dependencies, rather than installing the full frontend development tree:

```sh
node .claude/skills/chart-indicator/validate.mjs vendor/openalgo-js-indicator-library/indicators/MIT/oa-sma.js
node scripts/install_official_indicators.mjs
```

The installer checks source hashes, duplicate names/ids and existing files.
Different live files are preserved with an explicit error rather than overwritten.
It also refuses literal id collisions with other local JavaScript indicators.
All pending sources pass the repository's unmodified chart-indicator validator
before installation starts; the validator's `--install` mode is the only writer
of live indicator modules. Identical installed copies are left untouched.

Each checkout installs its own copies under `strategies/indicators/`. Those live
copies stay gitignored; this pinned source snapshot and the installer provide
GitHub reproducibility without tracking personal indicator files. No new service,
credentials, external connections, dependency pin or frontend build is required.
No study is automatically added to a chart or subscribed to trading alerts.

## Compatibility results and limits

All 497 descriptors passed the install gate: no errors, no built-in/custom
indicator id collisions. The 17 files listed in `validation-warnings.json` have
105 warnings about plot columns being empty across 156 synthetic bars at default
settings. Several are conditional zones, event levels, divergences or optional
plots. The warning does not prove a defect or prove correctness; these sources
remain unchanged and the warnings remain visible in the installation report.
Passing the gate establishes descriptor/data-shape compatibility, not profitability
or exact equivalence to every original Pine Script feature.

Read the upstream README's **Honest limitations** before relying on a port:
multi-symbol screeners evaluate only the chart symbol; some cross-symbol studies
substitute another price source on that same instrument; higher timeframes fold
the available chart bars; some forward projections are shifted onto existing
bars; dashboard geometry and certain style controls differ. A newer chart SDK
does not automatically rewrite these ports to remove those limitations.

The existing chart loader uses eight concurrent imports, caches unchanged
modules and learns the ids needed for saved layouts. Only studies added to a
chart calculate. The first catalogue open imports more files than before; no
claim is made that 497 simultaneously active studies would perform well.

The 502-study OpenScript catalogue at https://openalgo.in/script/library is a
separate collection and has not been installed as duplicate chart studies.
