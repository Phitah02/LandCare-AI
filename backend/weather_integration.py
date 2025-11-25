import requests
from config.config import Config
from datetime import datetime, timedelta
import ee
import numpy as np

def get_weather_data(lat, lon):
    """Get comprehensive weather data from Open-Meteo API."""
    try:
        # Open-Meteo current weather API - weather data provided by Open-Meteo (https://open-meteo.com/), licensed under CC BY 4.0
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"current_weather=true&"
            f"hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,pressure_msl&"
            f"timezone=Africa/Nairobi"
        )

        # Retry logic for transient failures
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                data = response.json()
                break
            except requests.RequestException as e:
                if attempt == max_retries - 1:
                    raise e
                import time
                time.sleep(1 * (attempt + 1))  # Exponential backoff

        # Convert Open-Meteo format to OpenWeatherMap-compatible format for existing code
        openweather_compatible_data = _convert_openmeteo_to_openweather_format(data)

        # Enhance weather data with agricultural insights
        enhanced_data = enhance_weather_data(openweather_compatible_data)
        return enhanced_data
    except Exception as e:
        return {'error': str(e)}

def get_weather_forecast(lat, lon, api_key=None):
    """Get 5-day weather forecast with agricultural insights using Open-Meteo API."""
    try:
        # Open-Meteo forecast API - weather data provided by Open-Meteo (https://open-meteo.com/), licensed under CC BY 4.0
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm&"
            f"timezone=Africa/Nairobi"
        )

        # Retry logic for transient failures
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                data = response.json()
                break
            except requests.RequestException as e:
                if attempt == max_retries - 1:
                    raise e
                import time
                time.sleep(1 * (attempt + 1))  # Exponential backoff

        # Process forecast data for agricultural insights
        processed_forecast = process_openmeteo_forecast_data(data)
        return processed_forecast
    except Exception as e:
        return {'error': str(e)}

def enhance_weather_data(weather_data):
    """Enhance weather data with agricultural insights and risk indicators."""
    try:
        if 'error' in weather_data:
            return weather_data

        enhanced = weather_data.copy()

        # Add agricultural insights
        temp = enhanced['main']['temp']
        humidity = enhanced['main']['humidity']
        wind_speed = enhanced['wind']['speed']
        pressure = enhanced['main']['pressure']

        # Get weather description
        weather_description = get_weather_description(weather_data)

        # Calculate agricultural risk indicators
        enhanced['agricultural_insights'] = {
            'drought_risk': calculate_drought_risk(temp, humidity, wind_speed),
            'heat_stress_risk': calculate_heat_stress_risk(temp, humidity),
            'wind_damage_risk': calculate_wind_damage_risk(wind_speed),
            'optimal_growing_conditions': assess_growing_conditions(temp, humidity, wind_speed),
            'soil_moisture_indicator': estimate_soil_moisture(temp, humidity, pressure)
        }

        # Add descriptive weather information
        enhanced['weather_description'] = weather_description

        # Add early warning indicators
        enhanced['early_warnings'] = generate_early_warnings(enhanced['agricultural_insights'])

        return enhanced
    except Exception as e:
        weather_data['error'] = str(e)
        return weather_data

def process_forecast_data(forecast_data):
    """Process forecast data for agricultural planning."""
    try:
        if 'error' in forecast_data:
            return forecast_data

        processed = forecast_data.copy()

        # Group forecasts by day
        daily_forecasts = {}
        for item in forecast_data['list']:
            date = item['dt_txt'].split(' ')[0]
            if date not in daily_forecasts:
                daily_forecasts[date] = []
            daily_forecasts[date].append(item)

        # Calculate daily agricultural summaries
        daily_summaries = {}
        for date, forecasts in daily_forecasts.items():
            temps = [f['main']['temp'] for f in forecasts]
            humidities = [f['main']['humidity'] for f in forecasts]
            precipitations = [f.get('rain', {}).get('3h', 0) for f in forecasts]

            daily_summaries[date] = {
                'date': date,
                'avg_temp': sum(temps) / len(temps),
                'min_temp': min(temps),
                'max_temp': max(temps),
                'avg_humidity': sum(humidities) / len(humidities),
                'total_precipitation': sum(precipitations),
                'agricultural_risk': assess_daily_agricultural_risk(temps, humidities, precipitations)
            }

        processed['daily_summaries'] = daily_summaries
        return processed
    except Exception as e:
        forecast_data['error'] = str(e)
        return forecast_data

