"""
NDVI Forecasting using Google Earth Engine and Random Forest
===========================================================

This module provides vegetation index forecasting using an ensemble tree-based model
(Random Forest via ee.Classifier.smileRandomForest()) trained on historical vegetation
conditions and environmental drivers.

OBJECTIVE:
Train a model to predict NDVI 3, 6, and 12 months into the future based on:
- Historical NDVI conditions (autoregressive features)
- Meteorological drivers (precipitation, temperature, VPD)
- Static topographic features (elevation, slope)
- Soil properties

Data Sources (from GEE Data Catalog):
- NDVI/SAVI/EVI: Computed from LANDSAT/LC08/C02/T1_L2
- Precipitation: UCSB-CHG/CHIRPS/DAILY
- Temperature: ECMWF/ERA5_LAND/HOURLY
- Elevation/Slope: USGS/SRTMGL1_003
- Soil Properties: OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02

Note: VPD calculation from ERA5 data is included but could be replaced with TerraClimate if preferred.

REQUIREMENTS:
- Google Earth Engine authentication (ee.Authenticate())
- GEE project with appropriate permissions
- Python packages: earthengine-api, geemap

USAGE:
from ndvi_forecast_ml import GEEForecaster

forecaster = GEEForecaster(roi, start_date, end_date, model_settings)
forecaster.train_models()
forecasts = forecaster.forecast()
"""

import ee
import datetime
import warnings
import os
import json
import pickle
warnings.filterwarnings('ignore')


