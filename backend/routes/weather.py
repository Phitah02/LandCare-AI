import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import pandas as pd

from models.schemas import ForecastResponse, WeatherForecastRequest
from auth.dependencies import get_current_user
from weather_integration import get_weather_data, get_weather_forecast
from database import db

router = APIRouter()


async def get_weather_background(lat: float, lon: float) -> Dict[str, Any]:
    """Run weather data fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_weather_data, lat, lon)
        return result


async def get_forecast_background(lat: float, lon: float) -> Dict[str, Any]:
    """Run weather forecast fetching in thread pool."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        result = await loop.run_in_executor(executor, get_weather_forecast, lat, lon)
        return result


async def save_forecast_background(user_id: str, lat: float, lon: float, forecast_data: Dict[str, Any]):
    """Background task to save forecast results to database."""
    try:
        db.save_forecast(user_id, {'type': 'weather', 'lat': lat, 'lon': lon}, forecast_data)
    except Exception as e:
        print(f"Background forecast save error: {e}")


@router.get("/weather/{lat}/{lon}")
async def get_weather(lat: float, lon: float):
    """Get current weather for coordinates."""
    try:
        weather_data = await get_weather_background(lat, lon)
        return weather_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast/{lat}/{lon}", response_model=ForecastResponse)
async def get_weather_forecast_route(
    lat: float,
    lon: float,
    days: int = 5,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get weather forecast for coordinates."""
    try:
        if days > 16:
            raise HTTPException(status_code=400, detail="Maximum 16 days allowed")

        user_id = current_user['user_id']

        # Get forecast data
        forecast_data_raw = await get_forecast_background(lat, lon)

        if 'error' in forecast_data_raw:
            raise HTTPException(status_code=500, detail=f"Failed to get weather forecast: {forecast_data_raw['error']}")

        # Extract daily summaries from Open-Meteo forecast
        daily_summaries = forecast_data_raw.get('daily_summaries', {})

        if not daily_summaries:
            raise HTTPException(status_code=500, detail="No forecast data available")

        # Sort dates and extract data for the requested number of days
        sorted_dates = sorted(daily_summaries.keys())[:days]

        temperatures = []
        precipitations = []
        humidities = []

        for date in sorted_dates:
            day_data = daily_summaries[date]
            temperatures.append(day_data['avg_temp'])
            precipitations.append(day_data['total_precipitation'])
            humidities.append(day_data['avg_humidity'])

        # Create forecast data in the format expected by frontend with simple uncertainty bounds
        forecast_data = {
            'forecast_dates': sorted_dates,
            'temperature': {
                'values': temperatures,
                'upper_bound': [v + 2 for v in temperatures],  # Simple uncertainty bounds
                'lower_bound': [v - 2 for v in temperatures]
            },
            'precipitation': {
                'values': [max(0, v) for v in precipitations],
                'upper_bound': [max(0, v + 1) for v in precipitations],
                'lower_bound': [max(0, v - 0.5) for v in precipitations]
            },
            'humidity': {
                'values': humidities,
                'upper_bound': [min(100, v + 5) for v in humidities],
                'lower_bound': [max(0, v - 5) for v in humidities]
            },
            'metadata': {
                'model_version': 'Open-Meteo Built-in',
                'run_date': pd.Timestamp.now().isoformat(),
                'forecast_period_days': days,
                'location': {'lat': lat, 'lon': lon},
                'source': 'Open-Meteo Forecast API',
                'uncertainty_method': 'Simple bounds based on daily variance'
            }
        }

        # Save to database (using geometry as None for weather forecasts)
        try:
            db.save_forecast(user_id, {'type': 'weather', 'lat': lat, 'lon': lon}, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return ForecastResponse(**forecast_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))