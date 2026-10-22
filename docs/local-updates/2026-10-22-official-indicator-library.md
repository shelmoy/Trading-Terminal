# Official chart indicator library — 22 October 2026

## Reason

The installed chart SDK supplied 112 built-in indicators and this installation
supplied six custom studies. The separate official JavaScript indicator library
had not been installed. Updating the main OpenAlgo repository alone does not
populate that user-content folder.

## Change

Imported all 497 descriptors from the official library at
`556c0f07de46ec570a614b9de5d2250195c351d6`, unchanged, with original licences and
attribution under `vendor/openalgo-js-indicator-library/`. Installed them in both
the Kotak and FYERS checkout using the existing chart-indicator validation gate.
The resulting catalogue has 615 unique indicator ids: 112 built-in, six existing
custom and 497 library entries. The searchable native picker groups them by
their own categories and can star favourites.

Added `scripts/install_official_indicators.mjs` to reproduce the installation
from GitHub, check pinned source hashes and refuse changed existing files or
personal-study id conflicts. The live copies remain ignored user-content files.
The source snapshot is separately pinned; future platform updates must preserve
it and must review any replacement library snapshot before installation.

## Checks and limitations

- All 497 passed the chart-indicator gate on openalgo-charts 2.6.7, in both
  checkouts. There were no validation errors or indicator id conflicts.
- There were 105 warnings across 17 studies about empty plot columns in the
  validator's 156-bar synthetic sample. Full details are retained in
  `vendor/openalgo-js-indicator-library/validation-warnings.json`; live install
  reports are private `tmp/official-indicator-install.json` files.
- Existing six custom source hashes are preserved. Previously removed Glass
  Trend and Vela studies are absent from this library.
- Registering the installed files against the real SDK yields 615 unique chart
  entries. Both running instances return HTTP 200 for `/faq`; unauthenticated
  requests for the indicator index and modules correctly return 401. No signed-in
  Chrome tab was connected to the browser tools, so authenticated picker rendering
  was not observed. No login cookie or password was obtained to bypass that limit.
- No application source, SDK pin or frontend bundle changed. The previous
  successful production build remains served; no rebuild, migration or service
  restart was needed. No automated application tests or order actions were run.
- Library entries do not become active indicators merely by being installed.
  Reopen **Trading → Indicators → All** on either instance to see them.
- See the vendor import notes and original README for porting limitations;
  multi-symbol screeners and some projections do not reproduce the original
  Pine Script behaviour. No performance or trading outcome is guaranteed by
  descriptor validation.

## Recovery

Primary recovery branch: `backup/before-official-indicators-2026-10-22`, at
`761800802ad7bf1798575192e4729a372204be98`. Both checkouts retain their original
indicator folder snapshot in `tmp/before-official-indicators-20261022/`.
To undo only this import, remove only live files named in the pinned manifest
whose hashes still match it. Preserve all unknown or edited files and the six
pre-existing custom modules. Do not use a broad `oa-*.js` deletion, as custom
indicators also use that prefix.
