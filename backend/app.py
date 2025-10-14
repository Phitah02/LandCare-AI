from flask import Flask, request, jsonify
from flask_cors import CORS
from config.config import Config
from gee_processor import initialize_gee, get_ndvi, get_land_cover, get_slope_data, calculate_risk_score, get_historical_ndvi
from weather_integration import get_weather_data, get_weather_forecast, get_historical_weather
from forecasting import forecast_ndvi, forecast_weather
from models import db
import json
import requests
import pandas as pd

app = Flask(__name__)
CORS(app)
app.config.from_object(Config)

# Initialize GEE on startup
gee_initialized = initialize_gee()

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'gee_initialized': gee_initialized
    })

@app.route('/analyze', methods=['POST'])
def analyze():
    """Analyze polygon for NDVI and land cover."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        centroid = data.get('centroid')  # [lat, lon]

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        results = {}

        # Get NDVI
        if gee_initialized:
            ndvi_result = get_ndvi(geometry)
            results['ndvi'] = ndvi_result

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
        
        # Calculate comprehensive risk score
        if gee_initialized and 'ndvi' in results and 'land_cover' in results:
            risk_assessment = calculate_risk_score(
                results.get('ndvi', {}),
                results.get('land_cover', {}),
                results.get('slope', {}),
                results.get('weather', {})
            )
            results['risk_assessment'] = risk_assessment

        # Save analysis to database (optional user_id for now)
        user_id = data.get('user_id', 'anonymous')
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
def historical_ndvi():
    """Get historical NDVI data for a geometry."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        years = data.get('years', 10)
        user_id = data.get('user_id', 'anonymous')

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        historical_data = get_historical_ndvi(geometry, years)

        # Save to database
        try:
            db.save_historical_ndvi(user_id, geometry, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return jsonify(historical_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/historical/weather/<float:lat>/<float:lon>', methods=['GET'])
def historical_weather(lat, lon):
    """Get historical weather data for coordinates."""
    try:
        years = int(request.args.get('years', 10))
        user_id = request.args.get('user_id', 'anonymous')

        historical_data = get_historical_weather(lat, lon, years)

        # Save to database
        try:
            db.save_historical_weather(user_id, lat, lon, historical_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return jsonify(historical_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/forecast/ndvi', methods=['POST'])
def forecast_ndvi_endpoint():
    """Forecast NDVI for a geometry."""
    try:
        data = request.get_json()
        geometry = data.get('geometry')
        months = data.get('months', 6)
        user_id = data.get('user_id', 'anonymous')

        if not geometry:
            return jsonify({'error': 'No geometry provided'}), 400

        # First get historical NDVI data
        historical_data = get_historical_ndvi(geometry, years=5)  # Use 5 years for forecasting

        if 'error' in historical_data or not historical_data.get('dates'):
            return jsonify({'error': 'Failed to get historical NDVI data'}), 500

        # Prepare data for forecasting
        historical_ndvi = {
            'dates': historical_data['dates'],
            'values': historical_data['ndvi_values']
        }

        forecast_data = forecast_ndvi(historical_ndvi, months)

        # Save to database
        try:
            db.save_forecast(user_id, geometry, forecast_data)
        except Exception as db_error:
            print(f"Database save error: {db_error}")

        return jsonify(forecast_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/forecast/weather/<float:lat>/<float:lon>', methods=['GET'])
def forecast_weather_endpoint(lat, lon):
    """Forecast weather for coordinates."""
    try:
        months = int(request.args.get('months', 6))
        user_id = request.args.get('user_id', 'anonymous')

        # First get historical weather data for forecasting
        historical_data = get_historical_weather(lat, lon, years=5)

        if 'error' in historical_data:
            return jsonify({'error': f"Failed to get historical weather data: {historical_data['error']}"}), 500

        # Forecast temperature
        temp_forecast = forecast_weather(historical_data, 'temperature', months)
        if 'error' in temp_forecast:
            return jsonify({'error': f"Failed to forecast temperature: {temp_forecast['error']}"}), 500

        # Forecast precipitation (rainfall)
        precip_forecast = forecast_weather(historical_data, 'precipitation', months)
        if 'error' in precip_forecast:
            return jsonify({'error': f"Failed to forecast precipitation: {precip_forecast['error']}"}), 500

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

        return jsonify(forecast_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

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

if __name__ == '__main__':
    app.run(debug=Config.DEBUG, host='0.0.0.0', port=5000)
