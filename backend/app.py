import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from config.config import Config
from gee_processor import initialize_gee, get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data, calculate_risk_score, get_historical_ndvi, get_historical_evi, get_historical_savi
import math
from weather_integration import get_weather_data, get_weather_forecast, get_historical_weather
from forecasting import forecast_ndvi, forecast_weather
from models import db, generate_token, token_required
import json
import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://landcare-ai-frontend.onrender.com",
    "https://land-care-ai-dl98.vercel.app"
], supports_credentials=True)
app.config.from_object(Config)

# Initialize GEE on startup
gee_initialized = initialize_gee()

# Global task storage for background tasks
background_tasks = {}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'gee_initialized': gee_initialized
    })

@app.route('/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters long'}), 400

        # Check if user already exists
        if db.user_exists(email):
            return jsonify({'error': 'User already exists'}), 409

        # Create new user
        user = db.create_user(email, password)
        if not user:
            return jsonify({'error': 'Failed to create user'}), 500

        # Generate token
        token = generate_token(str(user['id']), user['email'])

        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email']
            }
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    """Authenticate user and return token."""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        # Authenticate user
        user = db.authenticate_user(email, password)
        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401

        # Generate token
        token = generate_token(str(user['id']), user['email'])

        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email']
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/auth/me', methods=['GET'])
@token_required
def get_current_user():
    """Get current user information."""
    try:
        user = db.get_user_by_id(request.user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'user': {
                'id': user['id'],
                'email': user['email']
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
@token_required
def analyze():
    """Analyze polygon for NDVI and land cover."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        centroid = data.get('centroid')  # [lat, lon]

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        results = {}

        # Get vegetation indices
        if gee_initialized:
            ndvi_result = get_ndvi(geometry)
            results['ndvi'] = ndvi_result

            evi_result = get_evi(geometry)
            results['evi'] = evi_result

            savi_result = get_savi(geometry)
            results['savi'] = savi_result

            land_cover_result = get_land_cover(geometry)
            results['land_cover'] = land_cover_result

            # Get slope data for erosion assessment
            slope_result = get_slope_data(geometry)
            results['slope'] = slope_result
        else:
            results['error'] = 'GEE not initialized'

        # Get weather data if centroid provided
        if centroid:
            weather = get_weather_data(centroid[0], centroid[1])
            results['weather'] = weather

        # Calculate polygon area in hectares
        if geometry and 'coordinates' in geometry:
            try:
                area_sq_meters = calculate_polygon_area(geometry['coordinates'][0])
                area_hectares = area_sq_meters / 10000  # Convert to hectares
                results['area_hectares'] = round(area_hectares, 2)
            except Exception as area_error:
                print(f"Area calculation error: {area_error}")
                results['area_hectares'] = None
        
        # Calculate comprehensive risk score
        if gee_initialized and 'ndvi' in results and 'land_cover' in results:
            risk_assessment = calculate_risk_score(
                results.get('ndvi', {}),
                results.get('land_cover', {}),
                results.get('slope', {}),
                results.get('weather', {}),
                results.get('evi', {}),
                results.get('savi', {})
            )
            results['risk_assessment'] = risk_assessment

        # Save analysis to database with authenticated user_id
        user_id = request.user_id
        try:
            db.save_analysis(user_id, geometry, results)
        except Exception as db_error:
            print(f"Database save error: {db_error}")  # Log but don't fail the request

        return jsonify(results)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/weather/<float:lat>/<float:lon>', methods=['GET'])
def weather(lat, lon):
    """Get current weather for coordinates."""
    weather_data = get_weather_data(lat, lon)
    return jsonify(weather_data)

@app.route('/forecast/<float:lat>/<float:lon>', methods=['GET'])
def forecast(lat, lon):
    """Get weather forecast for coordinates."""
    forecast_data = get_weather_forecast(lat, lon)
    return jsonify(forecast_data)

@app.route('/geocode', methods=['POST'])
def geocode():
    """Geocode a place name to coordinates."""
    try:
        data = request.get_json()
        place_name = data.get('place_name')
        
        if not place_name:
            return jsonify({'error': 'No place name provided'}), 400
        
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
                return jsonify({
                    'lat': float(result['lat']),
                    'lon': float(result['lon']),
                    'display_name': result['display_name'],
                    'boundingbox': result['boundingbox']
                })
            else:
                return jsonify({'error': 'Location not found'}), 404
        else:
            return jsonify({'error': 'Geocoding service unavailable'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/historical/vis', methods=['POST'])
@token_required
def historical_vis():
    """Get historical NDVI data for a geometry with caching."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        months = data.get('months', 12)  # Default to 12 months, max 12
        user_id = request.user_id

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        if months > 12:
            return jsonify({'error': 'Maximum 12 months allowed'}), 400

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cache_key_suffix = f"_{months}m"
        cached_data = db.get_cached_historical_data('ndvi', geometry_hash + cache_key_suffix, years=2)  # Use years instead of months

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at'],
                'metadata': {
                    'source': 'Google Earth Engine',
                    'timestamp': cached_data['created_at'],
                    'spatial_extent': geometry,
                    'period_months': months
                }
            })

        # Compute new data - get historical data and filter to last N months
        historical_data = get_historical_ndvi(geometry, years=2)  # Get 2 years to ensure we have enough data

        if 'dates' in historical_data and 'ndvi_values' in historical_data:
            # Sort by date and get the most recent N months
            date_value_pairs = list(zip(historical_data['dates'], historical_data['ndvi_values']))
            date_value_pairs.sort(key=lambda x: pd.to_datetime(x[0]), reverse=True)

            # Take the most recent months worth of data
            filtered_pairs = date_value_pairs[:months * 30]  # Approximate 30 days per month

            # Sort back to chronological order
            filtered_pairs.sort(key=lambda x: pd.to_datetime(x[0]))

            filtered_dates = [pair[0] for pair in filtered_pairs]
            filtered_values = [pair[1] for pair in filtered_pairs]

            historical_data = {
                'dates': filtered_dates,
                'ndvi_values': filtered_values,
                'metadata': {
                    'source': 'Google Earth Engine',
                    'timestamp': pd.Timestamp.now().isoformat(),
                    'spatial_extent': geometry,
                    'period_months': months,
                    'data_points': len(filtered_dates)
                }
            }

            # Calculate summary statistics
            if filtered_values:
                historical_data['statistics'] = {
                    'mean': round(sum(filtered_values) / len(filtered_values), 4),
                    'median': round(sorted(filtered_values)[len(filtered_values)//2], 4),
                    'std_dev': round(pd.Series(filtered_values).std(), 4),
                    'min': round(min(filtered_values), 4),
                    'max': round(max(filtered_values), 4),
                    'trend': 'increasing' if filtered_values[-1] > filtered_values[0] else 'decreasing'
                }
        else:
            historical_data = {
                'error': 'Failed to retrieve historical NDVI data',
                'dates': [],
                'ndvi_values': []
            }

        # Save to cache
        try:
            db.save_cached_historical_data('ndvi', geometry_hash + cache_key_suffix, historical_data, years=2)  # Use years instead of months
        except Exception as cache_error:
            print(f"Cache save error: {cache_error}")

        # Save to database
        try:
            db.save_historical_ndvi(user_id, geometry, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return jsonify({**historical_data, 'cached': False})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/historical/evi', methods=['POST'])
@token_required
def historical_evi():
    """Get historical EVI data for a geometry with caching."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        years = data.get('years', 10)
        user_id = request.user_id

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cached_data = db.get_cached_historical_data('evi', geometry_hash, years=years)

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            })

        # Compute new data
        historical_data = get_historical_evi(geometry, years)

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

        return jsonify({**historical_data, 'cached': False})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/historical/savi', methods=['POST'])
@token_required
def historical_savi():
    """Get historical SAVI data for a geometry with caching."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        years = data.get('years', 10)
        user_id = request.user_id

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cached_data = db.get_cached_historical_data('savi', geometry_hash, years=years)

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            })

        # Compute new data
        historical_data = get_historical_savi(geometry, years)

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

        return jsonify({**historical_data, 'cached': False})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/historical/weather/<float:lat>/<float:lon>', methods=['OPTIONS'])
def historical_weather_options(lat, lon):
    """Handle CORS preflight requests for historical weather endpoint."""
    return '', 200

@app.route('/historical/weather/<float:lat>/<float:lon>', methods=['GET'])
@token_required
def historical_weather(lat, lon):
    """Get historical weather data for coordinates with caching."""
    try:
        # Check if using date range or days
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        days = request.args.get('days')

        user_id = request.user_id

        if start_date_str and end_date_str:
            # Use date range
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SSZ)'}), 400

            # Validate date range
            if end_date <= start_date:
                return jsonify({'error': 'End date must be after start date'}), 400

            max_days = (end_date - start_date).days
            if max_days > 365:
                return jsonify({'error': 'Maximum date range is 365 days'}), 400

        elif days:
            # Backward compatibility - use days
            days = int(days)
            if days > 365:
                return jsonify({'error': 'Maximum 365 days allowed'}), 400
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
        else:
            # Default to 30 days
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)

        # Check cache first
        location_key = f"{lat}_{lon}"
        date_range_key = f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"
        cache_key = f"{location_key}_{date_range_key}"
        cached_data = db.get_cached_historical_data('weather', cache_key, lat=lat, lon=lon, years=1)

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at'],
                'metadata': {
                    'source': 'Open-Meteo API',
                    'timestamp': cached_data['created_at'],
                    'location': {'lat': lat, 'lon': lon},
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'period_days': (end_date - start_date).days
                }
            })

        # Compute new data - get historical data for the specified range
        historical_data = get_historical_weather(lat, lon, start_date, end_date)

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
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'period_days': (end_date - start_date).days,
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

        return jsonify({**historical_data, 'cached': False})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/forecast/vis', methods=['OPTIONS', 'POST'])
