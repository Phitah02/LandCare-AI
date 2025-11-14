# LandCare AI - Land Analysis Platform

## Overview

LandCare AI is a comprehensive multi-section web application for land analysis, featuring a modern, user-friendly interface with dedicated sections for introduction, features, interactive exploration, future predictions, and calls to action. Users must authenticate to access analysis features. The platform provides detailed insights including multiple vegetation indices (NDVI, EVI, SAVI), land cover classification, slope analysis, comprehensive risk assessment, historical trends analysis, and weather forecasting using Google Earth Engine (GEE), OpenWeatherMap APIs, and advanced ARIMA modeling for predictions. A sophisticated caching system ensures optimal performance for repeated analyses.

### Key Features
- **User Authentication**: Secure login/signup system required for accessing analysis features.
- **Hero Section**: Engaging introduction with title, subtitle, and call-to-action button.
- **Features Section**: Highlight key capabilities with cards for Vegetation Analysis, Soil Health, and Water Management.
- **Interactive Explore Area**: Draw and edit polygons on a Leaflet-based map with satellite imagery, integrated with a sidebar for results.
- **Multi-Index Vegetation Analysis**: Comprehensive analysis using NDVI, EVI (Enhanced Vegetation Index), and SAVI (Soil-Adjusted Vegetation Index).
- **Real-time Analysis**: Instant vegetation indices, land cover classification, slope analysis, area calculation, and current weather data.
- **Advanced Risk Assessment**: Comprehensive risk scoring based on vegetation health, land cover types, erosion potential, and weather conditions with early warning recommendations.
- **Historical Analysis**: View vegetation indices and weather trends over the past 10+ years with interactive charts and caching for performance.
- **Future Predictions**: ARIMA-based forecasting of NDVI and weather conditions for up to 24 months ahead with confidence intervals.
- **Location Search**: Search for places by name using OpenStreetMap geocoding and automatically create analysis polygons.
- **Performance Caching**: Intelligent caching system for historical data and ML models to ensure fast response times.
- **Dark/Light Theme**: Toggle between themes for better user experience.
- **Responsive Design**: Optimized for desktop and mobile devices.
- **CTA Footer**: Call-to-action section encouraging user engagement.

### Core Functionality
- **User Authentication**: JWT-based authentication system with secure password hashing.
- **Interactive Map**: Users draw polygons using Leaflet.js and Leaflet.Draw on the frontend.
- **Analysis**: Backend processes GeoJSON polygons via Flask API with comprehensive data processing and caching.
- **Integrations**:
  - Google Earth Engine for NDVI, EVI, SAVI, land cover, slope, and historical satellite data.
  - OpenWeatherMap for current weather, historical weather, and forecasting.
  - ERA5 dataset (via GEE) for long-term climate data.
  - Supabase for data storage, user management, and caching.
- **Machine Learning**: ARIMA time series forecasting for vegetation and weather predictions.
- **Visualization**: Results displayed in tabbed panels with metrics, charts, risk indicators, and early warnings.

### Architecture
```
Frontend (Leaflet.js) ↔ Backend (Flask API) ↔ Google Earth Engine ↔ OpenWeatherMap
     ↓
User draws polygon → GeoJSON → GEE Processing → Visualization
```

## Project Structure
```
LandCare/
├── backend/
│   ├── app.py                 # Main Flask application with authentication
│   ├── config/
│   │   ├── __init__.py
│   │   └── config.py          # Configuration settings
│   ├── gee_processor.py       # GEE integration for vegetation indices, land cover, slope
│   ├── weather_integration.py # OpenWeatherMap and ERA5 integration
│   ├── forecasting.py         # ARIMA forecasting for NDVI and weather
│   ├── models.py              # Database models, caching, and Supabase integration
│   ├── requirements.txt       # Python dependencies
│   ├── test_auth.py           # Authentication tests
│   ├── test_authentication_enforcement.py # Auth enforcement tests
│   ├── test_db.py             # Database tests
│   └── .env.example           # Environment variables template
├── frontend/
│   ├── index.html             # Main HTML page with multi-section layout
│   ├── login.html             # User login page
│   ├── signup.html            # User registration page
│   ├── css/
│   │   ├── style.css          # Main application styles
│   │   └── login.css          # Authentication page styles
│   ├── js/
│   │   ├── app.js             # Main application logic and authentication
│   │   ├── login.js           # Login page functionality
│   │   ├── signup.js          # Signup page functionality
│   │   └── map-handler.js     # Leaflet map handling and drawing
│   └── assets/                # Images, icons, and favicons
├── database/
│   └── landcare_public_schema.sql             # Supabase database schema
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── LICENSE                    # MIT License
├── README.md                  # This file
└── TODO.md                    # Development tasks and progress
```

