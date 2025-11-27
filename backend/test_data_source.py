#!/usr/bin/env python3
"""
Simple test to check data source indicators in GEE functions.
"""

from gee_processor import initialize_gee, get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data

# Test geometry
geometry = {
    "type": "Polygon",
    "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
}

print("Testing GEE initialization...")
gee_initialized = initialize_gee()
print(f"GEE initialization result: {gee_initialized}")

print("\nTesting data source indicators...")

# Test NDVI
print("Testing NDVI data source...")
try:
    ndvi_result = get_ndvi(geometry)
    data_source = ndvi_result.get('data_source', 'unknown')
    print(f"NDVI data_source: {data_source}")
    if 'satellite' in data_source:
        print("✓ NDVI returning real satellite data")
    elif 'mock' in data_source:
        print("⚠ NDVI returning mock data")
    else:
        print("? NDVI data source unclear")
except Exception as e:
    print(f"NDVI error: {e}")

# Test EVI
print("Testing EVI data source...")
try:
    evi_result = get_evi(geometry)
    data_source = evi_result.get('data_source', 'unknown')
    print(f"EVI data_source: {data_source}")
    if 'satellite' in data_source:
        print("✓ EVI returning real satellite data")
    elif 'mock' in data_source:
        print("⚠ EVI returning mock data")
    else:
        print("? EVI data source unclear")
except Exception as e:
    print(f"EVI error: {e}")

# Test SAVI
print("Testing SAVI data source...")
try:
    savi_result = get_savi(geometry)
    data_source = savi_result.get('data_source', 'unknown')
    print(f"SAVI data_source: {data_source}")
    if 'satellite' in data_source:
        print("✓ SAVI returning real satellite data")
    elif 'mock' in data_source:
        print("⚠ SAVI returning mock data")
    else:
        print("? SAVI data source unclear")
except Exception as e:
    print(f"SAVI error: {e}")

# Test Land Cover
print("Testing Land Cover data source...")
try:
    lc_result = get_land_cover(geometry)
    data_source = lc_result.get('data_source', 'unknown')
    print(f"Land Cover data_source: {data_source}")
    if 'satellite' in data_source:
        print("✓ Land Cover returning real satellite data")
    elif 'mock' in data_source:
        print("⚠ Land Cover returning mock data")
    else:
        print("? Land Cover data source unclear")
except Exception as e:
    print(f"Land Cover error: {e}")

# Test Slope
print("Testing Slope data source...")
try:
    slope_result = get_slope_data(geometry)
    data_source = slope_result.get('data_source', 'unknown')
    print(f"Slope data_source: {data_source}")
    if 'satellite' in data_source:
        print("✓ Slope returning real satellite data")
    elif 'mock' in data_source:
        print("⚠ Slope returning mock data")
    else:
        print("? Slope data source unclear")
except Exception as e:
    print(f"Slope error: {e}")

print("\nData source test completed.")