import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import requests
from datetime import datetime

from models.schemas import GeocodeRequest, GeocodeResponse, HealthResponse
from auth.dependencies import get_current_user
from gee_processor import initialize_gee
from models import db

router = APIRouter()


async def geocode_background(place_name: str) -> Dict[str, Any]:
    """Run geocoding in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, perform_geocode, place_name)
        return result


def perform_geocode(place_name: str) -> Dict[str, Any]:
    """Perform geocoding using Nominatim."""
    # Use Nominatim (OpenStreetMap) geocoding service
    url = 'https://nominatim.openstreetmap.org/search'
    params = {
        'q': place_name,
        'format': 'json',
        'limit': 1,
        'addressdetails': 1
    }
    headers = {
        'User-Agent': 'LandCare-AI/1.0'
    }

    response = requests.get(url, params=params, headers=headers, timeout=10)

    if response.status_code == 200:
        results = response.json()
        if results:
            result = results[0]
            return {
                'lat': float(result['lat']),
                'lon': float(result['lon']),
                'display_name': result['display_name'],
                'boundingbox': result['boundingbox']
            }
        else:
            raise Exception('Location not found')
    else:
        raise Exception('Geocoding service unavailable')


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    try:
        return HealthResponse(
            status="healthy",
            gee_initialized=initialize_gee()
        )
    except Exception as e:
        # Log detailed error information
        import logging
        logging.error(f"Health check error: {e}", exc_info=True)
        try:
            return HealthResponse(
                status="error",
                gee_initialized=False
            )
        except Exception:
            # Fallback to ensure valid JSON response
            return {"status": "error", "gee_initialized": False}


@router.post("/geocode", response_model=GeocodeResponse)
async def geocode(request: GeocodeRequest):
    """Geocode a place name to coordinates."""
    try:
        if not request.place_name:
            raise HTTPException(status_code=400, detail="No place name provided")

        result = await geocode_background(request.place_name)
        return GeocodeResponse(**result)

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Clear expired cache entries."""
    try:
        result = db.clear_expired_cache()
        return {"success": result, "message": "Cache cleanup completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))