## Database Schema

The application uses Supabase with the following tables (prefixed with `landcare_` in the public schema):

- **users**: User accounts with email/password authentication
  - Fields: id (UUID), email (TEXT, unique), password_hash (TEXT), created_at (TIMESTAMP), updated_at (TIMESTAMP)
- **analyses**: User analysis results including vegetation indices, land cover, slope, area, weather, and risk assessment
  - Fields: id (UUID), user_id (TEXT), geometry (JSONB), ndvi (DECIMAL), evi (DECIMAL), savi (DECIMAL), land_cover (JSONB), slope (DECIMAL), area_hectares (DECIMAL), weather (JSONB), risk_assessment (JSONB), created_at (TIMESTAMP)
- **historical_data**: Historical NDVI, EVI, SAVI, and weather data for user analyses
  - Fields: id (UUID), user_id (TEXT), geometry (JSONB), latitude (DECIMAL), longitude (DECIMAL), data_type (TEXT), dates (JSONB), values (JSONB), temperature (JSONB), rainfall (JSONB), created_at (TIMESTAMP)
- **forecasts**: ARIMA forecasting results for vegetation and weather
  - Fields: id (UUID), user_id (TEXT), geometry (JSONB), forecast_type (TEXT), forecast_data (JSONB), forecast_dates (JSONB), forecast_values (JSONB), model_info (TEXT), created_at (TIMESTAMP)
- **cached_historical_data**: Performance cache for historical data (30-day expiration)
  - Fields: id (UUID), data_type (TEXT), geometry_hash (TEXT), latitude (DECIMAL), longitude (DECIMAL), years (INTEGER), data (JSONB), created_at (TIMESTAMP)
- **cached_models**: Cached ARIMA models for forecasting (7-day expiration)
  - Fields: id (UUID), model_key (TEXT), model_type (TEXT), model_data (TEXT), model_info (JSONB), created_at (TIMESTAMP)

Row Level Security (RLS) is enabled on all tables except users, with policies ensuring users can only access their own data. Indexes are created for optimal query performance.

## Setup Instructions

### 1. Prerequisites
- Python 3.8+
- Node.js (optional, not used in this setup)
- Google Earth Engine account (service account recommended for server-side)
- OpenWeatherMap API key
- Supabase account (for database functionality)

### 2. Environment Setup

#### Backend (Python/Flask)
1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Create a virtual environment:
   ```
   python -m venv venv
   ```

3. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - macOS/Linux: `source venv/bin/activate`

4. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

5. Copy the environment file:
   ```
   copy ..\ .env.example .env
   ```
   (Or `cp ../.env.example .env` on macOS/Linux)

