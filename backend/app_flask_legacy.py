import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from config.config import Config
from gee_processor import initialize_gee, get_ndvi, get_evi, get_savi, get_land_cover, get_slope_data, calculate_risk_score, get_historical_ndvi, get_historical_evi, get_historical_savi, get_historical_vis
import math
from weather_integration import get_weather_data, get_weather_forecast, get_historical_weather
from forecasting import forecast_ndvi, forecast_weather
from ndvi_forecast_ml import GEEForecaster
from models import db, generate_token, token_required
import json
import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
import time
import logging
import traceback
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
], methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], supports_credentials=False, allow_headers=['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Accept-Encoding', 'Accept-Language', 'Cache-Control', 'Connection', 'Host', 'Origin', 'Referer', 'User-Agent'])
app.config.from_object(Config)

# Initialize GEE on startup
gee_initialized = initialize_gee()

@app.before_request
def log_cors_request():
    """Log CORS-related request details for debugging."""
    if request.method == 'OPTIONS':
        print(f"CORS Preflight Request: Origin={request.headers.get('Origin')}, "
              f"Method={request.headers.get('Access-Control-Request-Method')}, "
              f"Headers={request.headers.get('Access-Control-Request-Headers')}")
    elif 'Origin' in request.headers:
        print(f"CORS Request: Origin={request.headers.get('Origin')}, "
              f"Method={request.method}, "
              f"Authorization={bool(request.headers.get('Authorization'))}")

@app.after_request
def log_cors_response(response):
    """Log CORS response headers for debugging and ensure CORS headers are present."""
    cors_headers = {}
    for header_name, header_value in response.headers.items():
        if header_name.lower().startswith('access-control'):
            cors_headers[header_name] = header_value

    if cors_headers:
        print(f"CORS Response Headers: {cors_headers}")
    elif request.method == 'OPTIONS' or 'Origin' in request.headers:
        print("WARNING: No CORS headers found in response!")

    # Ensure CORS headers are present in the response
    if 'Access-Control-Allow-Origin' not in response.headers:
        response.headers['Access-Control-Allow-Origin'] = '*'

    if 'Access-Control-Allow-Methods' not in response.headers:
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'

    if 'Access-Control-Allow-Headers' not in response.headers:
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, Origin, Referer, User-Agent'

    if 'Access-Control-Allow-Credentials' not in response.headers:
        response.headers['Access-Control-Allow-Credentials'] = 'false'

    return response

# Global task storage for background tasks
background_tasks = {}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        return jsonify({
            'status': 'healthy',
            'gee_initialized': gee_initialized
        }), 200
    except BaseException as e:
        # Log detailed error information
        logging.error(f"Health check error: {e}", exc_info=True)
        try:
            return jsonify({
                'status': 'error',
                'message': 'Health check failed',
                'error': str(e)
            }), 200
        except BaseException:
            # Fallback to ensure valid JSON response
            return '{"status": "error", "message": "Health check failed"}', 200, {'Content-Type': 'application/json'}

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

@cross_origin(origins=["https://landcare-ai-frontend.onrender.com"])
@app.route('/weather/<float:lat>/<float:lon>', methods=['GET', 'OPTIONS'])
def weather(lat, lon):
    """Get current weather for coordinates."""
    weather_data = get_weather_data(lat, lon)
    return jsonify(weather_data)

