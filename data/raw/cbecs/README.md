# 2018 CBECS public-use microdata

Files downloaded from the U.S. Energy Information Administration (EIA):

- `cbecs2018_final_public.csv` — 6,436 public-use commercial-building survey records.
- `2018microdata_codebook.xlsx` — variable definitions, units, response codes, and questionnaire text.

Source and download page: <https://www.eia.gov/consumption/commercial/data/2018/index.php?view=microdata>

Direct files:

- CSV: <https://www.eia.gov/consumption/commercial/data/2018/xls/cbecs2018_final_public.csv>
- Codebook: <https://www.eia.gov/consumption/commercial/data/2018/xls/2018microdata_codebook.xlsx>

The file has 1,249 columns, including building characteristics such as floor area (`SQFT`), principal activity (`PBA`), climate zone (`PUBCLIM`), number of floors (`NFLOOR`), and exterior glass share (`GLSSPC`). It includes annual whole-building energy-consumption fields such as `MFBTU` (thousand Btu), but does not provide UCI-compatible simulated heating-load (`Y1`) and cooling-load (`Y2`) targets. It is a candidate only if the project is redefined to estimate annual building energy consumption; do not merge its labels with the UCI load targets.

The codebook recommends accounting for survey final weights and replicate weights when producing population estimates and uncertainty measures. Public-use building identities are masked.

These data are kept local and excluded from Git by `.gitignore`.
