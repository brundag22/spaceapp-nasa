# NASA OSDR and Inspiration4 data notes

## Findings for AstroCare

NASA's official OSDR overview says publicly available Inspiration4 records include processed biological samples such as blood, urine, swabs, skin biopsies, stool, and T-cells. It also notes that private raw records require an application and board approval. This official I4 dataset inventory does not establish that every metric requested by AstroCare—such as suit pressure, radiation rate, core temperature, systolic/diastolic BP, or ECG Lead II—is available as a continuous public time series. [1]

A peer-reviewed study reports that Inspiration4 crew used Apple Watch Series 6 for selected mission periods and that heart rate, heart-rate variability, and blood oxygen saturation were among the cardiovascular measures collected. The paper reports mission-phase observations and variable data availability; it is not a universal clinical threshold specification for a live alert engine. [2]

The peer-reviewed data-access paper describes OSDR records across omics, biological and clinical assay categories, and describes processed public data alongside application-controlled access to raw human data. It emphasizes standards and differences across assays and data modalities; these materials do not justify treating all requested telemetry fields as a common continuous sensor stream. [3]

## Implementation consequence

AstroCare's initial live stream, crew, sample values, EVA pressure, radiation, and body-map events will be synthetic demo records, not raw or individually attributed Inspiration4 data. The simulator may be described as OSDR-informed only for the measures supported by the selected sources, and the app must not claim its full telemetry baselines or pathology rules are calibrated or clinically validated against NASA OSDR. Rule thresholds must be labeled demonstration/configurable values and alerts must be called rule-engine flags rather than diagnoses. A research-grade calibration would require field-specific source datasets and clinical review.

## References

[1]: https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ "NASA OSDR Inspiration4 mission datasets"
[2]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11357997/ "Molecular and physiological changes in the SpaceX Inspiration4 civilian crew"
[3]: https://www.nature.com/articles/s41526-024-00393-5 "Inspiration4 data access through the NASA Open Science Data Repository"
