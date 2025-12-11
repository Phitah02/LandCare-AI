import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List
import os
import json
import time
from datetime import datetime, timedelta

from auth.dependencies import get_current_user
from gee_processor import initialize_gee
from ndvi_forecast_ml import GEEForecaster
from database import db

router = APIRouter()


async def run_model_training_background(task_id: str, geometry: Dict[str, Any], user_id: str, settings: Dict[str, Any]):
    """Background task to train ML models for a specific ROI."""
    try:
        # Initialize GEE if not already done
        if not initialize_gee():
            raise Exception('Google Earth Engine initialization failed')

        # Convert geometry to GEE format
        import ee
        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Initialize GEEForecaster
        # Use last 2 years of data for training
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')

        forecaster = GEEForecaster(roi, start_date, end_date, settings)

        # Train models
        training_result = forecaster.train_models()
        if 'error' in training_result:
            raise Exception(f"Model training failed: {training_result['error']}")

        # Save trained model metadata
        geometry_hash = db.generate_geometry_hash(geometry)
        model_key = f"gee_forecaster_{geometry_hash}_{int(time.time())}"
        forecaster.save_models(f"models/{model_key}")

        # Store training results
        result = {
            'model_key': model_key,
            'training_result': training_result,
            'geometry_hash': geometry_hash,
            'created_at': datetime.now().isoformat(),
            'model_settings': settings
        }

        # Save to database or file system
        # For now, just return the result

    except Exception as e:
        result = {
            'error': str(e),
            'created_at': datetime.now().isoformat()
        }

    # Store results in a global dict for retrieval
    global background_tasks_store
    if 'background_tasks_store' not in globals():
        background_tasks_store = {}
    background_tasks_store[task_id] = result


@router.get("/list")
async def list_models(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List available trained models."""
    try:
        models_dir = 'models'
        if not os.path.exists(models_dir):
            return {'models': []}

        # Find all model metadata files
        model_files = [f for f in os.listdir(models_dir) if f.endswith('_metadata.json')]

        models = []
        for model_file in model_files:
            try:
                with open(os.path.join(models_dir, model_file), 'r') as f:
                    metadata = json.load(f)

                # Extract model key from filename
                model_key = model_file.replace('_metadata.json', '')

                models.append({
                    'model_key': model_key,
                    'created_at': metadata.get('saved_at'),
                    'training_samples': metadata.get('training_samples_count', 0),
                    'testing_samples': metadata.get('testing_samples_count', 0),
                    'model_settings': metadata.get('model_settings', {}),
                    'date_range': {
                        'start_date': metadata.get('start_date'),
                        'end_date': metadata.get('end_date')
                    },
                    'roi_bounds': metadata.get('roi_bounds')
                })
            except Exception as e:
                print(f"Error reading model file {model_file}: {e}")
                continue

        # Sort by creation date (newest first)
        models.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        return {'models': models}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train")
async def train_model(
    geometry: Dict[str, Any],
    model_settings: Dict[str, Any] = None,
    background_tasks: BackgroundTasks = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Train new models for a specific ROI."""
    try:
        if not geometry:
            raise HTTPException(status_code=400, detail="No geometry provided")

        # Validate model settings
        valid_settings = ['numberOfTrees', 'maxNodes', 'test_size']
        settings = {}
        if model_settings:
            for key in model_settings:
                if key not in valid_settings:
                    raise HTTPException(status_code=400, detail=f"Invalid model setting: {key}")
            settings = model_settings

        # Set defaults and validate ranges
        settings = {
            'numberOfTrees': min(max(settings.get('numberOfTrees', 100), 10), 500),
            'maxNodes': min(max(settings.get('maxNodes', 10), 5), 50),
            'test_size': min(max(settings.get('test_size', 0.3), 0.1), 0.5)
        }

        # Generate unique task ID
        task_id = f"model_train_{int(time.time())}_{hash(str(geometry)) % 10000}"
        user_id = current_user['user_id']

        # Start async training task
        background_tasks.add_task(run_model_training_background, task_id, geometry, user_id, settings)

        return {
            'task_id': task_id,
            'status': 'accepted',
            'message': 'Model training task started',
            'model_settings': settings
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))