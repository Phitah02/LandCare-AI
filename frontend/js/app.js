console.log('app.js loaded, creating LandCareApp');

// Main application logic
class LandCareApp {
    constructor() {
        console.log('LandCareApp constructor called');
        this.mapHandler = new MapHandler();
        this.currentPolygon = null;
        this.isAnalyzing = false;
        this.currentResults = null;

        this.initTheme();
        this.initEventListeners();
        this.initTabs();
        this.checkConnectionStatus();
    }

    initEventListeners() {
        console.log('initEventListeners called');

        // Navigation toggle for mobile
        const navToggle = document.querySelector('.nav-toggle');
        const navMenu = document.querySelector('.nav-menu');
        if (navToggle && navMenu) {
            navToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
                navToggle.classList.toggle('active');
            });
        }

        // Smooth scrolling for navigation links
        const navLinks = document.querySelectorAll('.nav-menu a');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                    // Close mobile menu after clicking
                    if (navMenu.classList.contains('active')) {
                        navMenu.classList.remove('active');
                        navToggle.classList.remove('active');
                    }
                }
            });
        });

        // Smooth scrolling for Explore Your Area button
        const exploreBtn = document.querySelector('.hero-actions .btn-primary');
        if (exploreBtn) {
            exploreBtn.addEventListener('click', () => {
                const targetSection = document.getElementById('explore');
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }

        // Update active nav link on scroll
        window.addEventListener('scroll', () => {
            this.updateActiveNavLink();
        });

        const drawBtn = document.getElementById('draw-polygon');
        if (drawBtn) {
            drawBtn.addEventListener('click', () => {
                console.log('Draw Polygon button clicked in app.js');
                this.mapHandler.startDrawing();
            });
        } else {
            console.error('Draw polygon button not found');
        }

        const clearBtn = document.getElementById('clear-drawings');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                console.log('Clear button clicked');
                this.mapHandler.clearDrawings();
                this.clearResults();
            });
        } else {
            console.error('Clear button not found');
        }

        const analyzeBtn = document.getElementById('analyze');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                console.log('Analyze button clicked');
                this.analyzePolygon();
            });
        } else {
            console.error('Analyze button not found');
        }

        const searchBtn = document.getElementById('search-location');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                console.log('Search location button clicked');
                this.searchLocation();
            });
        } else {
            console.error('Search location button not found');
        }

        const roiInput = document.getElementById('roi-input');
        if (roiInput) {
            roiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter pressed in ROI input');
                    this.searchLocation();
                }
            });
        }

        // Historical Analysis buttons
        const getHistoricalNDVI = document.getElementById('get-historical-ndvi');
        if (getHistoricalNDVI) {
            getHistoricalNDVI.addEventListener('click', () => {
                this.getHistoricalNDVI();
            });
        }

        const getHistoricalWeather = document.getElementById('get-historical-weather');
        if (getHistoricalWeather) {
            getHistoricalWeather.addEventListener('click', () => {
                this.getHistoricalWeather();
            });
        }

        // Forecasting buttons
        const forecastNDVI = document.getElementById('forecast-ndvi');
        if (forecastNDVI) {
            forecastNDVI.addEventListener('click', () => {
                this.forecastNDVI();
            });
        }

        const forecastWeather = document.getElementById('forecast-weather');
        if (forecastWeather) {
            forecastWeather.addEventListener('click', () => {
                this.forecastWeather();
            });
        }

        // Theme toggle button
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        console.log('Event listeners attached');
    }

    initTheme() {
        // Load saved theme from localStorage or default to light
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButton(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeButton(newTheme);
    }

    updateThemeButton(theme) {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
        }
    }

    updateActiveNavLink() {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-menu a');

        let currentSection = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - sectionHeight / 3) {
                currentSection = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === currentSection) {
                link.classList.add('active');
            }
        });
    }

    initTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Add new tabs dynamically if not present
        this.addNewTabs();
    }

    addNewTabs() {
        const tabsContainer = document.querySelector('#results-tabs');
        const tabContentContainer = document.querySelector('#results-content');

        if (!tabsContainer || !tabContentContainer) return;

        // Historical Analysis Tab
        if (!document.querySelector('[data-tab="historical"]')) {
            const historicalTabBtn = document.createElement('button');
            historicalTabBtn.className = 'tab-button';
            historicalTabBtn.setAttribute('data-tab', 'historical');
            historicalTabBtn.textContent = 'Historical Analysis';
            tabsContainer.appendChild(historicalTabBtn);

            const historicalTabContent = document.createElement('div');
            historicalTabContent.id = 'historical-tab';
            historicalTabContent.className = 'tab-content';
            historicalTabContent.innerHTML = `
                <div class="historical-controls">
                    <button id="get-historical-ndvi">Get Historical NDVI</button>
                    <button id="get-historical-weather">Get Historical Weather</button>
                    <input type="number" id="historical-years" placeholder="Years (default: 10)" min="1" max="20">
                </div>
                <div id="historical-charts">
                    <canvas id="ndvi-chart" width="400" height="200"></canvas>
                    <canvas id="weather-chart" width="400" height="200"></canvas>
                </div>
            `;
            tabContentContainer.appendChild(historicalTabContent);
        }

        // Forecasting Tab
        if (!document.querySelector('[data-tab="forecasting"]')) {
            const forecastTabBtn = document.createElement('button');
            forecastTabBtn.className = 'tab-button';
            forecastTabBtn.setAttribute('data-tab', 'forecasting');
            forecastTabBtn.textContent = 'Forecasting';
            tabsContainer.appendChild(forecastTabBtn);

            const forecastTabContent = document.createElement('div');
            forecastTabContent.id = 'forecasting-tab';
            forecastTabContent.className = 'tab-content';
            forecastTabContent.innerHTML = `
                <div class="forecast-controls">
                    <button id="forecast-ndvi">Forecast NDVI</button>
                    <button id="forecast-weather">Forecast Weather</button>
                    <input type="number" id="forecast-months" placeholder="Months (default: 6)" min="1" max="24">
                </div>
                <div id="forecast-charts">
                    <canvas id="ndvi-forecast-chart" width="400" height="200"></canvas>
                    <canvas id="weather-forecast-chart" width="400" height="200"></canvas>
                </div>
            `;
            tabContentContainer.appendChild(forecastTabContent);
        }

        // Re-attach event listeners for new tabs
        this.initTabs();
    }

    switchTab(tabName) {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to selected tab and button
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    async analyzePolygon() {
        if (this.isAnalyzing) return;

        const polygon = this.mapHandler.getCurrentPolygon();
        if (!polygon) {
            this.showError('Please draw a polygon first.');
            return;
        }

        this.isAnalyzing = true;
        this.setAnalyzingState(true);
        this.updateStatus('connecting', 'Analyzing...');
        this.showLoading('Analyzing polygon...');

        try {
            const geometry = {
                type: 'Polygon',
                coordinates: [polygon.map(coord => [coord.lng, coord.lat])]
            };

            // Calculate centroid for weather
            const centroid = this.calculateCentroid(polygon);
            
            // Calculate area
            const area = this.calculatePolygonArea(polygon);

            const response = await fetch('http://localhost:5000/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    geometry: geometry,
                    centroid: [centroid.lat, centroid.lng]
                })
            });

            const results = await response.json();

            if (response.ok) {
                results.area = area; // Add calculated area to results
                this.currentResults = results;
                this.displayResults(results);
                this.updateMapVisualization(results);
                this.updateStatus('', 'Connected');
            } else {
                this.showError(results.error || 'Analysis failed');
                this.updateStatus('error', 'Error');
            }

        } catch (error) {
            this.showError('Network error: ' + error.message);
            this.updateStatus('error', 'Disconnected');
        } finally {
            this.isAnalyzing = false;
            this.setAnalyzingState(false);
        }
    }

    calculateCentroid(coords) {
        let latSum = 0, lngSum = 0;
        coords.forEach(coord => {
            latSum += coord.lat;
            lngSum += coord.lng;
        });
        return {
            lat: latSum / coords.length,
            lng: lngSum / coords.length
        };
    }

    calculatePolygonArea(coords) {
        // Simple area calculation using shoelace formula
        let area = 0;
        const n = coords.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coords[i].lng * coords[j].lat;
            area -= coords[j].lng * coords[i].lat;
        }
        
        area = Math.abs(area) / 2;
        
        // Convert to hectares (rough approximation)
        const lat = coords[0].lat;
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);
        const areaInSquareMeters = area * metersPerDegreeLat * metersPerDegreeLng;
        const hectares = areaInSquareMeters / 10000;
        
        return hectares;
    }

    displayResults(results) {
        // Hide default message
        const defaultMessage = document.getElementById('default-message');
        if (defaultMessage) {
            defaultMessage.style.display = 'none';
        }

        // Show results content
        const resultsContent = document.getElementById('results-content');
        if (resultsContent) {
            resultsContent.style.display = 'block';
        }

        // Update risk indicator
        this.updateRiskIndicator(results);

        // Update overview tab
        this.updateOverviewTab(results);

        // Update risk analysis tab
        this.updateRiskTab(results);
    }

    updateRiskIndicator(results) {
        const riskAssessment = results.risk_assessment;
        if (!riskAssessment) return;

        const riskLevel = document.getElementById('risk-level');
        const riskScore = document.getElementById('risk-score');
        const riskIndicator = document.getElementById('risk-indicator');

        if (riskLevel && riskScore && riskIndicator) {
            riskLevel.textContent = riskAssessment.risk_level;
            riskScore.textContent = `${(riskAssessment.overall_risk_score * 100).toFixed(1)}%`;

            // Update risk indicator styling
            riskIndicator.className = 'risk-indicator';
            const riskClass = riskAssessment.risk_level.toLowerCase().replace(' ', '-');
            riskIndicator.classList.add(riskClass);
        }
    }

    updateOverviewTab(results) {
        // Update NDVI
        const ndviValue = document.getElementById('ndvi-value');
        if (results.ndvi && results.ndvi.NDVI) {
            const ndvi = results.ndvi.NDVI;
            ndviValue.textContent = ndvi.toFixed(3);
        }

        // Update land cover
        const landCoverSummary = document.getElementById('land-cover-summary');
        if (results.land_cover && results.land_cover.Map) {
            const lcData = results.land_cover.Map;
            const dominantType = Object.keys(lcData).reduce((a, b) => lcData[a] > lcData[b] ? a : b);
            const dominantLabel = this.getLandCoverLabel(parseInt(dominantType));
            landCoverSummary.textContent = dominantLabel;
        }

        // Update slope
        const slopeValue = document.getElementById('slope-value');
        if (results.slope && results.slope.slope_mean) {
            const slope = results.slope.slope_mean;
            slopeValue.textContent = `${slope.toFixed(1)}°`;
        }

        // Update area
        const areaValue = document.getElementById('area-value');
        if (results.area) {
            areaValue.textContent = `${results.area.toFixed(2)} ha`;
        }

        // Update temperature
        const temperatureValue = document.getElementById('temperature-value');
        if (results.weather && results.weather.main) {
            temperatureValue.textContent = `${results.weather.main.temp}°C`;
        }

        // Update humidity
        const humidityValue = document.getElementById('humidity-value');
        if (results.weather && results.weather.main) {
            humidityValue.textContent = `${results.weather.main.humidity}%`;
        }
    }

    updateRiskTab(results) {
        const riskAssessment = results.risk_assessment;
        if (!riskAssessment || !riskAssessment.risk_factors) return;

        const factors = riskAssessment.risk_factors;

        // Update risk factor meters
        this.updateRiskMeter('vegetation-risk', factors.vegetation_risk);
        this.updateRiskMeter('landcover-risk', factors.land_cover_risk);
        this.updateRiskMeter('erosion-risk', factors.erosion_risk);
        this.updateRiskMeter('weather-risk', factors.weather_risk);

        // Update early warnings
        this.updateEarlyWarnings(results);
    }

    updateRiskMeter(elementId, riskValue) {
        const fillElement = document.getElementById(`${elementId}-fill`);
        const percentElement = document.getElementById(`${elementId}-percent`);

        if (fillElement && percentElement) {
            const percentage = (riskValue * 100).toFixed(1);
            fillElement.style.setProperty('--risk-width', `${percentage}%`);
            percentElement.textContent = `${percentage}%`;
        }
    }

    updateEarlyWarnings(results) {
        const warningsList = document.getElementById('warnings-list');
        if (!warningsList) return;

        let warnings = [];

        // Get warnings from weather data
        if (results.weather && results.weather.early_warnings) {
            warnings = warnings.concat(results.weather.early_warnings);
        }

        // Get warnings from risk assessment
        if (results.risk_assessment && results.risk_assessment.recommendations) {
            warnings = warnings.concat(results.risk_assessment.recommendations.slice(0, 2));
        }

        if (warnings.length === 0) {
            warningsList.innerHTML = '<div class="warning-item">No immediate warnings</div>';
        } else {
            warningsList.innerHTML = warnings.map(warning => 
                `<div class="warning-item">${warning}</div>`
            ).join('');
        }
    }


    updateMapVisualization(results) {
        console.log('updateMapVisualization called with results:', results);
        
        // Update polygon color based on risk level
        const riskAssessment = results.risk_assessment;
        console.log('Risk assessment:', riskAssessment);
        console.log('Current polygon:', this.mapHandler.currentPolygon);
        console.log('Current polygon layer:', this.mapHandler.currentPolygonLayer);
        
        if (riskAssessment && this.mapHandler.currentPolygon) {
            const riskColor = riskAssessment.risk_color;
            const riskLevel = riskAssessment.risk_level;
            
            console.log(`Updating polygon with ${riskLevel} color: ${riskColor}`);
            
            // Update polygon color with risk-based styling
            this.mapHandler.updatePolygonColor(riskColor);
            
            // Add a popup to show risk information
            this.addRiskPopup(riskLevel, riskColor);
            
            console.log(`Polygon updated with ${riskLevel} color: ${riskColor}`);
        } else {
            console.warn('Cannot update polygon color - missing risk assessment or polygon');
            if (!riskAssessment) console.warn('No risk assessment found');
            if (!this.mapHandler.currentPolygon) console.warn('No current polygon found');
        }

        // Add NDVI color overlay if available
        if (results.ndvi && this.currentResults) {
            const geometry = {
                type: 'Polygon',
                coordinates: [this.mapHandler.currentPolygon.map(coord => [coord.lng, coord.lat])]
            };
            this.mapHandler.addNDVIOverlay(geometry, results.ndvi);
        }
    }
    
    addRiskPopup(riskLevel, riskColor) {
        if (this.mapHandler.currentPolygonLayer) {
            const riskScore = this.currentResults?.risk_assessment?.overall_risk_score;
            const riskPercentage = riskScore ? (riskScore * 100).toFixed(1) : 'N/A';
            
            const popupContent = `
                <div style="text-align: center; font-weight: bold;">
                    <div style="color: ${riskColor}; font-size: 16px; margin-bottom: 5px;">
                        ${riskLevel}
                    </div>
                    <div style="font-size: 14px;">
                        Risk Score: ${riskPercentage}%
                    </div>
                </div>
            `;
            
            this.mapHandler.currentPolygonLayer.bindPopup(popupContent, {
                closeButton: true,
                autoClose: false,
                closeOnClick: false
            }).openPopup();
        }
    }

    getLandCoverLabel(code) {
        const labels = {
            10: 'Tree cover',
            20: 'Shrubland',
            30: 'Grassland',
            40: 'Cropland',
            50: 'Built-up',
            60: 'Bare / sparse vegetation',
            70: 'Snow and ice',
            80: 'Permanent water bodies',
            90: 'Herbaceous wetland',
            95: 'Mangroves',
            100: 'Moss and lichen'
        };
        return labels[code] || `Class ${code}`;
    }

    showLoading(message) {
        const resultsContent = document.getElementById('results-content');
        const defaultMessage = document.getElementById('default-message');
        
        if (resultsContent) {
            resultsContent.style.display = 'none';
        }
        if (defaultMessage) {
            defaultMessage.innerHTML = `<div class="loading">${message}</div>`;
            defaultMessage.style.display = 'block';
        }
    }

    showError(message) {
        const resultsContent = document.getElementById('results-content');
        const defaultMessage = document.getElementById('default-message');
        
        if (resultsContent) {
            resultsContent.style.display = 'none';
        }
        if (defaultMessage) {
            defaultMessage.innerHTML = `<div class="error">${message}</div>`;
            defaultMessage.style.display = 'block';
        }
    }

    clearResults() {
        const resultsContent = document.getElementById('results-content');
        const defaultMessage = document.getElementById('default-message');
        
        if (resultsContent) {
            resultsContent.style.display = 'none';
        }
        if (defaultMessage) {
            defaultMessage.innerHTML = '<p>Draw a polygon on the map and click Analyze to get comprehensive land analysis.</p>';
            defaultMessage.style.display = 'block';
        }

        // Reset risk indicator
        const riskLevel = document.getElementById('risk-level');
        const riskScore = document.getElementById('risk-score');
        const riskIndicator = document.getElementById('risk-indicator');
        
        if (riskLevel && riskScore && riskIndicator) {
            riskLevel.textContent = '-';
            riskScore.textContent = '-';
            riskIndicator.className = 'risk-indicator';
        }

        // Reset polygon color to default
        if (this.mapHandler.currentPolygonLayer) {
            this.mapHandler.currentPolygonLayer.setStyle({
                color: '#4caf50',
                fillColor: '#4caf50',
                fillOpacity: 0.2,
                weight: 2,
                opacity: 0.8
            });
            // Remove any popups
            this.mapHandler.currentPolygonLayer.closePopup();
        }

        this.currentResults = null;
    }

    setAnalyzingState(analyzing) {
        const analyzeBtn = document.getElementById('analyze');
        if (analyzeBtn) {
            analyzeBtn.disabled = analyzing;
            analyzeBtn.textContent = analyzing ? 'Analyzing...' : 'Analyze';
        }
    }

    async searchLocation() {
        const roiInput = document.getElementById('roi-input');
        const placeName = roiInput.value.trim();
        
        if (!placeName) {
            this.showError('Please enter a place name.');
            return;
        }

        this.showLoading('Searching for location...');

        try {
            const response = await fetch('http://localhost:5000/geocode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    place_name: placeName
                })
            });

            const result = await response.json();

            if (response.ok) {
                // Create a polygon around the location using bounding box
                const bbox = result.boundingbox;
                const coordinates = [
                    [parseFloat(bbox[0]), parseFloat(bbox[2])], // SW corner
                    [parseFloat(bbox[0]), parseFloat(bbox[3])], // SE corner
                    [parseFloat(bbox[1]), parseFloat(bbox[3])], // NE corner
                    [parseFloat(bbox[1]), parseFloat(bbox[2])], // NW corner
                    [parseFloat(bbox[0]), parseFloat(bbox[2])]  // Close polygon
                ];
                
                // Add polygon to map
                this.mapHandler.clearDrawings();
                this.mapHandler.addPolygonToMap(coordinates);
                
                // Center map on location
                this.mapHandler.map.setView([result.lat, result.lon], 10);
                
                // Clear input and show success
                roiInput.value = '';
                this.showSuccess(`Location found: ${result.display_name}`);
                
            } else {
                this.showError(result.error || 'Location not found');
            }

        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }

    showSuccess(message) {
        const resultsContent = document.getElementById('results-content');
        const defaultMessage = document.getElementById('default-message');
        
        if (resultsContent) {
            resultsContent.style.display = 'none';
        }
        if (defaultMessage) {
            defaultMessage.innerHTML = `<div class="success">${message}</div>`;
            defaultMessage.style.display = 'block';
        }
    }

    async checkConnectionStatus() {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');
        
        if (statusDot && statusText) {
            statusDot.className = 'status-dot connecting';
            statusText.textContent = 'Checking...';
            
            try {
                const response = await fetch('http://localhost:5000/health');
                const data = await response.json();
                
                if (response.ok) {
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';
                } else {
                    statusDot.className = 'status-dot error';
                    statusText.textContent = 'Error';
                }
            } catch (error) {
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
            }
        }
    }

    updateStatus(status, text) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');

        if (statusDot && statusText) {
            statusDot.className = `status-dot ${status}`;
            statusText.textContent = text;
        }
    }

    // Historical Analysis Methods
    async getHistoricalNDVI() {
        const polygon = this.mapHandler.getCurrentPolygon();
        if (!polygon) {
            this.showError('Please draw a polygon first.');
            return;
        }

        const yearsInput = document.getElementById('historical-years');
        const years = yearsInput && yearsInput.value ? parseInt(yearsInput.value) : 10;

        this.showLoading('Fetching historical NDVI data...');

        try {
            const geometry = {
                type: 'Polygon',
                coordinates: [polygon.map(coord => [coord.lng, coord.lat])]
            };

            const response = await fetch('http://localhost:5000/historical/ndvi', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    geometry: geometry,
                    years: years
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.displayHistoricalNDVI(data);
                this.showSuccess('Historical NDVI data loaded successfully.');
            } else {
                this.showError(data.error || 'Failed to fetch historical NDVI');
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }

    async getHistoricalWeather() {
        const polygon = this.mapHandler.getCurrentPolygon();
        if (!polygon) {
            this.showError('Please draw a polygon first.');
            return;
        }

        const centroid = this.calculateCentroid(polygon);
        const yearsInput = document.getElementById('historical-years');
        const years = yearsInput && yearsInput.value ? parseInt(yearsInput.value) : 10;

        this.showLoading('Fetching historical weather data...');

        try {
            const response = await fetch(`http://localhost:5000/historical/weather/${centroid.lat}/${centroid.lng}?years=${years}`);

            const data = await response.json();

            if (response.ok) {
                this.displayHistoricalWeather(data);
                this.showSuccess('Historical weather data loaded successfully.');
            } else {
                this.showError(data.error || 'Failed to fetch historical weather');
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }

    // Forecasting Methods
    async forecastNDVI() {
        const polygon = this.mapHandler.getCurrentPolygon();
        if (!polygon) {
            this.showError('Please draw a polygon first.');
            return;
        }

        const monthsInput = document.getElementById('forecast-months');
        const months = monthsInput && monthsInput.value ? parseInt(monthsInput.value) : 6;

        this.showLoading('Generating NDVI forecast...');

        try {
            const geometry = {
                type: 'Polygon',
                coordinates: [polygon.map(coord => [coord.lng, coord.lat])]
            };

            const response = await fetch('http://localhost:5000/forecast/ndvi', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    geometry: geometry,
                    months: months
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.displayForecastNDVI(data);
                this.showSuccess('NDVI forecast generated successfully.');
            } else {
                this.showError(data.error || 'Failed to generate NDVI forecast');
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }

    async forecastWeather() {
        const polygon = this.mapHandler.getCurrentPolygon();
        if (!polygon) {
            this.showError('Please draw a polygon first.');
            return;
        }

        const centroid = this.calculateCentroid(polygon);
        const monthsInput = document.getElementById('forecast-months');
        const months = monthsInput && monthsInput.value ? parseInt(monthsInput.value) : 6;

        this.showLoading('Generating weather forecast...');

        try {
            const response = await fetch(`http://localhost:5000/forecast/weather/${centroid.lat}/${centroid.lng}?months=${months}`);

            const data = await response.json();

            if (response.ok) {
                this.displayForecastWeather(data);
                this.showSuccess('Weather forecast generated successfully.');
            } else {
                this.showError(data.error || 'Failed to generate weather forecast');
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        }
    }

    // Display Methods for Historical and Forecast Data
    getChartColors() {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        if (theme === 'dark') {
            return {
                ndvi: { border: 'rgb(100, 255, 255)', background: 'rgba(100, 255, 255, 0.2)' },
                temperature: { border: 'rgb(255, 150, 150)', background: 'rgba(255, 150, 150, 0.2)' },
                precipitation: { border: 'rgb(150, 200, 255)', background: 'rgba(150, 200, 255, 0.2)' },
                forecastNdvi: { border: 'rgb(255, 200, 100)', background: 'rgba(255, 200, 100, 0.2)' }
            };
        } else {
            return {
                ndvi: { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.2)' },
                temperature: { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.2)' },
                precipitation: { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.2)' },
                forecastNdvi: { border: 'rgb(255, 159, 64)', background: 'rgba(255, 159, 64, 0.2)' }
            };
        }
    }

    displayHistoricalNDVI(data) {
        const canvas = document.getElementById('ndvi-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dates = data.dates || [];
        const ndviValues = data.ndvi_values || [];
        const colors = this.getChartColors();
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const textColor = theme === 'dark' ? '#ffffff' : '#000000';
        const gridColor = theme === 'dark' ? '#555555' : '#dddddd';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'NDVI',
                    data: ndviValues,
                    borderColor: colors.ndvi.border,
                    backgroundColor: colors.ndvi.background,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical NDVI Trends',
                        color: textColor
                    },
                    legend: {
                        labels: {
                            color: textColor
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        beginAtZero: true,
                        max: 1,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    displayHistoricalWeather(data) {
        const canvas = document.getElementById('weather-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dates = data.dates || [];
        const tempData = data.temperature || [];
        const precipData = data.rainfall || [];
        const colors = this.getChartColors();
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const textColor = theme === 'dark' ? '#ffffff' : '#000000';
        const gridColor = theme === 'dark' ? '#555555' : '#dddddd';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: colors.temperature.border,
                    backgroundColor: colors.temperature.background,
                    yAxisID: 'y',
                    tension: 0.1
                }, {
                    label: 'Precipitation (mm)',
                    data: precipData,
                    borderColor: colors.precipitation.border,
                    backgroundColor: colors.precipitation.background,
                    yAxisID: 'y1',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                backgroundColor: theme === 'dark' ? '#2a2a2a' : '#ffffff',
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical Weather Trends',
                        color: textColor
                    },
                    legend: {
                        labels: {
                            color: textColor
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: textColor
                        },
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: textColor
                        },
                        ticks: { color: textColor },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        });
    }

    displayForecastNDVI(data) {
        const canvas = document.getElementById('ndvi-forecast-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const months = data.map(item => item.month);
        const ndviValues = data.map(item => item.ndvi);
        const colors = this.getChartColors();
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const textColor = theme === 'dark' ? '#ffffff' : '#000000';
        const gridColor = theme === 'dark' ? '#555555' : '#dddddd';

        ctx.canvas.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#ffffff';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Forecasted NDVI',
                    data: ndviValues,
                    borderColor: colors.forecastNdvi.border,
                    backgroundColor: colors.forecastNdvi.background,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'NDVI Forecast',
                        color: textColor
                    },
                    legend: {
                        labels: {
                            color: textColor
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        beginAtZero: true,
                        max: 1,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    displayForecastWeather(data) {
        const canvas = document.getElementById('weather-forecast-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const months = data.map(item => item.month);
        const tempData = data.map(item => item.temperature);
        const precipData = data.map(item => item.precipitation);
        const colors = this.getChartColors();
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const textColor = theme === 'dark' ? '#ffffff' : '#000000';
        const gridColor = theme === 'dark' ? '#555555' : '#dddddd';

        ctx.canvas.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#ffffff';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: colors.temperature.border,
                    backgroundColor: colors.temperature.background,
                    yAxisID: 'y',
                    tension: 0.1
                }, {
                    label: 'Precipitation (mm)',
                    data: precipData,
                    borderColor: colors.precipitation.border,
                    backgroundColor: colors.precipitation.background,
                    yAxisID: 'y1',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast',
                        color: textColor
                    },
                    legend: {
                        labels: {
                            color: textColor
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: textColor
                        },
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: textColor
                        },
                        ticks: { color: textColor },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        });
    }
}

// Initialize the application
new LandCareApp();
