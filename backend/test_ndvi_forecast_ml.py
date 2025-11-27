#!/usr/bin/env python3
"""
Unit tests for NDVI forecasting ML functions in ndvi_forecast_ml.py.

This module provides comprehensive unit tests for:
- Feature engineering functions
- Model training processes
- Prediction logic
- Model serialization/deserialization
- Error handling and edge cases

Tests are designed to run independently and use mocking for GEE dependencies.
"""

import unittest
import unittest.mock as mock
import json
import os
import tempfile
import shutil
from datetime import datetime, timedelta
import numpy as np

# Import the module to test
from ndvi_forecast_ml import GEEForecaster


class TestGEEForecaster(unittest.TestCase):
    """Test cases for the GEEForecaster class."""

    def setUp(self):
        """Set up test fixtures before each test method."""
        # Mock GEE to avoid authentication requirements
        self.mock_ee = mock.MagicMock()
        self.mock_geometry = mock.MagicMock()
        self.mock_image_collection = mock.MagicMock()
        self.mock_image = mock.MagicMock()
        self.mock_classifier = mock.MagicMock()

        # Create test ROI and dates
        self.test_roi = self.mock_geometry
        self.start_date = '2022-01-01'
        self.end_date = '2023-12-31'
        self.model_settings = {
            'numberOfTrees': 50,  # Smaller for testing
            'maxNodes': 5,
            'test_size': 0.3
        }

        # Setup common mock returns
        self.mock_ee.Geometry.Polygon.return_value = self.mock_geometry
        self.mock_ee.ImageCollection.return_value = self.mock_image_collection
        self.mock_ee.Image.return_value = self.mock_image
        self.mock_ee.ImageCollection.fromImages.return_value = self.mock_image_collection
        self.mock_ee.Terrain.slope.return_value = self.mock_image
        self.mock_ee.Classifier.smileRandomForest.return_value = self.mock_classifier
        self.mock_ee.Algorithms.If.return_value = self.mock_image
        self.mock_ee.Date.return_value = mock.MagicMock()

        # Mock size() to return mock with getInfo()
        mock_size = mock.MagicMock()
        mock_size.getInfo.return_value = 2100
        self.mock_image_collection.size.return_value = mock_size

        # Patch ee module
        with mock.patch.dict('sys.modules', {'ee': self.mock_ee}):
            self.forecaster = GEEForecaster(
                self.test_roi,
                self.start_date,
                self.end_date,
                self.model_settings
            )

    def tearDown(self):
        """Clean up after each test method."""
        # Clean up any temporary files created during tests
        if hasattr(self, 'temp_dir') and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_initialization(self, mock_ee):
        """Test GEEForecaster initialization."""
        mock_ee.Geometry.Polygon.return_value = self.mock_geometry

        forecaster = GEEForecaster(self.test_roi, self.start_date, self.end_date)

        self.assertEqual(forecaster.roi, self.test_roi)
        self.assertEqual(forecaster.start_date, self.start_date)
        self.assertEqual(forecaster.end_date, self.end_date)
        self.assertIsNone(forecaster.ndvi_classifier)
        self.assertIsNone(forecaster.savi_classifier)
        self.assertIsNone(forecaster.evi_classifier)
        self.assertEqual(len(forecaster.feature_bands), 22)  # Check expected number of bands

    @mock.patch('ndvi_forecast_ml.ee')
    def test_initialize_gee_success(self, mock_ee):
        """Test successful GEE initialization."""
        mock_ee.Initialize.return_value = None

        result = GEEForecaster.initialize_gee()
        self.assertTrue(result)
        mock_ee.Initialize.assert_called_once()

    @mock.patch('ndvi_forecast_ml.ee')
    def test_initialize_gee_failure(self, mock_ee):
        """Test GEE initialization failure."""
        mock_ee.Initialize.side_effect = Exception("Auth failed")

        result = GEEForecaster.initialize_gee()
        self.assertFalse(result)

    def test_demo_mode(self):
        """Test demo mode functionality."""
        result = GEEForecaster.demo_mode()

        self.assertIn('status', result)
        self.assertIn('forecasts', result)
        self.assertIn('model_info', result)
        self.assertEqual(result['status'], 'success')
        self.assertIn('3_months', result['forecasts'])
        self.assertIn('6_months', result['forecasts'])
        self.assertIn('12_months', result['forecasts'])

    @mock.patch('ndvi_forecast_ml.ee')
    def test_load_ndvi_data(self, mock_ee):
        """Test loading NDVI data."""
        # Mock GEE objects
        mock_collection = mock.MagicMock()
        mock_filtered = mock.MagicMock()
        mock_mapped = mock.MagicMock()
        mock_monthly = mock.MagicMock()

        mock_ee.ImageCollection.return_value = mock_collection
        mock_collection.filterBounds.return_value = mock_filtered
        mock_filtered.filterDate.return_value = mock_filtered
        mock_filtered.filter.return_value = mock_filtered
        mock_filtered.select.return_value = mock_filtered
        mock_filtered.map.return_value = mock_mapped
        mock_ee.ImageCollection.fromImages.return_value = mock_monthly

        result = self.forecaster.load_ndvi_data()

        self.assertEqual(result, mock_monthly)
        self.assertEqual(self.forecaster.vi_collection, mock_monthly)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_create_lagged_features_no_vi_collection(self, mock_ee):
        """Test create_lagged_features without VI collection loaded."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.create_lagged_features()

        self.assertIn("VI collection not loaded", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_create_lagged_features(self, mock_ee):
        """Test creating lagged features."""
        # Setup mock VI collection
        mock_list = mock.MagicMock()
        mock_image1 = mock.MagicMock()
        mock_image2 = mock.MagicMock()
        mock_mapped = mock.MagicMock()

        self.forecaster.vi_collection = mock.MagicMock()
        self.forecaster.vi_collection.toList.return_value = mock_list
        mock_size = mock.MagicMock()
        mock_size.getInfo.return_value = 12
        self.forecaster.vi_collection.size.return_value = mock_size
        mock_list.get.side_effect = lambda i: mock_image1 if i < 6 else mock_image2
        mock_list.map.return_value = mock_mapped

        # Mock image operations
        mock_ee.Image.return_value = mock_image1
        mock_ee.Algorithms.If.return_value = mock_image1

        result = self.forecaster.create_lagged_features()

        self.assertEqual(result, mock_mapped)
        self.assertEqual(self.forecaster.vi_lagged, mock_mapped)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_load_meteorological_data(self, mock_ee):
        """Test loading meteorological data."""
        # Mock collections and operations
        mock_precip_collection = mock.MagicMock()
        mock_temp_collection = mock.MagicMock()
        mock_monthly_meteo = mock.MagicMock()

        mock_ee.ImageCollection.side_effect = [mock_precip_collection, mock_temp_collection]
        mock_ee.ImageCollection.fromImages.return_value = mock_monthly_meteo

        result = self.forecaster.load_meteorological_data()

        self.assertEqual(result, mock_monthly_meteo)
        self.assertEqual(self.forecaster.meteo_collection, mock_monthly_meteo)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_load_topographic_data(self, mock_ee):
        """Test loading topographic data."""
        mock_elevation = mock.MagicMock()
        mock_slope = mock.MagicMock()
        mock_topo_image = mock.MagicMock()

        mock_ee.Image.return_value = mock_elevation
        mock_ee.Terrain.slope.return_value = mock_slope
        mock_elevation.addBands.return_value = mock_topo_image

        result = self.forecaster.load_topographic_data()

        # The result should be the topo_image created by addBands
        self.assertIsNotNone(result)
        self.assertEqual(self.forecaster.topo_image, mock_topo_image)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_load_soil_data(self, mock_ee):
        """Test loading soil data."""
        mock_soil_texture = mock.MagicMock()
        mock_soil_image = mock.MagicMock()

        mock_ee.Image.return_value = mock_soil_texture
        mock_soil_texture.select.return_value = mock_soil_image

        result = self.forecaster.load_soil_data()

        self.assertEqual(result, mock_soil_image)
        self.assertEqual(self.forecaster.soil_image, mock_soil_image)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_join_collections_not_loaded(self, mock_ee):
        """Test join_collections when data not loaded."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.join_collections()

        self.assertIn("All data collections must be loaded", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_join_collections(self, mock_ee):
        """Test joining collections."""
        # Setup mock collections
        self.forecaster.vi_lagged = mock.MagicMock()
        self.forecaster.meteo_collection = mock.MagicMock()
        self.forecaster.topo_image = mock.MagicMock()
        self.forecaster.soil_image = mock.MagicMock()

        mock_combined = mock.MagicMock()
        self.forecaster.vi_lagged.map.return_value = mock_combined

        result = self.forecaster.join_collections()

        self.assertEqual(result, mock_combined)
        self.assertEqual(self.forecaster.combined_collection, mock_combined)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_sample_training_data_no_collection(self, mock_ee):
        """Test sample_training_data without combined collection."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.sample_training_data()

        self.assertIn("Combined collection not created", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_sample_training_data(self, mock_ee):
        """Test sampling training data."""
        # Setup mock collection
        mock_collection = mock.MagicMock()
        mock_samples = mock.MagicMock()

        self.forecaster.combined_collection = mock_collection
        mock_collection.map.return_value = mock_samples
        mock_samples.flatten.return_value = mock_samples

        result = self.forecaster.sample_training_data()

        self.assertEqual(result, mock_samples)
        self.assertEqual(self.forecaster.samples, mock_samples)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_prepare_features_and_labels_no_samples(self, mock_ee):
        """Test prepare_features_and_labels without samples."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.prepare_features_and_labels()

        self.assertIn("Training samples not created", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_prepare_features_and_labels(self, mock_ee):
        """Test preparing features and labels."""
        # Setup mock samples
        mock_samples = mock.MagicMock()
        mock_features = mock.MagicMock()
        mock_ndvi_labels = mock.MagicMock()
        mock_savi_labels = mock.MagicMock()
        mock_evi_labels = mock.MagicMock()

        self.forecaster.samples = mock_samples
        mock_samples.select.side_effect = [mock_features, mock_ndvi_labels, mock_savi_labels, mock_evi_labels]

        features, ndvi_labels, savi_labels, evi_labels = self.forecaster.prepare_features_and_labels()

        self.assertEqual(features, mock_features)
        self.assertEqual(ndvi_labels, mock_ndvi_labels)
        self.assertEqual(savi_labels, mock_savi_labels)
        self.assertEqual(evi_labels, mock_evi_labels)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_train_gee_random_forests_no_samples(self, mock_ee):
        """Test train_gee_random_forests without samples."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.train_gee_random_forests()

        self.assertIn("Training samples not prepared", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_train_gee_random_forests(self, mock_ee):
        """Test training GEE Random Forest models."""
        # Setup mock samples and classifiers
        mock_samples = mock.MagicMock()
        mock_training_samples = mock.MagicMock()
        mock_testing_samples = mock.MagicMock()
        mock_ndvi_classifier = mock.MagicMock()
        mock_savi_classifier = mock.MagicMock()
        mock_evi_classifier = mock.MagicMock()

        self.forecaster.samples = mock_samples
        mock_samples.randomColumn.return_value = mock_samples
        mock_samples.filter.side_effect = [mock_training_samples, mock_testing_samples]

        mock_ee.Classifier.smileRandomForest.return_value = self.mock_classifier
        self.mock_classifier.train.side_effect = [mock_ndvi_classifier, mock_savi_classifier, mock_evi_classifier]
        mock_training_size = mock.MagicMock()
        mock_training_size.getInfo.return_value = 2100
        mock_testing_size = mock.MagicMock()
        mock_testing_size.getInfo.return_value = 900
        mock_training_samples.size.return_value = mock_training_size
        mock_testing_samples.size.return_value = mock_testing_size

        with mock.patch('builtins.print'):  # Suppress print statements
            ndvi_clf, savi_clf, evi_clf, train_samples, test_samples = self.forecaster.train_gee_random_forests()

        self.assertEqual(ndvi_clf, mock_ndvi_classifier)
        self.assertEqual(savi_clf, mock_savi_classifier)
        self.assertEqual(evi_clf, mock_evi_classifier)
        self.assertEqual(train_samples, mock_training_samples)
        self.assertEqual(test_samples, mock_testing_samples)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_validate_models_no_classifiers(self, mock_ee):
        """Test validate_models without trained classifiers."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.validate_models()

        self.assertIn("Models not trained", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_validate_models(self, mock_ee):
        """Test model validation."""
        # Setup mock classifiers and samples
        self.forecaster.ndvi_classifier = self.mock_classifier
        self.forecaster.savi_classifier = self.mock_classifier
        self.forecaster.evi_classifier = self.mock_classifier
        self.forecaster.testing_samples = mock.MagicMock()

        mock_classified = mock.MagicMock()
        self.forecaster.testing_samples.classify.return_value = mock_classified
        mock_test_size = mock.MagicMock()
        mock_test_size.getInfo.return_value = 100
        self.forecaster.testing_samples.size.return_value = mock_test_size

        # Mock error calculation results
        mock_error_stats = mock.MagicMock()
        mock_error_stats.getInfo.return_value = {'mean': {'abs_error': 0.05, 'sq_error': 0.003}}
        mock_classified.reduceColumns.return_value = mock_error_stats

        # Mock R-squared calculation
        mock_r2_stats = mock.MagicMock()
        mock_r2_stats.getInfo.return_value = {'sum': {'actual_mean_diff_sq': 10.0, 'residual_sq': 2.0}}

        with mock.patch('builtins.print'):  # Suppress print statements
            results = self.forecaster.validate_models()

        self.assertIn('ndvi', results)
        self.assertIn('savi', results)
        self.assertIn('evi', results)
        self.assertIn('mae', results['ndvi'])
        self.assertIn('rmse', results['ndvi'])
        self.assertIn('r_squared', results['ndvi'])

    @mock.patch('ndvi_forecast_ml.ee')
    def test_cross_validate_models_no_samples(self, mock_ee):
        """Test cross_validate_models without samples."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.cross_validate_models()

        self.assertIn("Training samples not prepared", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_cross_validate_models(self, mock_ee):
        """Test cross-validation."""
        # Setup mock samples
        mock_samples = mock.MagicMock()
        mock_fold_samples = mock.MagicMock()
        mock_train_fold = mock.MagicMock()
        mock_val_fold = mock.MagicMock()

        self.forecaster.samples = mock_samples
        mock_samples.randomColumn.return_value = mock_fold_samples
        mock_fold_samples.filter.side_effect = [mock_train_fold, mock_val_fold]
        mock_val_fold.size.return_value = 50  # Non-zero size

        # Mock classifier training and validation
        mock_classifier = mock.MagicMock()
        mock_ee.Classifier.smileRandomForest.return_value = mock_classifier

        mock_classified = mock.MagicMock()
        mock_val_fold.classify.return_value = mock_classified

        mock_fold_mse = mock.MagicMock()
        mock_fold_mse.getInfo.return_value = {'mean': {'sq_error': 0.01}}
        mock_classified.map.return_value = mock_classified
        mock_classified.reduceColumns.return_value = mock_fold_mse

        results = self.forecaster.cross_validate_models(k_folds=3)

        self.assertIn('ndvi', results)
        self.assertIn('savi', results)
        self.assertIn('evi', results)
        self.assertIn('avg_rmse', results['ndvi'])

    @mock.patch('ndvi_forecast_ml.ee')
    def test_forecast_vegetation_indices_no_models(self, mock_ee):
        """Test forecast_vegetation_indices without trained models."""
        with self.assertRaises(ValueError) as context:
            self.forecaster.forecast_vegetation_indices()

        self.assertIn("Models not trained", str(context.exception))

    @mock.patch('ndvi_forecast_ml.ee')
    def test_forecast_vegetation_indices(self, mock_ee):
        """Test forecasting vegetation indices."""
        # Setup mock classifiers
        self.forecaster.ndvi_classifier = self.mock_classifier
        self.forecaster.savi_classifier = self.mock_classifier
        self.forecaster.evi_classifier = self.mock_classifier

        # Setup mock collections
        mock_vi_collection = mock.MagicMock()
        mock_meteo_collection = mock.MagicMock()
        mock_topo_image = mock.MagicMock()
        mock_soil_image = mock.MagicMock()
        self.forecaster.vi_collection = mock_vi_collection
        self.forecaster.meteo_collection = mock_meteo_collection
        self.forecaster.topo_image = mock_topo_image
        self.forecaster.soil_image = mock_soil_image

        # Mock date operations
        mock_date = mock.MagicMock()
        mock_future_date = mock.MagicMock()
        mock_ee.Date.return_value = mock_date
        mock_date.advance.return_value = mock_future_date
        mock_future_date.format.return_value = mock_future_date
        mock_future_date.getInfo.return_value = "2024-03-01"

        # Mock VI data extraction
        mock_sorted_vi = mock.MagicMock()
        mock_limited_vi = mock.MagicMock()
        mock_vi_list = mock.MagicMock()
        mock_image = mock.MagicMock()
        mock_vi_collection.sort.return_value = mock_sorted_vi
        mock_sorted_vi.limit.return_value = mock_limited_vi
        mock_limited_vi.toList.return_value = mock_vi_list
        mock_vi_list.get.return_value = mock_image
        mock_image.select.return_value = mock_image

        # Mock meteorological data
        mock_sorted_meteo = mock.MagicMock()
        mock_last_meteo = mock.MagicMock()
        mock_meteo_collection.sort.return_value = mock_sorted_meteo
        mock_sorted_meteo.first.return_value = mock_last_meteo

        # Mock image operations
        mock_feature_image = mock.MagicMock()
        mock_prediction = mock.MagicMock()
        mock_ee.Image.return_value = mock_image
        mock_image.addBands.return_value = mock_feature_image
        mock_feature_image.classify.return_value = mock_prediction
        mock_feature_image.clip.return_value = mock_feature_image

        mock_mean = mock.MagicMock()
        mock_mean.getInfo.return_value = 0.6
        mock_prediction.reduceRegion.return_value = mock_mean

        results = self.forecaster.forecast_vegetation_indices([3])

        self.assertIn('3_months', results)
        self.assertIn('predicted_ndvi', results['3_months'])
        self.assertIn('predicted_savi', results['3_months'])
        self.assertIn('predicted_evi', results['3_months'])

    def test_save_models(self):
        """Test saving models."""
        # Create temporary directory for testing
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        with mock.patch('os.path.exists', return_value=True), \
             mock.patch('os.makedirs'), \
             mock.patch('builtins.open', mock.mock_open()) as mock_file, \
             mock.patch('json.dump'), \
             mock.patch('builtins.print'):

            self.forecaster.save_models(f"{models_dir}/test_model")

            # Verify file operations
            mock_file.assert_called()
            # Should have opened metadata file
            self.assertTrue(any('metadata.json' in str(call) for call in mock_file.call_args_list))

    def test_load_models_file_not_found(self):
        """Test loading models when file doesn't exist."""
        with self.assertRaises(FileNotFoundError):
            self.forecaster.load_models("nonexistent_model")

    def test_load_models(self):
        """Test loading models."""
        # Create temporary directory and metadata file
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        metadata_file = os.path.join(models_dir, 'test_model_metadata.json')
        metadata = {
            'model_settings': self.model_settings,
            'feature_bands': self.forecaster.feature_bands,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'roi_bounds': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'saved_at': datetime.now().isoformat()
        }

        with open(metadata_file, 'w') as f:
            json.dump(metadata, f)

        with mock.patch('os.path.exists', return_value=True), \
             mock.patch('builtins.open', mock.mock_open(read_data=json.dumps(metadata))), \
             mock.patch('json.load', return_value=metadata), \
             mock.patch('ndvi_forecast_ml.ee.Geometry', return_value=self.mock_geometry), \
             mock.patch('builtins.print'), \
             mock.patch.object(self.forecaster, 'train_models') as mock_train:

            self.forecaster.load_models(f"{models_dir}/test_model")

            # Verify training was called
            mock_train.assert_called_once()

    @mock.patch('ndvi_forecast_ml.ee')
    def test_train_models_workflow(self, mock_ee):
        """Test the complete train_models workflow."""
        # Mock all the required methods
        with mock.patch.object(self.forecaster, 'load_ndvi_data') as mock_load_ndvi, \
             mock.patch.object(self.forecaster, 'create_lagged_features') as mock_create_lags, \
             mock.patch.object(self.forecaster, 'load_meteorological_data') as mock_load_meteo, \
             mock.patch.object(self.forecaster, 'load_topographic_data') as mock_load_topo, \
             mock.patch.object(self.forecaster, 'load_soil_data') as mock_load_soil, \
             mock.patch.object(self.forecaster, 'join_collections') as mock_join, \
             mock.patch.object(self.forecaster, 'sample_training_data') as mock_sample, \
             mock.patch.object(self.forecaster, 'prepare_features_and_labels') as mock_prepare, \
             mock.patch.object(self.forecaster, 'train_gee_random_forests') as mock_train, \
             mock.patch.object(self.forecaster, 'validate_models', side_effect=Exception("Mock validation error")) as mock_validate, \
             mock.patch.object(self.forecaster, 'cross_validate_models', return_value={'ndvi': {'avg_rmse': 0.1}}) as mock_cv, \
             mock.patch('builtins.print'):

            result = self.forecaster.train_models()

            # Verify key methods were called
            mock_load_ndvi.assert_called_once()
            mock_create_lags.assert_called_once()
            mock_load_meteo.assert_called_once()
            mock_load_topo.assert_called_once()
            mock_load_soil.assert_called_once()
            mock_join.assert_called_once()
            mock_sample.assert_called_once()
            mock_prepare.assert_called_once()
            mock_train.assert_called_once()

            # Verify result structure
            self.assertIn('status', result)
            self.assertIn('model_info', result)
            self.assertIn('validation', result)
            self.assertIn('cross_validation', result)

    @mock.patch('ndvi_forecast_ml.ee')
    def test_forecast_workflow_no_models(self, mock_ee):
        """Test forecast workflow without trained models."""
        result = self.forecaster.forecast()

        self.assertIn('error', result)
        self.assertIn("Models not trained", result['error'])

    @mock.patch('ndvi_forecast_ml.ee')
    def test_forecast_workflow(self, mock_ee):
        """Test the complete forecast workflow."""
        # Setup mock trained models
        self.forecaster.ndvi_classifier = self.mock_classifier
        self.forecaster.savi_classifier = self.mock_classifier
        self.forecaster.evi_classifier = self.mock_classifier
        self.forecaster.training_samples = mock.MagicMock()
        self.forecaster.testing_samples = mock.MagicMock()
        mock_train_size = mock.MagicMock()
        mock_train_size.getInfo.return_value = 2100
        mock_test_size = mock.MagicMock()
        mock_test_size.getInfo.return_value = 900
        self.forecaster.training_samples.size.return_value = mock_train_size
        self.forecaster.testing_samples.size.return_value = mock_test_size

        with mock.patch.object(self.forecaster, 'forecast_vegetation_indices') as mock_forecast, \
             mock.patch('builtins.print'):

            mock_forecast.return_value = {'3_months': {'predicted_ndvi': 0.6}}

            result = self.forecaster.forecast([3])

            mock_forecast.assert_called_once_with([3])
            self.assertIn('status', result)
            self.assertIn('forecasts', result)
            self.assertIn('model_info', result)

    def test_error_handling_edge_cases(self):
        """Test error handling for edge cases."""
        # Test with invalid model settings - should not raise error, just use defaults
        try:
            forecaster = GEEForecaster(self.test_roi, self.start_date, self.end_date, {'invalid_setting': 'value'})
            # Should succeed with default settings
            self.assertIsNotNone(forecaster)
        except (KeyError, TypeError):
            pass  # This is acceptable behavior

        # Test that valid settings work
        valid_settings = {'numberOfTrees': 50, 'maxNodes': 5}
        forecaster = GEEForecaster(self.test_roi, self.start_date, self.end_date, valid_settings)
        self.assertEqual(forecaster.model_settings['numberOfTrees'], 50)

    def test_model_settings_validation(self):
        """Test model settings validation."""
        # Test default settings
        forecaster = GEEForecaster(self.test_roi, self.start_date, self.end_date)
        expected_defaults = {
            'numberOfTrees': 100,
            'maxNodes': 10,
            'test_size': 0.3
        }
        self.assertEqual(forecaster.model_settings, expected_defaults)

        # Test custom settings
        custom_settings = {
            'numberOfTrees': 200,
            'maxNodes': 15,
            'test_size': 0.2
        }
        forecaster_custom = GEEForecaster(self.test_roi, self.start_date, self.end_date, custom_settings)
        self.assertEqual(forecaster_custom.model_settings, custom_settings)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)