import ee
import geemap
from config.config import Config
import datetime
import numpy as np

def initialize_gee():
    """Initialize Google Earth Engine with prioritized authentication based on environment.

    For production/cloud environments (Render, headless servers):
    - Prioritizes service account authentication for reliability
    - Falls back to interactive auth if service account fails

    For local development:
    - Prioritizes interactive authentication for ease of use
    - Falls back to service account if interactive auth fails
    """
    import os

    # Environment detection: Check for headless/cloud environment indicators
    is_headless = (
        os.environ.get('DISPLAY') is None or  # No display (headless)
        os.environ.get('RENDER') is not None or  # Render deployment
        os.environ.get('CI') is not None or  # CI environment
        Config.FLASK_ENV == 'production' or  # Production environment
        os.environ.get('GITHUB_ACTIONS') is not None  # GitHub Actions
    )

    print(f"Environment detected: {'headless/cloud' if is_headless else 'local development'}")

    if is_headless:
        # Production/Cloud: Try service account first
        print("Prioritizing service account authentication for production environment...")

        # Try service account with Config credentials first
        if Config.GEE_SERVICE_ACCOUNT and Config.GEE_PRIVATE_KEY:
            if "Your private key here" not in Config.GEE_PRIVATE_KEY:
                try:
                    print(f"Attempting service account authentication with: {Config.GEE_SERVICE_ACCOUNT}")
                    credentials = ee.ServiceAccountCredentials(
                        Config.GEE_SERVICE_ACCOUNT,
                        key_data=Config.GEE_PRIVATE_KEY
                    )
                    ee.Initialize(credentials)
                    print("[SUCCESS] GEE initialized successfully with service account (production)")
                    return True
                except Exception as e:
                    print(f"[FAILED] Service account authentication failed: {str(e)}")
                    print("  This may be due to invalid credentials, insufficient permissions, or network issues.")
            else:
                print("[FAILED] Service account private key not properly configured (contains placeholder text)")
        else:
            print("[FAILED] Service account credentials not found in environment variables")

        # Fallback: Try service account with JSON file
        try:
            json_file_path = os.path.join(os.path.dirname(__file__), 'ee-daudipeterkamau-930c3f6b46e9.json')
            if os.path.exists(json_file_path):
                print(f"Attempting fallback service account authentication with JSON file: {json_file_path}")
                credentials = ee.ServiceAccountCredentials(None, json_file_path)
                ee.Initialize(credentials, project='ee-daudipeterkamau')
                print("[SUCCESS] GEE initialized successfully with service account JSON file (production)")
                return True
            else:
                print("[FAILED] Service account JSON file not found")
        except Exception as e:
            print(f"[FAILED] Service account JSON file authentication failed: {str(e)}")

        # Final fallback: Try interactive authentication
        try:
            print("Attempting fallback interactive authentication...")
            ee.Initialize()
            print("[SUCCESS] GEE initialized successfully with interactive authentication (fallback)")
            return True
        except Exception as e:
            print(f"[FAILED] Interactive authentication failed: {str(e)}")
            print("  This may require browser-based authentication which is not available in headless environment.")

    else:
        # Local Development: Try interactive authentication first
        print("Prioritizing interactive authentication for local development...")

        # Try interactive authentication first
        try:
            ee.Initialize()
            print("[SUCCESS] GEE initialized successfully with interactive authentication (development)")
            return True
        except Exception as e:
            print(f"[FAILED] Interactive authentication failed: {str(e)}")
            print("  This may require completing the authentication flow in your browser.")

        # Fallback: Try service account with Config credentials
        if Config.GEE_SERVICE_ACCOUNT and Config.GEE_PRIVATE_KEY:
            if "Your private key here" not in Config.GEE_PRIVATE_KEY:
                try:
                    print(f"Attempting fallback service account authentication with: {Config.GEE_SERVICE_ACCOUNT}")
                    credentials = ee.ServiceAccountCredentials(
                        Config.GEE_SERVICE_ACCOUNT,
                        key_data=Config.GEE_PRIVATE_KEY
                    )
                    ee.Initialize(credentials)
                    print("[SUCCESS] GEE initialized successfully with service account (development fallback)")
                    return True
                except Exception as e:
                    print(f"[FAILED] Service account authentication failed: {str(e)}")
            else:
                print("[FAILED] Service account private key not properly configured (contains placeholder text)")
        else:
            print("[FAILED] Service account credentials not found in environment variables")

        # Final fallback: Try service account with JSON file
        try:
            json_file_path = os.path.join(os.path.dirname(__file__), 'ee-daudipeterkamau-930c3f6b46e9.json')
            if os.path.exists(json_file_path):
                print(f"Attempting final fallback service account authentication with JSON file: {json_file_path}")
                credentials = ee.ServiceAccountCredentials(None, json_file_path)
                ee.Initialize(credentials, project='ee-daudipeterkamau')
                print("[SUCCESS] GEE initialized successfully with service account JSON file (development fallback)")
                return True
            else:
                print("[FAILED] Service account JSON file not found")
        except Exception as e:
            print(f"[FAILED] Service account JSON file authentication failed: {str(e)}")

    print("[FAILED] All GEE authentication methods failed. Check credentials and network connectivity.")
    return False

