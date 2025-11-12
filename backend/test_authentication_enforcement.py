#!/usr/bin/env python3
"""
Test script to verify authentication enforcement on all protected endpoints.
This tests that the @token_required decorator is properly applied to all necessary endpoints.
"""

import requests
import json
import sys

BASE_URL = 'http://localhost:5000'

# Test geometries
SAMPLE_GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[
        [36.8, -1.3],
        [36.9, -1.3],
        [36.9, -1.2],
        [36.8, -1.2],
        [36.8, -1.3]
    ]]
}

class TestAuthenticationEnforcement:
    def __init__(self):
        self.token = None
        self.user_id = None
        self.test_results = {
            'passed': [],
            'failed': []
        }

    def register_user(self):
        """Register a test user and get authentication token."""
        print("=" * 60)
        print("STEP 1: Registering test user...")
        print("=" * 60)
        
        data = {
            'email': f'test{int(__import__("time").time())}@example.com',
            'password': 'testPassword123',
            'confirmPassword': 'testPassword123'
        }

        response = requests.post(f'{BASE_URL}/auth/register', json=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 201:
            result = response.json()
            self.token = result.get('token')
            self.user_id = result.get('user', {}).get('id')
            print(f"✓ Registration successful")
            print(f"  Token: {self.token[:20]}...")
            print(f"  User ID: {self.user_id}")
            return True
        else:
            print(f"✗ Registration failed: {response.json()}")
            return False

    def test_endpoint_requires_auth(self, method, endpoint, data=None, description=""):
        """Test that an endpoint requires authentication."""
        print(f"\nTesting: {description}")
        print(f"  Endpoint: {method.upper()} {endpoint}")
        
        # Test 1: Without token
        print("  [1] Attempting request WITHOUT token...")
        if method.lower() == 'post':
            response = requests.post(f'{BASE_URL}{endpoint}', json=data or {})
        else:
            response = requests.get(f'{BASE_URL}{endpoint}')
        
        if response.status_code == 401:
            print(f"     ✓ Correctly rejected (401 Unauthorized)")
            self.test_results['passed'].append(f"{description} - no token")
        else:
            print(f"     ✗ ERROR: Got {response.status_code}, expected 401")
            print(f"       Response: {response.json()}")
            self.test_results['failed'].append(f"{description} - no token")
            return False

        # Test 2: With invalid token
        print("  [2] Attempting request with INVALID token...")
        headers = {'Authorization': 'Bearer invalid_token_12345'}
        if method.lower() == 'post':
            response = requests.post(f'{BASE_URL}{endpoint}', json=data or {}, headers=headers)
        else:
            response = requests.get(f'{BASE_URL}{endpoint}', headers=headers)
        
        if response.status_code == 401:
            print(f"     ✓ Correctly rejected (401 Unauthorized)")
            self.test_results['passed'].append(f"{description} - invalid token")
        else:
            print(f"     ✗ ERROR: Got {response.status_code}, expected 401")
            print(f"       Response: {response.json()}")
            self.test_results['failed'].append(f"{description} - invalid token")
            return False

        # Test 3: With valid token
        print("  [3] Attempting request with VALID token...")
        headers = {'Authorization': f'Bearer {self.token}'}
        if method.lower() == 'post':
            response = requests.post(f'{BASE_URL}{endpoint}', json=data or {}, headers=headers)
        else:
            response = requests.get(f'{BASE_URL}{endpoint}', headers=headers)
        
        if response.status_code != 401:
            print(f"     ✓ Request accepted (Status: {response.status_code})")
            self.test_results['passed'].append(f"{description} - valid token")
            return True
        else:
            print(f"     ✗ ERROR: Got {response.status_code}, should have been accepted")
            print(f"       Response: {response.json()}")
            self.test_results['failed'].append(f"{description} - valid token")
            return False

    def run_all_tests(self):
        """Run all authentication enforcement tests."""
        print("\n" + "=" * 60)
        print("AUTHENTICATION ENFORCEMENT TEST SUITE")
        print("=" * 60)

        # Register user first
        if not self.register_user():
            print("\n✗ Failed to register test user. Aborting tests.")
            return False

        print("\n" + "=" * 60)
        print("STEP 2: Testing Authentication Enforcement on Endpoints")
        print("=" * 60)

        # Test protected endpoints
        tests = [
            ('POST', '/analyze', {'geometry': SAMPLE_GEOMETRY, 'centroid': [-1.25, 36.85]}, 
             'POST /analyze - Analyze polygon'),
            
            ('POST', '/historical/ndvi', {'geometry': SAMPLE_GEOMETRY, 'years': 5},
             'POST /historical/ndvi - Get historical NDVI'),
            
            ('POST', '/historical/evi', {'geometry': SAMPLE_GEOMETRY, 'years': 5},
             'POST /historical/evi - Get historical EVI'),
            
            ('POST', '/historical/savi', {'geometry': SAMPLE_GEOMETRY, 'years': 5},
             'POST /historical/savi - Get historical SAVI'),
            
            ('GET', '/historical/weather/-1.25/36.85', None,
             'GET /historical/weather - Get historical weather'),
            
            ('POST', '/forecast/ndvi', {'geometry': SAMPLE_GEOMETRY, 'historical_ndvi': {'dates': [], 'values': []}, 'periods': 6},
             'POST /forecast/ndvi - Forecast NDVI'),
            
            ('GET', '/forecast/weather/-1.25/36.85', None,
             'GET /forecast/weather - Forecast weather'),
        ]

        for method, endpoint, data, description in tests:
            self.test_endpoint_requires_auth(method, endpoint, data, description)

        # Print summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"✓ Passed: {len(self.test_results['passed'])}")
        print(f"✗ Failed: {len(self.test_results['failed'])}")

        if self.test_results['passed']:
            print("\nPassed Tests:")
            for test in self.test_results['passed']:
                print(f"  ✓ {test}")

        if self.test_results['failed']:
            print("\nFailed Tests:")
            for test in self.test_results['failed']:
                print(f"  ✗ {test}")
            return False

        return True

def main():
    """Main test runner."""
    try:
        # Check if server is running
        print("Checking if backend server is running...")
        response = requests.get(f'{BASE_URL}/health', timeout=5)
        print(f"✓ Backend is running: {response.json()}\n")
    except requests.exceptions.ConnectionError:
        print("✗ ERROR: Cannot connect to backend server.")
        print("  Please ensure the Flask backend is running on http://localhost:5000")
        sys.exit(1)
    except Exception as e:
        print(f"✗ ERROR: {e}")
        sys.exit(1)

    # Run tests
    tester = TestAuthenticationEnforcement()
    success = tester.run_all_tests()

    if success:
        print("\n" + "=" * 60)
        print("✓ ALL TESTS PASSED - Authentication enforcement is working!")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("✗ SOME TESTS FAILED - Please check the failures above")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
