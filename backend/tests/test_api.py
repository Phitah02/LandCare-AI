import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_endpoint():
    """Test /health endpoint returns 200 status and healthy response."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "gee_initialized" in data


def test_analyze_without_auth():
    """Test /api/analyze endpoint returns 401 without authentication."""
    response = client.post("/api/analyze", json={
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        }
    })
    assert response.status_code == 401