def process_openmeteo_forecast_data(forecast_data):
    """Process Open-Meteo forecast data for agricultural planning."""
    try:
        if 'error' in forecast_data:
            return forecast_data

        processed = forecast_data.copy()

        # Extract hourly data
        times = forecast_data.get('hourly', {}).get('time', [])
        temperatures = forecast_data.get('hourly', {}).get('temperature_2m', [])
        humidities = forecast_data.get('hourly', {}).get('relative_humidity_2m', [])
        precipitations = forecast_data.get('hourly', {}).get('precipitation', [])
        wind_speeds = forecast_data.get('hourly', {}).get('wind_speed_10m', [])
        soil_temps = forecast_data.get('hourly', {}).get('soil_temperature_0_to_7cm', [])
        soil_moistures = forecast_data.get('hourly', {}).get('soil_moisture_0_to_7cm', [])

        if not times:
            return {'error': 'No hourly data available'}

        # Group by date
        daily_forecasts = {}
        for i, time_str in enumerate(times):
            date = time_str.split('T')[0]  # Extract date from ISO format
            if date not in daily_forecasts:
                daily_forecasts[date] = {
                    'temps': [],
                    'humidities': [],
                    'precipitations': [],
                    'wind_speeds': [],
                    'soil_temps': [],
                    'soil_moistures': []
                }

            daily_forecasts[date]['temps'].append(temperatures[i] if i < len(temperatures) and temperatures[i] is not None else 0)
            daily_forecasts[date]['humidities'].append(humidities[i] if i < len(humidities) and humidities[i] is not None else 0)
            daily_forecasts[date]['precipitations'].append(precipitations[i] if i < len(precipitations) and precipitations[i] is not None else 0)
            daily_forecasts[date]['wind_speeds'].append(wind_speeds[i] if i < len(wind_speeds) and wind_speeds[i] is not None else 0)
            daily_forecasts[date]['soil_temps'].append(soil_temps[i] if i < len(soil_temps) and soil_temps[i] is not None else 0)
            daily_forecasts[date]['soil_moistures'].append(soil_moistures[i] if i < len(soil_moistures) and soil_moistures[i] is not None else 0)

        # Calculate daily agricultural summaries
        daily_summaries = {}
        for date, data in daily_forecasts.items():
            temps = data['temps']
            humidities = data['humidities']
            precipitations = data['precipitations']
            wind_speeds = data['wind_speeds']
            soil_temps = data['soil_temps']
            soil_moistures = data['soil_moistures']

            daily_summaries[date] = {
                'date': date,
                'avg_temp': sum(temps) / len(temps) if temps else 0,
                'min_temp': min(temps) if temps else 0,
                'max_temp': max(temps) if temps else 0,
                'avg_humidity': sum(humidities) / len(humidities) if humidities else 0,
                'total_precipitation': sum(precipitations) if precipitations else 0,
                'avg_wind_speed': sum(wind_speeds) / len(wind_speeds) if wind_speeds else 0,
                'avg_soil_temp': sum(soil_temps) / len(soil_temps) if soil_temps else 0,
                'avg_soil_moisture': sum(soil_moistures) / len(soil_moistures) if soil_moistures else 0,
                'agricultural_risk': assess_daily_agricultural_risk(temps, humidities, precipitations)
            }

        processed['daily_summaries'] = daily_summaries
        return processed
    except Exception as e:
        forecast_data['error'] = str(e)
        return forecast_data

def calculate_drought_risk(temp, humidity, wind_speed):
    """Calculate drought risk based on weather conditions."""
    risk_score = 0
    
    # High temperature increases drought risk
    if temp > 35:
        risk_score += 0.4
    elif temp > 30:
        risk_score += 0.3
    elif temp > 25:
        risk_score += 0.2
    
    # Low humidity increases drought risk
    if humidity < 30:
        risk_score += 0.4
    elif humidity < 40:
        risk_score += 0.3
    elif humidity < 50:
        risk_score += 0.2
    
    # High wind speed increases drought risk
    if wind_speed > 15:
        risk_score += 0.2
    elif wind_speed > 10:
        risk_score += 0.1
    
    return min(risk_score, 1.0)

def calculate_heat_stress_risk(temp, humidity):
    """Calculate heat stress risk for crops."""
    if temp > 35 and humidity > 70:
        return 0.9  # Very high risk
    elif temp > 32 and humidity > 60:
        return 0.7  # High risk
    elif temp > 30 and humidity > 50:
        return 0.5  # Medium risk
    elif temp > 28:
        return 0.3  # Low risk
    else:
        return 0.1  # Very low risk

