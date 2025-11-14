-- LandCare AI Tables in Public Schema (with landcare_ prefix)

-- Users table
CREATE TABLE IF NOT EXISTS landcare_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analyses table
CREATE TABLE IF NOT EXISTS landcare_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    geometry JSONB NOT NULL,
    ndvi DECIMAL,
    evi DECIMAL,
    savi DECIMAL,
    land_cover JSONB,
    weather JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical data table
CREATE TABLE IF NOT EXISTS landcare_historical_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    geometry JSONB,
    latitude DECIMAL,
    longitude DECIMAL,
    data_type TEXT NOT NULL, -- 'ndvi', 'evi', 'savi', 'weather'
    dates JSONB,
    values JSONB,
    temperature JSONB,
    rainfall JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Forecasts table
CREATE TABLE IF NOT EXISTS landcare_forecasts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    geometry JSONB,
    forecast_type TEXT NOT NULL, -- 'ndvi', 'weather'
    forecast_data JSONB,
    forecast_dates JSONB,
    forecast_values JSONB,
    model_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cached historical data table
CREATE TABLE IF NOT EXISTS landcare_cached_historical_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data_type TEXT NOT NULL,
    geometry_hash TEXT NOT NULL,
    latitude DECIMAL,
    longitude DECIMAL,
    years INTEGER DEFAULT 10,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cached models table
CREATE TABLE IF NOT EXISTS landcare_cached_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_key TEXT NOT NULL,
    model_type TEXT NOT NULL,
    model_data TEXT NOT NULL,
    model_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_landcare_analyses_user_id ON landcare_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_landcare_analyses_created_at ON landcare_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landcare_historical_data_user_id ON landcare_historical_data(user_id);
CREATE INDEX IF NOT EXISTS idx_landcare_historical_data_type ON landcare_historical_data(data_type);
CREATE INDEX IF NOT EXISTS idx_landcare_forecasts_user_id ON landcare_forecasts(user_id);
CREATE INDEX IF NOT EXISTS idx_landcare_cached_historical_data_hash ON landcare_cached_historical_data(geometry_hash);
CREATE INDEX IF NOT EXISTS idx_landcare_cached_models_key ON landcare_cached_models(model_key);

-- Row Level Security (RLS) policies
-- Temporarily disable RLS for users table to allow custom auth
-- ALTER TABLE landcare_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE landcare_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE landcare_historical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE landcare_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE landcare_cached_historical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE landcare_cached_models ENABLE ROW LEVEL SECURITY;

-- Users table has RLS disabled for custom auth
-- No policies needed for landcare_users

-- Analyses policies
CREATE POLICY "Users can view own analyses" ON landcare_analyses
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own analyses" ON landcare_analyses
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own analyses" ON landcare_analyses
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own analyses" ON landcare_analyses
    FOR DELETE USING (auth.uid()::text = user_id);

-- Historical data policies
CREATE POLICY "Users can view own historical data" ON landcare_historical_data
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own historical data" ON landcare_historical_data
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Forecasts policies
CREATE POLICY "Users can view own forecasts" ON landcare_forecasts
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own forecasts" ON landcare_forecasts
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Cached data policies (allow authenticated users to read/write cache)
CREATE POLICY "Authenticated users can view cached historical data" ON landcare_cached_historical_data
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert cached historical data" ON landcare_cached_historical_data
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view cached models" ON landcare_cached_models
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert cached models" ON landcare_cached_models
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
