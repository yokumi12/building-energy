# NREL ComStock / End-Use Load Profiles

This project data is from the publicly available 2021 ComStock AMY 2018 release, part of the U.S. DOE End-Use Load Profiles for the U.S. Building Stock dataset.

## Downloaded files

- `metadata.parquet` — 347,144 rows and 115 columns of building characteristics plus annual energy consumption.
- `data_dictionary.tsv` — column names, units, descriptions, and enumerated values.
- `enumeration_dictionary.tsv` — descriptions of categorical values.
- `upgrade_dictionary.tsv` — descriptions of upgrade identifiers.
- `citation.txt` — dataset citation.

## Sources

- Dataset record and access information: <https://data.openei.org/submissions/4520>
- Public AWS dataset catalog: <https://registry.opendata.aws/nrel-pds-building-stock/>
- S3 dataset root: <https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/>
- ComStock release overview: <https://github.com/NatLabRockies/ComStock>
- Technical report: <https://www.nrel.gov/docs/fy22osti/80889.pdf>

The EULP data documentation describes 15-minute energy-use profiles by building type and end use. ComStock includes building features such as floor area, number of stories, type, aspect ratio, climate/location, and HVAC system, together with simulated annual energy results. Candidate annual targets include `out.electricity.cooling.energy_consumption` and `out.district_cooling.cooling.energy_consumption` for cooling, and `out.electricity.heating.energy_consumption`, `out.natural_gas.heating.energy_consumption`, `out.district_heating.heating.energy_consumption`, and `out.other_fuel.heating.energy_consumption` for heating; all are in kWh. A total-by-end-use target can be formed by summing the applicable fuel columns after checking missing-value and applicability rules.

These are modeled annual end-use energy-consumption results, not the UCI dataset's `Y1`/`Y2` simulated heating/cooling load labels. Treat ComStock as a separate, clearly named dataset and evaluation unless definitions, units, and targets have been validated for a joint dataset. These labels come from building-stock simulations, not direct metered operation.

The OpenEI record identifies CC BY 4.0 for the EULP submission. Retain attribution and consult the linked ComStock license before redistributing code/model artifacts. Large raw datasets are kept local and excluded from Git by `.gitignore`.

## Model experiment

`scripts/train_comstock_models.py` trains separate regressors for annual heating and cooling energy consumption. It compares structure-only inputs with an expanded set that adds HVAC/fuel, replacement energy-code, thermostat, and operating-hour inputs. Target totals sum the applicable fuel-specific kWh columns listed above.

The current held-out building test scores are R² 0.8499 (heating) and 0.8916 (cooling), with MAE and RMSE in `artifacts/comstock_energy_metrics.json`. R² is not classification accuracy. Heating is just below the project's 0.85 goal. These are simulated US stock results, not measured operation and not UCI heating/cooling-load results. Do not merge or substitute these targets without updating the service definition.