6. Configure `.env`:
   - **Google Earth Engine**:
     - Create a Google Cloud Project and enable the Earth Engine API.
     - Create a service account and download the JSON key file.
     - Set `GEE_SERVICE_ACCOUNT` to the email (e.g., `service@project.iam.gserviceaccount.com`).
     - Set `GEE_PRIVATE_KEY` to the full private key content (multiline string from the JSON).
     - Authenticate: Run `earthengine authenticate --service-account` in the terminal (follow prompts).
   - **OpenWeatherMap**:
     - Sign up at [openweathermap.org/api](https://openweathermap.org/api) and get an API key.
     - Set `OPENWEATHER_API_KEY=your_key_here`.
   - **Supabase**:
     - Create a project at [supabase.com](https://supabase.com).
     - Go to Settings > API to get your project URL and anon key.
     - Set `SUPABASE_URL=https://your-project.supabase.co`.
     - Set `SUPABASE_KEY=your_anon_key_here`.
     - Run the SQL schema from `database/schema.sql` in your Supabase SQL editor.
   - Generate a strong `SECRET_KEY` for Flask (use `python -c "import secrets; print(secrets.token_hex(16))"`).

#### Frontend
- No build step required. The frontend is static HTML/CSS/JS.
- Leaflet.js and Leaflet.Draw are loaded via CDN.

### 3. Running the Application

1. Start the backend server:
   ```
   cd backend
   # Ensure venv is activated
   python app.py
   ```
   - The server runs on `http://localhost:5000`.
   - Check health: Visit `http://localhost:5000/health` (should show `{"status": "healthy", "gee_initialized": true}`).

2. Open the frontend:
   - Navigate to `frontend/index.html` in your browser (or use `python -m http.server 8000` in the root and visit `http://localhost:8000/frontend/index.html`).
   - The app will connect to the backend at `http://localhost:5000`.

### 4. Usage
1. **Authentication**: Start by creating an account or logging in using the buttons in the navigation bar.
    - Click "Sign Up" to create a new account with email and password.
    - Click "Login" to access your existing account.
    - All analysis features require authentication.

2. Open the main app in your browser after logging in.

3. **Hero Section**: Read the introduction and click "Explore Your Area" to scroll to the interactive section.

4. **Features Section**: Review the key capabilities (Vegetation Analysis, Soil Health, Water Management).

5. **Theme Toggle**: Click the "🌙 Dark Mode" button in the header to switch between light and dark themes.

6. **Explore Section**: Use the interactive map and sidebar for analysis.
    - **Location Search**: Enter a place name (e.g., "Nairobi, Kenya") in the search box and click "Search Location" to automatically create a polygon around that area.
    - **Draw Polygon**: Click "Draw Polygon" to start drawing on the map, or use the searched location.
    - Draw a polygon over an area of interest (e.g., farmland).
    - Click "Analyze" to process:
      - Multiple vegetation indices: NDVI, EVI, and SAVI for comprehensive vegetation health assessment.
      - Land cover classification with area calculations.
      - Slope analysis for erosion risk.
      - Area calculations in hectares.
      - Current weather conditions at the polygon's center.
      - Comprehensive risk assessment with overall score and factor breakdowns.
    - View results in the sidebar:
      - **Statistics Tab**: Basic metrics including all vegetation indices, land cover, slope, area, and weather.
      - **Risk Analysis Tab**: Detailed risk factors (vegetation, land cover, erosion, weather) with visual meters and early warnings.
      - **Historical Analysis Tab**: View historical trends for NDVI, EVI, SAVI, and weather data (default 10 years, cached for performance).
      - **Forecasting Tab**: ARIMA-based forecasting of NDVI and weather conditions (default 6 months).
    - Use "Clear/Reset" to reset the map and results.

7. **Future Section**: View sample bar charts for health trends and risk levels (integrates with analysis results).

8. **Footer**: Click "Be part of the solution" to return to the explore section.

### 5. Testing
- **Authentication**: Test user registration, login, and JWT token validation.
- **Basic Map**: Ensure the map loads with base layers.
- **Drawing**: Verify polygon drawing and editing work.
- **API Calls**: Test authenticated endpoints with sample GeoJSON via Postman or curl.
  Example analysis request:
  ```
  curl -X POST http://localhost:5000/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"geometry": {"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]}}'
  ```
- **GEE**: Ensure authentication works; check console for errors.
- **Weather**: Test `/weather/<lat>/<lon>` and forecast endpoints.
- **Historical Data**: Test historical NDVI, EVI, SAVI, and weather endpoints.
- **Forecasting**: Test NDVI and weather forecasting with cached model performance.
- **Database**: Run included test files (`test_auth.py`, `test_db.py`, etc.) to verify database operations.

### 6. Troubleshooting
- **GEE Errors**: Verify service account has Earth Engine access. Run `python -c "import ee; ee.Authenticate();"` for testing.
- **CORS Issues**: Flask-CORS is enabled; ensure backend runs on port 5000.
- **Map Not Loading**: Check browser console for Leaflet CDN issues.
- **No Results**: Ensure polygon is valid and within GEE data coverage (e.g., not over oceans).

### 7. Development
- Backend: Use `FLASK_ENV=development` for debug mode.
- Frontend: Edit JS/CSS and refresh the browser.
- Authentication: JWT-based user system with secure password hashing.
- Caching: Historical data and ML models cached for performance (30-day and 7-day expiration respectively).
- Testing: Run authentication and database tests with provided test files.
- Add features: Enhance forecasting models, add more vegetation indices, implement real-time monitoring.

### 8. Deployment
- **Backend**: Deploy Flask to Heroku, Vercel, or Google Cloud Run. Set env vars securely.
- **Frontend**: Host static files on Netlify, Vercel, or GitHub Pages.
- **Database**: Supabase handles user data and analysis storage automatically.

## Contributing
1. Fork the repository.
2. Create a feature branch.
3. Make changes and test.
4. Submit a pull request.

## Author
Peter Kamau Mwaura

GitHub: [@Phitah02](https://github.com/Phitah02)
LinkedIn: [Peter Kamau Mwaura](https://www.linkedin.com/in/peter-kamau-mwaura-aa748b241)

## Last Updated
15th November 2024

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact
For questions, open an issue or contact the maintainer.
