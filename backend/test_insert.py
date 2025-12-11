#!/usr/bin/env python3
"""Test database insert."""

from database import db
import json

def test_insert():
    """Test inserting data."""
    print("Testing insert...")

    data = {
        'user_id': 'test_user',
        'geometry': json.dumps({'type': 'Polygon', 'coordinates': [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}),
        'ndvi': 0.5,
        'evi': 0.4,
        'savi': 0.3,
        'land_cover': json.dumps({'type': 'grass'}),
        'weather': json.dumps({'temp': 25}),
        'created_at': '2023-01-01T00:00:00'
    }

    try:
        result = db.client.table('landcare_analyses').insert(data).execute()
        print('Insert result:', result)
    except Exception as e:
        print(f"Insert error: {e}")

if __name__ == '__main__':
    test_insert()
