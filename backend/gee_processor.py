import ee
import geemap
from config.config import Config
import datetime
import numpy as np

def initialize_gee():
    """Initialize Google Earth Engine with user authentication or service account."""
    try:
        # Try to initialize without project first (uses default)
        ee.Initialize()
        print("GEE initialized successfully with user authentication")
        return True
    except Exception as e1:
        print(f"GEE initialization without project failed: {e1}")
        
        # Try with service account JSON file first
        try:
            import os
            json_file_path = os.path.join(os.path.dirname(__file__), 'ee-daudipeterkamau-14e6262536e5.json')
            if os.path.exists(json_file_path):
                print(f"Attempting service account initialization with JSON file: {json_file_path}")
                credentials = ee.ServiceAccountCredentials(None, json_file_path)
                ee.Initialize(credentials, project='ee-daudipeterkamau')
                print("Service account initialization successful with JSON file")
                return True
        except Exception as json_error:
            print(f"JSON file initialization failed: {json_error}")
        
        # Try with different project options
        projects_to_try = ['earthengine-legacy', 'earthengine-public', 'ee-daudipeterkamau']
        
        for project in projects_to_try:
            try:
                print(f"Trying to initialize with project: {project}")
                ee.Initialize(project=project)
                print(f"Successfully initialized with project: {project}")
                return True
            except Exception as e2:
                print(f"Failed with project {project}: {e2}")
                continue
        
        # Fallback to service account if credentials are available
        try:
            if Config.GEE_SERVICE_ACCOUNT and Config.GEE_PRIVATE_KEY and "Your private key here" not in Config.GEE_PRIVATE_KEY:
                print("Attempting service account initialization...")
                credentials = ee.ServiceAccountCredentials(
                    Config.GEE_SERVICE_ACCOUNT,
                    key_data=Config.GEE_PRIVATE_KEY
                )
                ee.Initialize(credentials)
                print("Service account initialization successful")
                return True
            else:
                print("GEE service account credentials not properly configured")
        except Exception as service_error:
            print(f"GEE service account initialization failed: {service_error}")
        
        # For development: return True to allow testing without GEE
        print("WARNING: GEE not initialized. Running in development mode with mock data.")
        return True

