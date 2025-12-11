import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import pandas as pd

from models.schemas import HistoricalVISRequest, HistoricalData
from auth.dependencies import get_current_user
from gee_processor import get_historical_ndvi, get_historical_evi, get_historical_savi, get_historical_vis
from weather_integration import get_historical_weather
from models import db

router = APIRouter()


async def get_historical_vis_background(geometry: Dict[str, Any], start_date: str, end_date: Optional[str]) -> Dict[str, Any]:
    """Run historical VIS data fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_historical_vis, geometry, start_date, end_date)
        return result


async def get_historical_evi_background(geometry: Dict[str, Any], years: int) -> Dict[str, Any]:
    """Run historical EVI data fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_historical_evi, geometry, years)
        return result


async def get_historical_savi_background(geometry: Dict[str, Any], years: int) -> Dict[str, Any]:
    """Run historical SAVI data fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_historical_savi, geometry, years)
        return result


async def get_historical_weather_background(lat: float, lon: float, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
    """Run historical weather data fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_historical_weather, lat, lon, start_date, end_date)
        return result


async def save_historical_background(user_id: str, geometry: Dict[str, Any], data: Dict[str, Any], data_type: str):
    """Background task to save historical data to database."""
    try:
        if data_type == 'vis':
            db.save_historical_ndvi(user_id, geometry, data)  # Reuse NDVI table for now
        elif data_type == 'weather':
            db.save_historical_weather(user_id, geometry.get('lat'), geometry.get('lon'), data)
    except Exception as e:
        print(f"Background historical save error: {e}")


