#!/usr/bin/env python3
"""
Test script to check GEE initialization specifically.
"""

from gee_processor import initialize_gee

print("Testing GEE initialization...")

success = initialize_gee()

if success:
    print("GEE initialization successful!")
else:
    print("GEE initialization failed!")

print("Test completed.")