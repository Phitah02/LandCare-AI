#!/usr/bin/env python3
"""
Unit tests for ML API endpoints in app.py.

This module provides comprehensive unit tests for:
- Vegetation forecasting endpoint (/api/forecast/vegetation)
- Forecast status endpoint (/api/forecast/status/<task_id>)
- Model listing endpoint (/api/models/list)
- Model training endpoint (/api/models/train)
- Forecast comparison endpoint (/api/forecast/compare)
- API endpoint validation
- Error handling and edge cases

Tests use mocking to avoid external dependencies and run independently.
"""

import unittest
import unittest.mock as mock
import json
import os
import tempfile
import shutil
from datetime import datetime, timedelta

# Set environment variables for testing
os.environ['DEBUG'] = 'true'
os.environ['SECRET_KEY'] = 'test_secret'
os.environ['SUPABASE_URL'] = 'test_url'
os.environ['SUPABASE_KEY'] = 'test_key'
os.environ['GOOGLE_CLIENT_EMAIL'] = 'test@example.com'
os.environ['GOOGLE_PRIVATE_KEY'] = 'test_key'
# Override any existing DEBUG setting
os.environ['DEBUG'] = 'true'

# Mock Supabase client creation before importing anything that uses it
with mock.patch('supabase.create_client', return_value=mock.MagicMock()):
    # Import FastAPI app and required modules
    from fastapi.testclient import TestClient
    from main import app
    from routes.tasks import background_tasks_store as background_tasks
    from database import db


