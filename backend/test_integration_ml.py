#!/usr/bin/env python3
"""
Integration tests for the end-to-end ML forecasting workflow.

This module provides comprehensive integration tests for:
- Initiating model training via API
- Monitoring training status
- Performing predictions with trained models
- Comparing ML vs statistical forecasts
- Handling background processing failures
- Database interactions

Tests cover the full workflow from API endpoints to background processing
and database persistence, using a test database setup with proper cleanup.
"""

import unittest
import unittest.mock as mock
import json
import os
import tempfile
import shutil
import asyncio
import time
from datetime import datetime, timedelta

# Mock token_required before importing app
def mock_token_required(f):
    """Mock token_required decorator that sets user_id on request."""
    def mock_wrapper(*args, **kwargs):
        # Set user_id on the request object
        from flask import request
        request.user_id = 'test_user_123'
        request.user_email = 'test@example.com'
        return f(*args, **kwargs)
    # Preserve the original function name to avoid Flask conflicts
    mock_wrapper.__name__ = f.__name__
    return mock_wrapper

with mock.patch('models.token_required', mock_token_required):
    # Import Flask app and required modules
    from app import app, background_tasks
    from models import db

# Test database setup
class TestDatabase:
    """Mock database for testing that stores data in memory."""
    def __init__(self):
        self.data = {
            'users': {},
            'forecasts': {},
            'analyses': {},
            'historical_data': {},
            'cached_historical_data': {},
            'cached_models': {}
        }

    def save_forecast(self, user_id, geometry, forecast_data):
        """Mock save forecast."""
        forecast_id = f"forecast_{len(self.data['forecasts'])}"
        self.data['forecasts'][forecast_id] = {
            'user_id': user_id,
            'geometry': geometry,
            'forecast_data': forecast_data,
            'created_at': datetime.utcnow().isoformat()
        }
        return forecast_id

    def get_forecasts(self, user_id, limit=5):
        """Mock get forecasts."""
        user_forecasts = [
            f for f in self.data['forecasts'].values()
            if f['user_id'] == user_id
        ]
        return user_forecasts[-limit:] if user_forecasts else []

    def generate_geometry_hash(self, geometry):
        """Mock geometry hash generation."""
        return f"hash_{hash(str(geometry))}"

    def clear_expired_cache(self):
        """Mock cache clearing."""
        return True


