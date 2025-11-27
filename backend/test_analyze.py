#!/usr/bin/env python3
"""
Test script to check what the analyze endpoint returns.
"""

from gee_processor import initialize_gee, get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data, calculate_risk_score
import json

# Test geometry
geometry = {
    "type": "Polygon",
    "coordinates": [[[36.8, -1.3], [36.9, -1.3], [36.9, -1.2], [36.8, -1.2], [36.8, -1.3]]]
}

print("Testing GEE initialization...")
gee_initialized = initialize_gee()
print(f"GEE initialization result: {gee_initialized}")

print("Testing GEE functions...")

# Test NDVI
print("Testing NDVI...")
ndvi_result = get_ndvi(geometry)
print(f"NDVI result: {ndvi_result}")

# Test EVI
print("Testing EVI...")
evi_result = get_evi(geometry)
print(f"EVI result: {evi_result}")

# Test SAVI
print("Testing SAVI...")
savi_result = get_savi(geometry)
print(f"SAVI result: {savi_result}")

# Test Land Cover
print("Testing Land Cover...")
land_cover_result = get_land_cover(geometry)
print(f"Land Cover result: {land_cover_result}")

# Test Slope
print("Testing Slope...")
slope_result = get_slope_data(geometry)
print(f"Slope result: {slope_result}")

# Test Risk Calculation
print("Testing Risk Calculation...")
risk_result = calculate_risk_score(ndvi_result, land_cover_result, slope_result, {})
print(f"Risk result: {risk_result}")

print("Test completed.")