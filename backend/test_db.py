#!/usr/bin/env python3
"""Test database connection and tables."""

from models import db

def test_database():
    """Test database connection and tables."""
    print("Testing database connection...")

    if not db.client:
        print("❌ Database client not initialized")
        return

    print("✅ Database client initialized")

    # Test users table
    try:
        result = db.client.table('landcare_users').select('*').limit(1).execute()
        print("✅ Users table exists")
    except Exception as e:
        print(f"❌ Users table error: {str(e)}")

    # Test analyses table
    try:
        result = db.client.table('landcare_analyses').select('*').limit(1).execute()
        print("✅ Analyses table exists")
    except Exception as e:
        print(f"❌ Analyses table error: {str(e)}")

    # Test historical_data table
    try:
        result = db.client.table('landcare_historical_data').select('*').limit(1).execute()
        print("✅ Historical data table exists")
    except Exception as e:
        print(f"❌ Historical data table error: {str(e)}")

    # Test forecasts table
    try:
        result = db.client.table('landcare_forecasts').select('*').limit(1).execute()
        print("✅ Forecasts table exists")
    except Exception as e:
        print(f"❌ Forecasts table error: {str(e)}")

if __name__ == '__main__':
    test_database()
