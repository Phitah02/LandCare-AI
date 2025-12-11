import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    GEE_SERVICE_ACCOUNT = os.getenv('GEE_SERVICE_ACCOUNT')
    GEE_PRIVATE_KEY = os.getenv('GEE_PRIVATE_KEY')
    APP_ENV = os.getenv('APP_ENV', 'development')
    DEBUG = APP_ENV == 'development'

    # Supabase
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