def get_ndvi(geometry):
    """Calculate NDVI for given geometry."""
    try:
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

        result = stats.getInfo()
        result['data_source'] = 'satellite'
        result['source_details'] = 'Google Earth Engine Sentinel-2'
        return result
    except Exception as e:
        # Return mock data on error
        return {
            'NDVI': 0.65,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_evi(geometry):
    """Calculate EVI (Enhanced Vegetation Index) for given geometry."""
    try:
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

        # Calculate EVI: 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
        nir = image.select('B8')
        red = image.select('B4')
        blue = image.select('B2')

        evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            {
                'NIR': nir,
                'RED': red,
                'BLUE': blue
            }
        ).rename('EVI')

        # Get EVI stats
        stats = evi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        )

        result = stats.getInfo()
        result['data_source'] = 'satellite'
        result['source_details'] = 'Google Earth Engine Sentinel-2'
        return result
    except Exception as e:
        # Return mock data on error
        return {
            'EVI': 0.45,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_savi(geometry, L=0.5):
    """Calculate SAVI (Soil-Adjusted Vegetation Index) for given geometry."""
    try:
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

        # Calculate SAVI: ((NIR - RED) / (NIR + RED + L)) * (1 + L)
        nir = image.select('B8')
        red = image.select('B4')

        savi = image.expression(
            '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
            {
                'NIR': nir,
                'RED': red,
                'L': L
            }
        ).rename('SAVI')

        # Get SAVI stats
        stats = savi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10,
            maxPixels=1e9
        )

        result = stats.getInfo()
        result['data_source'] = 'satellite'
        result['source_details'] = 'Google Earth Engine Sentinel-2'
        return result
    except Exception as e:
        # Return mock data on error
        return {
            'SAVI': 0.55,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_historical_ndvi(geometry, start_date='1984-01-01', end_date=None):
    """Get historical NDVI data using Landsat 8-Day VI Composite Collection."""
    try:
        if end_date is None:
            end_date = datetime.datetime.now().strftime('%Y-%m-%d')

        # Validate dates
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        if start.year < 1984 or end.date() > datetime.datetime.now().date():
            raise ValueError("Date range must be between 1984 and present")

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
            current = start
            while current <= end:
                dates.append(current.strftime('%Y-%m-%d'))
                values.append(0.5 + 0.3 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
                current += datetime.timedelta(days=8)  # 8-day intervals
            return {
                'dates': dates,
                'ndvi_values': values,
                'note': 'Mock data - GEE not initialized',
                'data_source': 'mock',
                'source_details': 'Fallback mock data'
            }

        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Get Landsat 8-Day NDVI Composite Collection
        collection = ee.ImageCollection('LANDSAT/LC8_L1T_8DAY_NDVI') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date)

        # Get all images and extract dates and values
        def extract_ndvi(image):
            date = image.date().format('YYYY-MM-dd')
            ndvi = image.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=roi,
                scale=30,
                maxPixels=1e9
            ).get('NDVI')
            return ee.Feature(None, {'date': date, 'ndvi': ndvi})

        features = collection.map(extract_ndvi)
        results = features.getInfo()

        # Process results
        dates = []
        values = []
        for feature in results['features']:
            props = feature['properties']
            if props['ndvi'] is not None:
                dates.append(props['date'])
                values.append(props['ndvi'])

        result = {
            'dates': dates,
            'ndvi_values': values,
            'data_source': 'satellite',
            'source_details': 'Google Earth Engine Landsat 8-Day NDVI'
        }
        return result

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        try:
            current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            # Use default dates if parsing fails
            current = datetime.datetime(1984, 1, 1)
            end_dt = datetime.datetime.now()
        while current <= end_dt:
            dates.append(current.strftime('%Y-%m-%d'))
            values.append(0.5 + 0.3 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
            current += datetime.timedelta(days=8)
        return {
            'dates': dates,
            'ndvi_values': values,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_historical_evi(geometry, start_date='1984-01-01', end_date=None):
    """Get historical EVI data using Landsat Level 2 with monthly averages."""
    try:
        if end_date is None:
            end_date = datetime.datetime.now().strftime('%Y-%m-%d')

        # Validate dates
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        if start.year < 1984 or end.date() > datetime.datetime.now().date():
            raise ValueError("Date range must be between 1984 and present")

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
            current = start
            while current <= end:
                dates.append(current.strftime('%Y-%m-%d'))
                values.append(0.35 + 0.25 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.08))
                current += datetime.timedelta(days=30)  # Monthly intervals
            return {
                'dates': dates,
                'evi_values': values,
                'note': 'Mock data - GEE not initialized',
                'data_source': 'mock',
                'source_details': 'Fallback mock data'
            }

        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Get Landsat Level 2 collection
        collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 20)) \
            .select(['SR_B2', 'SR_B4', 'SR_B5'])  # Blue, Red, NIR

        # Create a list of year-month combinations
        year_months = []
        current = start
        while current <= end:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define a function to calculate EVI for each month
        def calculate_monthly_evi(ym_str):
            year, month = ym_str.split('-')
            year = ee.Number.parse(year)
            month = ee.Number.parse(month)

            start = ee.Date.fromYMD(year, month, 1)
            end = ee.Date.fromYMD(
                ee.Algorithms.If(month.eq(12), year.add(1), year),
                ee.Algorithms.If(month.eq(12), 1, month.add(1)),
                1
            )

            monthly_collection = collection.filterDate(start, end)
            monthly_size = monthly_collection.size()

            # Calculate mean EVI for the month
            def compute_evi():
                monthly_image = monthly_collection.mean()
                nir = monthly_image.select('SR_B5')
                red = monthly_image.select('SR_B4')
                blue = monthly_image.select('SR_B2')

                monthly_evi = monthly_image.expression(
                    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
                    {
                        'NIR': nir,
                        'RED': red,
                        'BLUE': blue
                    }
                )

                mean_evi = monthly_evi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=roi,
                    scale=30,
                    maxPixels=1e9
                )
                return mean_evi.get('constant')

            # Return null if no images, otherwise compute EVI
            return ee.Algorithms.If(monthly_size.gt(0), compute_evi(), None)

        # Create an ee.List of year-month strings
        ym_list = ee.List(year_months)

        # Map the function over the list
        evi_results = ym_list.map(calculate_monthly_evi)

        # Get the results as a list
        results_list = evi_results.getInfo()

        # Process results
        dates = []
        values = []
        for i, ym in enumerate(year_months):
            evi_val = results_list[i]
            if evi_val is not None:
                dates.append(f"{ym}-15")  # Mid-month date
                values.append(evi_val)

        result = {
            'dates': dates,
            'evi_values': values,
            'data_source': 'satellite',
            'source_details': 'Google Earth Engine Landsat Level 2'
        }
        return result

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        try:
            current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            # Use default dates if parsing fails
            current = datetime.datetime(1984, 1, 1)
            end_dt = datetime.datetime.now()
        while current <= end_dt:
            dates.append(current.strftime('%Y-%m-%d'))
            values.append(0.35 + 0.25 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.08))
            current += datetime.timedelta(days=30)
        return {
            'dates': dates,
            'evi_values': values,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_historical_savi(geometry, start_date='1984-01-01', end_date=None, L=0.5):
    """Get historical SAVI data using Landsat Level 2 with monthly averages."""
    try:
        if end_date is None:
            end_date = datetime.datetime.now().strftime('%Y-%m-%d')

        # Validate dates
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        if start.year < 1984 or end.date() > datetime.datetime.now().date():
            raise ValueError("Date range must be between 1984 and present")

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
            current = start
            while current <= end:
                dates.append(current.strftime('%Y-%m-%d'))
                values.append(0.45 + 0.35 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
                current += datetime.timedelta(days=30)  # Monthly intervals
            return {
                'dates': dates,
                'savi_values': values,
                'note': 'Mock data - GEE not initialized',
                'data_source': 'mock',
                'source_details': 'Fallback mock data'
            }

        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Get Landsat Level 2 collection
        collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date) \
            .filter(ee.Filter.lt('CLOUD_COVER', 20)) \
            .select(['SR_B4', 'SR_B5'])  # Red, NIR

        # Create a list of year-month combinations
        year_months = []
        current = start
        while current <= end:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define a function to calculate SAVI for each month
        def calculate_monthly_savi(ym_str):
            year, month = ym_str.split('-')
            year = ee.Number.parse(year)
            month = ee.Number.parse(month)

            start = ee.Date.fromYMD(year, month, 1)
            end = ee.Date.fromYMD(
                ee.Algorithms.If(month.eq(12), year.add(1), year),
                ee.Algorithms.If(month.eq(12), 1, month.add(1)),
                1
            )

            monthly_collection = collection.filterDate(start, end)
            monthly_size = monthly_collection.size()

            # Calculate mean SAVI for the month
            def compute_savi():
                monthly_image = monthly_collection.mean()
                nir = monthly_image.select('SR_B5')
                red = monthly_image.select('SR_B4')

                monthly_savi = monthly_image.expression(
                    '((NIR - RED) / (NIR + RED + L)) * (1 + L)',
                    {
                        'NIR': nir,
                        'RED': red,
                        'L': L
                    }
                )

                mean_savi = monthly_savi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=roi,
                    scale=30,
                    maxPixels=1e9
                )
                return mean_savi.get('constant')

            # Return null if no images, otherwise compute SAVI
            return ee.Algorithms.If(monthly_size.gt(0), compute_savi(), None)

        # Create an ee.List of year-month strings
        ym_list = ee.List(year_months)

        # Map the function over the list
        savi_results = ym_list.map(calculate_monthly_savi)

        # Get the results as a list
        results_list = savi_results.getInfo()

        # Process results
        dates = []
        values = []
        for i, ym in enumerate(year_months):
            savi_val = results_list[i]
            if savi_val is not None:
                dates.append(f"{ym}-15")  # Mid-month date
                values.append(savi_val)

        result = {
            'dates': dates,
            'savi_values': values,
            'data_source': 'satellite',
            'source_details': 'Google Earth Engine Landsat Level 2'
        }
        return result

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        try:
            current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            # Use default dates if parsing fails
            current = datetime.datetime(1984, 1, 1)
            end_dt = datetime.datetime.now()
        while current <= end_dt:
            dates.append(current.strftime('%Y-%m-%d'))
            values.append(0.45 + 0.35 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
            current += datetime.timedelta(days=30)
        return {
            'dates': dates,
            'savi_values': values,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_land_cover(geometry):
    """Get land cover classification for given geometry."""
    try:
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

        lc_data = lc_stats.getInfo()

        # Convert numeric codes to human-readable land cover types
        land_cover_mapping = {
            '10': 'Tree cover',
            '20': 'Shrubland',
            '30': 'Grassland',
            '40': 'Cropland',
            '50': 'Built-up',
            '60': 'Bare / sparse vegetation',
            '70': 'Snow and ice',
            '80': 'Water bodies',
            '90': 'Herbaceous wetland',
            '95': 'Mangroves',
            '100': 'Moss and lichen'
        }

        land_cover_types = {}
        total_pixels = 0
        if 'Map' in lc_data:
            for code, count in lc_data['Map'].items():
                if code in land_cover_mapping:
                    land_cover_types[land_cover_mapping[code]] = count
                    total_pixels += count

        # Convert pixel counts to km² (10m resolution = 100m² per pixel = 0.0001 km² per pixel)
        pixel_to_km2 = 0.0001  # 10m × 10m = 100m² = 0.0001 km²
        land_cover_areas = {}
        for land_type, pixel_count in land_cover_types.items():
            area_km2 = pixel_count * pixel_to_km2
            percentage = (pixel_count / total_pixels * 100) if total_pixels > 0 else 0
            land_cover_areas[land_type] = {
                'area_km2': round(area_km2, 2),
                'percentage': round(percentage, 1),
                'pixel_count': pixel_count
            }

        lc_data['land_cover_types'] = land_cover_types  # Keep original for backward compatibility
        lc_data['land_cover_areas'] = land_cover_areas  # New km² format
        lc_data['data_source'] = 'satellite'
        lc_data['source_details'] = 'Google Earth Engine ESA WorldCover'
        return lc_data
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
            'land_cover_types': {
                'Tree cover': 1250,
                'Shrubland': 850,
                'Grassland': 2100,
                'Cropland': 1800,
                'Built-up': 450
            },
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def get_slope_data(geometry):
    """Get slope data for erosion risk assessment."""
    try:
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

        result = slope_stats.getInfo()
        result['data_source'] = 'satellite'
        result['source_details'] = 'Google Earth Engine SRTM DEM'
        return result
    except Exception as e:
        return {
            'slope_mean': 15.2,
            'slope_max': 45.8,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
        }

def calculate_risk_score(ndvi_data, land_cover_data, slope_data, weather_data, evi_data=None, savi_data=None):
    """Calculate comprehensive risk score for land degradation."""
    try:
        # Initialize risk factors
        vegetation_risk = 0
        land_cover_risk = 0
        erosion_risk = 0
        weather_risk = 0

        # Vegetation risk (based on multiple indices for better accuracy)
        ndvi = ndvi_data.get('NDVI', 0.5)
        evi = evi_data.get('EVI', 0.4) if evi_data else None
        savi = savi_data.get('SAVI', 0.5) if savi_data else None

        # Use average of available vegetation indices for more robust assessment
        vegetation_indices = [ndvi]
        if evi is not None:
            vegetation_indices.append(evi)
        if savi is not None:
            vegetation_indices.append(savi)

        avg_vegetation = sum(vegetation_indices) / len(vegetation_indices)

        # Adjust risk calculation based on vegetation density (use EVI for dense vegetation, SAVI for sparse)
        if avg_vegetation < 0.2:
            vegetation_risk = 0.9  # Very high risk
        elif avg_vegetation < 0.4:
            vegetation_risk = 0.7  # High risk
        elif avg_vegetation < 0.6:
            vegetation_risk = 0.4  # Medium risk
        elif avg_vegetation < 0.8:
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
            'note': 'Risk calculation failed, using default values',
            'data_source': 'calculated',
            'source_details': 'Risk assessment calculation with fallback values'
        }


def get_historical_vis(geometry, start_date='1984-01-01', end_date=None):
    """Get historical NDVI, EVI, SAVI data for the specified date range."""
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
            ndvi_values = []
            evi_values = []
            savi_values = []
            current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            end = datetime.datetime.strptime(end_date or datetime.datetime.now().strftime('%Y-%m-%d'), '%Y-%m-%d')
            while current <= end:
                dates.append(current.strftime('%Y-%m-15'))
                ndvi_values.append(0.5 + 0.3 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
                evi_values.append(0.35 + 0.25 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.08))
                savi_values.append(0.45 + 0.35 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)
            return {
                'dates': dates,
                'ndvi_values': ndvi_values,
                'evi_values': evi_values,
                'savi_values': savi_values,
                'note': 'Mock data - GEE not initialized',
                'data_source': 'mock',
                'source_details': 'Fallback mock data'
            }

        roi = ee.Geometry.Polygon(geometry['coordinates'])

        # Validate and parse dates
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        if end_date:
            end = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        else:
            end = datetime.datetime.now()

        if start.year < 1984 or end.date() > datetime.datetime.now().date():
            raise ValueError("Date range must be between 1984 and present")

        # Create a list of year-month combinations
        year_months = []
        current = start
        while current <= end:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Get NDVI from 8-day composite
        ndvi_collection = ee.ImageCollection('LANDSAT/LC8_L1T_8DAY_NDVI') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date or datetime.datetime.now().strftime('%Y-%m-%d'))

        # Get EVI and SAVI from Landsat Level 2
        vi_collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
            .filterBounds(roi) \
            .filterDate(start_date, end_date or datetime.datetime.now().strftime('%Y-%m-%d')) \
            .filter(ee.Filter.lt('CLOUD_COVER', 20)) \
            .select(['SR_B2', 'SR_B4', 'SR_B5'])

        # Define a function to calculate VIs for each month
        def calculate_monthly_vis(ym_str):
            year, month = ym_str.split('-')
            year = ee.Number.parse(year)
            month = ee.Number.parse(month)

            start_month = ee.Date.fromYMD(year, month, 1)
            end_month = ee.Date.fromYMD(
                ee.Algorithms.If(month.eq(12), year.add(1), year),
                ee.Algorithms.If(month.eq(12), 1, month.add(1)),
                1
            )

            # NDVI from composite
            monthly_ndvi_collection = ndvi_collection.filterDate(start_month, end_month)
            monthly_ndvi_size = monthly_ndvi_collection.size()

            # VI from Level 2
            monthly_vi_collection = vi_collection.filterDate(start_month, end_month)
            monthly_vi_size = monthly_vi_collection.size()

            def compute_vis():
                # NDVI
                ndvi_mean = ee.Algorithms.If(
                    monthly_ndvi_size.gt(0),
                    monthly_ndvi_collection.mean().reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=roi,
                        scale=30,
                        maxPixels=1e9
                    ).get('NDVI'),
                    None
                )

                # EVI and SAVI
                vi_mean = ee.Algorithms.If(
                    monthly_vi_size.gt(0),
                    monthly_vi_collection.mean(),
                    None
                )

                evi_val = ee.Algorithms.If(
                    vi_mean,
                    vi_mean.expression(
                        '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
                        {
                            'NIR': vi_mean.select('SR_B5'),
                            'RED': vi_mean.select('SR_B4'),
                            'BLUE': vi_mean.select('SR_B2')
                        }
                    ).reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=roi,
                        scale=30,
                        maxPixels=1e9
                    ).get('constant'),
                    None
                )

                savi_val = ee.Algorithms.If(
                    vi_mean,
                    vi_mean.expression(
                        '((NIR - RED) / (NIR + RED + 0.5)) * 1.5',
                        {
                            'NIR': vi_mean.select('SR_B5'),
                            'RED': vi_mean.select('SR_B4')
                        }
                    ).reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=roi,
                        scale=30,
                        maxPixels=1e9
                    ).get('constant'),
                    None
                )

                return ee.Dictionary({
                    'ndvi': ndvi_mean,
                    'evi': evi_val,
                    'savi': savi_val
                })

            return ee.Algorithms.If(
                ee.Algorithms.Or(monthly_ndvi_size.gt(0), monthly_vi_size.gt(0)),
                compute_vis(),
                ee.Dictionary({'ndvi': None, 'evi': None, 'savi': None})
            )

        # Map the function over the list
        ym_list = ee.List(year_months)
        vis_results = ym_list.map(calculate_monthly_vis)

        # Get the results
        results_list = vis_results.getInfo()

        # Process results
        dates = []
        ndvi_values = []
        evi_values = []
        savi_values = []
        for i, ym in enumerate(year_months):
            vis_data = results_list[i]
            if vis_data:
                dates.append(f"{ym}-15")
                ndvi_values.append(vis_data.get('ndvi'))
                evi_values.append(vis_data.get('evi'))
                savi_values.append(vis_data.get('savi'))

        result = {
            'dates': dates,
            'ndvi_values': ndvi_values,
            'evi_values': evi_values,
            'savi_values': savi_values,
            'data_source': 'satellite',
            'source_details': 'Google Earth Engine Landsat/Sentinel composites'
        }
        return result

    except Exception as e:
        # Return mock data on error
        dates = []
        ndvi_values = []
        evi_values = []
        savi_values = []
        try:
            current = datetime.datetime.strptime(start_date, '%Y-%m-%d')
            end_str = end_date or datetime.datetime.now().strftime('%Y-%m-%d')
            end = datetime.datetime.strptime(end_str, '%Y-%m-%d')
        except ValueError:
            # Use default dates if parsing fails
            current = datetime.datetime(1984, 1, 1)
            end = datetime.datetime.now()
        while current <= end:
            dates.append(current.strftime('%Y-%m-15'))
            ndvi_values.append(0.5 + 0.3 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
            evi_values.append(0.35 + 0.25 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.08))
            savi_values.append(0.45 + 0.35 * np.sin(current.month * np.pi / 6) + np.random.normal(0, 0.1))
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
        return {
            'dates': dates,
            'ndvi_values': ndvi_values,
            'evi_values': evi_values,
            'savi_values': savi_values,
            'error': str(e),
            'note': 'Mock data due to error',
            'data_source': 'mock',
            'source_details': 'Fallback mock data'
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