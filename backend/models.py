from supabase import create_client, Client
from config.config import Config
import json
from datetime import datetime, timedelta
import hashlib
import pickle
import base64
import jwt
import bcrypt
from functools import wraps

class Database:
    def __init__(self):
        if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
            self.client = None
            print("Warning: Supabase not configured. Database functionality disabled.")
        else:
            self.client: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
            self.schema = 'public'  # Use public schema with landcare_ prefixed tables

    def save_analysis(self, user_id: str, geometry: dict, results: dict):
        """Save analysis results to database."""
        try:
            # Extract NDVI value - handle both dict and direct value formats
            ndvi_data = results.get('ndvi', {})
            if isinstance(ndvi_data, dict):
                ndvi_value = ndvi_data.get('NDVI')
            else:
                ndvi_value = ndvi_data

            # Extract EVI value
            evi_data = results.get('evi', {})
            if isinstance(evi_data, dict):
                evi_value = evi_data.get('EVI')
            else:
                evi_value = evi_data

            # Extract SAVI value
            savi_data = results.get('savi', {})
            if isinstance(savi_data, dict):
                savi_value = savi_data.get('SAVI')
            else:
                savi_value = savi_data

            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'ndvi': ndvi_value,
                'evi': evi_value,
                'savi': savi_value,
                'land_cover': json.dumps(results.get('land_cover', {})),
                'weather': json.dumps(results.get('weather', {})),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_analyses').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_user_analyses(self, user_id: str, limit: int = 10):
        """Get user's analysis history."""
        try:
            return self.client.table('landcare_analyses').select('*').eq('user_id', user_id).order('created_at', descending=True).limit(limit).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def create_user(self, email: str, password: str):
        """Create a new user with hashed password."""
        try:
            # Hash the password
            password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            data = {
                'email': email,
                'password_hash': password_hash,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            result = self.client.table('landcare_users').insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def authenticate_user(self, email: str, password: str):
        """Authenticate user and return user data if valid."""
        try:
            result = self.client.table('landcare_users').select('*').eq('email', email).execute()
            if result.data:
                user = result.data[0]
                # Check password
                if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
                    return user
            return None
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def user_exists(self, email: str):
        """Check if a user with the given email already exists."""
        try:
            result = self.client.table('landcare_users').select('id').eq('email', email).execute()
            return len(result.data) > 0
        except Exception as e:
            print(f"Database error: {e}")
            return False

    def get_user_by_id(self, user_id: str):
        """Get user by ID."""
        try:
            result = self.client.table('landcare_users').select('id, email, created_at, updated_at').eq('id', user_id).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_user(self, user_id: str, email: str):
        """Save or update user information (legacy method)."""
        try:
            data = {
                'id': user_id,
                'email': email,
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_users').upsert(data).execute()
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
            return self.client.table('landcare_historical_data').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_historical_evi(self, user_id: str, geometry: dict, historical_data: dict):
        """Save historical EVI data."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'data_type': 'evi',
                'dates': json.dumps(historical_data.get('dates', [])),
                'values': json.dumps(historical_data.get('evi_values', [])),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_historical_data').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def save_historical_savi(self, user_id: str, geometry: dict, historical_data: dict):
        """Save historical SAVI data."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'data_type': 'savi',
                'dates': json.dumps(historical_data.get('dates', [])),
                'values': json.dumps(historical_data.get('savi_values', [])),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_historical_data').insert(data).execute()
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
            return self.client.table('landcare_historical_data').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_historical_data(self, user_id: str, data_type: str, limit: int = 5):
        """Get user's historical data."""
        try:
            return self.client.table('landcare_historical_data').select('*').eq('user_id', user_id).eq('data_type', data_type).order('created_at', descending=True).limit(limit).execute()
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
            return self.client.table('landcare_forecasts').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_forecasts(self, user_id: str, limit: int = 5):
        """Get user's forecast history."""
        try:
            return self.client.table('landcare_forecasts').select('*').eq('user_id', user_id).order('created_at', descending=True).limit(limit).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def get_cached_historical_data(self, data_type: str, geometry_hash: str, lat: float = None, lon: float = None, years: int = 10):
        """Get cached historical data if available and not expired."""
        try:
            # Calculate expiration time (30 days)
            expiration_time = datetime.utcnow() - timedelta(days=30)

            query = self.client.table('landcare_cached_historical_data').select('*') \
                .eq('data_type', data_type) \
                .eq('geometry_hash', geometry_hash) \
                .eq('years', years) \
                .gt('created_at', expiration_time.isoformat())

            if lat is not None and lon is not None:
                query = query.eq('latitude', lat).eq('longitude', lon)

            result = query.order('created_at', descending=True).limit(1).execute()

            if result.data:
                cached_data = result.data[0]
                # Deserialize the cached data
                cached_data['data'] = json.loads(cached_data['data'])
                return cached_data
            return None
        except Exception as e:
            print(f"Cache retrieval error: {e}")
            return None

    def save_cached_historical_data(self, data_type: str, geometry_hash: str, data: dict, lat: float = None, lon: float = None, years: int = 10):
        """Save historical data to cache."""
        try:
            cache_data = {
                'data_type': data_type,
                'geometry_hash': geometry_hash,
                'latitude': lat,
                'longitude': lon,
                'years': years,
                'data': json.dumps(data),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_cached_historical_data').insert(cache_data).execute()
        except Exception as e:
            print(f"Cache save error: {e}")
            return None

    def get_cached_arima_model(self, model_key: str):
        """Get cached ARIMA model if available and not expired."""
        try:
            # Calculate expiration time (7 days for models)
            expiration_time = datetime.utcnow() - timedelta(days=7)

            result = self.client.table('landcare_cached_models').select('*') \
                .eq('model_key', model_key) \
                .gt('created_at', expiration_time.isoformat()) \
                .order('created_at', descending=True).limit(1).execute()

            if result.data:
                cached_model = result.data[0]
                # Deserialize the model
                try:
                    model_bytes = base64.b64decode(cached_model['model_data'])
                    cached_model['model'] = pickle.loads(model_bytes)
                    return cached_model
                except Exception as deserial_error:
                    print(f"Model deserialization error: {deserial_error}")
                    return None
            return None
        except Exception as e:
            print(f"Model cache retrieval error: {e}")
            return None

    def save_cached_arima_model(self, model_key: str, model, model_info: dict):
        """Save ARIMA model to cache."""
        try:
            # Serialize the model
            model_bytes = pickle.dumps(model)
            model_data = base64.b64encode(model_bytes).decode('utf-8')

            cache_data = {
                'model_key': model_key,
                'model_type': 'arima',
                'model_data': model_data,
                'model_info': json.dumps(model_info),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_cached_models').insert(cache_data).execute()
        except Exception as e:
            print(f"Model cache save error: {e}")
            return None

    def save_forecast(self, user_id: str, geometry: dict, forecast_data: dict):
        """Save forecast data to database."""
        try:
            data = {
                'user_id': user_id,
                'geometry': json.dumps(geometry),
                'forecast_data': json.dumps(forecast_data),
                'created_at': datetime.utcnow().isoformat()
            }
            return self.client.table('landcare_forecasts').insert(data).execute()
        except Exception as e:
            print(f"Database error: {e}")
            return None

    def clear_expired_cache(self, days: int = 30):
        """Clear expired cache entries."""
        try:
            expiration_time = datetime.utcnow() - timedelta(days=days)

            # Clear historical data cache
            self.client.table('landcare_cached_historical_data').delete() \
                .lt('created_at', expiration_time.isoformat()).execute()

            # Clear model cache (shorter expiration)
            model_expiration = datetime.utcnow() - timedelta(days=7)
            self.client.table('landcare_cached_models').delete() \
                .lt('created_at', model_expiration.isoformat()).execute()

            return True
        except Exception as e:
            print(f"Cache cleanup error: {e}")
            return False

    def generate_geometry_hash(self, geometry: dict) -> str:
        """Generate a hash for geometry to use as cache key."""
        geometry_str = json.dumps(geometry, sort_keys=True)
        return hashlib.md5(geometry_str.encode()).hexdigest()

# Global database instance
db = Database()

def generate_token(user_id: str, email: str) -> str:
    """Generate JWT token for user."""
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.utcnow() + timedelta(days=7)  # Token expires in 7 days
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')

def token_required(f):
    """Decorator to require authentication token."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import request
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid authorization header'}), 401

        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])
            request.user_id = payload['user_id']
            request.user_email = payload['email']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated_function
