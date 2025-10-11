from supabase import create_client, Client
from config.config import Config
import json
from datetime import datetime

class Database:
    def __init__(self):
        if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
            self.client = None
            print("Warning: Supabase not configured. Database functionality disabled.")
        else:
            self.client: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

    def save_analysis(self, user_id: str, geometry: dict, results: dict):
        """Save analysis results to database."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'ndvi': results.get('ndvi', {}).get('NDVI'),
                'land_cover': json.dumps(results.get('land_cover', {})),
                'weather': json.dumps(results.get('weather', {})),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('analyses').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_user_analyses(self, user_id: str, limit: int = 10):
        """Get user's analysis history."""
        try:
            return self.client.table('analyses').select('*').eq('user_id', user_id).order('created_at', descending=True).limit(limit).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_user(self, user_id: str, email: str):
        """Save or update user information."""
        try:
            data = {
                'id': user_id,
                'email': email,
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('users').upsert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_historical_ndvi(self, user_id: str, geometry: dict, historical_data: dict):
        """Save historical NDVI data."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'data_type': 'ndvi',
                'dates': json.dumps(historical_data.get('dates', [])),
                'values': json.dumps(historical_data.get('ndvi_values', [])),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('historical_data').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_historical_weather(self, user_id: str, lat: float, lon: float, historical_data: dict):
        """Save historical weather data."""
        try:
            data = {
                'user_id': user_id,
                'latitude': lat,
                'longitude': lon,
                'data_type': 'weather',
                'dates': json.dumps(historical_data.get('dates', [])),
                'temperature': json.dumps(historical_data.get('temperature', [])),
                'rainfall': json.dumps(historical_data.get('rainfall', [])),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('historical_data').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_historical_data(self, user_id: str, data_type: str, limit: int = 5):
        """Get user's historical data."""
        try:
            return self.client.table('historical_data').select('*').eq('user_id', user_id).eq('data_type', data_type).order('created_at', descending=True).limit(limit).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_forecast(self, user_id: str, geometry: dict, forecast_data: dict):
        """Save forecast results."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'forecast_type': forecast_data.get('type', 'ndvi'),
                'forecast_dates': json.dumps(forecast_data.get('forecast_dates', [])),
                'forecast_values': json.dumps(forecast_data.get('forecast_values', [])),
                'model_info': forecast_data.get('model_info', ''),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('forecasts').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_forecasts(self, user_id: str, limit: int = 5):
        """Get user's forecast history."""
        try:
            return self.client.table('forecasts').select('*').eq('user_id', user_id).order('created_at', descending=True).limit(limit).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

# Global database instance
db = Database()
