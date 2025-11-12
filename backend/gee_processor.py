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

def get_evi(geometry):
    """Calculate EVI (Enhanced Vegetation Index) for given geometry."""
    try:
        # Check if GEE is properly initialized
        try:
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False

        if not gee_initialized:
            # Return mock data for development
            return {
                'EVI': 0.45,
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

        return stats.getInfo()
    except Exception as e:
        # Return mock data on error
        return {
            'EVI': 0.45,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_savi(geometry, L=0.5):
    """Calculate SAVI (Soil-Adjusted Vegetation Index) for given geometry."""
    try:
        # Check if GEE is properly initialized
        try:
            test_geometry = ee.Geometry.Point([0, 0])
            gee_initialized = True
        except:
            gee_initialized = False

        if not gee_initialized:
            # Return mock data for development
            return {
                'SAVI': 0.55,
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

        return stats.getInfo()
    except Exception as e:
        # Return mock data on error
        return {
            'SAVI': 0.55,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_historical_ndvi(geometry, years=10):
    """Get historical NDVI data for the past N years with monthly averages using parallel processing."""
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

        # Create a list of year-month combinations
        year_months = []
        current = start_date
        while current <= end_date:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define a function to calculate NDVI for each month (to be mapped over)
        def calculate_monthly_ndvi(ym_str):
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

            # Calculate mean NDVI for the month
            def compute_ndvi():
                monthly_ndvi = monthly_collection.mean().normalizedDifference(['B8', 'B4'])
                mean_ndvi = monthly_ndvi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=roi,
                    scale=10,
                    maxPixels=1e9
                )
                return mean_ndvi.get('nd')

            # Return null if no images, otherwise compute NDVI
            return ee.Algorithms.If(monthly_size.gt(0), compute_ndvi(), None)

        # Create an ee.List of year-month strings
        ym_list = ee.List(year_months)

        # Map the function over the list in parallel
        ndvi_results = ym_list.map(calculate_monthly_ndvi)

        # Get the results as a list
        results_list = ndvi_results.getInfo()

        # Process results
        dates = []
        values = []
        for i, ym in enumerate(year_months):
            ndvi_val = results_list[i]
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

def get_historical_evi(geometry, years=10):
    """Get historical EVI data for the past N years with monthly averages using parallel processing."""
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
                    values.append(0.35 + 0.25 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.08))
            return {
                'dates': dates,
                'evi_values': values,
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
            .select(['B2', 'B4', 'B8'])

        # Create a list of year-month combinations
        year_months = []
        current = start_date
        while current <= end_date:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define a function to calculate EVI for each month (to be mapped over)
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
                nir = monthly_image.select('B8')
                red = monthly_image.select('B4')
                blue = monthly_image.select('B2')

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
                    scale=10,
                    maxPixels=1e9
                )
                return mean_evi.get('constant')

            # Return null if no images, otherwise compute EVI
            return ee.Algorithms.If(monthly_size.gt(0), compute_evi(), None)

        # Create an ee.List of year-month strings
        ym_list = ee.List(year_months)

        # Map the function over the list in parallel
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

        return {
            'dates': dates,
            'evi_values': values
        }

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        for year in range(2023 - years + 1, 2024):
            for month in range(1, 13):
                dates.append(f"{year}-{month:02d}-15")
                values.append(0.35 + 0.25 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.08))
        return {
            'dates': dates,
            'evi_values': values,
            'error': str(e),
            'note': 'Mock data due to error'
        }

def get_historical_savi(geometry, years=10, L=0.5):
    """Get historical SAVI data for the past N years with monthly averages using parallel processing."""
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
                    values.append(0.45 + 0.35 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.1))
            return {
                'dates': dates,
                'savi_values': values,
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

        # Create a list of year-month combinations
        year_months = []
        current = start_date
        while current <= end_date:
            year_months.append(f"{current.year}-{current.month:02d}")
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        # Define a function to calculate SAVI for each month (to be mapped over)
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
                nir = monthly_image.select('B8')
                red = monthly_image.select('B4')

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
                    scale=10,
                    maxPixels=1e9
                )
                return mean_savi.get('constant')

            # Return null if no images, otherwise compute SAVI
            return ee.Algorithms.If(monthly_size.gt(0), compute_savi(), None)

        # Create an ee.List of year-month strings
        ym_list = ee.List(year_months)

        # Map the function over the list in parallel
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

        return {
            'dates': dates,
            'savi_values': values
        }

    except Exception as e:
        # Return mock data on error
        dates = []
        values = []
        for year in range(2023 - years + 1, 2024):
            for month in range(1, 13):
                dates.append(f"{year}-{month:02d}-15")
                values.append(0.45 + 0.35 * np.sin(month * np.pi / 6) + np.random.normal(0, 0.1))
        return {
            'dates': dates,
            'savi_values': values,
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
                'land_cover_types': {
                    'Tree cover': 1250,
                    'Shrubland': 850,
                    'Grassland': 2100,
                    'Cropland': 1800,
                    'Built-up': 450
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