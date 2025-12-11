import asyncio
import math
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, BackgroundTasks
from typing import Dict, Any

from models.schemas import AnalysisRequest, AnalysisResponse
from auth.dependencies import get_current_user
from gee_processor import get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data, calculate_risk_score
from weather_integration import get_weather_data
from database import db

router = APIRouter()


def calculate_polygon_area(coordinates: list) -> float:
    """Calculate the area of a polygon using the shoelace formula."""
    if not coordinates or len(coordinates) < 3:
        return 0

    # Convert coordinates to a list of (lon, lat) tuples
    points = [(coord[0], coord[1]) for coord in coordinates]

    # Close the polygon by adding the first point at the end
    if points[0] != points[-1]:
        points.append(points[0])

    # Shoelace formula
    area = 0
    for i in range(len(points) - 1):
        lon1, lat1 = points[i]
        lon2, lat2 = points[i + 1]
        area += (lon2 - lon1) * (lat2 + lat1)

    area = abs(area) / 2

    # Convert to square meters (approximate for small areas)
    # Using a simple approximation: 1 degree ≈ 111,000 meters
    # More accurate would be to use proper geodesic calculations
    area_sq_meters = area * (111000 ** 2) * math.cos(math.radians(sum(lat for _, lat in points[:-1]) / len(points[:-1])))

    return abs(area_sq_meters)


async def run_gee_operation(operation_func, geometry: Dict[str, Any]) -> Dict[str, Any]:
    """Run a GEE operation in a thread pool to avoid blocking."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, operation_func, geometry)
        return result


async def run_weather_operation(lat: float, lon: float) -> Dict[str, Any]:
    """Run weather data fetching in a thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_weather_data, lat, lon)
        return result


async def save_analysis_background(user_id: str, geometry: Dict[str, Any], results: Dict[str, Any]):
    """Background task to save analysis results to database."""
    try:
        db.save_analysis(user_id, geometry, results)
    except Exception as e:
        print(f"Background save error: {e}")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Analyze polygon for vegetation indices, land cover, and risk assessment."""
    try:
        geometry = request.geometry.dict()
        centroid = request.centroid

        results = {}

        # Run GEE operations concurrently
        gee_tasks = [
            run_gee_operation(get_ndvi, geometry),
            run_gee_operation(get_evi, geometry),
            run_gee_operation(get_savi, geometry),
            run_gee_operation(get_land_cover, geometry),
            run_gee_operation(get_slope_data, geometry)
        ]

        # Gather all GEE results
        ndvi_result, evi_result, savi_result, land_cover_result, slope_result = await asyncio.gather(*gee_tasks)

        results['ndvi'] = ndvi_result
        results['evi'] = evi_result
        results['savi'] = savi_result
        results['land_cover'] = land_cover_result
        results['slope'] = slope_result

        # Get weather data asynchronously if centroid provided
        if centroid:
            weather_result = await run_weather_operation(centroid.lat, centroid.lon)
            results['weather'] = weather_result

        # Calculate polygon area synchronously
        if geometry and 'coordinates' in geometry:
            try:
                area_sq_meters = calculate_polygon_area(geometry['coordinates'][0])
                area_hectares = area_sq_meters / 10000  # Convert to hectares
                results['area_hectares'] = round(area_hectares, 2)
            except Exception as area_error:
                print(f"Area calculation error: {area_error}")
                results['area_hectares'] = None

        # Calculate comprehensive risk score synchronously
        if 'ndvi' in results and 'land_cover' in results:
            risk_assessment = calculate_risk_score(
                results.get('ndvi', {}),
                results.get('land_cover', {}),
                results.get('slope', {}),
                results.get('weather', {}),
                results.get('evi', {}),
                results.get('savi', {})
            )
            results['risk_assessment'] = risk_assessment

        # Save analysis to database via background task
        user_id = current_user['user_id']
        background_tasks.add_task(save_analysis_background, user_id, geometry, results)

        return AnalysisResponse(**results)

    except Exception as e:
        return AnalysisResponse(error=str(e))