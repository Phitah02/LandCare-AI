import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Dict, Any
import time
import json
from datetime import datetime, timedelta

from auth.dependencies import get_current_user
from forecasting import forecast_ndvi
from gee_processor import initialize_gee, get_historical_ndvi
from ndvi_forecast_ml import GEEForecaster
from database import db

router = APIRouter()

# Global task storage for background tasks
background_tasks_store: Dict[str, Dict[str, Any]] = {}


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Get status of background task."""
    if task_id not in background_tasks_store:
        raise HTTPException(status_code=404, detail="Task not found")

    task = background_tasks_store[task_id]
    response = {'task_id': task_id, 'status': task.get('status', 'unknown')}

    if task.get('status') == 'completed':
        response['result'] = task.get('result')
    elif task.get('status') == 'failed':
        response['error'] = task.get('error')

    if 'start_time' in task:
        response['start_time'] = task['start_time']
    if 'end_time' in task:
        response['end_time'] = task['end_time']
        response['duration'] = task['end_time'] - task['start_time']

    return response


@router.get("/history/{user_id}")
async def get_history(user_id: str):
    """Get user's analysis and forecast history."""
    try:
        data_type = request.args.get('type', 'all')  # analyses, historical, forecasts, all

        results = {}

        if data_type in ['analyses', 'all']:
            analyses = db.get_user_analyses(user_id)
            results['analyses'] = analyses.data if analyses else []

        if data_type in ['historical', 'all']:
            ndvi_history = db.get_historical_data(user_id, 'ndvi')
            weather_history = db.get_historical_data(user_id, 'weather')
            results['historical_ndvi'] = ndvi_history.data if ndvi_history else []
            results['historical_weather'] = weather_history.data if weather_history else []

        if data_type in ['forecasts', 'all']:
            forecasts = db.get_forecasts(user_id)
            results['forecasts'] = forecasts.data if forecasts else []

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forecast/compare")
async def compare_forecasts(
    geometry: Dict[str, Any],
    periods: list = [3, 6, 12],
    model_key: str = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Compare ML and statistical forecasting models."""
    try:
        if not geometry:
            raise HTTPException(status_code=400, detail="No geometry provided")

        if not isinstance(periods, list) or not all(isinstance(p, int) and p > 0 for p in periods):
            raise HTTPException(status_code=400, detail="Periods must be a list of positive integers")

        # Validate periods are reasonable (max 24 months)
        if any(p > 24 for p in periods):
            raise HTTPException(status_code=400, detail="Maximum forecast period is 24 months")

        user_id = current_user['user_id']

        # Get historical NDVI data for statistical forecasting
        try:
            historical_data = get_historical_ndvi(geometry, years=2)
            if 'error' in historical_data:
                raise HTTPException(status_code=500, detail=f"Failed to get historical data: {historical_data['error']}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to retrieve historical data: {str(e)}")

        # Prepare data for statistical forecasting
        historical_ndvi = {
            'dates': historical_data['dates'],
            'values': historical_data['ndvi_values']
        }

        # Generate statistical forecast
        statistical_forecast = forecast_ndvi(historical_ndvi, max(periods))

        # Try to get ML forecast
        ml_forecast = None
        ml_error = None

        if model_key:
            # Try to load specific model
            try:
                import os
                metadata_file = f"models/{model_key}_metadata.json"
                if os.path.exists(metadata_file):
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)

                    # Create forecaster with saved settings
                    import ee
                    roi = ee.Geometry.Polygon(geometry['coordinates'])
                    forecaster = GEEForecaster(
                        roi,
                        metadata['start_date'],
                        metadata['end_date'],
                        metadata.get('model_settings', {})
                    )

                    # Load and use the model
                    forecaster.load_models(f"models/{model_key}")
                    ml_forecast = forecaster.forecast(periods)
                else:
                    ml_error = f"Model {model_key} not found"
            except Exception as e:
                ml_error = f"Failed to load ML model: {str(e)}"
        else:
            # Try to create and use ML forecast on-the-fly (may be slow)
            try:
                import ee
                roi = ee.Geometry.Polygon(geometry['coordinates'])
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')

                forecaster = GEEForecaster(roi, start_date, end_date)
                training_result = forecaster.train_models(include_validation=False, include_cv=False)

                if 'error' not in training_result:
                    ml_forecast = forecaster.forecast(periods)
                else:
                    ml_error = f"ML training failed: {training_result['error']}"
            except Exception as e:
                ml_error = f"ML forecasting failed: {str(e)}"

        # Prepare comparison response
        comparison = {
            'periods': periods,
            'statistical_forecast': statistical_forecast if 'error' not in statistical_forecast else None,
            'ml_forecast': ml_forecast.get('forecasts') if ml_forecast and 'error' not in ml_forecast else None,
            'ml_error': ml_error,
            'comparison_metrics': {}
        }

        # Calculate comparison metrics if both forecasts are available
        if (comparison['statistical_forecast'] and 'error' not in comparison['statistical_forecast'] and
            comparison['ml_forecast']):

            # For simplicity, compare final period forecasts
            final_period = max(periods)
            stat_values = comparison['statistical_forecast'].get('forecast_values', [])
            ml_values = []
            for period_key, period_data in comparison['ml_forecast'].items():
                if period_data.get('period_months') == final_period:
                    ml_values.extend([
                        period_data.get('predicted_ndvi', 0),
                        period_data.get('predicted_savi', 0),
                        period_data.get('predicted_evi', 0)
                    ])

            if stat_values and ml_values:
                # Calculate simple metrics (ML vs Statistical for final period)
                stat_avg = sum(stat_values) / len(stat_values) if stat_values else 0
                ml_avg = sum(ml_values) / len(ml_values) if ml_values else 0

                comparison['comparison_metrics'] = {
                    'final_period_months': final_period,
                    'statistical_avg': round(stat_avg, 4),
                    'ml_avg': round(ml_avg, 4),
                    'difference': round(ml_avg - stat_avg, 4),
                    'ml_improvement_pct': round(((ml_avg - stat_avg) / abs(stat_avg)) * 100, 2) if stat_avg != 0 else 0
                }

        return comparison

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))