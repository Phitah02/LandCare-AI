#!/usr/bin/env python3
"""
Performance Testing Script for ML Forecasting Components
=======================================================

This script measures and benchmarks the performance of machine learning components
in the LandCare AI system, including:

- Model training time (GEEForecaster.train_models())
- Prediction speed (GEEForecaster.forecast() and API calls)
- Memory usage during training and prediction
- API response times for various endpoints

Tests different scenarios:
- Small vs large geometries
- Different forecast periods (3, 6, 12 months)

Success Criteria:
- Model training time: < 30 minutes
- Prediction response time: < 5 seconds
- Memory usage: reasonable bounds
"""

import time
import functools
import psutil
import os
import tracemalloc
import json
import requests
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple
import ee
from ndvi_forecast_ml import GEEForecaster
from forecasting import forecast_ndvi
import warnings
warnings.filterwarnings('ignore')


# Performance measurement decorators
def timing_decorator(func):
    """Decorator to measure function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time
        wrapper.execution_time = execution_time
        return result
    return wrapper


def memory_profiler(func):
    """Decorator to measure memory usage during function execution."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Start memory tracing
        tracemalloc.start()
        start_snapshot = tracemalloc.take_snapshot()

        # Get initial memory
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        result = func(*args, **kwargs)

        # Get final memory
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        end_snapshot = tracemalloc.take_snapshot()

        # Calculate memory statistics
        memory_increase = final_memory - initial_memory

        # Get top memory consumers
        try:
            top_stats = end_snapshot.compare_to(start_snapshot, 'lineno')
            top_10_stats = top_stats[:10]

            wrapper.memory_stats = {
                'initial_memory_mb': initial_memory,
                'final_memory_mb': final_memory,
                'memory_increase_mb': memory_increase,
                'peak_memory_mb': max(initial_memory, final_memory),
                'top_memory_consumers': [
                    {
                        'size_mb': stat.size / 1024 / 1024,
                        'count': stat.count,
                        'traceback': str(stat.traceback) if hasattr(stat, 'traceback') else 'N/A'
                    } for stat in top_10_stats
                ]
            }
        except Exception as mem_error:
            # Fallback if memory profiling fails
            wrapper.memory_stats = {
                'initial_memory_mb': initial_memory,
                'final_memory_mb': final_memory,
                'memory_increase_mb': memory_increase,
                'peak_memory_mb': max(initial_memory, final_memory),
                'error': str(mem_error)
            }

        tracemalloc.stop()
        return result
    return wrapper