class TestMLAPIEndpoints(unittest.TestCase):
    """Test cases for ML API endpoints."""

    def setUp(self):
        """Set up test fixtures before each test method."""
        self.app = app
        self.client = TestClient(self.app)

        # Mock database and external dependencies
        self.mock_db = mock.MagicMock()
        self.mock_gee_processor = mock.MagicMock()
        self.mock_forecasting = mock.MagicMock()
        self.mock_ndvi_forecast_ml = mock.MagicMock()

        # Clear background tasks
        background_tasks.clear()

        # Mock external modules
        self.patches = [
            mock.patch('models.Database', return_value=self.mock_db),
            mock.patch('models.db', self.mock_db),
            mock.patch('routes.models.db', self.mock_db),
            mock.patch('routes.tasks.db', self.mock_db),
            mock.patch('routes.forecasting.db', self.mock_db),
            mock.patch('gee_processor.initialize_gee', return_value=True),
            mock.patch('gee_processor.get_historical_ndvi'),
            mock.patch('gee_processor.get_historical_evi'),
            mock.patch('gee_processor.get_historical_savi'),
            mock.patch('gee_processor.get_historical_vis'),
            mock.patch('forecasting.forecast_ndvi'),
            mock.patch('weather_integration.get_weather_data'),
            mock.patch('weather_integration.get_weather_forecast'),
            mock.patch('ndvi_forecast_ml.GEEForecaster'),
            mock.patch('routes.forecasting.run_vegetation_forecast_async'),
            mock.patch('routes.models.run_model_training_async'),
            # Mock the auth dependency to return test user
            mock.patch('auth.dependencies.get_current_user', return_value={'user_id': 'test_user_123', 'email': 'test@example.com'}),
        ]

        for patch in self.patches:
            patch.start()

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

    def test_forecast_vegetation_missing_geometry(self):
        """Test vegetation forecast endpoint with missing geometry."""
        # Mock authentication
        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json={},
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('geometry', data['error'].lower())

    def test_forecast_vegetation_invalid_periods(self):
        """Test vegetation forecast endpoint with invalid periods."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': 'invalid'  # Should be list
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('periods', data['error'].lower())

    def test_forecast_vegetation_invalid_period_values(self):
        """Test vegetation forecast endpoint with invalid period values."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': ['invalid', 6, 12]  # Non-integer values
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)

    def test_forecast_vegetation_periods_too_large(self):
        """Test vegetation forecast endpoint with periods too large."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 25]  # 25 > 24 max
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('24 months', data['error'])

    def test_forecast_vegetation_success(self):
        """Test successful vegetation forecast endpoint."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 12],
            'use_fallback': True
        }

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.run_vegetation_forecast_async') as mock_async, \
             mock.patch('app.time.time', return_value=1234567890):

            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 202)
            data = json.loads(response.data)
            self.assertIn('task_id', data)
            self.assertIn('status', data)
            self.assertEqual(data['status'], 'accepted')
            self.assertIn('periods', data)
            self.assertTrue(data['fallback_enabled'])

            # Verify async task was started
            mock_async.assert_called_once()
            args, kwargs = mock_async.call_args
            self.assertEqual(len(args), 4)  # geometry, periods, user_id, use_fallback

    def test_forecast_status_task_not_found(self):
        """Test forecast status endpoint with non-existent task."""
        with mock.patch('app.token_required', lambda f: f):
            response = self.client.get('/api/forecast/status/nonexistent_task',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 404)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('not found', data['error'].lower())

    def test_forecast_status_completed_task(self):
        """Test forecast status endpoint with completed task."""
        task_id = 'test_task_123'
        task_result = {
            'status': 'completed',
            'result': {'forecasts': {'3_months': {'predicted_ndvi': 0.6}}},
            'end_time': 1234567890.5
        }
        background_tasks[task_id] = task_result

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.get(f'/api/forecast/status/{task_id}',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['task_id'], task_id)
            self.assertEqual(data['status'], 'completed')
            self.assertIn('result', data)
            self.assertIn('end_time', data)

    def test_forecast_status_failed_task(self):
        """Test forecast status endpoint with failed task."""
        task_id = 'failed_task_123'
        task_result = {
            'status': 'failed',
            'error': 'Test error message',
            'end_time': 1234567890.5
        }
        background_tasks[task_id] = task_result

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.get(f'/api/forecast/status/{task_id}',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['status'], 'failed')
            self.assertIn('error', data)

    def test_forecast_status_processing_task(self):
        """Test forecast status endpoint with processing task."""
        task_id = 'processing_task_123'
        task_result = {
            'status': 'processing',
            'start_time': 1234567890.0
        }
        background_tasks[task_id] = task_result

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.get(f'/api/forecast/status/{task_id}',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['status'], 'processing')
            self.assertIn('start_time', data)

    def test_models_list_no_models_dir(self):
        """Test models list endpoint when models directory doesn't exist."""
        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('os.path.exists', return_value=False):

            response = self.client.get('/api/models/list',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('models', data)
            self.assertEqual(data['models'], [])

    def test_models_list_with_models(self):
        """Test models list endpoint with existing models."""
        # Create temporary models directory with test metadata
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        # Create test model metadata
        model_metadata = {
            'saved_at': datetime.now().isoformat(),
            'training_samples_count': 1000,
            'testing_samples_count': 400,
            'model_settings': {'numberOfTrees': 100},
            'start_date': '2022-01-01',
            'end_date': '2023-12-31',
            'roi_bounds': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
        }

        metadata_file = os.path.join(models_dir, 'test_model_metadata.json')
        with open(metadata_file, 'w') as f:
            json.dump(model_metadata, f)

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('os.path.exists', return_value=True), \
             mock.patch('glob.glob', return_value=[metadata_file]), \
             mock.patch('builtins.open', mock.mock_open(read_data=json.dumps(model_metadata))), \
             mock.patch('json.load', return_value=model_metadata):

            response = self.client.get('/api/models/list',
                                     headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('models', data)
            self.assertEqual(len(data['models']), 1)
            model = data['models'][0]
            self.assertIn('model_key', model)
            self.assertIn('created_at', model)
            self.assertIn('training_samples', model)

    def test_models_list_corrupt_metadata(self):
        """Test models list endpoint with corrupt metadata file."""
        self.temp_dir = tempfile.mkdtemp()
        models_dir = os.path.join(self.temp_dir, 'models')
        os.makedirs(models_dir)

        corrupt_file = os.path.join(models_dir, 'corrupt_model_metadata.json')

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('os.path.exists', return_value=True), \
             mock.patch('glob.glob', return_value=[corrupt_file]), \
             mock.patch('builtins.open', side_effect=json.JSONDecodeError("Invalid JSON", "", 0)):

            response = self.client.get('/api/models/list',
                                     headers={'Authorization': 'Bearer test_token'})

            # Should still return successfully, just skip corrupt files
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('models', data)

    def test_train_model_missing_geometry(self):
        """Test train model endpoint with missing geometry."""
        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/models/train',
                                      json={},
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('geometry', data['error'].lower())

    def test_train_model_invalid_settings(self):
        """Test train model endpoint with invalid model settings."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'model_settings': {'invalid_param': 'value'}
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/models/train',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('invalid', data['error'].lower())

    def test_train_model_success(self):
        """Test successful model training endpoint."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'model_settings': {
                'numberOfTrees': 50,
                'maxNodes': 5,
                'test_size': 0.3
            }
        }

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.run_model_training_async') as mock_async, \
             mock.patch('app.time.time', return_value=1234567890):

            response = self.client.post('/api/models/train',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 202)
            data = json.loads(response.data)
            self.assertIn('task_id', data)
            self.assertIn('status', data)
            self.assertEqual(data['status'], 'accepted')
            self.assertIn('model_settings', data)

            # Verify settings were validated and passed
            self.assertEqual(data['model_settings']['numberOfTrees'], 50)

    def test_compare_forecasts_missing_geometry(self):
        """Test compare forecasts endpoint with missing geometry."""
        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/compare',
                                      json={},
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('geometry', data['error'].lower())

    def test_compare_forecasts_invalid_periods(self):
        """Test compare forecasts endpoint with invalid periods."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 25]  # 25 > 24 max
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/compare',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertIn('error', data)
            self.assertIn('24 months', data['error'])

    def test_compare_forecasts_success(self):
        """Test successful forecast comparison endpoint."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 12],
            'model_key': 'test_model'
        }

        # Mock historical data
        mock_historical = {
            'dates': ['2023-01-01', '2023-02-01', '2023-03-01'],
            'ndvi_values': [0.5, 0.6, 0.55]
        }

        # Mock statistical forecast
        mock_stat_forecast = {
            'forecast_dates': ['2023-04-01', '2023-05-01', '2023-06-01'],
            'forecast_values': [0.58, 0.62, 0.60]
        }

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.get_historical_ndvi', return_value=mock_historical), \
             mock.patch('app.forecast_ndvi', return_value=mock_stat_forecast), \
             mock.patch('os.path.exists', return_value=False):  # No ML model

            response = self.client.post('/api/forecast/compare',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('periods', data)
            self.assertIn('statistical_forecast', data)
            self.assertIn('ml_forecast', data)
            self.assertIn('ml_error', data)
            self.assertIn('comparison_metrics', data)

    def test_compare_forecasts_with_ml_model(self):
        """Test forecast comparison with available ML model."""
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 12]
        }

        # Mock historical data
        mock_historical = {
            'dates': ['2023-01-01', '2023-02-01', '2023-03-01'],
            'ndvi_values': [0.5, 0.6, 0.55]
        }

        # Mock statistical forecast
        mock_stat_forecast = {
            'forecast_dates': ['2023-04-01', '2023-05-01', '2023-06-01'],
            'forecast_values': [0.58, 0.62, 0.60]
        }

        # Mock ML forecast
        mock_ml_forecast = {
            'forecasts': {
                '3_months': {'predicted_ndvi': 0.65, 'predicted_savi': 0.55, 'predicted_evi': 0.45},
                '6_months': {'predicted_ndvi': 0.68, 'predicted_savi': 0.58, 'predicted_evi': 0.48},
                '12_months': {'predicted_ndvi': 0.70, 'predicted_savi': 0.60, 'predicted_evi': 0.50}
            }
        }

        # Mock model metadata
        mock_metadata = {
            'model_settings': {'numberOfTrees': 100},
            'start_date': '2022-01-01',
            'end_date': '2023-12-31',
            'roi_bounds': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
        }

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.get_historical_ndvi', return_value=mock_historical), \
             mock.patch('app.forecast_ndvi', return_value=mock_stat_forecast), \
             mock.patch('os.path.exists', return_value=True), \
             mock.patch('builtins.open', mock.mock_open(read_data=json.dumps(mock_metadata))), \
             mock.patch('json.load', return_value=mock_metadata), \
             mock.patch('app.GEEForecaster') as mock_forecaster_class:

            # Setup mock forecaster instance
            mock_forecaster = mock.MagicMock()
            mock_forecaster_class.return_value = mock_forecaster
            mock_forecaster.load_models.return_value = None
            mock_forecaster.forecast.return_value = mock_ml_forecast

            response = self.client.post('/api/forecast/compare',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('ml_forecast', data)
            self.assertIsNotNone(data['ml_forecast'])
            self.assertIn('comparison_metrics', data)

    def test_error_handling_database_errors(self):
        """Test error handling for database-related errors."""
        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.db.generate_geometry_hash', side_effect=Exception("DB Error")):

            test_data = {
                'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
                'periods': [3, 6, 12]
            }

            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 500)
            data = json.loads(response.data)
            self.assertIn('error', data)

    def test_authentication_required(self):
        """Test that endpoints require authentication."""
        # Test without Authorization header
        response = self.client.post('/api/forecast/vegetation',
                                  json={'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}})

        # Should fail due to missing token
        self.assertEqual(response.status_code, 401)

    def test_cors_headers(self):
        """Test CORS headers are present in responses."""
        with mock.patch('app.token_required', lambda f: f):
            response = self.client.options('/api/forecast/vegetation')

            self.assertIn('Access-Control-Allow-Origin', response.headers)
            self.assertIn('Access-Control-Allow-Methods', response.headers)
            self.assertIn('Access-Control-Allow-Headers', response.headers)

    def test_input_validation_edge_cases(self):
        """Test input validation for edge cases."""
        # Test with empty geometry coordinates
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': []},
            'periods': [3, 6, 12]
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            # Should still accept but may fail later in processing
            self.assertEqual(response.status_code, 202)

        # Test with negative periods
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [-1, 3, 6]
        }

        with mock.patch('app.token_required', lambda f: f):
            response = self.client.post('/api/forecast/vegetation',
                                      json=test_data,
                                      headers={'Authorization': 'Bearer test_token'})

            self.assertEqual(response.status_code, 400)

    def test_concurrent_requests_simulation(self):
        """Test handling of concurrent requests (simulation)."""
        # Simulate multiple concurrent forecast requests
        test_data = {
            'geometry': {'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
            'periods': [3, 6, 12]
        }

        with mock.patch('app.token_required', lambda f: f), \
             mock.patch('app.run_vegetation_forecast_async'), \
             mock.patch('app.time.time', side_effect=[1000.0, 1000.1, 1000.2]):

            # Make multiple requests
            responses = []
            for i in range(3):
                response = self.client.post('/api/forecast/vegetation',
                                          json=test_data,
                                          headers={'Authorization': 'Bearer test_token'})
                responses.append(response)

            # All should succeed and have different task IDs
            for response in responses:
                self.assertEqual(response.status_code, 202)
                data = json.loads(response.data)
                self.assertIn('task_id', data)

            # Verify different task IDs were generated
            task_ids = [json.loads(r.data)['task_id'] for r in responses]
            self.assertEqual(len(set(task_ids)), len(task_ids))


if __name__ == '__main__':
    # Run tests with verbose output
    unittest.main(verbosity=2)