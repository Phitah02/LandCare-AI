#!/usr/bin/env python3

import os
import sys

# Debug: print relevant env vars
print("DEBUG env var:", os.environ.get('DEBUG'))
print("SECRET_KEY env var:", os.environ.get('SECRET_KEY'))

# Ensure SECRET_KEY and DEBUG are not set for this test
if 'SECRET_KEY' in os.environ:
    del os.environ['SECRET_KEY']
if 'DEBUG' in os.environ:
    del os.environ['DEBUG']
    print("Deleted SECRET_KEY from env")

try:
    from config.settings import settings
    print("Settings instantiated successfully!")
    print(f"Secret key generated: {settings.secret_key}")
    print(f"Secret key length: {len(settings.secret_key)}")
    # Verify it's a hex string of 64 characters (32 bytes * 2)
    if len(settings.secret_key) == 64 and all(c in '0123456789abcdef' for c in settings.secret_key):
        print("Secret key is a valid 64-character hex string.")
    else:
        print("ERROR: Secret key format is invalid!")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: Failed to instantiate settings: {e}")
    sys.exit(1)

print("Test passed: Settings can be instantiated without SECRET_KEY environment variable.")