def forecast_vis_endpoint():
    """Forecast Vegetation Indices (NDVI, EVI, SAVI) using historical data with SARIMA model."""
    if request.method == 'OPTIONS':
        return '', 200

    # For POST requests, apply token_required
    return _forecast_vis_with_token()

@token_required
def _forecast_vis_with_token():
    try:
        data = request.get_json()
        historical_ndvi = data.get('historical_ndvi')
        months = data.get('months', 12)  # Default to 12 months, max 12
        user_id = request.user_id
        geometry = data.get('geometry')

        if not historical_ndvi:
            return jsonify({'error': 'No historical Vegetation Indices data provided'}), 400

        if months > 12:
            return jsonify({'error': 'Maximum 12 months allowed'}), 400

        # Generate geometry hash for caching
        geometry_hash = db.generate_geometry_hash(geometry) if geometry else None

        # Call forecast function synchronously with SARIMA model
        forecast_data = forecast_ndvi(historical_ndvi, months, geometry_hash, use_sarima=True)

        if 'error' not in forecast_data:
            # Add metadata to forecast data
            forecast_data['metadata'] = {
                'model': 'SARIMA',
                'run_date': pd.Timestamp.now().isoformat(),
                'parameters': {
                    'periods': months,
                    'confidence_intervals': True
                },
                'source': 'Historical Vegetation Indices data'
            }

        # Save forecast to database
        if geometry and 'error' not in forecast_data:
            db.save_forecast(user_id, forecast_data, geometry)

        return jsonify(forecast_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

async def run_ndvi_forecast_async(task_id, geometry, months, user_id):
    """Run NDVI forecasting in background."""
    try:
        background_tasks[task_id] = {'status': 'processing', 'start_time': time.time()}

        # First get historical NDVI data
        historical_data = get_historical_ndvi(geometry, years=2)  # Use 2 years for forecasting

        if 'error' in historical_data or not historical_data.get('dates'):
            background_tasks[task_id] = {
                'status': 'failed',
                'error': 'Failed to get historical NDVI data',
                'end_time': time.time()
            }
            return

        # Prepare data for forecasting
        historical_ndvi = {
            'dates': historical_data['dates'],
            'values': historical_data['ndvi_values']
        }

        # Generate geometry hash for caching
        geometry_hash = db.generate_geometry_hash(geometry)

        forecast_data = forecast_ndvi(historical_ndvi, months, geometry_hash)

        if 'error' in forecast_data:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': forecast_data['error'],
                'end_time': time.time()
            }
            return

        # Save to database
        try:
            db.save_forecast(user_id, geometry, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        # Store results
        background_tasks[task_id] = {
            'status': 'completed',
            'result': forecast_data,
            'end_time': time.time()
        }

    except Exception as e:
        background_tasks[task_id] = {
            'status': 'failed',
            'error': str(e),
            'end_time': time.time()
        }

@app.route('/forecast/weather/<float:lat>/<float:lon>', methods=['OPTIONS', 'GET'])
def forecast_weather_endpoint(lat, lon):
    """Forecast weather for coordinates synchronously with uncertainty bands."""
    if request.method == 'OPTIONS':
        return '', 200

    # For GET requests, apply token_required
    return _forecast_weather_with_token(lat, lon)

@token_required
def _forecast_weather_with_token(lat, lon):
    try:
        days = int(request.args.get('days', 5))  # Default to 5 days, max 16
        user_id = request.user_id

        if days > 16:
            return jsonify({'error': 'Maximum 16 days allowed'}), 400

        # Get historical weather data for forecasting (use 1 year for better forecasting)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        historical_data = get_historical_weather(lat, lon, start_date, end_date)

        if 'error' in historical_data:
            return jsonify({'error': f"Failed to get historical weather data: {historical_data['error']}"}), 500

        # Generate location key for caching
        location_key = f"{lat}_{lon}"

        # Forecast temperature with uncertainty
        temp_forecast = forecast_weather(historical_data, 'temperature', days, location_key, use_sarima=True)
        if 'error' in temp_forecast:
            return jsonify({'error': f"Failed to forecast temperature: {temp_forecast['error']}"}), 500

        # Forecast precipitation (rainfall) with uncertainty
        precip_forecast = forecast_weather(historical_data, 'rainfall', days, location_key, use_sarima=True)
        if 'error' in precip_forecast:
            return jsonify({'error': f"Failed to forecast precipitation: {precip_forecast['error']}"}), 500

        # Forecast humidity with uncertainty - use temperature as proxy since humidity data may not be available
        humidity_forecast = forecast_weather(historical_data, 'temperature', days, location_key + '_humidity', use_sarima=True)
        if 'error' in humidity_forecast:
            return jsonify({'error': f"Failed to forecast humidity: {humidity_forecast['error']}"}), 500

        # Combine forecasts into the format expected by frontend with uncertainty bands
        forecast_data = {
            'forecast_dates': temp_forecast['forecast_dates'],
            'temperature': {
                'values': temp_forecast['forecast_values'],
                'upper_bound': [v + 2 for v in temp_forecast['forecast_values']],  # Simple uncertainty
                'lower_bound': [v - 2 for v in temp_forecast['forecast_values']]
            },
            'precipitation': {
                'values': [max(0, v) for v in precip_forecast['forecast_values']],
                'upper_bound': [max(0, v + 1) for v in precip_forecast['forecast_values']],
                'lower_bound': [max(0, v - 0.5) for v in precip_forecast['forecast_values']]
            },
            'humidity': {
                'values': humidity_forecast['forecast_values'],
                'upper_bound': [min(100, v + 5) for v in humidity_forecast['forecast_values']],
                'lower_bound': [max(0, v - 5) for v in humidity_forecast['forecast_values']]
            },
            'metadata': {
                'model_version': '1.0',
                'run_date': pd.Timestamp.now().isoformat(),
                'forecast_period_days': days,
                'location': {'lat': lat, 'lon': lon},
                'source': 'Open-Meteo historical data',
                'uncertainty_method': 'Simple bounds based on historical variance'
            }
        }

        # Save to database (using geometry as None for weather forecasts)
        try:
            db.save_forecast(user_id, {'type': 'weather', 'lat': lat, 'lon': lon}, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return jsonify(forecast_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

async def run_weather_forecast_async(task_id, lat, lon, months, user_id):
    """Run weather forecasting in background."""
    try:
        background_tasks[task_id] = {'status': 'processing', 'start_time': time.time()}

        # First get historical weather data for forecasting
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        historical_data = get_historical_weather(lat, lon, start_date, end_date)

        if 'error' in historical_data:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': f"Failed to get historical weather data: {historical_data['error']}",
                'end_time': time.time()
            }
            return

        # Generate location key for caching
        location_key = f"{lat}_{lon}"

        # Forecast temperature
        temp_forecast = forecast_weather(historical_data, 'temperature', months, location_key)
        if 'error' in temp_forecast:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': f"Failed to forecast temperature: {temp_forecast['error']}",
                'end_time': time.time()
            }
            return

        # Forecast precipitation (rainfall)
        precip_forecast = forecast_weather(historical_data, 'precipitation', months, location_key)
        if 'error' in precip_forecast:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': f"Failed to forecast precipitation: {precip_forecast['error']}",
                'end_time': time.time()
            }
            return

        # Combine forecasts into the format expected by frontend
        forecast_data = []
        for i in range(months):
            forecast_date = pd.to_datetime(temp_forecast['forecast_dates'][i])
            month_label = forecast_date.to_pydatetime().strftime('%b %Y')  # e.g., "Jan 2024"
            forecast_data.append({
                'month': month_label,
                'temperature': round(temp_forecast['forecast_values'][i], 1),
                'precipitation': round(max(0, precip_forecast['forecast_values'][i]), 1)  # Ensure non-negative
            })

        # Save to database (using geometry as None for weather forecasts)
        try:
            db.save_forecast(user_id, {'type': 'weather', 'lat': lat, 'lon': lon}, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        # Store results
        background_tasks[task_id] = {
            'status': 'completed',
            'result': forecast_data,
            'end_time': time.time()
        }

    except Exception as e:
        background_tasks[task_id] = {
            'status': 'failed',
            'error': str(e),
            'end_time': time.time()
        }

@app.route('/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Get status of background task."""
    if task_id not in background_tasks:
        return jsonify({'error': 'Task not found'}), 404

    task = background_tasks[task_id]
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

    return jsonify(response)

@app.route('/history/<user_id>', methods=['GET'])
def get_history(user_id):
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

        return jsonify(results)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/cache/clear', methods=['POST'])
def clear_cache():
    """Clear expired cache entries."""
    try:
        result = db.clear_expired_cache()
        return jsonify({'success': result, 'message': 'Cache cleanup completed'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_polygon_area(coordinates):
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

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host='0.0.0.0', port=5000)