def calculate_wind_damage_risk(wind_speed):
    """Calculate wind damage risk."""
    if wind_speed > 20:
        return 0.9  # Very high risk
    elif wind_speed > 15:
        return 0.7  # High risk
    elif wind_speed > 10:
        return 0.4  # Medium risk
    elif wind_speed > 5:
        return 0.2  # Low risk
    else:
        return 0.1  # Very low risk

def assess_growing_conditions(temp, humidity, wind_speed):
    """Assess overall growing conditions."""
    score = 1.0
    
    # Temperature assessment (optimal: 20-25°C)
    if 20 <= temp <= 25:
        score -= 0.0  # Optimal
    elif 15 <= temp <= 30:
        score -= 0.2  # Good
    elif 10 <= temp <= 35:
        score -= 0.4  # Moderate
    else:
        score -= 0.7  # Poor
    
    # Humidity assessment (optimal: 40-70%)
    if 40 <= humidity <= 70:
        score -= 0.0  # Optimal
    elif 30 <= humidity <= 80:
        score -= 0.1  # Good
    else:
        score -= 0.3  # Poor
    
    # Wind assessment
    if wind_speed > 15:
        score -= 0.3  # Poor
    elif wind_speed > 10:
        score -= 0.1  # Moderate
    
    return max(score, 0.0)

def estimate_soil_moisture(temp, humidity, pressure):
    """Estimate soil moisture based on weather conditions."""
    # Simple estimation based on humidity and temperature
    base_moisture = humidity / 100
    
    # Temperature affects evaporation
    if temp > 30:
        base_moisture *= 0.7
    elif temp > 25:
        base_moisture *= 0.85
    elif temp < 10:
        base_moisture *= 1.2
    
    # Pressure affects moisture retention
    if pressure < 1000:
        base_moisture *= 0.9
    
    return min(max(base_moisture, 0.0), 1.0)

def assess_daily_agricultural_risk(temps, humidities, precipitations):
    """Assess daily agricultural risk from forecast data."""
    avg_temp = sum(temps) / len(temps)
    avg_humidity = sum(humidities) / len(humidities)
    total_precip = sum(precipitations)
    
    risk_score = 0
    
    # Temperature risk
    if avg_temp > 35 or avg_temp < 5:
        risk_score += 0.4
    elif avg_temp > 30 or avg_temp < 10:
        risk_score += 0.2
    
    # Humidity risk
    if avg_humidity < 30 or avg_humidity > 85:
        risk_score += 0.3
    elif avg_humidity < 40 or avg_humidity > 75:
        risk_score += 0.1
    
    # Precipitation risk (too much or too little)
    if total_precip > 50:  # Heavy rain risk
        risk_score += 0.3
    elif total_precip == 0 and avg_humidity < 40:  # Drought risk
        risk_score += 0.4
    
    return min(risk_score, 1.0)

def generate_early_warnings(insights):
    """Generate early warning messages based on agricultural insights."""
    warnings = []
    
    if insights['drought_risk'] > 0.7:
        warnings.append("High drought risk - consider irrigation")
    elif insights['drought_risk'] > 0.5:
        warnings.append("Moderate drought risk - monitor soil moisture")
    
    if insights['heat_stress_risk'] > 0.7:
        warnings.append("High heat stress risk - provide shade/water")
    elif insights['heat_stress_risk'] > 0.5:
        warnings.append("Moderate heat stress risk - monitor crop health")
    
    if insights['wind_damage_risk'] > 0.7:
        warnings.append("High wind damage risk - secure structures")
    elif insights['wind_damage_risk'] > 0.5:
        warnings.append("Moderate wind damage risk - check supports")
    
    if insights['optimal_growing_conditions'] < 0.3:
        warnings.append("Poor growing conditions - consider protective measures")

    return warnings

def _get_historical_weather_single_request(lat, lon, start_date, end_date):
    """Get historical weather data for a single date range using Open-Meteo Archive API."""
    try:
        # Open-Meteo Archive API - weather data provided by Open-Meteo (https://open-meteo.com/), licensed under CC BY 4.0
        url = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude={lat}&longitude={lon}&"
            f"start_date={start_date.strftime('%Y-%m-%d')}&"
            f"end_date={end_date.strftime('%Y-%m-%d')}&"
            f"hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm&"
            f"timezone=Africa/Nairobi"
        )

        # Retry logic for transient failures
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(url, timeout=30)
                response.raise_for_status()
                data = response.json()
                break
            except requests.RequestException as e:
                if attempt == max_retries - 1:
                    # Return mock data on error
                    return _generate_mock_historical_data(start_date, end_date)
                import time
                time.sleep(1 * (attempt + 1))  # Exponential backoff

        # Process Open-Meteo data into expected format (daily aggregates)
        return _process_openmeteo_historical_data(data, start_date, end_date)

    except Exception as e:
        # Return mock data on error
        return _generate_mock_historical_data(start_date, end_date, error=str(e))

