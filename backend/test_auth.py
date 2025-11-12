#!/usr/bin/env python3
"""Test script for authentication endpoints."""

import requests
import json

BASE_URL = 'http://localhost:5000'

def test_register():
    """Test user registration."""
    print("Testing user registration...")
    data = {
        'email': 'test@example.com',
        'password': 'password123',
        'confirmPassword': 'password123'
    }

    response = requests.post(f'{BASE_URL}/auth/register', json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 201:
        return response.json().get('token')
    return None

def test_login():
    """Test user login."""
    print("\nTesting user login...")
    data = {
        'email': 'test@example.com',
        'password': 'password123'
    }

    response = requests.post(f'{BASE_URL}/auth/login', json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 200:
        return response.json().get('token')
    return None

def test_get_me(token):
    """Test getting current user info."""
    print("\nTesting get current user...")
    headers = {'Authorization': f'Bearer {token}'}

    response = requests.get(f'{BASE_URL}/auth/me', headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

def test_invalid_login():
    """Test invalid login."""
    print("\nTesting invalid login...")
    data = {
        'email': 'test@example.com',
        'password': 'wrongpassword'
    }

    response = requests.post(f'{BASE_URL}/auth/login', json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

if __name__ == '__main__':
    # Test registration
    token = test_register()

    if token:
        # Test login
        login_token = test_login()

        if login_token:
            # Test get me
            test_get_me(login_token)

    # Test invalid login
    test_invalid_login()

    print("\nAuth tests completed!")
