#!/usr/bin/env python3
"""
Test script to test API endpoints with proper authentication.
Creates a test user, obtains JWT token, tests /analyze endpoint,
and compares results with direct function calls.
"""

import requests
import json
import time
from gee_processor import initialize_gee, get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data, calculate_risk_score
from weather_integration import get_weather_data

# Configuration
BASE_URL = "http://localhost:5000"
TEST_EMAIL = f"test_{int(time.time())}@example.com"  # Unique email
TEST_PASSWORD = "testpass123"

# Sample geometry (Nairobi area)
SAMPLE_GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
}

SAMPLE_CENTROID = [-1.25, 36.85]  # [lat, lon]

def create_test_user():
    """Create a test user via the API."""
    print("Creating test user...")
    url = f"{BASE_URL}/auth/register"
    data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }

    try:
        response = requests.post(url, json=data, headers={'Content-Type': 'application/json'})
        print(f"Register response status: {response.status_code}")
        print(f"Register response: {response.json()}")

        if response.status_code == 201:
            return response.json().get('token')
        elif response.status_code == 409:
            print("User already exists, proceeding to login...")
            return None
        else:
            print(f"Failed to create user: {response.text}")
            return None
    except Exception as e:
        print(f"Error creating user: {e}")
        return None

def login_test_user():
    """Login to get JWT token."""
    print("Logging in test user...")
    url = f"{BASE_URL}/auth/login"
    data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }

    try:
        response = requests.post(url, json=data, headers={'Content-Type': 'application/json'})
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.json()}")

        if response.status_code == 200:
            return response.json().get('token')
        else:
            print(f"Failed to login: {response.text}")
            return None
    except Exception as e:
        print(f"Error logging in: {e}")
        return None

def test_analyze_endpoint(token):
    """Test the /analyze endpoint with authentication."""
    print("Testing /analyze endpoint...")
    url = f"{BASE_URL}/analyze"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    data = {
        "geometry": SAMPLE_GEOMETRY,
        "centroid": SAMPLE_CENTROID
    }

    try:
        response = requests.post(url, json=data, headers=headers)
        print(f"Analyze response status: {response.status_code}")

        if response.status_code == 200:
            api_result = response.json()
            print("API analyze result keys:", list(api_result.keys()))
            return api_result
        else:
            print(f"Failed to analyze: {response.text}")
            return None
    except Exception as e:
        print(f"Error testing analyze endpoint: {e}")
        return None

def get_direct_function_results():
    """Get results from direct function calls."""
    print("Getting direct function results...")

    results = {}

    # Initialize GEE
    gee_initialized = initialize_gee()
    print(f"GEE initialized: {gee_initialized}")

    if gee_initialized:
        # Get vegetation indices
        results['ndvi'] = get_ndvi(SAMPLE_GEOMETRY)
        results['evi'] = get_evi(SAMPLE_GEOMETRY)
        results['savi'] = get_savi(SAMPLE_GEOMETRY)
        results['land_cover'] = get_land_cover(SAMPLE_GEOMETRY)
        results['slope'] = get_slope_data(SAMPLE_GEOMETRY)
    else:
        print("GEE not initialized, using mock data")
        results['ndvi'] = {'NDVI': 0.65, 'note': 'Mock data'}
        results['evi'] = {'EVI': 0.45, 'note': 'Mock data'}
        results['savi'] = {'SAVI': 0.55, 'note': 'Mock data'}
        results['land_cover'] = {'Map': {'10': 1250, '20': 850}, 'note': 'Mock data'}
        results['slope'] = {'slope_mean': 15.2, 'note': 'Mock data'}

    # Get weather data
    try:
        results['weather'] = get_weather_data(SAMPLE_CENTROID[0], SAMPLE_CENTROID[1])
    except Exception as e:
        print(f"Error getting weather data: {e}")
        results['weather'] = {'error': str(e)}

    # Calculate risk score
    if 'ndvi' in results and 'land_cover' in results:
        results['risk_assessment'] = calculate_risk_score(
            results.get('ndvi', {}),
            results.get('land_cover', {}),
            results.get('slope', {}),
            results.get('weather', {}),
            results.get('evi', {}),
            results.get('savi', {})
        )

    return results