def get_historical_weather(lat, lon, start_date=None, end_date=None, api_key=None):
    """Get historical weather data using Open-Meteo Archive API with chunked requests for long ranges."""
    try:
        # Handle backward compatibility - if start_date/end_date not provided, use years=1
        if start_date is None or end_date is None:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365)

        # Calculate date range in days
        date_range_days = (end_date - start_date).days

        # If range is <= 365 days, use single request
        if date_range_days <= 365:
            return _get_historical_weather_single_request(lat, lon, start_date, end_date)

        # For longer ranges, split into yearly chunks
        all_data = []
        current_start = start_date

        while current_start < end_date:
            # Calculate end of current year chunk
            current_year_end = datetime(current_start.year, 12, 31)
            chunk_end = min(current_year_end, end_date)

            # Get data for this chunk
            chunk_data = _get_historical_weather_single_request(lat, lon, current_start, chunk_end)
            if 'error' not in chunk_data and 'data' in chunk_data:
                all_data.extend(chunk_data['data'])
            else:
                # If chunk fails, return error
                return {'error': f'Failed to retrieve data for period {current_start.strftime("%Y-%m-%d")} to {chunk_end.strftime("%Y-%m-%d")}: {chunk_data.get("error", "Unknown error")}'}

            # Move to next year
            current_start = chunk_end + timedelta(days=1)

            # Add delay between requests to handle rate limits (1 second)
            if current_start < end_date:
                import time
                time.sleep(1)

        # Return aggregated data
        return {
            'data': all_data,
            'metadata': {
                'source': 'Open-Meteo API',
                'timestamp': datetime.now().isoformat(),
                'location': {'lat': lat, 'lon': lon},
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'period_days': date_range_days,
                'data_points': len(all_data),
                'chunked_request': True
            }
        }

    except Exception as e:
        # Return mock data on error
        return _generate_mock_historical_data(start_date or (datetime.now() - timedelta(days=365)), end_date or datetime.now(), error=str(e))

def calculate_temperature_anomaly(historical_temps, baseline_years=30):
    """Calculate temperature anomalies compared to baseline period."""
    try:
        import pandas as pd

        # Convert to DataFrame
        df = pd.DataFrame({
            'date': pd.to_datetime(historical_temps['dates']),
            'temp': historical_temps['temperature']
        })

        # Calculate monthly climatology (baseline)
        df['month'] = df['date'].dt.month
        climatology = df.groupby('month')['temp'].mean()

        # Calculate anomalies
        anomalies = []
        for _, row in df.iterrows():
            baseline_temp = climatology[row['month']]
            anomaly = row['temp'] - baseline_temp
            anomalies.append(anomaly)

        return {
            'dates': historical_temps['dates'],
            'anomalies': anomalies,
            'climatology': climatology.to_dict()
        }

    except Exception as e:
        return {'error': str(e)}

def calculate_average_monthly_rainfall(historical_rainfall):
    """Calculate average monthly rainfall."""
    try:
        import pandas as pd

        df = pd.DataFrame({
            'date': pd.to_datetime(historical_rainfall['dates']),
            'rainfall': historical_rainfall['rainfall']
        })

        df['month'] = df['date'].dt.month
        monthly_avg = df.groupby('month')['rainfall'].mean()

        return monthly_avg.to_dict()

    except Exception as e:
        return {'error': str(e)}

