import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from sklearn.metrics import mean_squared_error
import warnings
warnings.filterwarnings("ignore")

def forecast_ndvi(historical_ndvi, periods=12):
    """
    Forecast NDVI using ARIMA model.
    historical_ndvi: dict with 'dates' and 'values' lists
    periods: number of months to forecast
    """
    try:
        # Convert to pandas Series
        dates = pd.to_datetime(historical_ndvi['dates'])
        values = pd.Series(historical_ndvi['values'], index=dates)

        # Fit ARIMA model (p,d,q) - simple (1,1,1)
        model = ARIMA(values, order=(1,1,1))
        model_fit = model.fit()

        # Forecast
        forecast = model_fit.forecast(steps=periods)

        # Return forecast as list
        forecast_dates = pd.date_range(start=dates[-1] + pd.DateOffset(months=1), periods=periods, freq='M')
        return {
            'forecast_dates': forecast_dates.strftime('%Y-%m-%d').tolist(),
            'forecast_values': forecast.tolist(),
            'model_info': 'ARIMA(1,1,1)'
        }
    except Exception as e:
        return {'error': str(e)}

def forecast_weather(historical_weather, variable='temperature', periods=12):
    """
    Forecast weather variable using ARIMA.
    historical_weather: dict with 'dates', 'temperature', 'rainfall' lists
    variable: 'temperature' or 'rainfall'
    """
    try:
        dates = pd.to_datetime(historical_weather['dates'])
        values = pd.Series(historical_weather[variable], index=dates)

        # Fit ARIMA
        model = ARIMA(values, order=(1,1,1))
        model_fit = model.fit()

        # Forecast
        forecast = model_fit.forecast(steps=periods)

        forecast_dates = pd.date_range(start=dates[-1] + pd.DateOffset(months=1), periods=periods, freq='M')
        return {
            'forecast_dates': forecast_dates.strftime('%Y-%m-%d').tolist(),
            'forecast_values': forecast.tolist(),
            'variable': variable,
            'model_info': 'ARIMA(1,1,1)'
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
