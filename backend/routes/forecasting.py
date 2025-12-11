import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from typing import Dict, Any

from models.schemas import VegetationForecastRequest, TaskStatusResponse
from auth.dependencies import get_current_user
from ndvi_forecast_ml import GEEForecaster
from gee_processor import initialize_gee
from models import db

router = APIRouter()

# Global task storage for background tasks
background_tasks_store: Dict[str, Dict[str, Any]] = {}


async def run_ml_forecast_background(task_id: str, geometry: Dict[str, Any], periods: list, user_id: str, use_fallback: bool = True):
    """Background task to train and forecast with GEEForecaster."""
    try:
        background_tasks_store[task_id] = {'status': 'processing', 'start_time': asyncio.get_event_loop().time()}

        # Initialize GEE if not already done
        if not initialize_gee():
            background_tasks_store[task_id] = {
                'status': 'failed',
                'error': 'Google Earth Engine initialization failed',
                'end_time': asyncio.get_event_loop().time()
            }
            return

        # Convert geometry to GEE format
        import ee
        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Use last 2 years of data for training
        import datetime
        end_date = datetime.datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.datetime.now() - datetime.timedelta(days=730)).strftime('%Y-%m-%d')

        # Initialize forecaster
        forecaster = GEEForecaster(roi, start_date, end_date)

        # Train models
        training_result = forecaster.train_models(include_validation=False, include_cv=False)
        if 'error' in training_result:
            background_tasks_store[task_id] = {
                'status': 'failed',
                'error': f'Model training failed: {training_result["error"]}',
                'end_time': asyncio.get_event_loop().time()
            }
            return

        # Make forecasts
        forecast_result = forecaster.forecast(periods)
        if 'error' in forecast_result:
            background_tasks_store[task_id] = {
                'status': 'failed',
                'error': f'Forecasting failed: {forecast_result["error"]}',
                'end_time': asyncio.get_event_loop().time()
            }
            return

        # Save forecast to database
        try:
            forecast_data = {
                **forecast_result,
                'method_used': 'ml',
                'fallback_used': False
            }
            db.save_forecast(user_id, geometry, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        # Store results
        background_tasks_store[task_id] = {
            'status': 'completed',
            'result': {
                **forecast_result,
                'method_used': 'ml',
                'fallback_used': False
            },
            'end_time': asyncio.get_event_loop().time()
        }

    except Exception as e:
        background_tasks_store[task_id] = {
            'status': 'failed',
            'error': str(e),
            'end_time': asyncio.get_event_loop().time()
        }


@router.post("/vegetation")
async def forecast_vegetation(
    request: VegetationForecastRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Start vegetation forecasting background task."""
    try:
        geometry = request.geometry.dict()
        periods = request.periods
        use_fallback = request.use_fallback

        # Validate periods
        if not isinstance(periods, list) or not periods:
            raise HTTPException(status_code=400, detail="Periods must be a non-empty list of integers")

        if any(p > 24 for p in periods):
            raise HTTPException(status_code=400, detail="Maximum forecast period is 24 months")

        # Generate unique task ID
        import time
        task_id = f"veg_forecast_{int(time.time())}_{hash(str(geometry)) % 10000}"
        user_id = current_user['user_id']

        # Start background task
        background_tasks.add_task(run_ml_forecast_background, task_id, geometry, periods, user_id, use_fallback)

        return {
            'task_id': task_id,
            'status': 'accepted',
            'message': 'Vegetation forecasting task started',
            'periods': periods,
            'fallback_enabled': use_fallback
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_forecast_status(
    task_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Check status of forecasting task."""
    if task_id not in background_tasks_store:
        raise HTTPException(status_code=404, detail="Task not found")

    task = background_tasks_store[task_id]
    response = {'task_id': task_id, 'status': task['status']}

    if task['status'] == 'completed':
        response['result'] = task['result']
    elif task['status'] == 'failed':
        response['error'] = task['error']

    if 'start_time' in task:
        response['start_time'] = task['start_time']
    if 'end_time' in task:
        response['end_time'] = task['end_time']
        response['duration'] = task['end_time'] - task['start_time']

    return response