def _convert_openmeteo_to_openweather_format(data):
    """Convert Open-Meteo response to OpenWeatherMap-compatible format."""
    try:
        current_weather = data.get('current_weather', {})
        hourly_data = data.get('hourly', {})

        # Get current values from hourly data (first entry should be current)
        temp = current_weather.get('temperature', 20)
        wind_speed = current_weather.get('windspeed', 5)
        wind_direction = current_weather.get('winddirection', 0)
        weathercode = current_weather.get('weathercode', 0)

        # Get additional data from hourly arrays
        humidity = hourly_data.get('relative_humidity_2m', [60])[0] if hourly_data.get('relative_humidity_2m') else 60
        pressure = hourly_data.get('pressure_msl', [1013])[0] if hourly_data.get('pressure_msl') else 1013

        # Convert weathercode to OpenWeatherMap weather description
        weather_description = _convert_weathercode_to_description(weathercode)

        # Create OpenWeatherMap-compatible structure
        openweather_format = {
            'coord': {'lon': data.get('longitude', 0), 'lat': data.get('latitude', 0)},
            'weather': [{
                'id': weathercode,
                'main': weather_description['main'],
                'description': weather_description['description'],
                'icon': '01d'  # Default icon
            }],
            'main': {
                'temp': temp,
                'humidity': humidity,
                'pressure': pressure,
                'temp_min': temp - 5,  # Estimate
                'temp_max': temp + 5   # Estimate
            },
            'wind': {
                'speed': wind_speed,
                'deg': wind_direction
            },
            'clouds': {'all': 0},  # Not available in Open-Meteo current weather
            'dt': int(datetime.fromisoformat(current_weather.get('time', datetime.now().isoformat())).timestamp()),
            'sys': {'country': 'KE', 'sunrise': 0, 'sunset': 0},  # Mock values
            'name': 'Current Location'
        }

        return openweather_format

    except Exception as e:
        # Return a basic structure on error
        return {
            'main': {'temp': 20, 'humidity': 60, 'pressure': 1013},
            'wind': {'speed': 5},
            'weather': [{'main': 'Clear', 'description': 'clear sky'}],
            'error': f'Conversion error: {str(e)}'
        }

def _convert_weathercode_to_description(weathercode):
    """Convert Open-Meteo weathercode to OpenWeatherMap weather description."""
    # Open-Meteo weather codes: https://open-meteo.com/en/docs
    weather_map = {
        0: {'main': 'Clear', 'description': 'clear sky'},
        1: {'main': 'Clouds', 'description': 'mainly clear'},
        2: {'main': 'Clouds', 'description': 'partly cloudy'},
        3: {'main': 'Clouds', 'description': 'overcast'},
        45: {'main': 'Fog', 'description': 'fog'},
        48: {'main': 'Fog', 'description': 'depositing rime fog'},
        51: {'main': 'Drizzle', 'description': 'light drizzle'},
        53: {'main': 'Drizzle', 'description': 'moderate drizzle'},
        55: {'main': 'Drizzle', 'description': 'dense drizzle'},
        56: {'main': 'Drizzle', 'description': 'light freezing drizzle'},
        57: {'main': 'Drizzle', 'description': 'dense freezing drizzle'},
        61: {'main': 'Rain', 'description': 'slight rain'},
        63: {'main': 'Rain', 'description': 'moderate rain'},
        65: {'main': 'Rain', 'description': 'heavy rain'},
        66: {'main': 'Rain', 'description': 'light freezing rain'},
        67: {'main': 'Rain', 'description': 'heavy freezing rain'},
        71: {'main': 'Snow', 'description': 'slight snow fall'},
        73: {'main': 'Snow', 'description': 'moderate snow fall'},
        75: {'main': 'Snow', 'description': 'heavy snow fall'},
        77: {'main': 'Snow', 'description': 'snow grains'},
        80: {'main': 'Rain', 'description': 'slight rain showers'},
        81: {'main': 'Rain', 'description': 'moderate rain showers'},
        82: {'main': 'Rain', 'description': 'violent rain showers'},
        85: {'main': 'Snow', 'description': 'slight snow showers'},
        86: {'main': 'Snow', 'description': 'heavy snow showers'},
        95: {'main': 'Thunderstorm', 'description': 'thunderstorm'},
        96: {'main': 'Thunderstorm', 'description': 'thunderstorm with slight hail'},
        99: {'main': 'Thunderstorm', 'description': 'thunderstorm with heavy hail'}
    }

    return weather_map.get(weathercode, {'main': 'Clear', 'description': 'clear sky'})

def _generate_mock_historical_data(start_date, end_date, error=None):
    """Generate mock historical weather data for fallback."""
    daily_entries = []

    current = start_date
    while current <= end_date:
        # Generate daily mock data
        base_temp = 20 + 10 * np.sin(current.month * np.pi / 6)
        temp = base_temp + np.random.normal(0, 5)
        precip = max(0, 50 + 30 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 20))
        humidity = 60 + 20 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 10)

        daily_entries.append({
            'date': current.strftime('%Y-%m-%d'),
            'temperature': round(temp, 1),
            'humidity': round(max(0, min(100, humidity)), 1),
            'precipitation': round(precip, 1),
            'temp_min': round(temp - 3, 1),
            'temp_max': round(temp + 3, 1)
        })
        current += timedelta(days=1)  # Daily data

    result = {
        'data': daily_entries,
        'note': 'Mock data - Open-Meteo API unavailable'
    }
    if error:
        result['error'] = error
    return result

