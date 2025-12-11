import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from sklearn.metrics import mean_squared_error
import warnings
import hashlib
import asyncio
warnings.filterwarnings("ignore")

def forecast_ndvi(historical_ndvi, periods=12, geometry_hash=None, use_sarima=False):
    """
    Forecast NDVI using ARIMA/SARIMA model with caching and confidence intervals.
    historical_ndvi: dict with 'dates' and 'values' lists
    periods: number of months to forecast
    geometry_hash: hash of geometry for caching
    use_sarima: whether to use SARIMA instead of ARIMA
    """
    try:
        # Filter out invalid values
        valid_data = [(d, v) for d, v in zip(historical_ndvi['dates'], historical_ndvi['values']) if v is not None and str(v).lower() != 'nan']

        if len(valid_data) == 0:
            return {'error': 'No valid historical NDVI data available for forecasting'}

        dates, values = zip(*valid_data)
        dates = pd.to_datetime(dates)
        values = pd.Series(values, index=dates)

        # Ensure numeric and clean
        values = pd.to_numeric(values, errors='coerce').dropna()
        if len(values) == 0:
            return {'error': 'No valid historical NDVI data available for forecasting'}

        # Generate model key for caching
        model_key = None
        if geometry_hash:
            data_hash = hashlib.md5(str(values.values.tolist()).encode()).hexdigest()
            model_type = 'sarima' if use_sarima else 'arima'
            model_key = f"ndvi_{model_type}_{geometry_hash}_{data_hash}"

        # Try to get cached model
        cached_model = None
        if model_key:
            from database import db
            cached_model = db.get_cached_arima_model(model_key)

        if cached_model:
            # Use cached model
            model_fit = cached_model['model']
            model_info = cached_model['model_info']
        else:
            # Fit new model
            if use_sarima:
                # SARIMA model with seasonal component (12 months seasonality)
                from statsmodels.tsa.statespace.sarimax import SARIMAX
                model = SARIMAX(values, order=(1,1,1), seasonal_order=(1,1,1,12))
                model_fit = model.fit(disp=False)
                model_info = {
                    'model_type': 'SARIMA',
                    'order': (1,1,1),
                    'seasonal_order': (1,1,1,12),
                    'aic': model_fit.aic
                }
            else:
                # ARIMA model (p,d,q) - simple (1,1,1)
                model = ARIMA(values, order=(1,1,1))
                model_fit = model.fit()
                model_info = {
                    'model_type': 'ARIMA',
                    'order': (1,1,1),
                    'aic': model_fit.aic
                }

            # Cache the model
            if model_key:
                db.save_cached_arima_model(model_key, model_fit, model_info)

        # Forecast with confidence intervals
        forecast_result = model_fit.get_forecast(steps=periods)
        forecast = forecast_result.predicted_mean
        confidence_intervals = forecast_result.conf_int()

        # Return forecast as list
        forecast_dates = pd.date_range(start=dates[-1] + pd.DateOffset(months=1), periods=periods, freq='M')
        return {
            'forecast_dates': forecast_dates.strftime('%Y-%m-%d').tolist(),
            'forecast_values': forecast.tolist(),
            'confidence_intervals': {
                'lower': confidence_intervals.iloc[:, 0].tolist(),
                'upper': confidence_intervals.iloc[:, 1].tolist()
            },
            'model_info': model_info,
            'cached': cached_model is not None
        }
    except Exception as e:
        return {'error': str(e)}

def forecast_weather(historical_weather, variable='temperature', periods=12, location_key=None, use_sarima=False):
    """
    Forecast weather variable using ARIMA/SARIMA with caching and confidence intervals.
    historical_weather: dict with 'dates', 'temperature', 'rainfall' lists
    variable: 'temperature', 'rainfall', or 'precipitation' (alias for rainfall)
    periods: number of months to forecast
    location_key: key for caching (lat_lon format)
    use_sarima: whether to use SARIMA instead of ARIMA
    """
    try:
        # Handle precipitation as alias for rainfall
        if variable == 'precipitation':
            variable = 'rainfall'

        # Filter out invalid values
        valid_data = [(d, v) for d, v in zip(historical_weather['dates'], historical_weather[variable]) if v is not None and str(v).lower() != 'nan']

        if len(valid_data) == 0:
            return {'error': f'No valid historical {variable} data available for forecasting'}

        dates, values = zip(*valid_data)
        dates = pd.to_datetime(dates)
        values = pd.Series(values, index=dates)

        # Ensure numeric and clean
        values = pd.to_numeric(values, errors='coerce').dropna()
        if len(values) == 0:
            return {'error': f'No valid historical {variable} data available for forecasting'}

        # Generate model key for caching
        model_key = None
        if location_key:
            data_hash = hashlib.md5(str(values.values.tolist()).encode()).hexdigest()
            model_type = 'sarima' if use_sarima else 'arima'
            model_key = f"weather_{variable}_{model_type}_{location_key}_{data_hash}"

        # Try to get cached model
        cached_model = None
        if model_key:
            from database import db
            cached_model = db.get_cached_arima_model(model_key)

        if cached_model:
            # Use cached model
            model_fit = cached_model['model']
            model_info = cached_model['model_info']
        else:
            # Fit new model
            if use_sarima:
                # SARIMA model with seasonal component (12 months seasonality)
                from statsmodels.tsa.statespace.sarimax import SARIMAX
                model = SARIMAX(values, order=(1,1,1), seasonal_order=(1,1,1,12))
                model_fit = model.fit(disp=False)
                model_info = {
                    'model_type': 'SARIMA',
                    'order': (1,1,1),
                    'seasonal_order': (1,1,1,12),
                    'aic': model_fit.aic,
                    'variable': variable
                }
            else:
                # ARIMA model
                model = ARIMA(values, order=(1,1,1))
                model_fit = model.fit()
                model_info = {
                    'model_type': 'ARIMA',
                    'order': (1,1,1),
                    'aic': model_fit.aic,
                    'variable': variable
                }

            # Cache the model
            if model_key:
                db.save_cached_arima_model(model_key, model_fit, model_info)

        # Forecast with confidence intervals
        forecast_result = model_fit.get_forecast(steps=periods)
        forecast = forecast_result.predicted_mean
        confidence_intervals = forecast_result.conf_int()

        forecast_dates = pd.date_range(start=dates[-1] + pd.DateOffset(months=1), periods=periods, freq='M')
        return {
            'forecast_dates': forecast_dates.strftime('%Y-%m-%d').tolist(),
            'forecast_values': forecast.tolist(),
            'confidence_intervals': {
                'lower': confidence_intervals.iloc[:, 0].tolist(),
                'upper': confidence_intervals.iloc[:, 1].tolist()
            },
            'variable': variable,
            'model_info': model_info,
            'cached': cached_model is not None
        }
    except Exception as e:
        return {'error': str(e)}

def calculate_statistics(data):
    """
    Calculate statistical metrics for time series data.
    data: list of values
    """
    try:
        series = pd.Series(data)
        stats = {
            'mean': float(series.mean()),
            'median': float(series.median()),
            'std_dev': float(series.std()),
            'min': float(series.min()),
            'max': float(series.max()),
            'count': int(series.count())
        }

        # Trend calculation (simple linear regression slope)
        if len(series) > 1:
            x = np.arange(len(series))
            slope = np.polyfit(x, series.values, 1)[0]
            stats['trend_slope'] = float(slope)
        else:
            stats['trend_slope'] = 0.0

        return stats
    except Exception as e:
        return {'error': str(e)}