class PerformanceTester:
    """Main class for running performance tests."""

    def __init__(self, base_url: str = "http://localhost:5000"):
        self.base_url = base_url
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'tests': {},
            'summary': {},
            'success_criteria': {
                'model_training_time_max_minutes': 30,
                'prediction_response_time_max_seconds': 5,
                'memory_usage_reasonable_mb': 1000
            }
        }

        # Test geometries
        self.small_geometry = {
            'type': 'Polygon',
            'coordinates': [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
        }

        self.large_geometry = {
            'type': 'Polygon',
            'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }

        # Initialize GEE if possible
        try:
            ee.Initialize()
            self.gee_available = True
            print("GEE initialized successfully")
        except Exception as e:
            print(f"GEE not available: {e}")
            self.gee_available = False

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all performance tests."""
        print("Starting comprehensive performance testing...")

        # Skip model training if GEE not available
        if not self.gee_available:
            print("GEE not available, skipping model training tests")
            self.results['tests']['model_training'] = {
                'status': 'skipped',
                'reason': 'GEE not available'
            }
        else:
            # Test model training performance
            self.test_model_training_performance()

        # Test prediction performance (statistical forecasting always available)
        self.test_prediction_performance()

        # Test API response times
        self.test_api_response_times()

        # Generate summary
        self.generate_summary()

        return self.results

    @timing_decorator
    @memory_profiler
    def test_model_training_performance(self):
        """Test model training time and memory usage."""
        print("\n=== Testing Model Training Performance ===")

        if not self.gee_available:
            print("GEE not available, skipping model training tests")
            self.results['tests']['model_training'] = {
                'status': 'skipped',
                'reason': 'GEE not available'
            }
            return

        training_results = {}

        for geometry_name, geometry in [('small', self.small_geometry), ('large', self.large_geometry)]:
            print(f"\nTesting training with {geometry_name} geometry...")

            try:
                # Create GEE geometry
                roi = ee.Geometry.Polygon(geometry['coordinates'])

                # Initialize forecaster
                start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
                end_date = datetime.now().strftime('%Y-%m-%d')

                forecaster = GEEForecaster(roi, start_date, end_date)

                # Train models with timing and memory profiling
                training_start = time.time()
                result = forecaster.train_models(include_validation=False, include_cv=False)
                training_end = time.time()

                training_time = training_end - training_start

                training_results[geometry_name] = {
                    'status': 'success',
                    'training_time_seconds': training_time,
                    'training_time_minutes': training_time / 60,
                    'memory_stats': getattr(self.test_model_training_performance, 'memory_stats', {}),
                    'result': result
                }

                print(f"    Training completed in {training_time / 60:.2f} minutes")
            except Exception as e:
                training_results[geometry_name] = {
                    'status': 'failed',
                    'error': str(e)
                }
                print(f"Training failed for {geometry_name} geometry: {e}")

        self.results['tests']['model_training'] = training_results

    @timing_decorator
    @memory_profiler
    def test_prediction_performance(self):
        """Test prediction speed and memory usage."""
        print("\n=== Testing Prediction Performance ===")

        prediction_results = {}

        # Test different forecast periods
        periods_to_test = [3, 6, 12]

        for geometry_name, geometry in [('small', self.small_geometry), ('large', self.large_geometry)]:
            print(f"\nTesting predictions with {geometry_name} geometry...")

            geometry_results = {}

            for periods in periods_to_test:
                print(f"  Testing {periods} month forecast...")

                try:
                    # Test statistical forecasting (always available)
                    historical_data = {
                        'dates': ['2023-01-01', '2023-02-01', '2023-03-01', '2023-04-01', '2023-05-01', '2023-06-01'],
                        'values': [0.5, 0.55, 0.6, 0.58, 0.62, 0.65]
                    }

                    prediction_start = time.time()
                    stat_result = forecast_ndvi(historical_data, periods)
                    prediction_end = time.time()

                    prediction_time = prediction_end - prediction_start

                    geometry_results[f'{periods}_months_statistical'] = {
                        'method': 'statistical',
                        'prediction_time_seconds': prediction_time,
                        'memory_stats': getattr(self.test_prediction_performance, 'memory_stats', {}),
                        'result': stat_result
                    }

                    print(f"    Statistical prediction completed in {prediction_time:.3f} seconds")
                    # Test ML forecasting if GEE available
                    if self.gee_available:
                        try:
                            roi = ee.Geometry.Polygon(geometry['coordinates'])
                            start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
                            end_date = datetime.now().strftime('%Y-%m-%d')

                            forecaster = GEEForecaster(roi, start_date, end_date)

                            # Quick training for prediction test
                            forecaster.train_models(include_validation=False, include_cv=False)

                            prediction_start = time.time()
                            ml_result = forecaster.forecast([periods])
                            prediction_end = time.time()

                            prediction_time = prediction_end - prediction_start

                            geometry_results[f'{periods}_months_ml'] = {
                                'method': 'ml',
                                'prediction_time_seconds': prediction_time,
                                'memory_stats': getattr(self.test_prediction_performance, 'memory_stats', {}),
                                'result': ml_result
                            }

                            print(f"    ML prediction completed in {prediction_time:.3f} seconds")
                        except Exception as e:
                            geometry_results[f'{periods}_months_ml'] = {
                                'method': 'ml',
                                'status': 'failed',
                                'error': str(e)
                            }

                except Exception as e:
                    geometry_results[f'{periods}_months'] = {
                        'status': 'failed',
                        'error': str(e)
                    }

            prediction_results[geometry_name] = geometry_results

        self.results['tests']['predictions'] = prediction_results

    def test_api_response_times(self):
        """Test API response times for various endpoints."""
        print("\n=== Testing API Response Times ===")

        api_results = {}

        # Test endpoints
        endpoints_to_test = [
            ('GET', '/health', None, 'health_check'),
            ('POST', '/analyze', {
                'geometry': self.small_geometry,
                'centroid': [0.005, 0.005]
            }, 'analyze_small_geometry'),
            ('POST', '/analyze', {
                'geometry': self.large_geometry,
                'centroid': [0.5, 0.5]
            }, 'analyze_large_geometry'),
            ('POST', '/forecast/vis', {
                'historical_ndvi': {
                    'dates': ['2023-01-01', '2023-02-01', '2023-03-01'],
                    'values': [0.5, 0.55, 0.6]
                },
                'months': 3
            }, 'forecast_vis_3_months'),
            ('POST', '/forecast/vis', {
                'historical_ndvi': {
                    'dates': ['2023-01-01', '2023-02-01', '2023-03-01', '2023-04-01', '2023-05-01', '2023-06-01'],
                    'values': [0.5, 0.55, 0.6, 0.58, 0.62, 0.65]
                },
                'months': 12
            }, 'forecast_vis_12_months'),
        ]

        # Mock authentication header (assuming token-based auth)
        headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test_token'  # This might need adjustment based on actual auth
        }

        for method, endpoint, data, test_name in endpoints_to_test:
            print(f"Testing {method} {endpoint}...")

            try:
                start_time = time.time()

                if method == 'GET':
                    response = requests.get(f"{self.base_url}{endpoint}", headers=headers, timeout=30)
                elif method == 'POST':
                    response = requests.post(f"{self.base_url}{endpoint}", json=data, headers=headers, timeout=60)

                end_time = time.time()
                response_time = end_time - start_time

                api_results[test_name] = {
                    'method': method,
                    'endpoint': endpoint,
                    'response_time_seconds': response_time,
                    'status_code': response.status_code,
                    'success': response.status_code < 400
                }

                print(f"    API call completed in {response_time:.3f} seconds")
            except requests.exceptions.RequestException as e:
                api_results[test_name] = {
                    'method': method,
                    'endpoint': endpoint,
                    'status': 'failed',
                    'error': str(e)
                }
                print(f"API test failed for {endpoint}: {e}")

        self.results['tests']['api_response_times'] = api_results

    def generate_summary(self):
        """Generate performance summary and check success criteria."""
        print("\n=== Generating Performance Summary ===")

        summary = {
            'overall_status': 'success',
            'success_criteria_met': {},
            'performance_metrics': {},
            'recommendations': []
        }

        # Check model training performance
        if 'model_training' in self.results['tests']:
            training_data = self.results['tests']['model_training']
            training_times = []

            for geometry_name, results in training_data.items():
                if results.get('status') == 'success':
                    training_times.append(results['training_time_minutes'])

            if training_times:
                avg_training_time = np.mean(training_times)
                max_training_time = np.max(training_times)

                summary['performance_metrics']['model_training'] = {
                    'average_time_minutes': avg_training_time,
                    'max_time_minutes': max_training_time,
                    'criterion_max_minutes': self.results['success_criteria']['model_training_time_max_minutes']
                }

                # Check success criterion
                training_success = max_training_time < self.results['success_criteria']['model_training_time_max_minutes']
                summary['success_criteria_met']['model_training_time'] = training_success

                if not training_success:
                    summary['overall_status'] = 'failed'
                    summary['recommendations'].append(
                        ".2f"
                    )

        # Check prediction performance
        if 'predictions' in self.results['tests']:
            prediction_data = self.results['tests']['predictions']
            prediction_times = []

            for geometry_name, geometry_results in prediction_data.items():
                for test_name, results in geometry_results.items():
                    if results.get('prediction_time_seconds'):
                        prediction_times.append(results['prediction_time_seconds'])

            if prediction_times:
                avg_prediction_time = np.mean(prediction_times)
                max_prediction_time = np.max(prediction_times)

                summary['performance_metrics']['predictions'] = {
                    'average_time_seconds': avg_prediction_time,
                    'max_time_seconds': max_prediction_time,
                    'criterion_max_seconds': self.results['success_criteria']['prediction_response_time_max_seconds']
                }

                # Check success criterion
                prediction_success = max_prediction_time < self.results['success_criteria']['prediction_response_time_max_seconds']
                summary['success_criteria_met']['prediction_response_time'] = prediction_success

                if not prediction_success:
                    summary['overall_status'] = 'failed'
                    summary['recommendations'].append(
                        ".3f"
                    )

        # Check API response times
        if 'api_response_times' in self.results['tests']:
            api_data = self.results['tests']['api_response_times']
            api_times = []

            for test_name, results in api_data.items():
                if results.get('response_time_seconds'):
                    api_times.append(results['response_time_seconds'])

            if api_times:
                avg_api_time = np.mean(api_times)
                max_api_time = np.max(api_times)

                summary['performance_metrics']['api_response'] = {
                    'average_time_seconds': avg_api_time,
                    'max_time_seconds': max_api_time
                }

        # Memory usage analysis
        memory_usage = []
        if 'model_training' in self.results['tests']:
            for geometry_name, results in self.results['tests']['model_training'].items():
                if 'memory_stats' in results:
                    memory_usage.append(results['memory_stats'].get('peak_memory_mb', 0))

        if memory_usage:
            avg_memory = np.mean(memory_usage)
            max_memory = np.max(memory_usage)

            summary['performance_metrics']['memory_usage'] = {
                'average_mb': avg_memory,
                'max_mb': max_memory,
                'criterion_max_mb': self.results['success_criteria']['memory_usage_reasonable_mb']
            }

            memory_success = max_memory < self.results['success_criteria']['memory_usage_reasonable_mb']
            summary['success_criteria_met']['memory_usage'] = memory_success

            if not memory_success:
                summary['recommendations'].append(
                    ".1f"
                )

        # Overall assessment
        all_criteria_met = all(summary['success_criteria_met'].values())
        if all_criteria_met:
            summary['overall_status'] = 'success'
            summary['recommendations'].append("All performance criteria met. System performing well.")
        else:
            summary['overall_status'] = 'needs_improvement'

        self.results['summary'] = summary

    def print_results(self):
        """Print formatted results."""
        print("\n" + "="*80)
        print("PERFORMANCE TESTING RESULTS")
        print("="*80)

        print(f"\nTest Timestamp: {self.results['timestamp']}")
        print(f"\nOverall Status: {self.results['summary']['overall_status'].upper()}")

        print("\nSUCCESS CRITERIA:")
        for criterion, met in self.results['summary']['success_criteria_met'].items():
            status = "✓ MET" if met else "✗ NOT MET"
            print(f"  {criterion}: {status}")

        print("\nPERFORMANCE METRICS:")
        for metric_name, metrics in self.results['summary']['performance_metrics'].items():
            print(f"\n  {metric_name.upper()}:")
            for key, value in metrics.items():
                if 'time' in key and 'seconds' in key:
                    print(".3f")
                elif 'time' in key and 'minutes' in key:
                    print(".2f")
                elif 'mb' in key.lower():
                    print(".1f")
                else:
                    print(f"    {key}: {value}")

        print("\nRECOMMENDATIONS:")
        for rec in self.results['summary']['recommendations']:
            print(f"  • {rec}")

        print("\n" + "="*80)

    def save_results(self, filename: str = None):
        """Save results to JSON file."""
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"performance_test_results_{timestamp}.json"

        with open(filename, 'w') as f:
            json.dump(self.results, f, indent=2, default=str)

        print(f"\nResults saved to: {filename}")


def main():
    """Main function to run performance tests."""
    print("LandCare AI Performance Testing Script")
    print("=====================================")

    # Initialize tester
    tester = PerformanceTester()

    # Run all tests
    results = tester.run_all_tests()

    # Print results
    tester.print_results()

    # Save results
    tester.save_results()

    return results


if __name__ == "__main__":
    main()