def compare_results(api_result, direct_result):
    """Compare API results with direct function calls."""
    print("\n" + "="*50)
    print("COMPARING API RESULTS WITH DIRECT FUNCTION CALLS")
    print("="*50)

    # Check if both have the same keys
    api_keys = set(api_result.keys())
    direct_keys = set(direct_result.keys())

    print(f"API result keys: {sorted(api_keys)}")
    print(f"Direct result keys: {sorted(direct_keys)}")

    if api_keys == direct_keys:
        print("[OK] Keys match between API and direct calls")
    else:
        print("[FAIL] Keys differ between API and direct calls")
        print(f"  API only: {api_keys - direct_keys}")
        print(f"  Direct only: {direct_keys - api_keys}")

    # Compare specific values
    comparisons = []

    # NDVI comparison
    if 'ndvi' in api_result and 'ndvi' in direct_result:
        api_ndvi = api_result['ndvi'].get('NDVI') if isinstance(api_result['ndvi'], dict) else api_result['ndvi']
        direct_ndvi = direct_result['ndvi'].get('NDVI') if isinstance(direct_result['ndvi'], dict) else direct_result['ndvi']

        if api_ndvi is not None and direct_ndvi is not None:
            diff = abs(api_ndvi - direct_ndvi)
            comparisons.append(('NDVI', api_ndvi, direct_ndvi, diff, diff < 0.01))
        else:
            comparisons.append(('NDVI', api_ndvi, direct_ndvi, None, api_ndvi == direct_ndvi))

    # EVI comparison
    if 'evi' in api_result and 'evi' in direct_result:
        api_evi = api_result['evi'].get('EVI') if isinstance(api_result['evi'], dict) else api_result['evi']
        direct_evi = direct_result['evi'].get('EVI') if isinstance(direct_result['evi'], dict) else direct_result['evi']

        if api_evi is not None and direct_evi is not None:
            diff = abs(api_evi - direct_evi)
            comparisons.append(('EVI', api_evi, direct_evi, diff, diff < 0.01))
        else:
            comparisons.append(('EVI', api_evi, direct_evi, None, api_evi == direct_evi))

    # SAVI comparison
    if 'savi' in api_result and 'savi' in direct_result:
        api_savi = api_result['savi'].get('SAVI') if isinstance(api_result['savi'], dict) else api_result['savi']
        direct_savi = direct_result['savi'].get('SAVI') if isinstance(direct_result['savi'], dict) else direct_result['savi']

        if api_savi is not None and direct_savi is not None:
            diff = abs(api_savi - direct_savi)
            comparisons.append(('SAVI', api_savi, direct_savi, diff, diff < 0.01))
        else:
            comparisons.append(('SAVI', api_savi, direct_savi, None, api_savi == direct_savi))

    # Print comparison table
    print("\nValue Comparisons:")
    print("-" * 70)
    print(f"{'Index':<8} {'API':<12} {'Direct':<12} {'Diff':<12} {'Match':<8}")
    print("-" * 70)

    for index, api_val, direct_val, diff, match in comparisons:
        api_str = f"{api_val:.4f}" if isinstance(api_val, (int, float)) else str(api_val)
        direct_str = f"{direct_val:.4f}" if isinstance(direct_val, (int, float)) else str(direct_val)
        diff_str = f"{diff:.4f}" if diff is not None else "N/A"
        match_str = "OK" if match else "FAIL"
        print(f"{index:<8} {api_str:<12} {direct_str:<12} {diff_str:<12} {match_str:<8}")

    # Check for mock data indicators
    api_has_mock = any('mock' in str(v).lower() or 'note' in str(v).lower() for v in api_result.values())
    direct_has_mock = any('mock' in str(v).lower() or 'note' in str(v).lower() for v in direct_result.values())

    print(f"\nMock data indicators:")
    print(f"  API result has mock data: {'Yes' if api_has_mock else 'No'}")
    print(f"  Direct result has mock data: {'Yes' if direct_has_mock else 'No'}")

    if not api_has_mock and not direct_has_mock:
        print("[OK] Both API and direct calls appear to return real satellite data")
    else:
        print("[WARN] Some results may contain mock data")

    return all(comp[4] for comp in comparisons if comp[4] is not None)

def main():
    """Main test function."""
    print("Starting API authentication and analysis test...")
    print("=" * 60)

    # Step 1: Create test user
    token = create_test_user()
    if not token:
        # Try to login if user creation failed (user might already exist)
        token = login_test_user()

    if not token:
        print("Failed to get authentication token. Exiting.")
        return False

    print(f"[OK] Got authentication token: {token[:20]}...")

    # Step 2: Test analyze endpoint
    api_result = test_analyze_endpoint(token)
    if not api_result:
        print("Failed to get API results. Exiting.")
        return False

    # Step 3: Get direct function results
    direct_result = get_direct_function_results()

    # Step 4: Compare results
    results_match = compare_results(api_result, direct_result)

    print("\n" + "="*50)
    if results_match:
        print("[PASS] TEST PASSED: API results match direct function calls")
    else:
        print("[FAIL] TEST FAILED: API results differ from direct function calls")
    print("="*50)

    return results_match

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)