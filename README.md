# LandCare AI - Agricultural Analysis Platform

## Overview

LandCare AI is a comprehensive web application for  land analysis, enabling users to draw polygons on an interactive map and receive detailed insights including NDVI (Normalized Difference Vegetation Index), land cover classification, risk assessment, historical trends, and weather forecasting using Google Earth Engine (GEE) and OpenWeatherMap APIs.

### Key Features
- **Interactive Map**: Draw and edit polygons on a Leaflet-based map with satellite imagery.
- **Real-time Analysis**: Instant NDVI, land cover, slope, area calculation, and weather data.
- **Risk Assessment**: Comprehensive risk scoring based on vegetation, land cover, erosion, and weather factors.
- **Historical Analysis**: View NDVI and weather trends over the past 10+ years with interactive charts.
- **Forecasting**: Predict NDVI and weather conditions for up to 24 months ahead.
- **Location Search**: Search for places by name and automatically create analysis polygons.
- **Dark/Light Theme**: Toggle between themes for better user experience.
- **Responsive Design**: Optimized for desktop and mobile devices.

### Core Functionality
- **Interactive Map**: Users draw polygons using Leaflet.js and Leaflet.Draw on the frontend.
- **Analysis**: Backend processes GeoJSON polygons via Flask API with comprehensive data processing.
- **Integrations**:
  - Google Earth Engine for NDVI, land cover, slope, and historical data.
  - OpenWeatherMap for current weather and forecasting.
  - Supabase for data storage and user management.
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
│   ├── app.py                 # Main Flask application
│   ├── config/
│   │   ├── __init__.py
│   │   └── config.py          # Configuration settings
│   ├── gee_processor.py       # GEE integration for NDVI and land cover
│   ├── weather_integration.py # OpenWeatherMap integration
│   ├── models.py              # Database models and Supabase integration
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── index.html             # Main HTML page
│   ├── css/
│   │   └── style.css          # Styles for the application
│   ├── js/
│   │   ├── app.js             # Main application logic
│   │   └── map-handler.js     # Leaflet map handling and drawing
│   └── assets/                # (Optional) Images and other assets
├── database/
│   └── schema.sql             # Supabase database schema
├── .env.example               # Environment variables template
├── README.md                  # This file
└── LICENSE
```

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
1. Open the app in your browser.
2. **Theme Toggle**: Click the "🌙 Dark Mode" button in the header to switch between light and dark themes.
3. **Location Search**: Enter a place name (e.g., "Nairobi, Kenya") in the search box and click "Search Location" to automatically create a polygon around that area.
4. **Draw Polygon**: Click "Draw Polygon" to start drawing on the map, or use the searched location.
5. Draw a polygon over an area of interest (e.g., farmland).
6. Click "Analyze" to process:
   - NDVI value for vegetation health.
   - Land cover breakdown (e.g., cropland percentage).
   - Slope and area calculations.
   - Current weather at the polygon's center.
   - Risk assessment with overall score and factor breakdowns.
7. View results in the bottom panel:
   - **Statistics Tab**: Basic metrics and overview.
   - **Risk Analysis Tab**: Detailed risk factors and early warnings.
   - **Historical Analysis Tab**: Get historical NDVI and weather data (default 10 years).
   - **Forecasting Tab**: Forecast NDVI and weather (default 6 months).
8. Use "Clear/Reset" to reset the map and results.

### 5. Testing
- **Basic Map**: Ensure the map loads with base layers.
- **Drawing**: Verify polygon drawing and editing work.
- **API Calls**: Test `/analyze` endpoint with sample GeoJSON via Postman or curl.
  Example:
  ```
  curl -X POST http://localhost:5000/analyze \
  -H "Content-Type: application/json" \
  -d '{"geometry": {"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]}}'
  ```
- **GEE**: Ensure authentication works; check console for errors.
- **Weather**: Test `/weather/<lat>/<lon>` endpoint.

### 6. Troubleshooting
- **GEE Errors**: Verify service account has Earth Engine access. Run `python -c "import ee; ee.Authenticate();"` for testing.
- **CORS Issues**: Flask-CORS is enabled; ensure backend runs on port 5000.
- **Map Not Loading**: Check browser console for Leaflet CDN issues.
- **No Results**: Ensure polygon is valid and within GEE data coverage (e.g., not over oceans).

### 7. Development
- Backend: Use `FLASK_ENV=development` for debug mode.
- Frontend: Edit JS/CSS and refresh the browser.
- Add features: Enhance GEE processing (e.g., time-series NDVI), add user auth, deploy to cloud.

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

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact
For questions, open an issue or contact the maintainer.
