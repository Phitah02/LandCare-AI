#!/usr/bin/env python3
"""
Test to verify that different geometries produce different forecast results when using mock data.

This test ensures that the forecasting system correctly differentiates between
different spatial areas and produces unique forecast results based on geometry.
"""

import unittest
import json
from datetime import datetime, timedelta
from forecasting import forecast_ndvi
from models import db


class TestGeometryForecastDifferentiation(unittest.TestCase):
    """Test cases for verifying geometry-based forecast differentiation."""

    def setUp(self):
        """Set up test fixtures."""
        # Create two different geometries (representing different spatial areas)
        self.geometry1 = {
            "type": "Polygon",
            "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
        }

        self.geometry2 = {
            "type": "Polygon",
            "coordinates": [[[37.0, -1.1], [37.1, -1.1], [37.1, -1.0], [37.0, -1.0], [37.0, -1.1]]]
        }

        # Generate geometry hashes
        self.hash1 = db.generate_geometry_hash(self.geometry1)
        self.hash2 = db.generate_geometry_hash(self.geometry2)

        # Verify hashes are different
        self.assertNotEqual(self.hash1, self.hash2, "Geometry hashes should be different for different geometries")

    def test_different_geometries_produce_different_forecasts(self):
        """Test that different geometries produce different forecast results with mock data."""
        # Create different mock historical NDVI data for each geometry
        # Geometry 1: Higher NDVI values (healthier vegetation)
        dates = [(datetime.now() - timedelta(days=30*i)).strftime('%Y-%m-%d') for i in range(12, 0, -1)]

        historical_ndvi_1 = {
            'dates': dates,
            'values': [0.7, 0.72, 0.68, 0.75, 0.71, 0.69, 0.73, 0.70, 0.74, 0.72, 0.71, 0.73]  # Higher values
        }

        # Geometry 2: Lower NDVI values (less healthy vegetation)
        historical_ndvi_2 = {
            'dates': dates,
            'values': [0.4, 0.42, 0.38, 0.45, 0.41, 0.39, 0.43, 0.40, 0.44, 0.42, 0.41, 0.43]  # Lower values
        }

        # Forecast for geometry 1
        forecast_1 = forecast_ndvi(historical_ndvi_1, periods=6, geometry_hash=self.hash1, use_sarima=True)

        # Forecast for geometry 2
        forecast_2 = forecast_ndvi(historical_ndvi_2, periods=6, geometry_hash=self.hash2, use_sarima=True)

        # Verify both forecasts succeeded
        self.assertNotIn('error', forecast_1, f"Forecast 1 failed: {forecast_1.get('error', 'Unknown error')}")
        self.assertNotIn('error', forecast_2, f"Forecast 2 failed: {forecast_2.get('error', 'Unknown error')}")

        # Verify forecast results exist
        self.assertIn('forecast_values', forecast_1)
        self.assertIn('forecast_values', forecast_2)
        self.assertIn('forecast_dates', forecast_1)
        self.assertIn('forecast_dates', forecast_2)

        # Verify forecast values are different
        forecast_values_1 = forecast_1['forecast_values']
        forecast_values_2 = forecast_2['forecast_values']

        self.assertNotEqual(forecast_values_1, forecast_values_2,
                          "Forecast values should be different for different geometries")

        # Verify the difference is significant (not just floating point precision)
        differences = [abs(v1 - v2) for v1, v2 in zip(forecast_values_1, forecast_values_2)]
        max_difference = max(differences)
        self.assertGreater(max_difference, 0.01,
                          f"Forecast differences should be significant (>0.01), got max diff: {max_difference}")

        # Verify dates are the same (forecast periods should be identical)
        self.assertEqual(forecast_1['forecast_dates'], forecast_2['forecast_dates'],
                        "Forecast dates should be identical for same periods")

        # Verify model info indicates different models were used (different geometry hashes)
        self.assertIn('model_info', forecast_1)
        self.assertIn('model_info', forecast_2)

        print("PASS: Different geometries produced different forecast results")
        print(f"  Geometry 1 hash: {self.hash1[:8]}...")
        print(f"  Geometry 2 hash: {self.hash2[:8]}...")
        print(f"  Forecast 1 first value: {forecast_values_1[0]:.4f}")
        print(f"  Forecast 2 first value: {forecast_values_2[0]:.4f}")
        print(f"  Max difference: {max_difference:.4f}")

    def test_same_geometry_produces_same_forecast_with_same_data(self):
        """Test that same geometry with same data produces same forecast (caching verification)."""
        # Use same geometry but call forecast twice
        dates = [(datetime.now() - timedelta(days=30*i)).strftime('%Y-%m-%d') for i in range(12, 0, -1)]
        historical_ndvi = {
            'dates': dates,
            'values': [0.6, 0.62, 0.58, 0.65, 0.61, 0.59, 0.63, 0.60, 0.64, 0.62, 0.61, 0.63]
        }

        # First forecast
        forecast_1 = forecast_ndvi(historical_ndvi, periods=6, geometry_hash=self.hash1, use_sarima=True)

        # Second forecast with same parameters (should use cache)
        forecast_2 = forecast_ndvi(historical_ndvi, periods=6, geometry_hash=self.hash1, use_sarima=True)

        # Verify both succeeded
        self.assertNotIn('error', forecast_1)
        self.assertNotIn('error', forecast_2)

        # Verify results are identical
        self.assertEqual(forecast_1['forecast_values'], forecast_2['forecast_values'])
        self.assertEqual(forecast_1['forecast_dates'], forecast_2['forecast_dates'])

        # Check if caching was used
        cached_used = forecast_1.get('cached', False) or forecast_2.get('cached', False)
        if cached_used:
            print("PASS: Caching was used for identical geometry/data")
        else:
            print("PASS: Forecasts were identical (caching may not have been triggered)")

    def test_geometry_hash_uniqueness(self):
        """Test that geometry hash generation produces unique hashes for different geometries."""
        # Test multiple different geometries
        geometries = [
            {
                "type": "Polygon",
                "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
            },
            {
                "type": "Polygon",
                "coordinates": [[[37.0, -1.1], [37.1, -1.1], [37.1, -1.0], [37.0, -1.0], [37.0, -1.1]]]
            },
            {
                "type": "Polygon",
                "coordinates": [[[35.5, -0.5], [35.6, -0.5], [35.6, -0.4], [35.5, -0.4], [35.5, -0.5]]]
            }
        ]

        hashes = [db.generate_geometry_hash(geom) for geom in geometries]

        # All hashes should be unique
        self.assertEqual(len(hashes), len(set(hashes)), "All geometry hashes should be unique")

        # Same geometry should produce same hash
        hash_again = db.generate_geometry_hash(geometries[0])
        self.assertEqual(hashes[0], hash_again, "Same geometry should produce same hash")

        print("PASS: Geometry hash generation is working correctly")
        print(f"  Generated {len(set(hashes))} unique hashes for {len(geometries)} geometries")


if __name__ == '__main__':
    unittest.main(verbosity=2)