@cross_origin(origins=["https://landcare-ai-frontend.onrender.com"])
@app.route('/forecast/<float:lat>/<float:lon>', methods=['GET', 'OPTIONS'])
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
    """Get historical NDVI, EVI, SAVI data for a geometry with caching."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        start_date = data.get('start_date', '1984-01-01')
        end_date = data.get('end_date')
        user_id = request.user_id

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # Validate dates
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            if end_date:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            else:
                end = datetime.now()
            if start.year < 1984 or end.date() > datetime.now().date():
                return jsonify({'error': 'Date range must be between 1984 and present'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

        # Check cache first
        geometry_hash = db.generate_geometry_hash(geometry)
        date_range_key = f"{start_date}_{end_date or 'present'}"
        cache_key = f"{geometry_hash}_{date_range_key}"
        cached_data = db.get_cached_historical_data('vis', cache_key, years=1)

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
                    'start_date': start_date,
                    'end_date': end_date,
                    'data_points': len(cached_data['data'].get('dates', []))
                }
            })

        # Compute new data
        historical_data = get_historical_vis(geometry, start_date, end_date)

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



@app.route('/historical/weather/<float:lat>/<float:lon>', methods=['GET', 'OPTIONS'])
@cross_origin(origins=["https://landcare-ai-frontend.onrender.com"], methods=['GET', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Accept-Encoding', 'Accept-Language', 'Cache-Control', 'Connection', 'Host', 'Origin', 'Referer', 'User-Agent'])
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
            if max_days > 3650:
                return jsonify({'error': 'Maximum date range is 3650 days (10 years)'}), 400

        elif days:
            # Backward compatibility - use days
            days = int(days)
            if days > 3650:
                return jsonify({'error': 'Maximum 3650 days allowed'}), 400
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



@app.route('/forecast/vis', methods=['POST'])
@token_required
def forecast_vis():
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



@app.route('/forecast/weather/<float:lat>/<float:lon>', methods=['GET', 'OPTIONS'])
@cross_origin(origins=["https://landcare-ai-frontend.onrender.com"], methods=['GET', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Accept-Encoding', 'Accept-Language', 'Cache-Control', 'Connection', 'Host', 'Origin', 'Referer', 'User-Agent'])
@token_required
def forecast_weather_route(lat, lon):
    try:
        days = int(request.args.get('days', 5))  # Default to 5 days, max 16
        user_id = request.user_id

        if days > 16:
            return jsonify({'error': 'Maximum 16 days allowed'}), 400

        # Use Open-Meteo's built-in forecast API instead of custom ML forecasting
        forecast_data_raw = get_weather_forecast(lat, lon)

        if 'error' in forecast_data_raw:
            return jsonify({'error': f"Failed to get weather forecast: {forecast_data_raw['error']}"}), 500

        # Extract daily summaries from Open-Meteo forecast
        daily_summaries = forecast_data_raw.get('daily_summaries', {})

        if not daily_summaries:
            return jsonify({'error': 'No forecast data available'}), 500

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

async def run_vegetation_forecast_async(task_id, geometry, periods, user_id, use_fallback=True):
    """Run vegetation index forecasting in background using GEEForecaster with fallback to statistical models."""
    try:
        background_tasks[task_id] = {'status': 'processing', 'start_time': time.time()}

        # Validate periods
        if not isinstance(periods, list) or not periods:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': 'Periods must be a non-empty list of integers',
                'end_time': time.time()
            }
            return

        # Validate geometry
        if not geometry or 'coordinates' not in geometry:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': 'Invalid geometry provided',
                'end_time': time.time()
            }
            return

        forecast_result = None
        method_used = 'ml'

        # Try ML forecasting first
        try:
            # Convert geometry to GEE format
            import ee
            roi = ee.Geometry.Polygon(geometry['coordinates'])

            # Initialize GEEForecaster
            # Use last 2 years of data for training
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')

            forecaster = GEEForecaster(roi, start_date, end_date)

            # Train models (this may take time)
            training_result = forecaster.train_models(include_validation=False, include_cv=False)
            if 'error' in training_result:
                raise Exception(f"Model training failed: {training_result['error']}")

            # Make forecasts
            forecast_result = forecaster.forecast(periods)
            if 'error' in forecast_result:
                raise Exception(f"ML forecasting failed: {forecast_result['error']}")

        except Exception as ml_error:
            print(f"ML forecasting failed: {ml_error}")
            method_used = 'statistical_fallback'

            if not use_fallback:
                background_tasks[task_id] = {
                    'status': 'failed',
                    'error': f"ML forecasting failed and fallback disabled: {str(ml_error)}",
                    'end_time': time.time()
                }
                return

            # Fallback to statistical forecasting
            try:
                # Get historical NDVI data
                historical_data = get_historical_ndvi(geometry, years=2)
                if 'error' in historical_data or not historical_data.get('dates'):
                    raise Exception(f"Failed to get historical data for fallback: {historical_data.get('error', 'No data available')}")

                # Prepare data for statistical forecasting
                historical_ndvi = {
                    'dates': historical_data['dates'],
                    'values': historical_data['ndvi_values']
                }

                # Generate statistical forecast for the maximum period
                max_periods = max(periods)
                stat_forecast = forecast_ndvi(historical_ndvi, max_periods)

                if 'error' in stat_forecast:
                    raise Exception(f"Statistical forecasting fallback failed: {stat_forecast['error']}")

                # Convert to ML-style format for consistency
                forecast_result = {
                    'status': 'success',
                    'forecasts': {},
                    'model_info': {
                        'type': 'ARIMA/SARIMA Statistical Model (Fallback)',
                        'method': 'statistical_fallback',
                        'reason': str(ml_error),
                        'original_error': str(ml_error)
                    }
                }

                # Create forecast entries for each requested period
                forecast_dates = stat_forecast.get('forecast_dates', [])
                forecast_values = stat_forecast.get('forecast_values', [])

                for period in periods:
                    if period <= len(forecast_values):
                        forecast_result['forecasts'][f'{period}_months'] = {
                            'predicted_ndvi': forecast_values[period-1],
                            'predicted_savi': forecast_values[period-1] * 0.8,  # Approximate conversion
                            'predicted_evi': forecast_values[period-1] * 0.6,   # Approximate conversion
                            'period_months': period,
                            'forecast_date': forecast_dates[period-1] if period-1 < len(forecast_dates) else f"{datetime.now().year + period//12}-{period%12 + 1:02d}-01"
                        }

            except Exception as fallback_error:
                background_tasks[task_id] = {
                    'status': 'failed',
                    'error': f"Both ML and statistical fallback failed. ML error: {str(ml_error)}, Fallback error: {str(fallback_error)}",
                    'end_time': time.time()
                }
                return

        # Save forecast to database
        try:
            forecast_data = {
                **forecast_result,
                'method_used': method_used,
                'fallback_used': method_used == 'statistical_fallback'
            }
            db.save_forecast(user_id, geometry, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        # Store results
        background_tasks[task_id] = {
            'status': 'completed',
            'result': {
                **forecast_result,
                'method_used': method_used,
                'fallback_used': method_used == 'statistical_fallback'
            },
            'end_time': time.time()
        }

    except Exception as e:
        background_tasks[task_id] = {
            'status': 'failed',
            'error': str(e),
            'end_time': time.time()
        }

async def run_model_training_async(task_id, geometry, user_id, model_settings=None):
    """Run model training in background for a specific ROI."""
    try:
        background_tasks[task_id] = {'status': 'processing', 'start_time': time.time()}

        # Validate geometry
        if not geometry or 'coordinates' not in geometry:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': 'Invalid geometry provided',
                'end_time': time.time()
            }
            return

        # Convert geometry to GEE format
        import ee
        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Initialize GEEForecaster
        # Use last 2 years of data for training
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')

        forecaster = GEEForecaster(roi, start_date, end_date, model_settings)

        # Train models
        training_result = forecaster.train_models()
        if 'error' in training_result:
            background_tasks[task_id] = {
                'status': 'failed',
                'error': f"Model training failed: {training_result['error']}",
                'end_time': time.time()
            }
            return

        # Save trained model metadata
        geometry_hash = db.generate_geometry_hash(geometry)
        model_key = f"gee_forecaster_{geometry_hash}_{int(time.time())}"
        forecaster.save_models(f"models/{model_key}")

        # Store training results
        result = {
            'model_key': model_key,
            'training_result': training_result,
            'geometry_hash': geometry_hash,
            'created_at': datetime.now().isoformat()
        }

        background_tasks[task_id] = {
            'status': 'completed',
            'result': result,
            'end_time': time.time()
        }

    except Exception as e:
        background_tasks[task_id] = {
            'status': 'failed',
            'error': str(e),
            'end_time': time.time()
        }

@app.route('/api/forecast/vegetation', methods=['POST'])
@token_required
def forecast_vegetation():
    """Main vegetation forecasting endpoint that accepts ROI and periods."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        periods = data.get('periods', [3, 6, 12])  # Default periods
        use_fallback = data.get('use_fallback', True)  # Default to using fallback

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        if not isinstance(periods, list) or not all(isinstance(p, int) and p > 0 for p in periods):
            return jsonify({'error': 'Periods must be a list of positive integers'}), 400

        # Validate periods are reasonable (max 24 months)
        if any(p > 24 for p in periods):
            return jsonify({'error': 'Maximum forecast period is 24 months'}), 400

        # Generate unique task ID
        task_id = f"veg_forecast_{int(time.time())}_{hash(str(geometry)) % 10000}"
        user_id = request.user_id

        # Start async task
        asyncio.create_task(run_vegetation_forecast_async(task_id, geometry, periods, user_id, use_fallback))

        return jsonify({
            'task_id': task_id,
            'status': 'accepted',
            'message': 'Vegetation forecasting task started',
            'periods': periods,
            'fallback_enabled': use_fallback
        }), 202

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecast/status/<task_id>', methods=['GET'])
@token_required
def get_forecast_status(task_id):
    """Check status of async forecasting tasks."""
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