@router.post("/vis", response_model=HistoricalData)
async def get_historical_vis_route(
    request: HistoricalVISRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get historical NDVI, EVI, SAVI data for a geometry with caching."""
    try:
        geometry = request.geometry.dict()
        start_date = request.start_date or '1984-01-01'
        end_date = request.end_date
        user_id = current_user['user_id']

        # Validate dates
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            if end_date:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            else:
                end = datetime.now()
            if start.year < 1984 or end.date() > datetime.now().date():
                raise HTTPException(status_code=400, detail="Date range must be between 1984 and present")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        date_range_key = f"{start_date}_{end_date or 'present'}"
        cache_key = f"{geometry_hash}_{date_range_key}"
        cached_data = db.get_cached_historical_data('vis', cache_key, years=1)

        if cached_data:
            # Return cached data
            return HistoricalData(
                **cached_data['data'],
                cached=True,
                cache_timestamp=cached_data['created_at'],
                metadata={
                    'source': 'Google Earth Engine',
                    'timestamp': cached_data['created_at'],
                    'spatial_extent': geometry,
                    'start_date': start_date,
                    'end_date': end_date,
                    'data_points': len(cached_data['data'].get('dates', []))
                }
            )

        # Compute new data
        historical_data = await get_historical_vis_background(geometry, start_date, end_date)

        if 'dates' in historical_data:
            historical_data['metadata'] = {
                'source': 'Google Earth Engine',
                'timestamp': pd.Timestamp.now().isoformat(),
                'spatial_extent': geometry,
                'start_date': start_date,
                'end_date': end_date,
                'data_points': len(historical_data['dates'])
            }

            # Calculate summary statistics for each index
            for index in ['ndvi_values', 'evi_values', 'savi_values']:
                if index in historical_data and historical_data[index]:
                    values = [v for v in historical_data[index] if v is not None]
                    if values:
                        historical_data[f'{index.split("_")[0]}_statistics'] = {
                            'mean': round(sum(values) / len(values), 4),
                            'median': round(sorted(values)[len(values)//2], 4),
                            'std_dev': round(pd.Series(values).std(), 4),
                            'min': round(min(values), 4),
                            'max': round(max(values), 4),
                            'trend': 'increasing' if values[-1] > values[0] else 'decreasing'
                        }
        else:
            historical_data = {
                'error': 'Failed to retrieve historical VI data',
                'dates': [],
                'ndvi_values': [],
                'evi_values': [],
                'savi_values': []
            }

        # Save to cache
        try:
            db.save_cached_historical_data('vis', cache_key, historical_data, years=1)
        except Exception as cache_error:
            print(f"Cache save error: {cache_error}")

        # Save to database
        try:
            db.save_historical_ndvi(user_id, geometry, historical_data)  # Reuse NDVI table for now
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return HistoricalData(**historical_data, cached=False)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evi")
async def get_historical_evi_route(
    geometry: Dict[str, Any],
    years: int = 10,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get historical EVI data for a geometry with caching."""
    try:
        user_id = current_user['user_id']

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cached_data = db.get_cached_historical_data('evi', geometry_hash, years=years)

        if cached_data:
            # Return cached data
            return {
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            }

        # Compute new data
        historical_data = await get_historical_evi_background(geometry, years)

        # Save to cache
        try:
            db.save_cached_historical_data('evi', geometry_hash, historical_data, years=years)
        except Exception as cache_error:
            print(f"Cache save error: {cache_error}")

        # Save to database
        try:
            db.save_historical_evi(user_id, geometry, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return {**historical_data, 'cached': False}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/savi")
async def get_historical_savi_route(
    geometry: Dict[str, Any],
    years: int = 10,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get historical SAVI data for a geometry with caching."""
    try:
        user_id = current_user['user_id']

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cached_data = db.get_cached_historical_data('savi', geometry_hash, years=years)

        if cached_data:
            # Return cached data
            return {
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            }

        # Compute new data
        historical_data = await get_historical_savi_background(geometry, years)

        # Save to cache
        try:
            db.save_cached_historical_data('savi', geometry_hash, historical_data, years=years)
        except Exception as cache_error:
            print(f"Cache save error: {cache_error}")

        # Save to database
        try:
            db.save_historical_savi(user_id, geometry, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return {**historical_data, 'cached': False}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weather/{lat}/{lon}")
async def get_historical_weather_route(
    lat: float,
    lon: float,
    start_date: str = Query(..., description="Start date in ISO format"),
    end_date: str = Query(None, description="End date in ISO format"),
    days: int = Query(None, description="Number of days backward from now"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get historical weather data for coordinates with caching."""
    try:
        user_id = current_user['user_id']

        if start_date and end_date:
            # Use date range
            try:
                start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SSZ)")

            # Validate date range
            if end <= start:
                raise HTTPException(status_code=400, detail="End date must be after start date")

            max_days = (end - start).days
            if max_days > 3650:
                raise HTTPException(status_code=400, detail="Maximum date range is 3650 days (10 years)")

        elif days:
            # Backward compatibility - use days
            days = int(days)
            if days > 3650:
                raise HTTPException(status_code=400, detail="Maximum 3650 days allowed")
            end = datetime.now()
            start = end - timedelta(days=days)
        else:
            # Default to 30 days
            end = datetime.now()
            start = end - timedelta(days=30)

        # Check cache first
        location_key = f"{lat}_{lon}"
        date_range_key = f"{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}"
        cache_key = f"{location_key}_{date_range_key}"
        cached_data = db.get_cached_historical_data('weather', cache_key, lat=lat, lon=lon, years=1)

        if cached_data:
            # Return cached data
            return {
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at'],
                'metadata': {
                    'source': 'Open-Meteo API',
                    'timestamp': cached_data['created_at'],
                    'location': {'lat': lat, 'lon': lon},
                    'start_date': start.isoformat(),
                    'end_date': end.isoformat(),
                    'period_days': (end - start).days
                }
            }

        # Compute new data - get historical data for the specified range
        historical_data = await get_historical_weather_background(lat, lon, start, end)

        if 'error' not in historical_data and 'data' in historical_data:
            # Process the data (already in daily format from get_historical_weather)
            weather_data = historical_data['data']

            # Ensure we have the required fields including humidity
            processed_data = []
            for entry in weather_data:
                processed_entry = {
                    'date': entry['date'],
                    'temperature': entry['temperature'],
                    'humidity': entry.get('humidity', entry.get('relative_humidity', 60)),  # Support both field names
                    'precipitation': entry['precipitation'],
                    'temp_min': entry.get('temp_min', entry['temperature'] - 2),
                    'temp_max': entry.get('temp_max', entry['temperature'] + 2)
                }
                processed_data.append(processed_entry)

            historical_data = {
                'data': processed_data,
                'metadata': {
                    'source': 'Open-Meteo API',
                    'timestamp': pd.Timestamp.now().isoformat(),
                    'location': {'lat': lat, 'lon': lon},
                    'start_date': start.isoformat(),
                    'end_date': end.isoformat(),
                    'period_days': (end - start).days,
                    'data_points': len(processed_data)
                }
            }

            # Calculate summary statistics
            if processed_data:
                temps = [day['temperature'] for day in processed_data]
                humidity = [day['humidity'] for day in processed_data]
                precip = [day['precipitation'] for day in processed_data]

                historical_data['statistics'] = {
                    'avg_temperature': round(sum(temps) / len(temps), 1),
                    'avg_humidity': round(sum(humidity) / len(humidity), 1),
                    'total_precipitation': round(sum(precip), 1),
                    'temp_range': f"{round(min(temps), 1)}°C - {round(max(temps), 1)}°C",
                    'humidity_range': f"{round(min(humidity), 1)}% - {round(max(humidity), 1)}%",
                    'precipitation_trend': 'increasing' if len(precip) > 1 and precip[-1] > precip[0] else 'decreasing'
                }
        else:
            historical_data = {
                'error': historical_data.get('error', 'Failed to retrieve historical weather data'),
                'data': []
            }

        # Save to cache
        try:
            db.save_cached_historical_data('weather', cache_key, historical_data, lat=lat, lon=lon, years=1)
        except Exception as cache_error:
            print(f"Cache save error: {cache_error}")

        # Save to database
        try:
            db.save_historical_weather(user_id, lat, lon, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return {**historical_data, 'cached': False}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))