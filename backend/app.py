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

app = Flask(__name__)
CORS(app)
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

@app.route('/historical/ndvi', methods=['POST'])
@token_required
def historical_ndvi():
    """Get historical NDVI data for a geometry with caching."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        years = data.get('years', 10)
        user_id = request.user_id

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        cached_data = db.get_cached_historical_data('ndvi', geometry_hash, years=years)

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            })

        # Compute new data
        historical_data = get_historical_ndvi(geometry, years)

        # Save to cache
        try:
            db.save_cached_historical_data('ndvi', geometry_hash, historical_data, years=years)
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

@app.route('/historical/weather/<float:lat>/<float:lon>', methods=['GET'])
@token_required
def historical_weather(lat, lon):
    """Get historical weather data for coordinates with caching."""
    try:
        years = int(request.args.get('years', 10))
        user_id = request.user_id

        # Check cache first
        location_key = f"{lat}_{lon}"
        cached_data = db.get_cached_historical_data('weather', location_key, lat=lat, lon=lon, years=years)

        if cached_data:
            # Return cached data
            return jsonify({
                **cached_data['data'],
                'cached': True,
                'cache_timestamp': cached_data['created_at']
            })

        # Compute new data
        historical_data = get_historical_weather(lat, lon, years)

        # Save to cache
        try:
            db.save_cached_historical_data('weather', location_key, historical_data, lat=lat, lon=lon, years=years)
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

@app.route('/forecast/ndvi', methods=['POST'])
@token_required
def forecast_ndvi_endpoint():
    """Forecast NDVI using historical data."""
    try:
        data = request.get_json()
        historical_ndvi = data.get('historical_ndvi')
        periods = data.get('periods', 12)
        user_id = request.user_id
        geometry = data.get('geometry')

        if not historical_ndvi:
            return jsonify({'error': 'No historical NDVI data provided'}), 400

        # Generate geometry hash for caching
        geometry_hash = db.generate_geometry_hash(geometry) if geometry else None

        # Call forecast function synchronously
        forecast_data = forecast_ndvi(historical_ndvi, periods, geometry_hash)

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
        historical_data = get_historical_ndvi(geometry, years=5)  # Use 5 years for forecasting

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

@app.route('/forecast/weather/<float:lat>/<float:lon>', methods=['GET'])
@token_required
def forecast_weather_endpoint(lat, lon):
    """Forecast weather for coordinates synchronously."""
    try:
        months = int(request.args.get('months', 6))
        user_id = request.user_id

        # Get historical weather data for forecasting
        historical_data = get_historical_weather(lat, lon, years=5)

        if 'error' in historical_data:
            return jsonify({'error': f"Failed to get historical weather data: {historical_data['error']}"}), 500

        # Generate location key for caching
        location_key = f"{lat}_{lon}"

        # Forecast temperature
        temp_forecast = forecast_weather(historical_data, 'temperature', months, location_key)
        if 'error' in temp_forecast:
            return jsonify({'error': f"Failed to forecast temperature: {temp_forecast['error']}"}), 500

        # Forecast precipitation (rainfall)
        precip_forecast = forecast_weather(historical_data, 'precipitation', months, location_key)
        if 'error' in precip_forecast:
            return jsonify({'error': f"Failed to forecast precipitation: {precip_forecast['error']}"}), 500

        # Combine forecasts into the format expected by frontend
        forecast_data = {
            'forecast_dates': temp_forecast['forecast_dates'],
            'temperature_forecast': temp_forecast['forecast_values'],
            'precipitation_forecast': precip_forecast['forecast_values']
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
        historical_data = get_historical_weather(lat, lon, years=5)

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