def _process_openmeteo_historical_data(data, start_date, end_date):
    """Process Open-Meteo historical data into daily aggregates."""
    try:
        # Extract hourly data
        times = data.get('hourly', {}).get('time', [])
        temperatures = data.get('hourly', {}).get('temperature_2m', [])
        precipitations = data.get('hourly', {}).get('precipitation', [])
        humidities = data.get('hourly', {}).get('relative_humidity_2m', [])

        if not times:
            return _generate_mock_historical_data(start_date, end_date, 'No hourly data available')

        # Group by day
        daily_data = {}
        for i, time_str in enumerate(times):
            date = datetime.fromisoformat(time_str.replace('T', ' ').split('+')[0])
            day_key = date.strftime('%Y-%m-%d')

            if day_key not in daily_data:
                daily_data[day_key] = {'temps': [], 'precip': [], 'humidities': []}

            if i < len(temperatures) and temperatures[i] is not None:
                daily_data[day_key]['temps'].append(temperatures[i])
            if i < len(precipitations) and precipitations[i] is not None:
                daily_data[day_key]['precip'].append(precipitations[i])
            if i < len(humidities) and humidities[i] is not None:
                daily_data[day_key]['humidities'].append(humidities[i])

        # Calculate daily aggregates
        daily_entries = []
        for day_key in sorted(daily_data.keys()):
            data_day = daily_data[day_key]

            if data_day['temps']:
                avg_temp = sum(data_day['temps']) / len(data_day['temps'])
                total_precip = sum(data_day['precip']) if data_day['precip'] else 0
                avg_humidity = sum(data_day['humidities']) / len(data_day['humidities']) if data_day['humidities'] else 60
                min_temp = min(data_day['temps'])
                max_temp = max(data_day['temps'])

                daily_entries.append({
                    'date': day_key,
                    'temperature': round(avg_temp, 1),
                    'humidity': round(avg_humidity, 1),
                    'precipitation': round(total_precip, 1),
                    'temp_min': round(min_temp, 1),
                    'temp_max': round(max_temp, 1)
                })

        return {
            'data': daily_entries
        }

    except Exception as e:
        return _generate_mock_historical_data(start_date, end_date, str(e))

def get_weather_description(weather_data):
    """Generate a descriptive weather summary."""
    try:
        if 'weather' not in weather_data or not weather_data['weather']:
            return "Weather data unavailable"

        main_weather = weather_data['weather'][0]['main'].lower()
        description = weather_data['weather'][0]['description'].lower()
        temp = weather_data['main']['temp']
        humidity = weather_data['main']['humidity']

        # Create descriptive summary
        if main_weather == 'clear':
            if temp > 25:
                desc = "Sunny and warm"
            elif temp > 15:
                desc = "Clear and pleasant"
            else:
                desc = "Clear and cool"
        elif main_weather == 'clouds':
            if 'few' in description:
                desc = "Partly cloudy"
            elif 'scattered' in description or 'broken' in description:
                desc = "Mostly cloudy"
            else:
                desc = "Overcast"
        elif main_weather == 'rain':
            if 'light' in description:
                desc = "Light rain"
            elif 'moderate' in description:
                desc = "Moderate rain"
            else:
                desc = "Heavy rain"
        elif main_weather == 'drizzle':
            desc = "Light drizzle"
        elif main_weather == 'thunderstorm':
            desc = "Thunderstorms"
        elif main_weather == 'snow':
            desc = "Snow"
        elif main_weather == 'mist' or main_weather == 'fog':
            desc = "Foggy"
        else:
            desc = description.capitalize()

        # Add temperature context
        if temp > 30:
            desc += ", hot"
        elif temp > 25:
            desc += ", warm"
        elif temp < 10:
            desc += ", cold"
        elif temp < 5:
            desc += ", very cold"

        # Add humidity context
        if humidity > 80:
            desc += ", humid"
        elif humidity < 30:
            desc += ", dry"

        return desc

    except Exception as e:
        return f"Weather description unavailable: {str(e)}"