@app.route('/api/models/list', methods=['GET'])
@token_required
def list_models():
    """List available trained models."""
    try:
        import os
        import glob

        models_dir = 'models'
        if not os.path.exists(models_dir):
            return jsonify({'models': []})

        # Find all model metadata files
        model_files = glob.glob(os.path.join(models_dir, '*_metadata.json'))

        models = []
        for model_file in model_files:
            try:
                with open(model_file, 'r') as f:
                    metadata = json.load(f)

                # Extract model key from filename
                model_key = os.path.basename(model_file).replace('_metadata.json', '')

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

        return jsonify({'models': models})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/train', methods=['POST'])
@token_required
def train_model():
    """Train new models for a specific ROI."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        model_settings = data.get('model_settings', {})

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # Validate model settings
        valid_settings = ['numberOfTrees', 'maxNodes', 'test_size']
        for key in model_settings:
            if key not in valid_settings:
                return jsonify({'error': f'Invalid model setting: {key}'}), 400

        # Set defaults and validate ranges
        settings = {
            'numberOfTrees': min(max(model_settings.get('numberOfTrees', 100), 10), 500),
            'maxNodes': min(max(model_settings.get('maxNodes', 10), 5), 50),
            'test_size': min(max(model_settings.get('test_size', 0.3), 0.1), 0.5)
        }

        # Generate unique task ID
        task_id = f"model_train_{int(time.time())}_{hash(str(geometry)) % 10000}"
        user_id = request.user_id

        # Start async training task
        asyncio.create_task(run_model_training_async(task_id, geometry, user_id, settings))

        return jsonify({
            'task_id': task_id,
            'status': 'accepted',
            'message': 'Model training task started',
            'model_settings': settings
        }), 202

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/forecast/compare', methods=['POST'])
@token_required
def compare_forecasts():
    """Compare ML and statistical forecasting models."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        periods = data.get('periods', [3, 6, 12])
        model_key = data.get('model_key')  # Optional: specific ML model to use

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        if not isinstance(periods, list) or not all(isinstance(p, int) and p > 0 for p in periods):
            return jsonify({'error': 'Periods must be a list of positive integers'}), 400

        # Validate periods are reasonable (max 24 months)
        if any(p > 24 for p in periods):
            return jsonify({'error': 'Maximum forecast period is 24 months'}), 400

        user_id = request.user_id

        # Get historical NDVI data for statistical forecasting
        try:
            historical_data = get_historical_ndvi(geometry, years=2)
            if 'error' in historical_data:
                return jsonify({'error': f"Failed to get historical data: {historical_data['error']}"}), 500
        except Exception as e:
            return jsonify({'error': f"Failed to retrieve historical data: {str(e)}"}), 500

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

        return jsonify(comparison)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
