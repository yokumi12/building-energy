# Building Data Genome Project 2 (BDG2)

Downloaded source files in this folder:

| File | Contents | Size |
|---|---|---:|
| `chilledwater_cleaned.csv` | Hourly chilled-water meter readings, used as cooling-related measurements | 77,005,463 bytes |
| `hotwater_cleaned.csv` | Hourly hot-water meter readings, used as heating-related measurements | 24,362,948 bytes |
| `steam_cleaned.csv` | Hourly steam meter readings, used as heating-related measurements | 45,422,530 bytes |
| `metadata.csv` | Building use, floor area, location, meter availability, and other building metadata | 272,024 bytes |
| `weather.csv` | Hourly weather observations by site | 19,457,782 bytes |

The three meter files contain 17,544 hourly timestamps covering 2016–2017. Each meter is a separate column; the timestamp is the first column. Meter column names match building IDs in `metadata.csv`. Weather observations can be associated by timestamp and site.

## Source and attribution

- Repository: <https://github.com/buds-lab/building-data-genome-project-2>
- Direct file source: `https://media.githubusercontent.com/media/buds-lab/building-data-genome-project-2/master/`
- Repository license: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- Citation: Miller, C. et al. (2020). “The Building Data Genome Project 2, energy meter data from the ASHRAE Great Energy Predictor III competition.” *Scientific Data* 7, 368. <https://doi.org/10.1038/s41597-020-00712-x>

## Interpretation cautions

- These are measured operational meter readings, unlike the UCI Energy Efficiency simulated design cases.
- Chilled water is a cooling-related meter; hot water and steam are heating-related meters. They are not interchangeable with UCI's simulated heating/cooling load targets.
- Meter units and equipment conventions may vary by site. Check the source documentation before comparing values across buildings or meters.
- This download is kept separate from the UCI dataset. It has not been merged into the existing training table or model.