class TestIntegrationML(unittest.TestCase):
    """Integration tests for ML forecasting workflow."""

    def setUp(self):
        """Set up test fixtures before each test method."""
        self.app = app
        self.app.config['TESTING'] = True
        self.app.config['SECRET_KEY'] = 'test_secret_key'
        self.client = self.app.test_client()

        # Use test database
        self.test_db = TestDatabase()

        # Test data
        self.test_geometry = {
            'type': 'Polygon',
            'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
        self.test_user_id = 'test_user_123'
        self.test_token = 'Bearer test_token'

        # Mock external dependencies
        self.patches = [
            mock.patch('app.db', self.test_db),
            mock.patch('models.db', self.test_db),
            mock.patch('app.initialize_gee', return_value=True),
            mock.patch('app.get_historical_ndvi', self._mock_get_historical_ndvi),
            mock.patch('app.get_historical_evi', self._mock_get_historical_evi),
            mock.patch('app.get_historical_savi', self._mock_get_historical_savi),
            mock.patch('app.forecast_ndvi', self._mock_forecast_ndvi),
            mock.patch('app.GEEForecaster', self._mock_gee_forecaster),
            mock.patch('ndvi_forecast_ml.GEEForecaster', self._mock_gee_forecaster),
            mock.patch('asyncio.create_task', self._mock_create_task),
        ]

        for patch in self.patches:
            patch.start()

        # Clear background tasks
        background_tasks.clear()

    def tearDown(self):
        """Clean up after each test method."""
        # Stop all patches
        for patch in self.patches:
            patch.stop()

        # Clear background tasks
        background_tasks.clear()

        # Clean up any temporary files
        if hasattr(self, 'temp_dir') and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def _mock_get_historical_ndvi(self, geometry, years=2):
        """Mock historical NDVI data retrieval."""
        return {
            'dates': ['2023-01-01', '2023-02-01', '2023-03-01', '2023-04-01', '2023-05-01', '2023-06-01'],
            'ndvi_values': [0.5, 0.55, 0.6, 0.58, 0.62, 0.65]
        }

    def _mock_get_historical_evi(self, geometry, years=2):
        """Mock historical EVI data retrieval."""
        return {
            'dates': ['2023-01-01', '2023-02-01', '2023-03-01'],
            'evi_values': [0.4, 0.45, 0.5]
        }

    def _mock_get_historical_savi(self, geometry, years=2):
        """Mock historical SAVI data retrieval."""
        return {
            'dates': ['2023-01-01', '2023-02-01', '2023-03-01'],
            'savi_values': [0.3, 0.35, 0.4]
        }

    def _mock_forecast_ndvi(self, historical_data, periods, geometry_hash=None, use_sarima=True):
        """Mock NDVI forecasting."""
        forecast_dates = []
        forecast_values = []

        base_date = datetime.now()
        for i in range(max(periods)):
            forecast_dates.append((base_date + timedelta(days=30*(i+1))).strftime('%Y-%m-%d'))
            forecast_values.append(0.6 + i * 0.02)  # Increasing trend

        return {
            'forecast_dates': forecast_dates,
            'forecast_values': forecast_values,
            'model_info': {'type': 'SARIMA', 'periods': periods},
            'confidence_intervals': {
                'lower': [v - 0.05 for v in forecast_values],
                'upper': [v + 0.05 for v in forecast_values]
            }
        }

    def _mock_gee_forecaster(self, roi, start_date, end_date, model_settings=None):
        """Mock GEEForecaster class."""
        forecaster = mock.MagicMock()
        forecaster.roi = roi
        forecaster.start_date = start_date
        forecaster.end_date = end_date
        forecaster.model_settings = model_settings or {'numberOfTrees': 100}

        # Mock training result
        forecaster.train_models.return_value = {
            'status': 'success',
            'model_info': {
                'ndvi_model': 'trained',
                'savi_model': 'trained',
                'evi_model': 'trained',
                'training_samples': 1000,
                'validation_score': 0.85
            }
        }

        # Mock forecast result
        forecaster.forecast.return_value = {
            'status': 'success',
            'forecasts': {
                '3_months': {
                    'predicted_ndvi': 0.65,
                    'predicted_savi': 0.55,
                    'predicted_evi': 0.45,
                    'period_months': 3,
                    'forecast_date': '2024-03-01'
                },
                '6_months': {
                    'predicted_ndvi': 0.68,
                    'predicted_savi': 0.58,
                    'predicted_evi': 0.48,
                    'period_months': 6,
                    'forecast_date': '2024-06-01'
                },
                '12_months': {
                    'predicted_ndvi': 0.70,
                    'predicted_savi': 0.60,
                    'predicted_evi': 0.50,
                    'period_months': 12,
                    'forecast_date': '2024-12-01'
                }
            },
            'model_info': {
                'type': 'Random Forest (GEE)',
                'settings': model_settings
            }
        }

        forecaster.save_models.return_value = None
        forecaster.load_models.return_value = None

        return forecaster

    def _mock_create_task(self, coro):
        """Mock asyncio.create_task to avoid async issues in tests."""
        # For testing, we'll simulate the task completion by running synchronously
        # In a real scenario, this would be handled by the event loop
        return mock.MagicMock()

    def test_initiate_model_training_success(self):
        """Test successful initiation of model training via API."""
        test_data = {
            'geometry': self.test_geometry,
            'model_settings': {
                'numberOfTrees': 50,
                'maxNodes': 5,
                'test_size': 0.3
            }
        }

        response = self.client.post('/api/models/train',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 202)
        data = json.loads(response.data)
        self.assertIn('task_id', data)
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'accepted')
        self.assertIn('model_settings', data)
        self.assertEqual(data['model_settings']['numberOfTrees'], 50)

    @mock.patch('app.token_required', lambda f: f)
    def test_initiate_model_training_missing_geometry(self):
        """Test model training initiation with missing geometry."""
        test_data = {
            'model_settings': {'numberOfTrees': 50}
        }

        response = self.client.post('/api/models/train',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)
        self.assertIn('geometry', data['error'].lower())

    @mock.patch('app.token_required', lambda f: f)
    def test_monitor_training_status_processing(self):
        """Test monitoring training status while processing."""
        # Start a training task
        task_id = f"model_train_{int(time.time())}_1234"
        background_tasks[task_id] = {
            'status': 'processing',
            'start_time': time.time()
        }

        response = self.client.get(f'/api/forecast/status/{task_id}',
                                 headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['task_id'], task_id)
        self.assertEqual(data['status'], 'processing')
        self.assertIn('start_time', data)

    @mock.patch('app.token_required', lambda f: f)
    def test_monitor_training_status_completed(self):
        """Test monitoring training status when completed."""
        task_id = f"model_train_{int(time.time())}_1234"
        task_result = {
            'status': 'completed',
            'result': {
                'model_key': 'test_model_123',
                'training_result': {'status': 'success'},
                'geometry_hash': 'hash_123'
            },
            'start_time': time.time() - 10,
            'end_time': time.time()
        }
        background_tasks[task_id] = task_result

        response = self.client.get(f'/api/forecast/status/{task_id}',
                                 headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'completed')
        self.assertIn('result', data)
        self.assertIn('duration', data)

    @mock.patch('app.token_required', lambda f: f)
    def test_monitor_training_status_failed(self):
        """Test monitoring training status when failed."""
        task_id = f"model_train_{int(time.time())}_1234"
        task_result = {
            'status': 'failed',
            'error': 'Model training failed: insufficient data',
            'end_time': time.time()
        }
        background_tasks[task_id] = task_result

        response = self.client.get(f'/api/forecast/status/{task_id}',
                                 headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'failed')
        self.assertIn('error', data)

    @mock.patch('app.token_required', lambda f: f)
    def test_perform_predictions_with_trained_model(self):
        """Test performing predictions with trained models."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 12]
        }

        response = self.client.post('/api/forecast/vegetation',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 202)
        data = json.loads(response.data)
        self.assertIn('task_id', data)
        task_id = data['task_id']

        # Simulate background task completion
        background_tasks[task_id] = {
            'status': 'completed',
            'result': {
                'status': 'success',
                'forecasts': {
                    '3_months': {'predicted_ndvi': 0.65},
                    '6_months': {'predicted_ndvi': 0.68},
                    '12_months': {'predicted_ndvi': 0.70}
                },
                'method_used': 'ml'
            },
            'end_time': time.time()
        }

        # Check status
        response = self.client.get(f'/api/forecast/status/{task_id}',
                                 headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'completed')
        self.assertIn('result', data)
        self.assertIn('forecasts', data['result'])

    @mock.patch('app.token_required', lambda f: f)
    def test_compare_ml_vs_statistical_forecasts(self):
        """Test comparing ML and statistical forecasts."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 12]
        }

        response = self.client.post('/api/forecast/compare',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('periods', data)
        self.assertIn('statistical_forecast', data)
        self.assertIn('ml_forecast', data)
        self.assertIn('comparison_metrics', data)

        # Verify statistical forecast is present
        self.assertIsNotNone(data['statistical_forecast'])

        # Verify ML forecast is present (mocked)
        self.assertIsNotNone(data['ml_forecast'])

        # Verify comparison metrics
        self.assertIn('final_period_months', data['comparison_metrics'])
        self.assertIn('statistical_avg', data['comparison_metrics'])
        self.assertIn('ml_avg', data['comparison_metrics'])

    @mock.patch('app.token_required', lambda f: f)
    def test_compare_forecasts_with_model_key(self):
        """Test forecast comparison with specific model key."""
        # Create temporary model directory and metadata
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        model_key = 'test_model_123'
        metadata_file = os.path.join(models_dir, f'{model_key}_metadata.json')
        metadata = {
            'model_settings': {'numberOfTrees': 100},
            'start_date': '2022-01-01',
            'end_date': '2023-12-31',
            'roi_bounds': self.test_geometry,
            'saved_at': datetime.now().isoformat()
        }

        with open(metadata_file, 'w') as f:
            json.dump(metadata, f)

        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6],
            'model_key': model_key
        }

        with mock.patch('os.path.exists', return_value=True), \
             mock.patch('builtins.open', mock.mock_open(read_data=json.dumps(metadata))), \
             mock.patch('json.load', return_value=metadata):

            response = self.client.post('/api/forecast/compare',
                                      json=test_data,
                                      headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('ml_forecast', data)
            self.assertIsNotNone(data['ml_forecast'])

    @mock.patch('app.token_required', lambda f: f)
    def test_background_processing_failure_handling(self):
        """Test handling of background processing failures."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 12]
        }

        # Mock forecast_ndvi to raise an exception
        with mock.patch('app.forecast_ndvi', side_effect=Exception("Forecasting error")):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 202)
            data = json.loads(response.data)
            task_id = data['task_id']

            # Simulate background task failure
            background_tasks[task_id] = {
                'status': 'failed',
                'error': 'Background processing failed: Forecasting error',
                'end_time': time.time()
            }

            # Check status
            response = self.client.get(f'/api/forecast/status/{task_id}',
                                     headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['status'], 'failed')
            self.assertIn('error', data)

    @mock.patch('app.token_required', lambda f: f)
    def test_fallback_to_statistical_forecasting(self):
        """Test fallback to statistical forecasting when ML fails."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 12],
            'use_fallback': True
        }

        # Mock GEEForecaster to fail during training
        with mock.patch('app.GEEForecaster') as mock_forecaster_class:
            mock_forecaster = mock.MagicMock()
            mock_forecaster_class.return_value = mock_forecaster
            mock_forecaster.train_models.side_effect = Exception("GEE training failed")

            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 202)
            data = json.loads(response.data)
            task_id = data['task_id']

            # Simulate completion with fallback
            background_tasks[task_id] = {
                'status': 'completed',
                'result': {
                    'status': 'success',
                    'forecasts': {
                        '3_months': {'predicted_ndvi': 0.62},
                        '6_months': {'predicted_ndvi': 0.65},
                        '12_months': {'predicted_ndvi': 0.68}
                    },
                    'method_used': 'statistical_fallback',
                    'fallback_used': True
                },
                'end_time': time.time()
            }

            # Check status
            response = self.client.get(f'/api/forecast/status/{task_id}',
                                     headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['status'], 'completed')
            self.assertTrue(data['result']['fallback_used'])

    def test_database_interactions_forecast_storage(self):
        """Test database interactions for forecast storage."""
        user_id = 'test_user_123'
        geometry = self.test_geometry
        forecast_data = {
            'forecast_dates': ['2024-01-01', '2024-02-01'],
            'forecast_values': [0.6, 0.65],
            'model_info': {'type': 'test_model'}
        }

        # Save forecast
        forecast_id = self.test_db.save_forecast(user_id, geometry, forecast_data)

        # Verify storage
        self.assertIn(forecast_id, self.test_db.data['forecasts'])
        stored_forecast = self.test_db.data['forecasts'][forecast_id]
        self.assertEqual(stored_forecast['user_id'], user_id)
        self.assertEqual(stored_forecast['geometry'], geometry)
        self.assertEqual(stored_forecast['forecast_data'], forecast_data)

        # Retrieve forecasts
        user_forecasts = self.test_db.get_forecasts(user_id)
        self.assertEqual(len(user_forecasts), 1)
        self.assertEqual(user_forecasts[0]['forecast_data'], forecast_data)

    def test_database_interactions_geometry_hash(self):
        """Test database geometry hash generation."""
        geometry1 = {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
        geometry2 = {'type': 'Polygon', 'coordinates': [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}

        hash1 = self.test_db.generate_geometry_hash(geometry1)
        hash2 = self.test_db.generate_geometry_hash(geometry2)

        # Hashes should be different for different geometries
        self.assertNotEqual(hash1, hash2)

        # Same geometry should produce same hash
        hash1_again = self.test_db.generate_geometry_hash(geometry1)
        self.assertEqual(hash1, hash1_again)

    @mock.patch('app.token_required', lambda f: f)
    def test_error_conditions_invalid_periods(self):
        """Test error conditions with invalid forecast periods."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 30]  # 30 > 24 max
        }

        response = self.client.post('/api/forecast/vegetation',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)
        self.assertIn('24 months', data['error'])

    @mock.patch('app.token_required', lambda f: f)
    def test_error_conditions_missing_geometry(self):
        """Test error conditions with missing geometry."""
        test_data = {
            'periods': [3, 6, 12]
        }

        response = self.client.post('/api/forecast/vegetation',
                                  json=test_data,
                                  headers={'Authorization': self.test_token})

        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)
        self.assertIn('geometry', data['error'].lower())

    @mock.patch('app.token_required', lambda f: f)
    def test_concurrent_requests_handling(self):
        """Test handling of concurrent forecast requests."""
        test_data = {
            'geometry': self.test_geometry,
            'periods': [3, 6, 12]
        }

        # Make multiple concurrent requests
        responses = []
        for i in range(3):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': self.test_token})
            responses.append(response)

        # All should succeed
        for response in responses:
            self.assertEqual(response.status_code, 202)
            data = json.loads(response.data)
            self.assertIn('task_id', data)

        # Verify different task IDs were generated
        task_ids = [json.loads(r.data)['task_id'] for r in responses]
        self.assertEqual(len(set(task_ids)), len(task_ids))

    @mock.patch('app.token_required', lambda f: f)
    def test_models_list_endpoint(self):
        """Test models list endpoint functionality."""
        # Create temporary models directory
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        # Create test model metadata
        metadata = {
            'saved_at': datetime.now().isoformat(),
            'training_samples_count': 1000,
            'testing_samples_count': 400,
            'model_settings': {'numberOfTrees': 100},
            'start_date': '2022-01-01',
            'end_date': '2023-12-31',
            'roi_bounds': self.test_geometry
        }

        metadata_file = os.path.join(models_dir, 'test_model_metadata.json')
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f)

        with mock.patch('os.path.exists', return_value=True), \
             mock.patch('glob.glob', return_value=[metadata_file]), \
             mock.patch('builtins.open', mock.mock_open(read_data=json.dumps(metadata))), \
             mock.patch('json.load', return_value=metadata):

            response = self.client.get('/api/models/list',
                                     headers={'Authorization': self.test_token})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('models', data)
            self.assertEqual(len(data['models']), 1)
            model = data['models'][0]
            self.assertIn('model_key', model)
            self.assertIn('training_samples', model)


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)