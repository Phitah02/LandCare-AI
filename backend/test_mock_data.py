#!/usr/bin/env python3
"""
Test to verify mock data fallback when GEE is not available.
"""

import ee
from gee_processor import get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data

# Test geometry
geometry = {
    "type": "Polygon",
    "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
}

print("Testing mock data fallback...")

# Temporarily disable GEE by resetting it
try:
    # This should cause GEE operations to fail
    ee.Reset()
    print("GEE reset - should now return mock data")
except:
    print("GEE reset failed or not initialized")

print("\nTesting data source indicators with GEE disabled...")

# Test NDVI
print("Testing NDVI mock data...")
try:
    ndvi_result = get_ndvi(geometry)
    data_source = ndvi_result.get('data_source', 'unknown')
    print(f"NDVI data_source: {data_source}")
    if 'mock' in data_source:
        print("✓ NDVI correctly returning mock data")
    else:
        print("✗ NDVI should return mock data but didn't")
except Exception as e:
    print(f"NDVI error: {e}")

# Test EVI
print("Testing EVI mock data...")
try:
    evi_result = get_evi(geometry)
    data_source = evi_result.get('data_source', 'unknown')
    print(f"EVI data_source: {data_source}")
    if 'mock' in data_source:
        print("✓ EVI correctly returning mock data")
    else:
        print("✗ EVI should return mock data but didn't")
except Exception as e:
    print(f"EVI error: {e}")

# Test SAVI
print("Testing SAVI mock data...")
try:
    savi_result = get_savi(geometry)
    data_source = savi_result.get('data_source', 'unknown')
    print(f"SAVI data_source: {data_source}")
    if 'mock' in data_source:
        print("✓ SAVI correctly returning mock data")
    else:
        print("✗ SAVI should return mock data but didn't")
except Exception as e:
    print(f"SAVI error: {e}")

# Test Land Cover
print("Testing Land Cover mock data...")
try:
    lc_result = get_land_cover(geometry)
    data_source = lc_result.get('data_source', 'unknown')
    print(f"Land Cover data_source: {data_source}")
    if 'mock' in data_source:
        print("✓ Land Cover correctly returning mock data")
    else:
        print("✗ Land Cover should return mock data but didn't")
except Exception as e:
    print(f"Land Cover error: {e}")

# Test Slope
print("Testing Slope mock data...")
try:
    slope_result = get_slope_data(geometry)
    data_source = slope_result.get('data_source', 'unknown')
    print(f"Slope data_source: {data_source}")
    if 'mock' in data_source:
        print("✓ Slope correctly returning mock data")
    else:
        print("✗ Slope should return mock data but didn't")
except Exception as e:
    print(f"Slope error: {e}")

print("\nMock data test completed.")