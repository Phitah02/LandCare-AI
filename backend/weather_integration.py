import requests
from config.config import Config
from datetime import datetime, timedelta
import ee
import numpy as np

def get_weather_data(lat, lon):
    """Get comprehensive weather data from OpenWeatherMap API."""
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={Config.OPENWEATHER_API_KEY}&units=metric"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        # Enhance weather data with agricultural insights
        enhanced_data = enhance_weather_data(data)
        return enhanced_data
    except Exception as e:
        return {'error': str(e)}

def get_weather_forecast(lat, lon):
    """Get 5-day weather forecast with agricultural insights."""
    try:
        url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={Config.OPENWEATHER_API_KEY}&units=metric"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        # Process forecast data for agricultural insights
        processed_forecast = process_forecast_data(data)
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

def get_historical_weather(lat, lon, years=10):
    """Get historical weather data using GEE ERA5 dataset with parallel processing."""
    try:
        # Check if GEE is initialized
        try:
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False

        if not gee_initialized:
            # Return mock historical data
            dates = []
            temperatures = []
            rainfall = []
            for year in range(2023 - years + 1, 2024):
                for month in range(1, 13):
                    dates.append(f"{year}-{month:02d}-15")
                    temperatures.append(20 + 10 * np.sin(month * np.pi / 6) + np.random.normal(0, 5))
                    rainfall.append(max(0, 50 + 30 * np.sin(month * np.pi / 6) + np.random.normal(0, 20)))
            return {
                'dates': dates,
                'temperature': temperatures,
                'rainfall': rainfall,
                'note': 'Mock data - GEE not initialized'
            }

        # Define point
        point = ee.Geometry.Point([lon, lat])

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365 * years)

        # Get ERA5 daily data
        era5 = ee.ImageCollection('ECMWF/ERA5/DAILY') \
            .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')) \
            .select(['mean_2m_air_temperature', 'total_precipitation'])

        # Create list of year-month combinations
        year_months = []
        current = start_date
        while current <= end_date:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define function to extract monthly data (to be mapped over)
        def get_monthly_weather(year_month_str):
            def inner_calc(ym_str):
                year, month = ym_str.split('-')
                year = ee.Number.parse(year)
                month = ee.Number.parse(month)

                start = ee.Date.fromYMD(year, month, 1)
                end = ee.Date.fromYMD(
                    ee.Algorithms.If(month.eq(12), year.add(1), year),
                    ee.Algorithms.If(month.eq(12), 1, month.add(1)),
                    1
                )

                monthly_data = era5.filterDate(start, end)
                monthly_size = monthly_data.size()

                # Calculate monthly aggregates
                def compute_weather():
                    temp_mean = monthly_data.select('mean_2m_air_temperature').mean()
                    precip_sum = monthly_data.select('total_precipitation').sum()

                    # Extract values
                    temp_val = temp_mean.reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point,
                        scale=27830
                    ).get('mean_2m_air_temperature')

                    precip_val = precip_sum.reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point,
                        scale=27830
                    ).get('total_precipitation')

                    return ee.Dictionary({
                        'temperature': temp_val,
                        'rainfall': precip_val
                    })

                # Return null dict if no data, otherwise compute
                return ee.Algorithms.If(monthly_size.gt(0), compute_weather(), ee.Dictionary())

            return inner_calc(year_month_str)

        # Create ee.List and map function in parallel
        ym_list = ee.List(year_months)
        weather_results = ym_list.map(lambda ym: get_monthly_weather(ym))

        # Get results
        results_list = weather_results.getInfo()

        # Process results
        dates = []
        temperatures = []
        rainfall = []

        for i, ym in enumerate(year_months):
            data = results_list[i]
            if data and 'temperature' in data and data['temperature'] is not None:
                dates.append(f"{ym}-15")
                temperatures.append(data['temperature'] - 273.15)  # Convert Kelvin to Celsius
                rainfall.append((data['rainfall'] or 0) * 1000)  # Convert to mm

        return {
            'dates': dates,
            'temperature': temperatures,
            'rainfall': rainfall
        }

    except Exception as e:
        # Return mock data on error
        dates = []
        temperatures = []
        rainfall = []
        for year in range(2023 - years + 1, 2024):
            for month in range(1, 13):
                dates.append(f"{year}-{month:02d}-15")
                temperatures.append(20 + 10 * np.sin(month * np.pi / 6) + np.random.normal(0, 5))
                rainfall.append(max(0, 50 + 30 * np.sin(month * np.pi / 6) + np.random.normal(0, 20)))
        return {
            'dates': dates,
            'temperature': temperatures,
            'rainfall': rainfall,
            'error': str(e),
            'note': 'Mock data due to error'
        }

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