def get_ndvi(geometry):
    """Calculate NDVI for given geometry."""
    try:
        # Check if GEE is properly initialized by trying to access it
        try:
            # Try to create a simple geometry to test if GEE is working
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False

        if not gee_initialized:
            # Return mock data for development
            return {
                'NDVI': 0.65,
                'note': 'Mock data - GEE not initialized'
            }

        # Define the region of interest
        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Get Sentinel-2 image collection
        collection = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterBounds(roi) \
            .filterDate('2023-01-01', '2024-01-01') \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .sort('system:time_start', False)

        # Get the most recent image
        image = collection.first()

        # Calculate NDVI
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')

        # Get NDVI stats
        stats = ndvi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        )

        return stats.getInfo()
    except Exception as e:
        # Return mock data on error
        return {
            'NDVI': 0.65,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_historical_ndvi(geometry, years=10):
    """Get historical NDVI data for the past N years with monthly averages."""
    try:
        # Check if GEE is properly initialized
        try:
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False

        if not gee_initialized:
            # Return mock historical data
            dates = []
            values = []
            for year in range(2023 - years + 1, 2024):
                for month in range(1, 13):
                    dates.append(f"{year}-{month:02d}-15")
                    values.append(0.5 + 0.3 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.1))
            return {
                'dates': dates,
                'ndvi_values': values,
                'note': 'Mock data - GEE not initialized'
            }

        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Calculate start and end dates
        end_date = datetime.datetime.now()
        start_date = end_date - datetime.timedelta(days=365 * years)

        # Get Sentinel-2 collection
        collection = ee.ImageCollection('COPERNICUS/S2_SR') \
            .filterBounds(roi) \
            .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .select(['B4', 'B8'])

        # Function to calculate monthly NDVI
        def calculate_monthly_ndvi(year_month):
            year, month = year_month.split('-')
            start = f"{year}-{month}-01"
            end = f"{year}-{int(month)+1:02d}-01" if int(month) < 12 else f"{int(year)+1}-01-01"

            monthly_collection = collection.filterDate(start, end)
            if monthly_collection.size().getInfo() == 0:
                return None

            # Get mean NDVI for the month
            monthly_ndvi = monthly_collection.mean().normalizedDifference(['B8', 'B4'])
            mean_ndvi = monthly_ndvi.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=roi,
                scale=10,
                maxPixels=1e9
            )
            return mean_ndvi.getInfo().get('nd', None)

        # Generate list of year-month combinations
        year_months = []
        current = start_date
        while current <= end_date:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Calculate NDVI for each month
        dates = []
        values = []
        for ym in year_months:
            ndvi_val = calculate_monthly_ndvi(ym)
            if ndvi_val is not None:
                dates.append(f"{ym}-15")  # Mid-month date
                values.append(ndvi_val)

        return {
            'dates': dates,
            'ndvi_values': values
        }

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        for year in range(2023 - years + 1, 2024):
            for month in range(1, 13):
                dates.append(f"{year}-{month:02d}-15")
                values.append(0.5 + 0.3 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.1))
        return {
            'dates': dates,
            'ndvi_values': values,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_land_cover(geometry):
    """Get land cover classification for given geometry."""
    try:
        # Check if GEE is properly initialized by trying to access it
        try:
            # Try to create a simple geometry to test if GEE is working
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False
        
        if not gee_initialized:
            # Return mock data for development
            return {
                'Map': {
                    '10': 1250,  # Tree cover
                    '20': 850,   # Shrubland
                    '30': 2100,  # Grassland
                    '40': 1800,  # Cropland
                    '50': 450    # Built-up
                },
                'note': 'Mock data - GEE not initialized'
            }
        
        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # ESA WorldCover 2021
        landcover = ee.ImageCollection("ESA/WorldCover/v200").first()

        # Get land cover values
        lc_stats = landcover.reduceRegion(
            reducer=ee.Reducer.frequencyHistogram(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        )

        return lc_stats.getInfo()
    except Exception as e:
        # Return mock data on error
        return {
            'Map': {
                '10': 1250,  # Tree cover
                '20': 850,   # Shrubland
                '30': 2100,  # Grassland
                '40': 1800,  # Cropland
                '50': 450    # Built-up
            },
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_slope_data(geometry):
    """Get slope data for erosion risk assessment."""
    try:
        try:
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False
        
        if not gee_initialized:
            # Return mock slope data
            return {
                'slope_mean': 15.2,
                'slope_max': 45.8,
                'note': 'Mock data - GEE not initialized'
            }
        
        roi = ee.Geometry.Polygon(geometry['coordinates'])
        
        # Get SRTM elevation data
        elevation = ee.Image('USGS/SRTMGL1_003')
        
        # Calculate slope
        slope = ee.Terrain.slope(elevation)
        
        # Get slope statistics
        slope_stats = slope.reduceRegion(
            reducer=ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
            geometry=roi,
            scale=30,
            maxPixels=1e9
        )
        
        return slope_stats.getInfo()
    except Exception as e:
        return {
            'slope_mean': 15.2,
            'slope_max': 45.8,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def calculate_risk_score(ndvi_data, land_cover_data, slope_data, weather_data):
    """Calculate comprehensive risk score for land degradation."""
    try:
        # Initialize risk factors
        vegetation_risk = 0
        land_cover_risk = 0
        erosion_risk = 0
        weather_risk = 0
        
        # Vegetation risk (based on NDVI)
        ndvi = ndvi_data.get('NDVI', 0.5)
        if ndvi < 0.2:
            vegetation_risk = 0.9  # Very high risk
        elif ndvi < 0.4:
            vegetation_risk = 0.7  # High risk
        elif ndvi < 0.6:
            vegetation_risk = 0.4  # Medium risk
        elif ndvi < 0.8:
            vegetation_risk = 0.2  # Low risk
        else:
            vegetation_risk = 0.1  # Very low risk
        
        # Land cover risk (based on cover types)
        lc_map = land_cover_data.get('Map', {})
        total_pixels = sum(lc_map.values()) if lc_map else 1
        
        # Calculate risk based on land cover types
        risk_weights = {
            '10': 0.1,  # Tree cover - low risk
            '20': 0.3,  # Shrubland - medium risk
            '30': 0.5,  # Grassland - medium-high risk
            '40': 0.4,  # Cropland - medium risk
            '50': 0.8,  # Built-up - high risk
            '60': 0.9,  # Bare/sparse vegetation - very high risk
            '70': 0.2,  # Snow and ice - low risk
            '80': 0.3,  # Water bodies - low-medium risk
            '90': 0.4,  # Wetlands - medium risk
            '95': 0.2,  # Mangroves - low risk
            '100': 0.6  # Moss and lichen - high risk
        }
        
        weighted_risk = 0
        for cover_type, pixel_count in lc_map.items():
            weight = risk_weights.get(cover_type, 0.5)
            weighted_risk += (pixel_count / total_pixels) * weight
        
        land_cover_risk = weighted_risk
        
        # Erosion risk (based on slope)
        slope_mean = slope_data.get('slope_mean', 0)
        slope_max = slope_data.get('slope_max', 0)
        
        if slope_mean > 30:
            erosion_risk = 0.9
        elif slope_mean > 20:
            erosion_risk = 0.7
        elif slope_mean > 10:
            erosion_risk = 0.4
        else:
            erosion_risk = 0.2
        
        # Weather risk (based on precipitation and temperature)
        if weather_data and 'main' in weather_data:
            temp = weather_data['main'].get('temp', 20)
            humidity = weather_data['main'].get('humidity', 50)
            
            # High temperature and low humidity increase risk
            if temp > 30 and humidity < 30:
                weather_risk = 0.8
            elif temp > 25 and humidity < 40:
                weather_risk = 0.6
            elif temp < 10 or humidity > 80:
                weather_risk = 0.3
            else:
                weather_risk = 0.2
        else:
            weather_risk = 0.3  # Default medium risk if no weather data
        
        # Calculate weighted overall risk score
        weights = {
            'vegetation': 0.35,
            'land_cover': 0.25,
            'erosion': 0.25,
            'weather': 0.15
        }
        
        overall_risk = (
            vegetation_risk * weights['vegetation'] +
            land_cover_risk * weights['land_cover'] +
            erosion_risk * weights['erosion'] +
            weather_risk * weights['weather']
        )
        
        # Determine risk level with simplified Green/Yellow/Red system
        if overall_risk >= 0.6:
            risk_level = 'High Risk'
            risk_color = '#d32f2f'  # Red
        elif overall_risk >= 0.3:
            risk_level = 'Medium Risk'
            risk_color = '#ffc107'  # Yellow
        else:
            risk_level = 'Low Risk'
            risk_color = '#28a745'  # Green
        
        return {
            'overall_risk_score': round(overall_risk, 3),
            'risk_level': risk_level,
            'risk_color': risk_color,
            'risk_factors': {
                'vegetation_risk': round(vegetation_risk, 3),
                'land_cover_risk': round(land_cover_risk, 3),
                'erosion_risk': round(erosion_risk, 3),
                'weather_risk': round(weather_risk, 3)
            },
            'recommendations': get_risk_recommendations(overall_risk, risk_level)
        }
        
    except Exception as e:
        return {
            'overall_risk_score': 0.5,
            'risk_level': 'Medium',
            'risk_color': '#fbc02d',
            'error': str(e),
            'note': 'Risk calculation failed, using default values'
        }

def get_risk_recommendations(risk_score, risk_level):
    """Generate recommendations based on risk assessment."""
    recommendations = []
    
    if risk_level in ['Very High', 'High']:
        recommendations.extend([
            "Immediate intervention required",
            "Consider soil conservation measures",
            "Implement erosion control structures",
            "Monitor vegetation health regularly"
        ])
    elif risk_level == 'Medium':
        recommendations.extend([
            "Monitor land condition closely",
            "Consider preventive measures",
            "Implement sustainable land management practices"
        ])
    else:
        recommendations.extend([
            "Continue current management practices",
            "Regular monitoring recommended",
            "Maintain soil health"
        ])
    
    return recommendations