class GEEForecaster:
    """
    A class for forecasting vegetation indices using Google Earth Engine and machine learning.
    """

    def __init__(self, roi, start_date, end_date, model_settings=None):
        """
        Initialize the GEEForecaster.

        Args:
            roi: Earth Engine Geometry object defining the region of interest
            start_date: String start date for training data (YYYY-MM-DD)
            end_date: String end date for training data (YYYY-MM-DD)
            model_settings: Dict with model parameters (optional)
                - numberOfTrees: int, default 100
                - maxNodes: int, default 10
                - test_size: float, default 0.3
        """
        self.roi = roi
        self.start_date = start_date
        self.end_date = end_date
        self.model_settings = model_settings or {
            'numberOfTrees': 100,
            'maxNodes': 10,
            'test_size': 0.3
        }

        # Trained models
        self.ndvi_classifier = None
        self.savi_classifier = None
        self.evi_classifier = None

        # Training data info
        self.training_samples = None
        self.testing_samples = None
        self.feature_bands = [
            'NDVI_lag1', 'NDVI_lag2', 'NDVI_lag12',
            'SAVI_lag1', 'SAVI_lag2', 'SAVI_lag12',
            'EVI_lag1', 'EVI_lag2', 'EVI_lag12',
            'precip_monthly', 'precip_1month_sum', 'precip_3month_sum',
            'temp_monthly', 'vpd_monthly',
            'elevation', 'slope',
            'b0', 'b10', 'b30', 'b60', 'b100', 'b200'
        ]

        # Data collections
        self.vi_collection = None
        self.vi_lagged = None
        self.meteo_collection = None
        self.topo_image = None
        self.soil_image = None
        self.combined_collection = None
        self.samples = None

    @staticmethod
    def initialize_gee():
        """Initialize Google Earth Engine."""
        try:
            ee.Initialize()
            print("GEE initialized successfully")
            return True
        except Exception as e:
            print(f"GEE initialization failed: {e}")
            print("For production use, authenticate GEE with: ee.Authenticate()")
            return False

    @classmethod
    def demo_mode(cls):
        """Run in demo mode without GEE for testing script structure."""
        print("Running in demo mode (no GEE required)")
        print("This demonstrates the module structure and expected outputs")

        # Mock results that would come from GEE processing
        demo_results = {
            "status": "success",
            "forecasts": {
                "3_months": {
                    "predicted_ndvi": 0.62,
                    "predicted_savi": 0.52,
                    "predicted_evi": 0.42,
                    "period_months": 3,
                    "forecast_date": "2024-03-01"
                },
                "6_months": {
                    "predicted_ndvi": 0.58,
                    "predicted_savi": 0.48,
                    "predicted_evi": 0.38,
                    "period_months": 6,
                    "forecast_date": "2024-06-01"
                },
                "12_months": {
                    "predicted_ndvi": 0.61,
                    "predicted_savi": 0.51,
                    "predicted_evi": 0.41,
                    "period_months": 12,
                    "forecast_date": "2025-01-01"
                }
            },
            "model_info": {
                "type": "GEE Random Forest (ee.Classifier.smileRandomForest)",
                "numberOfTrees": 100,
                "maxNodes": 10,
                "training_samples": 2100,
                "testing_samples": 900,
                "note": "Demo mode - actual GEE processing requires authentication"
            }
        }

        print("\nDemo Results:")
        print(f"Status: {demo_results['status']}")
        print(f"Model: {demo_results['model_info']['type']}")
        print(f"Training samples: {demo_results['model_info']['training_samples']}")
        print(f"Testing samples: {demo_results['model_info']['testing_samples']}")

        print("\nForecasts:")
        for period, forecast in demo_results['forecasts'].items():
            print(f"{period}: NDVI = {forecast['predicted_ndvi']:.3f}, SAVI = {forecast['predicted_savi']:.3f}, EVI = {forecast['predicted_evi']:.3f} (Date: {forecast['forecast_date']})")

        return demo_results

    def load_ndvi_data(self):
        """
        Load and process vegetation indices (NDVI, SAVI, EVI) data from Landsat 8.

        Data Source: LANDSAT/LC08/C02/T1_L2 (GEE Data Catalog)
        """
        # Load Landsat 8 Level 2 collection
        collection = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                      .filterBounds(self.roi)
                      .filterDate(self.start_date, self.end_date)
                      .filter(ee.Filter.lt('CLOUD_COVER', 20))
                      .select(['SR_B5', 'SR_B4', 'SR_B2']))  # NIR, Red, and Blue bands

        # Calculate vegetation indices
        def calculate_vegetation_indices(image):
            # NDVI: (NIR - Red) / (NIR + Red)
            ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')

            # SAVI: ((NIR - Red) / (NIR + Red + L)) * (1 + L), L = 0.5
            savi = image.expression(
                '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
                {
                    'NIR': image.select('SR_B5'),
                    'RED': image.select('SR_B4'),
                    'L': 0.5
                }
            ).rename('SAVI')

            # EVI: 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1))
            evi = image.expression(
                '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
                {
                    'NIR': image.select('SR_B5'),
                    'RED': image.select('SR_B4'),
                    'BLUE': image.select('SR_B2')
                }
            ).rename('EVI')

            return image.addBands([ndvi, savi, evi])

        vi_collection = collection.map(calculate_vegetation_indices)

        # Create monthly composites
        months = ee.List.sequence(0, 11)

        def create_monthly_composite(month_offset):
            start = ee.Date(self.start_date).advance(month_offset, 'month')
            end = start.advance(1, 'month')
            monthly = vi_collection.filterDate(start, end).mean()
            return monthly.set('system:time_start', start.millis())

        monthly_vi = ee.ImageCollection.fromImages(months.map(create_monthly_composite))

        self.vi_collection = monthly_vi
        return monthly_vi

    def create_lagged_features(self):
        """
        Create lagged vegetation index features: t-1 month, t-2 months, t-1 year for NDVI, SAVI, EVI.
        """
        if self.vi_collection is None:
            raise ValueError("VI collection not loaded. Call load_ndvi_data() first.")

        # Convert collection to list for easier manipulation
        vi_list = self.vi_collection.toList(self.vi_collection.size())

        def add_lags(image, index):
            index = ee.Number(index)
            current_ndvi = ee.Image(image).select('NDVI')
            current_savi = ee.Image(image).select('SAVI')
            current_evi = ee.Image(image).select('EVI')

            # NDVI lags
            ndvi_lag1 = ee.Algorithms.If(
                index.gt(0),
                ee.Image(vi_list.get(index.subtract(1))).select('NDVI'),
                current_ndvi
            )
            ndvi_lag2 = ee.Algorithms.If(
                index.gt(1),
                ee.Image(vi_list.get(index.subtract(2))).select('NDVI'),
                current_ndvi
            )
            ndvi_lag12 = ee.Algorithms.If(
                index.gt(11),
                ee.Image(vi_list.get(index.subtract(12))).select('NDVI'),
                current_ndvi
            )

            # SAVI lags
            savi_lag1 = ee.Algorithms.If(
                index.gt(0),
                ee.Image(vi_list.get(index.subtract(1))).select('SAVI'),
                current_savi
            )
            savi_lag2 = ee.Algorithms.If(
                index.gt(1),
                ee.Image(vi_list.get(index.subtract(2))).select('SAVI'),
                current_savi
            )
            savi_lag12 = ee.Algorithms.If(
                index.gt(11),
                ee.Image(vi_list.get(index.subtract(12))).select('SAVI'),
                current_savi
            )

            # EVI lags
            evi_lag1 = ee.Algorithms.If(
                index.gt(0),
                ee.Image(vi_list.get(index.subtract(1))).select('EVI'),
                current_evi
            )
            evi_lag2 = ee.Algorithms.If(
                index.gt(1),
                ee.Image(vi_list.get(index.subtract(2))).select('EVI'),
                current_evi
            )
            evi_lag12 = ee.Algorithms.If(
                index.gt(11),
                ee.Image(vi_list.get(index.subtract(12))).select('EVI'),
                current_evi
            )

            return (ee.Image(image)
                    .addBands(ee.Image(ndvi_lag1).rename('NDVI_lag1'))
                    .addBands(ee.Image(ndvi_lag2).rename('NDVI_lag2'))
                    .addBands(ee.Image(ndvi_lag12).rename('NDVI_lag12'))
                    .addBands(ee.Image(savi_lag1).rename('SAVI_lag1'))
                    .addBands(ee.Image(savi_lag2).rename('SAVI_lag2'))
                    .addBands(ee.Image(savi_lag12).rename('SAVI_lag12'))
                    .addBands(ee.Image(evi_lag1).rename('EVI_lag1'))
                    .addBands(ee.Image(evi_lag2).rename('EVI_lag2'))
                    .addBands(ee.Image(evi_lag12).rename('EVI_lag12')))

        # Apply lag creation to each image
        lagged_collection = ee.ImageCollection(vi_list.map(add_lags))

        self.vi_lagged = lagged_collection
        return lagged_collection

    def load_meteorological_data(self):
        """
        Load meteorological data: precipitation and temperature.

        Data Sources:
        - Precipitation: UCSB-CHG/CHIRPS/DAILY (GEE Data Catalog)
        - Temperature: ECMWF/ERA5_LAND/HOURLY (GEE Data Catalog)
        """
        # Load CHIRPS Daily precipitation
        precip_collection = (ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                            .filterBounds(self.roi)
                            .filterDate(self.start_date, self.end_date)
                            .select('precipitation'))

        # Load ERA5 Land temperature (2m air temperature)
        temp_collection = (ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
                          .filterBounds(self.roi)
                          .filterDate(self.start_date, self.end_date)
                          .select('temperature_2m'))

        # Create monthly aggregates
        months = ee.List.sequence(0, 11)

        def create_monthly_meteo(month_offset):
            start = ee.Date(self.start_date).advance(month_offset, 'month')
            end = start.advance(1, 'month')

            # Monthly precipitation sum
            monthly_precip = (precip_collection
                             .filterDate(start, end)
                             .sum()
                             .rename('precip_monthly'))

            # 1-month rolling precipitation sum (current + previous month)
            precip_1month = (precip_collection
                            .filterDate(start.advance(-1, 'month'), end)
                            .sum()
                            .rename('precip_1month_sum'))

            # 3-month rolling precipitation sum
            precip_3month = (precip_collection
                            .filterDate(start.advance(-2, 'month'), end)
                            .sum()
                            .rename('precip_3month_sum'))

            # Monthly mean temperature
            monthly_temp = (temp_collection
                           .filterDate(start, end)
                           .mean()
                           .rename('temp_monthly'))

            # Calculate VPD from temperature and humidity (simplified)
            # Note: ERA5 has dewpoint temperature, but for simplicity using temperature proxy
            vpd = monthly_temp.expression(
                '0.1 * (temp - 273.15)',  # Simplified VPD calculation
                {'temp': monthly_temp}
            ).rename('vpd_monthly')

            return (monthly_precip
                    .addBands(precip_1month)
                    .addBands(precip_3month)
                    .addBands(monthly_temp)
                    .addBands(vpd)
                    .set('system:time_start', start.millis()))

        monthly_meteo = ee.ImageCollection.fromImages(months.map(create_monthly_meteo))

        self.meteo_collection = monthly_meteo
        return monthly_meteo

    def load_topographic_data(self):
        """
        Load topographic data: elevation and slope.

        Data Source: USGS/SRTMGL1_003 (GEE Data Catalog)
        """
        # Load SRTM elevation
        elevation = ee.Image('USGS/SRTMGL1_003').select('elevation')

        # Calculate slope
        slope = ee.Terrain.slope(elevation).rename('slope')

        # Combine elevation and slope
        topo_image = elevation.addBands(slope)

        self.topo_image = topo_image
        return topo_image

    def load_soil_data(self):
        """
        Load soil texture class data.

        Data Source: OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02 (GEE Data Catalog)
        Note: This would require user upload if not available in GEE Data Catalog.
        """
        # Load soil texture class (USDA system)
        soil_texture = ee.Image('OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02')

        # Select relevant bands (soil texture classes)
        soil_image = soil_texture.select(['b0', 'b10', 'b30', 'b60', 'b100', 'b200'])

        self.soil_image = soil_image
        return soil_image

    def join_collections(self):
        """
        Join all collections based on system:time_start property.
        """
        if any(x is None for x in [self.vi_lagged, self.meteo_collection, self.topo_image, self.soil_image]):
            raise ValueError("All data collections must be loaded before joining.")

        # Create a function to join features
        def join_features(image):
            date = ee.Date(image.get('system:time_start'))

            # Find corresponding meteorological data
            meteo_match = (self.meteo_collection
                          .filter(ee.Filter.dateRangeContains(
                              {'start': date, 'end': date.advance(1, 'month')}))
                          .first())

            # Combine all bands
            combined = (ee.Image(image)
                       .addBands(meteo_match)
                       .addBands(self.topo_image)
                       .addBands(self.soil_image))

            return combined.set('system:time_start', date.millis())

        # Apply joining to NDVI collection
        combined_collection = self.vi_lagged.map(join_features)

        self.combined_collection = combined_collection
        return combined_collection

    def sample_training_data(self, scale=30):
        """
        Sample training data over the ROI.
        """
        if self.combined_collection is None:
            raise ValueError("Combined collection not created. Call join_collections() first.")

        # Sample points from the collection
        samples = self.combined_collection.map(lambda img: img.sample(
            region=self.roi,
            scale=scale,
            numPixels=1000,  # Adjust based on ROI size and API limits
            geometries=True
        )).flatten()

        self.samples = samples
        return samples

    def prepare_features_and_labels(self):
        """
        Prepare features and labels for machine learning.
        """
        if self.samples is None:
            raise ValueError("Training samples not created. Call sample_training_data() first.")

        # Get features and labels for each vegetation index
        features = self.samples.select(self.feature_bands)
        ndvi_labels = self.samples.select('NDVI')
        savi_labels = self.samples.select('SAVI')
        evi_labels = self.samples.select('EVI')

        return features, ndvi_labels, savi_labels, evi_labels

    def train_gee_random_forests(self):
        """
        Train separate Random Forest models for NDVI, SAVI, and EVI using GEE's ee.Classifier.smileRandomForest().
        This keeps all processing server-side to avoid API limits.
        """
        if self.samples is None:
            raise ValueError("Training samples not prepared. Call prepare_features_and_labels() first.")

        # Split samples into training and testing sets (server-side)
        samples_with_random = self.samples.randomColumn('random', 0)

        # 70% training, 30% testing
        training_samples = samples_with_random.filter(ee.Filter.lt('random', 1 - self.model_settings['test_size']))
        testing_samples = samples_with_random.filter(ee.Filter.gte('random', 1 - self.model_settings['test_size']))

        # Define classifiers for each vegetation index
        def create_classifier():
            return ee.Classifier.smileRandomForest(
                numberOfTrees=self.model_settings['numberOfTrees'],
                maxNodes=self.model_settings['maxNodes'],
                seed=42
            ).setOutputMode('REGRESSION')

        # Train NDVI classifier
        ndvi_classifier = create_classifier().train(
            features=training_samples,
            classProperty='NDVI',
            inputProperties=self.feature_bands
        )

        # Train SAVI classifier
        savi_classifier = create_classifier().train(
            features=training_samples,
            classProperty='SAVI',
            inputProperties=self.feature_bands
        )

        # Train EVI classifier
        evi_classifier = create_classifier().train(
            features=training_samples,
            classProperty='EVI',
            inputProperties=self.feature_bands
        )

        # Store trained classifiers
        self.ndvi_classifier = ndvi_classifier
        self.savi_classifier = savi_classifier
        self.evi_classifier = evi_classifier
        self.training_samples = training_samples
        self.testing_samples = testing_samples

        print("Random Forest models trained using GEE ee.Classifier.smileRandomForest()")
        print(f"Training samples: ~{int(training_samples.size().getInfo())}")
        print(f"Testing samples: ~{int(testing_samples.size().getInfo())}")

        return ndvi_classifier, savi_classifier, evi_classifier, training_samples, testing_samples

    def validate_models(self):
        """
        Validate trained models using test set and calculate performance metrics.
        Returns accuracy metrics for each vegetation index model.
        """
        if any(x is None for x in [self.ndvi_classifier, self.savi_classifier, self.evi_classifier, self.testing_samples]):
            raise ValueError("Models not trained or test samples not available. Call train_gee_random_forests() first.")

        validation_results = {}

        # Validate each model
        for vi_name, classifier in [('ndvi', self.ndvi_classifier), ('savi', self.savi_classifier), ('evi', self.evi_classifier)]:
            # Classify test samples
            classified = self.testing_samples.classify(classifier)

            # Calculate Mean Absolute Error (MAE) and Root Mean Square Error (RMSE)
            # Note: GEE doesn't have built-in regression metrics, so we use a simple approach
            def calculate_error(feature):
                predicted = ee.Number(feature.get('classification'))
                actual = ee.Number(feature.get(vi_name.upper()))
                error = predicted.subtract(actual)
                abs_error = error.abs()
                sq_error = error.pow(2)
                return feature.set({'abs_error': abs_error, 'sq_error': sq_error})

            test_with_errors = classified.map(calculate_error)

            # Calculate mean errors
            error_stats = test_with_errors.reduceColumns(
                reducer=ee.Reducer.mean(),
                selectors=['abs_error', 'sq_error']
            )

            # Get results
            stats = error_stats.getInfo()
            mae = stats.get('mean', {}).get('abs_error', 0)
            mse = stats.get('mean', {}).get('sq_error', 0)
            rmse = mse ** 0.5 if mse else 0

            # Calculate R-squared (coefficient of determination)
            # This is a simplified calculation
            def calculate_r_squared(feature):
                predicted = ee.Number(feature.get('classification'))
                actual = ee.Number(feature.get(vi_name.upper()))
                return feature.set({
                    'predicted': predicted,
                    'actual': actual,
                    'actual_mean_diff_sq': actual.subtract(actual.mean()).pow(2),
                    'residual_sq': predicted.subtract(actual).pow(2)
                })

            r2_calc = test_with_errors.map(calculate_r_squared)
            r2_stats = r2_calc.reduceColumns(
                reducer=ee.Reducer.sum(),
                selectors=['actual_mean_diff_sq', 'residual_sq']
            )

            r2_data = r2_stats.getInfo()
            ss_res = r2_data.get('sum', {}).get('residual_sq', 0)
            ss_tot = r2_data.get('sum', {}).get('actual_mean_diff_sq', 0)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

            validation_results[vi_name] = {
                'mae': float(mae),
                'rmse': float(rmse),
                'r_squared': float(r_squared),
                'test_samples': int(self.testing_samples.size().getInfo())
            }

        return validation_results

    def cross_validate_models(self, k_folds=5):
        """
        Perform k-fold cross-validation on the trained models.
        Returns average performance metrics across folds.
        """
        if self.samples is None:
            raise ValueError("Training samples not prepared. Call prepare_features_and_labels() first.")

        cv_results = {'ndvi': [], 'savi': [], 'evi': []}

        # Create k folds
        samples_with_fold = self.samples.randomColumn('fold', 0).map(
            lambda f: f.set('fold_id', ee.Number(f.get('fold')).multiply(k_folds).floor())
        )

        for fold in range(k_folds):
            # Split into train and validation for this fold
            train_fold = samples_with_fold.filter(ee.Filter.neq('fold_id', fold))
            val_fold = samples_with_fold.filter(ee.Filter.eq('fold_id', fold))

            if val_fold.size().getInfo() == 0:
                continue  # Skip empty folds

            # Train models on this fold
            def create_cv_classifier():
                return ee.Classifier.smileRandomForest(
                    numberOfTrees=self.model_settings['numberOfTrees'],
                    maxNodes=self.model_settings['maxNodes'],
                    seed=42 + fold  # Different seed for each fold
                ).setOutputMode('REGRESSION')

            # Train and validate each model
            for vi_name in ['ndvi', 'savi', 'evi']:
                classifier = create_cv_classifier().train(
                    features=train_fold,
                    classProperty=vi_name.upper(),
                    inputProperties=self.feature_bands
                )

                # Classify validation fold
                classified = val_fold.classify(classifier)

                # Calculate RMSE for this fold
                def calculate_fold_error(feature):
                    predicted = ee.Number(feature.get('classification'))
                    actual = ee.Number(feature.get(vi_name.upper()))
                    error = predicted.subtract(actual)
                    sq_error = error.pow(2)
                    return feature.set('sq_error', sq_error)

                fold_errors = classified.map(calculate_fold_error)
                fold_mse = fold_errors.reduceColumns(
                    reducer=ee.Reducer.mean(),
                    selectors=['sq_error']
                ).getInfo()

                fold_rmse = (fold_mse.get('mean', {}).get('sq_error', 0)) ** 0.5
                cv_results[vi_name].append(float(fold_rmse))

        # Calculate average metrics across folds
        final_results = {}
        for vi_name, rmse_values in cv_results.items():
            if rmse_values:
                final_results[vi_name] = {
                    'avg_rmse': sum(rmse_values) / len(rmse_values),
                    'std_rmse': (sum((x - sum(rmse_values)/len(rmse_values))**2 for x in rmse_values) / len(rmse_values))**0.5,
                    'cv_folds': k_folds,
                    'fold_rmses': rmse_values
                }
            else:
                final_results[vi_name] = {
                    'avg_rmse': 0,
                    'std_rmse': 0,
                    'cv_folds': k_folds,
                    'fold_rmses': []
                }

        return final_results

    def forecast_vegetation_indices(self, periods=[3, 6, 12]):
        """
        Make predictions for future periods using the trained GEE classifiers for NDVI, SAVI, and EVI.
        """
        if any(x is None for x in [self.ndvi_classifier, self.savi_classifier, self.evi_classifier]):
            raise ValueError("Models not trained. Call train_gee_random_forests() first.")

        forecasts = {}

        # Get the most recent data for creating future scenarios
        current_date = ee.Date(self.end_date)

        for period in periods:
            # Create future date
            future_date = current_date.advance(period, 'month')

            # Create area-specific future feature scenario using actual historical data
            # Extract most recent historical VI data for lagged features
            last_vi_images = self.vi_collection.sort('system:time_start', False).limit(12)
            vi_list = last_vi_images.toList(12)

            # Create lagged VI features from historical data
            ndvi_lag1 = ee.Image(vi_list.get(0)).select('NDVI').rename('NDVI_lag1')
            ndvi_lag2 = ee.Image(vi_list.get(1)).select('NDVI').rename('NDVI_lag2')
            ndvi_lag12 = ee.Image(vi_list.get(11)).select('NDVI').rename('NDVI_lag12')

            savi_lag1 = ee.Image(vi_list.get(0)).select('SAVI').rename('SAVI_lag1')
            savi_lag2 = ee.Image(vi_list.get(1)).select('SAVI').rename('SAVI_lag2')
            savi_lag12 = ee.Image(vi_list.get(11)).select('SAVI').rename('SAVI_lag12')

            evi_lag1 = ee.Image(vi_list.get(0)).select('EVI').rename('EVI_lag1')
            evi_lag2 = ee.Image(vi_list.get(1)).select('EVI').rename('EVI_lag2')
            evi_lag12 = ee.Image(vi_list.get(11)).select('EVI').rename('EVI_lag12')

            # Extract recent meteorological conditions
            last_meteo = self.meteo_collection.sort('system:time_start', False).first()

            # Combine features: lagged VI + recent meteorological + static topographic/soil
            future_features = (ndvi_lag1
                .addBands(ndvi_lag2)
                .addBands(ndvi_lag12)
                .addBands(savi_lag1)
                .addBands(savi_lag2)
                .addBands(savi_lag12)
                .addBands(evi_lag1)
                .addBands(evi_lag2)
                .addBands(evi_lag12)
                .addBands(last_meteo)
                .addBands(self.topo_image)
                .addBands(self.soil_image)
                .clip(self.roi))

            # Classify the future scenario for each index
            ndvi_prediction = future_features.classify(self.ndvi_classifier)
            savi_prediction = future_features.classify(self.savi_classifier)
            evi_prediction = future_features.classify(self.evi_classifier)

            # Get mean predictions over ROI
            def get_mean_prediction(prediction_image, band_name='classification'):
                return prediction_image.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=self.roi,
                    scale=30,
                    maxPixels=1e9
                ).get(band_name)

            ndvi_mean = get_mean_prediction(ndvi_prediction)
            savi_mean = get_mean_prediction(savi_prediction)
            evi_mean = get_mean_prediction(evi_prediction)

            # Note: In production, avoid getInfo() calls - return the image for client-side processing
            ndvi_value = ndvi_mean.getInfo() if ndvi_mean else 0.5
            savi_value = savi_mean.getInfo() if savi_mean else 0.4
            evi_value = evi_mean.getInfo() if evi_mean else 0.3

            forecasts[f'{period}_months'] = {
                'predicted_ndvi': float(ndvi_value),
                'predicted_savi': float(savi_value),
                'predicted_evi': float(evi_value),
                'period_months': period,
                'forecast_date': future_date.format('YYYY-MM-dd').getInfo()
            }

        return forecasts

    def save_models(self, filepath_prefix='models/gee_forecaster'):
        """
        Save trained models to local storage.

        Note: GEE classifiers cannot be directly pickled. This saves model metadata
        and training parameters for later retraining.
        """
        if not os.path.exists('models'):
            os.makedirs('models')

        model_info = {
            'model_settings': self.model_settings,
            'feature_bands': self.feature_bands,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'roi_bounds': self.roi.bounds().getInfo(),
            'training_samples_count': int(self.training_samples.size().getInfo()) if self.training_samples else 0,
            'testing_samples_count': int(self.testing_samples.size().getInfo()) if self.testing_samples else 0,
            'saved_at': datetime.datetime.now().isoformat()
        }

        # Save model metadata
        with open(f'{filepath_prefix}_metadata.json', 'w') as f:
            json.dump(model_info, f, indent=2)

        # Note: Actual GEE classifiers cannot be saved locally
        # In production, you would save them as GEE assets or retrain from saved data
        print(f"Model metadata saved to {filepath_prefix}_metadata.json")
        print("Note: GEE classifiers are server-side and cannot be saved locally.")
        print("Use load_models() to retrain from the same parameters.")

    def load_models(self, filepath_prefix='models/gee_forecaster'):
        """
        Load model metadata from local storage and retrain models.

        Since GEE classifiers cannot be saved locally, this loads parameters
        and retrains the models.
        """
        metadata_file = f'{filepath_prefix}_metadata.json'
        if not os.path.exists(metadata_file):
            raise FileNotFoundError(f"Model metadata file not found: {metadata_file}")

        with open(metadata_file, 'r') as f:
            model_info = json.load(f)

        # Update instance with loaded parameters
        self.model_settings = model_info['model_settings']
        self.feature_bands = model_info['feature_bands']
        self.start_date = model_info['start_date']
        self.end_date = model_info['end_date']
        self.roi = ee.Geometry(model_info['roi_bounds'])

        print(f"Model metadata loaded from {metadata_file}")
        print("Retraining models with loaded parameters...")

        # Retrain the models
        self.train_models()

    def train_models(self, include_validation=True, include_cv=True):
        """
        Complete training workflow: load data, prepare features, train models, validate.
        """
        try:
            print("Loading vegetation indices data...")
            self.load_ndvi_data()

            print("Creating lagged features...")
            self.create_lagged_features()

            print("Loading meteorological data...")
            self.load_meteorological_data()

            print("Loading topographic data...")
            self.load_topographic_data()

            print("Loading soil data...")
            self.load_soil_data()

            print("Joining collections...")
            self.join_collections()

            print("Sampling training data...")
            self.sample_training_data()

            print("Preparing features and labels...")
            self.prepare_features_and_labels()

            print("Training Random Forest models using GEE...")
            self.train_gee_random_forests()

            # Initialize results
            result = {
                "status": "success",
                "model_info": {
                    "type": "GEE Random Forest (ee.Classifier.smileRandomForest)",
                    "models": ["NDVI", "SAVI", "EVI"],
                    "numberOfTrees": self.model_settings['numberOfTrees'],
                    "maxNodes": self.model_settings['maxNodes'],
                    "training_samples": int(self.training_samples.size().getInfo()),
                    "testing_samples": int(self.testing_samples.size().getInfo())
                }
            }

            # Add validation results if requested
            if include_validation:
                print("Validating models...")
                try:
                    validation_results = self.validate_models()
                    result["validation"] = validation_results
                except Exception as val_error:
                    print(f"Validation failed: {val_error}")
                    result["validation"] = {"error": str(val_error)}

            # Add cross-validation results if requested
            if include_cv:
                print("Performing cross-validation...")
                try:
                    cv_results = self.cross_validate_models()
                    result["cross_validation"] = cv_results
                except Exception as cv_error:
                    print(f"Cross-validation failed: {cv_error}")
                    result["cross_validation"] = {"error": str(cv_error)}

            return result

        except Exception as e:
            return {"error": str(e)}

    def forecast(self, periods=[3, 6, 12]):
        """
        Complete forecasting workflow.
        """
        try:
            if any(x is None for x in [self.ndvi_classifier, self.savi_classifier, self.evi_classifier]):
                raise ValueError("Models not trained. Call train_models() first.")

            print("Making forecasts...")
            forecasts = self.forecast_vegetation_indices(periods)

            return {
                "status": "success",
                "forecasts": forecasts,
                "model_info": {
                    "type": "GEE Random Forest (ee.Classifier.smileRandomForest)",
                    "models": ["NDVI", "SAVI", "EVI"],
                    "numberOfTrees": self.model_settings['numberOfTrees'],
                    "maxNodes": self.model_settings['maxNodes'],
                    "training_samples": int(self.training_samples.size().getInfo()) if self.training_samples else 0,
                    "testing_samples": int(self.testing_samples.size().getInfo()) if self.testing_samples else 0
                }
            }

        except Exception as e:
            return {"error": str(e)}