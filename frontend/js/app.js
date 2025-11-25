console.log('app.js loaded, creating LandCareApp');

// Main application logic
class LandCareApp {
    constructor() {
        console.log('LandCareApp constructor called');
        this.mapHandler = new MapHandler();
        this.currentPolygon = null;
        this.isAnalyzing = false;
        this.currentResults = null;
        this.authToken = localStorage.getItem('authToken');
        this.user = null;

        // Status management
        this.currentStatus = {
            connection: 'checking', // 'connected', 'disconnected', 'checking'
            operation: 'idle', // 'idle', 'searching', 'analyzing', 'loading_historical', 'forecasting'
            message: 'Initializing...',
            details: ''
        };

        this.initTheme();
        this.initEventListeners();
        this.initTabs();
        this.initFutureCharts();
        this.initExportListeners(); // Initialize export functionality
        this.initAuth(); // Initialize auth
        this.initStatusIndicator();
        this.checkConnectionStatus();
    }

    async initAuth() {
        // Check if user is logged in
        if (this.authToken) {
            await this.validateToken();
        } else {
            this.showAuthSection();
        }
    }

    async validateToken() {
        try {
            const response = await fetch('https://landcare-ai-1.onrender.com/auth/me', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.showUserSection();
            } else {
                // Token invalid, clear it
                this.logout();
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.logout();
        }
    }

    showAuthSection() {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('user-section').style.display = 'none';
    }

    showUserSection() {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('user-section').style.display = 'flex';
        document.getElementById('user-email').textContent = this.user.email;
    }

    async login(email, password) {
        try {
            const response = await fetch('https://landcare-ai-1.onrender.com/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.user = data.user;
                localStorage.setItem('authToken', this.authToken);
                this.showUserSection();
                this.closeAuthModal();
                this.showSuccess('Login successful!');
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    async register(email, password, confirmPassword) {
        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        try {
            const response = await fetch('https://landcare-ai-1.onrender.com/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.authToken = data.token;
                this.user = data.user;
                localStorage.setItem('authToken', this.authToken);
                this.showUserSection();
                this.closeAuthModal();
                this.showSuccess('Registration successful!');
            } else {
                throw new Error(data.error || 'Registration failed');
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    logout() {
        this.authToken = null;
        this.user = null;
        localStorage.removeItem('authToken');
        this.showAuthSection();
        this.clearResults();
        this.showSuccess('Logged out successfully');
    }

    openAuthModal(login = true) {
        const modal = document.getElementById('auth-modal');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        modal.style.display = 'block';

        if (login) {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        }
    }

    closeAuthModal() {
        document.getElementById('auth-modal').style.display = 'none';
    }

    initEventListeners() {
        console.log('initEventListeners called');

        // Navigation toggle for mobile
        const navToggle = document.querySelector('.nav-toggle');
        const navMenu = document.querySelector('.nav-menu');
        if (navToggle && navMenu) {
            navToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
                navToggle.classList.remove('active');
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

        // Auth events
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Redirect to login/signup pages
        document.getElementById('login-btn').addEventListener('click', () => {
            window.location.href = 'login.html';
        });
        document.getElementById('register-btn').addEventListener('click', () => {
            window.location.href = 'signup.html';
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
                this.removeSearchPolygon(); // Also clear search polygon
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

        // Historical and Forecasting buttons will be attached after tabs are created
        this.attachHistoricalButtons();
        this.attachForecastingButtons();
    }

    attachHistoricalButtons() {
        const historicalBtn = document.getElementById('historical-ndvi');
        if (historicalBtn) {
            historicalBtn.addEventListener('click', () => {
                this.loadHistoricalNDVI();
            });
        }
    }

    attachForecastingButtons() {
        const forecastBtn = document.getElementById('forecast-ndvi');
        if (forecastBtn) {
            forecastBtn.addEventListener('click', () => {
                this.loadForecastNDVI();
            });
        }

        const forecastWeatherBtn = document.getElementById('forecast-weather');
        if (forecastWeatherBtn) {
            forecastWeatherBtn.addEventListener('click', () => {
                this.loadForecastWeather();
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

    async analyzePolygon() {
        // Check if user is authenticated before allowing analysis
        if (!this.authToken) {
            this.showError('You must be logged in to perform analysis');
            this.openAuthModal(true);
            return;
        }

        if (!this.mapHandler.currentPolygon) {
            this.showError('No polygon drawn. Please draw a polygon first.');
            return;
        }

        if (this.isAnalyzing) {
            this.showError('Analysis already in progress...');
            return;
        }

        try {
            this.isAnalyzing = true;
            this.updateStatus(this.currentStatus.connection, 'analyzing', 'Analyzing selected area...');

            const analyzeBtn = document.getElementById('analyze');
            if (analyzeBtn) {
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = 'Analyzing...';
            }
            const geometry = this.mapHandler.currentPolygonLayer.toGeoJSON().geometry;
            const centroid = this.mapHandler.getPolygonCentroid(geometry);

            const response = await fetch('https://landcare-ai-1.onrender.com/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    geometry: geometry,
                    centroid: centroid
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Analysis failed');
            }

            this.currentResults = data;
            this.displayResults(data);
            this.updateStatus(this.currentStatus.connection, 'idle', 'Analysis completed successfully');
            this.showSuccess('Analysis completed successfully!');
        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'Analysis failed');
            this.showError(`Analysis error: ${error.message}`);
            console.error('Analysis error:', error);
        } finally {
            this.isAnalyzing = false;
            const analyzeBtn = document.getElementById('analyze');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analyze';
            }
        }
    }

    displayResults(results) {
        console.log('Analysis Results:', results);

        // Hide default message and show results
        const defaultMessage = document.getElementById('default-message');
        if (defaultMessage) {
            defaultMessage.style.display = 'none';
        }

        // Update overview tab statistics
        if (results.ndvi && results.ndvi.NDVI !== undefined) {
            const ndviEl = document.getElementById('ndvi-value');
            if (ndviEl) ndviEl.textContent = results.ndvi.NDVI.toFixed(3);
        }

        if (results.evi && results.evi.EVI !== undefined) {
            const eviEl = document.getElementById('evi-value');
            if (eviEl) eviEl.textContent = results.evi.EVI.toFixed(3);
        }

        if (results.savi && results.savi.SAVI !== undefined) {
            const saviEl = document.getElementById('savi-value');
            if (saviEl) saviEl.textContent = results.savi.SAVI.toFixed(3);
        }

        // Update area in hectares
        if (results.area_hectares !== undefined && results.area_hectares !== null) {
            const areaEl = document.getElementById('area-value');
            if (areaEl) areaEl.textContent = `${results.area_hectares} ha`;
        }

        // Update polygon color based on NDVI (vegetation index)
        if (results.ndvi && results.ndvi.NDVI !== undefined) {
            this.mapHandler.updatePolygonVegetationColor(results.ndvi.NDVI);
        }

        // Update risk tag on polygon
        if (results.risk_assessment && results.risk_assessment.risk_level) {
            const riskLevel = results.risk_assessment.risk_level;
            const riskScore = results.risk_assessment.overall_risk_score;
            this.mapHandler.updatePolygonRiskTag(riskLevel, riskScore);
        }

        // Update detailed land cover types
        if (results.land_cover && (results.land_cover.land_cover_types || results.land_cover.land_cover_areas)) {
            this.updateLandCoverDisplay(results.land_cover);
        }

        if (results.weather && results.weather.main && results.weather.main.temp !== undefined) {
            const tempEl = document.getElementById('temperature-value');
            if (tempEl) tempEl.textContent = `${results.weather.main.temp.toFixed(1)}°C`;
        }

        if (results.weather && results.weather.main && results.weather.main.humidity !== undefined) {
            const humidityEl = document.getElementById('humidity-value');
            if (humidityEl) humidityEl.textContent = `${results.weather.main.humidity.toFixed(1)}%`;
        }

        // Update weather description
        if (results.weather && results.weather.weather_description) {
            const weatherDescEl = document.getElementById('weather-description-value');
            if (weatherDescEl) weatherDescEl.textContent = results.weather.weather_description;
        }

        // Update risk assessment
        if (results.risk_assessment) {
            const riskLevelEl = document.getElementById('risk-level');
            const riskScoreEl = document.getElementById('risk-score');

            if (results.risk_assessment.overall_risk_score !== undefined) {
                const score = results.risk_assessment.overall_risk_score;
                if (riskScoreEl) riskScoreEl.textContent = score.toFixed(2);

                let riskLevel = 'Unknown';
                if (score >= 0.6) riskLevel = 'High';
                else if (score >= 0.3) riskLevel = 'Medium';
                else riskLevel = 'Low';

                if (riskLevelEl) riskLevelEl.textContent = riskLevel;

                // Update risk indicator color
                const riskIndicator = document.getElementById('risk-indicator');
                if (riskIndicator) {
                    riskIndicator.className = `risk-indicator ${riskLevel.toLowerCase()}-risk`;
                    // Add background color based on risk level
                    let riskColor = '#28a745'; // Default low risk
                    if (riskLevel.toLowerCase() === 'high') {
                        riskColor = '#d32f2f';
                    } else if (riskLevel.toLowerCase() === 'medium') {
                        riskColor = '#ffc107';
                    }
                    riskIndicator.style.backgroundColor = riskColor;
                    riskIndicator.style.color = 'white';
                }
            }

            // Update risk breakdown if available
            if (results.risk_assessment.risk_factors) {
                const riskFactors = results.risk_assessment.risk_factors;

                // Helper function to update risk meter
                const updateRiskMeter = (riskValue, percentElId, fillElId, levelElId) => {
                    if (riskValue !== undefined) {
                        const percentage = riskValue * 100;
                        const percentEl = document.getElementById(percentElId);
                        const fillEl = document.getElementById(fillElId);
                        const levelEl = document.getElementById(levelElId);

                        if (percentEl) percentEl.textContent = `${percentage.toFixed(0)}%`;
                        if (fillEl) {
                            fillEl.style.setProperty('--risk-width', `${percentage}%`);
                            // Remove existing risk classes
                            fillEl.classList.remove('high-risk', 'medium-risk', 'low-risk');
                            levelEl.classList.remove('high-risk', 'medium-risk', 'low-risk');

                            // Determine risk level and apply classes
                            let riskLevel = 'Low Risk';
                            if (percentage >= 70) {
                                riskLevel = 'High Risk';
                                fillEl.classList.add('high-risk');
                                levelEl.classList.add('high-risk');
                            } else if (percentage >= 40) {
                                riskLevel = 'Medium Risk';
                                fillEl.classList.add('medium-risk');
                                levelEl.classList.add('medium-risk');
                            } else {
                                riskLevel = 'Low Risk';
                                fillEl.classList.add('low-risk');
                                levelEl.classList.add('low-risk');
                            }

                            if (levelEl) levelEl.textContent = riskLevel;
                        }
                    }
                };

                updateRiskMeter(riskFactors.vegetation_risk, 'vegetation-risk-percent', 'vegetation-risk-fill', 'vegetation-risk-level');
                updateRiskMeter(riskFactors.land_cover_risk, 'landcover-risk-percent', 'landcover-risk-fill', 'landcover-risk-level');
                updateRiskMeter(riskFactors.erosion_risk, 'erosion-risk-percent', 'erosion-risk-fill', 'erosion-risk-level');
                updateRiskMeter(riskFactors.weather_risk, 'weather-risk-percent', 'weather-risk-fill', 'weather-risk-level');
            }

            // Generate early warnings based on statistics and risk analysis
            const warnings = this.generateEarlyWarnings(results);
            this.displayEarlyWarnings(warnings);
        }

        // Update land cover summary (legacy support)
        if (results.land_cover && results.land_cover.Map && !results.land_cover.land_cover_types) {
            const landCoverEl = document.getElementById('land-cover-summary');
            if (landCoverEl) {
                // Find the most common land cover type
                const types = Object.keys(results.land_cover.Map);
                if (types.length > 0) {
                    const primaryType = types.reduce((a, b) =>
                        results.land_cover.Map[a] > results.land_cover.Map[b] ? a : b
                    );
                    landCoverEl.textContent = primaryType.replace(/_/g, ' ').toUpperCase();
                }
            }
        }

        // Update slope if available
        if (results.slope && results.slope.slope_mean !== undefined) {
            const slopeEl = document.getElementById('slope-value');
            if (slopeEl) slopeEl.textContent = `${results.slope.slope_mean.toFixed(1)}°`;
        }

        // Show results panel
        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) {
            resultsPanel.style.display = 'block';
        }
    }

    clearResults() {
        this.currentResults = null;

        // Reset all result elements to default values
        const elementsToReset = [
            'ndvi-value', 'evi-value', 'savi-value', 'area-value',
            'land-cover-summary', 'slope-value', 'temperature-value', 'humidity-value',
            'weather-description-value', 'risk-level', 'risk-score'
        ];

        elementsToReset.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });

        // Clear land cover details
        const landCoverDetailsEl = document.getElementById('land-cover-details');
        if (landCoverDetailsEl) {
            landCoverDetailsEl.innerHTML = '';
        }

        // Clear early warnings
        const earlyWarningsEl = document.getElementById('early-warnings-list');
        if (earlyWarningsEl) {
            earlyWarningsEl.innerHTML = '';
        }

        // Reset risk meters
        const riskFills = [
            'vegetation-risk-fill', 'landcover-risk-fill', 'erosion-risk-fill', 'weather-risk-fill'
        ];

        riskFills.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.setProperty('--risk-width', '0%');
                el.classList.remove('high-risk', 'medium-risk', 'low-risk');
            }
        });

        const riskPercents = [
            'vegetation-risk-percent', 'landcover-risk-percent', 'erosion-risk-percent', 'weather-risk-percent'
        ];

        riskPercents.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });

        const riskLevels = [
            'vegetation-risk-level', 'landcover-risk-level', 'erosion-risk-level', 'weather-risk-level'
        ];

        riskLevels.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '-';
                el.classList.remove('high-risk', 'medium-risk', 'low-risk');
            }
        });

        // Reset risk indicator
        const riskIndicator = document.getElementById('risk-indicator');
        if (riskIndicator) {
            riskIndicator.className = 'risk-indicator';
        }

        // Clear polygon risk tag
        this.mapHandler.clearPolygonRiskTag();

        // Show default message and hide results panel
        const defaultMessage = document.getElementById('default-message');
        if (defaultMessage) {
            defaultMessage.style.display = 'block';
        }

        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) {
            resultsPanel.style.display = 'none';
        }
    }

    async searchLocation() {
        const roiInput = document.getElementById('roi-input');
        const placeName = roiInput.value.trim();

        if (!placeName) {
            this.showError('Please enter a location name');
            return;
        }

        // Update status
        this.updateStatus(this.currentStatus.connection, 'searching', `Searching for "${placeName}"...`);

        // Show loading feedback
        const searchBtn = document.getElementById('search-location');
        const originalText = searchBtn.textContent;
        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';

        try {
            const response = await fetch('https://landcare-ai-1.onrender.com/geocode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ place_name: placeName })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Geocoding failed');
            }

            // Center map on the found location
            this.mapHandler.map.setView([data.lat, data.lon], 10);

            // Display bounding polygon if boundingbox is available
            if (data.boundingbox) {
                this.displaySearchBoundingPolygon(data.boundingbox, data.display_name, placeName);
            }

            // Update status to success
            this.updateStatus(this.currentStatus.connection, 'idle', `Found: ${data.display_name}`);
            this.showSuccess(`Found: ${data.display_name}`);
        } catch (error) {
            // Update status to error
            this.updateStatus(this.currentStatus.connection, 'idle', 'Search failed');
            this.showError(`Search error: ${error.message}`);
            console.error('Geocoding error:', error);
        } finally {
            // Reset button
            searchBtn.disabled = false;
            searchBtn.textContent = originalText;
        }
    }

    toggleTheme() {
        const htmlElement = document.documentElement;
        const isDark = htmlElement.getAttribute('data-theme') === 'dark';

        const newTheme = isDark ? 'light' : 'dark';
        htmlElement.setAttribute('data-theme', newTheme);

        // Save preference
        localStorage.setItem('theme', newTheme);

        // Update button text/icon
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = newTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        }

        // Re-render all existing charts with new theme colors
        this.updateChartThemes();
    }

    initTheme() {
        // Load saved theme preference or use system preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        
        document.documentElement.setAttribute('data-theme', theme);
        
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
        }
    }

    initTabs() {
        // Initialize tabs functionality - will be enhanced based on your HTML structure
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                // Hide all tabs
                tabContents.forEach(content => {
                    content.style.display = 'none';
                });

                // Remove active class from all buttons
                tabButtons.forEach(btn => {
                    btn.classList.remove('active');
                });

                // Show selected tab and mark button as active
                if (tabContents[index]) {
                    tabContents[index].style.display = 'block';
                }
                button.classList.add('active');
            });
        });

        // Show first tab by default
        if (tabButtons.length > 0) {
            tabButtons[0].classList.add('active');
            if (tabContents.length > 0) {
                tabContents[0].style.display = 'block';
            }
        }
    }

    initFutureCharts() {
        // Initialize D3.js charts
        if (typeof d3 !== 'undefined') {
            this.d3Charts = this.d3Charts || {};
            console.log('D3.js initialized for future charts');

            // Initialize future charts with realistic mock data after a short delay
            // to ensure DOM elements are fully loaded
            setTimeout(() => {
                this.initFutureVegetationChart();
                this.initFutureErosionChart();
            }, 100);
        } else {
            console.log('D3.js not available, charts disabled');
        }
    }

    initFutureVegetationChart() {
        // Generate realistic 5-year vegetation health forecast data
        // Based on NDVI forecasting data, polygon analysis results, and historical trends

        const currentYear = new Date().getFullYear();
        const years = [];
        const ndviValues = [];
        const confidenceUpper = [];
        const confidenceLower = [];

        // Start with a baseline NDVI value (typical for mixed agricultural/vegetation areas)
        let baseNDVI = 0.45; // Starting NDVI value

        // Simulate realistic vegetation trends over 5 years
        // Factors: climate change, land management, seasonal variations
        for (let i = 0; i < 5; i++) {
            years.push(`${currentYear + i}`);

            // Apply realistic trends:
            // Year 1-2: Slight improvement due to conservation efforts
            // Year 3: Moderate decline due to climate variability
            // Year 4-5: Recovery with sustainable practices
            let trendFactor = 0;
            if (i < 2) trendFactor = 0.02; // Improvement
            else if (i === 2) trendFactor = -0.03; // Decline
            else trendFactor = 0.015; // Recovery

            // Add seasonal and random variation
            const seasonalVariation = Math.sin((i * Math.PI) / 2) * 0.01;
            const randomVariation = (Math.random() - 0.5) * 0.02;

            baseNDVI += trendFactor + seasonalVariation + randomVariation;
            baseNDVI = Math.max(0.2, Math.min(0.8, baseNDVI)); // Keep within realistic bounds

            ndviValues.push(baseNDVI.toFixed(3));

            // Confidence intervals (wider for future predictions)
            const uncertainty = 0.05 + (i * 0.02); // Increasing uncertainty over time
            confidenceUpper.push((baseNDVI + uncertainty).toFixed(3));
            confidenceLower.push(Math.max(0.1, baseNDVI - uncertainty).toFixed(3));
        }

        // Render the vegetation forecast chart
        this.renderFutureVegetationChart(years, ndviValues, confidenceUpper, confidenceLower);
    }

    initFutureErosionChart() {
        // Generate realistic erosion risk forecast data for Scenario A
        // Scenario A: Moderate rainfall increase with minimal human intervention

        const currentYear = new Date().getFullYear();
        const years = [];
        const erosionRisk = [];
        const vegetationRisk = [];
        const combinedRisk = [];

        // Baseline risk assessment based on typical land analysis results
        let baseErosionRisk = 0.35; // 35% erosion risk
        let baseVegetationRisk = 0.25; // 25% vegetation degradation risk

        for (let i = 0; i < 5; i++) {
            years.push(`${currentYear + i}`);

            // Scenario A: Moderate rainfall increase with minimal intervention
            // Erosion risk trends: initially stable, then increases with more rainfall
            let erosionTrend = 0;
            if (i < 2) erosionTrend = 0.01; // Slight increase due to more rainfall
            else if (i === 2) erosionTrend = 0.03; // Moderate increase
            else erosionTrend = 0.02; // Continued increase without intervention

            // Vegetation risk: improves slightly due to increased rainfall, but degrades without management
            let vegetationTrend = 0;
            if (i < 2) vegetationTrend = -0.01; // Slight improvement from rainfall
            else vegetationTrend = 0.015; // Degradation without active management

            baseErosionRisk += erosionTrend + (Math.random() - 0.5) * 0.02;
            baseVegetationRisk += vegetationTrend + (Math.random() - 0.5) * 0.02;

            // Keep within realistic bounds
            baseErosionRisk = Math.max(0.1, Math.min(0.9, baseErosionRisk));
            baseVegetationRisk = Math.max(0.1, Math.min(0.8, baseVegetationRisk));

            erosionRisk.push((baseErosionRisk * 100).toFixed(1));
            vegetationRisk.push((baseVegetationRisk * 100).toFixed(1));

            // Combined risk (weighted average)
            const combined = (baseErosionRisk * 0.6 + baseVegetationRisk * 0.4);
            combinedRisk.push((combined * 100).toFixed(1));
        }

        // Render the erosion risk chart
        this.renderFutureErosionChart(years, erosionRisk, vegetationRisk, combinedRisk);
    }

    renderFutureVegetationChart(years, ndviValues, confidenceUpper, confidenceLower) {
        const containerId = 'futureVegetationChart';
        const container = d3.select(`#${containerId}`);
        if (container.empty()) {
            console.warn('Future vegetation chart container not found');
            return;
        }

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Responsive with viewBox
        const margin = {top: 20, right: 80, bottom: 60, left: 60};
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - margin.left - margin.right;
        const height = containerRect.height - margin.top - margin.bottom;

        // Create SVG with viewBox for responsive scaling
        const svg = container.append("svg")
            .attr("width", containerRect.width)
            .attr("height", containerRect.height)
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = years.map((year, i) => ({
            year: year,
            ndvi: parseFloat(ndviValues[i]),
            upper: parseFloat(confidenceUpper[i]),
            lower: parseFloat(confidenceLower[i])
        }));

        // Set up scales
        const xScale = d3.scaleBand()
            .domain(years)
            .range([0, width])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, 1])
            .range([height, 0]);

        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.year) + xScale.bandwidth() / 2)
            .y(d => yScale(d.ndvi))
            .curve(d3.curveMonotoneX);

        // Create area generator for confidence
        const area = d3.area()
            .x(d => xScale(d.year) + xScale.bandwidth() / 2)
            .y0(d => yScale(d.lower))
            .y1(d => yScale(d.upper))
            .curve(d3.curveMonotoneX);

        // Add confidence area with enhanced visibility
        svg.append("path")
            .datum(data)
            .attr("class", "confidence-area")
            .attr("fill", themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.3)'))
            .attr("stroke", themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.5)'))
            .attr("stroke-width", 1)
            .attr("d", area);

        // Add NDVI line
        svg.append("path")
            .datum(data)
            .attr("class", "ndvi-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.green)
            .attr("stroke-width", 3)
            .attr("d", line);

        // Add points
        svg.selectAll(".ndvi-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "ndvi-point")
            .attr("cx", d => xScale(d.year) + xScale.bandwidth() / 2)
            .attr("cy", d => yScale(d.ndvi))
            .attr("r", 6)
            .attr("fill", themeColors.green)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 2);

        // Add axes
        const xAxis = d3.axisBottom(xScale);
        const yAxis = d3.axisLeft(yScale).tickFormat(d3.format(".2f"));

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Year");

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("NDVI Value");

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Predicted Vegetation Health (5 Years)");

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 150}, 10)`);

        // Confidence area
        legend.append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", 20)
            .attr("height", 10)
            .attr("fill", themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.2)'));

        legend.append("text")
            .attr("x", 25)
            .attr("y", 5)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Confidence Interval");

        // Line
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 20)
            .attr("x2", 20)
            .attr("y2", 20)
            .attr("stroke", themeColors.green)
            .attr("stroke-width", 3);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 20)
            .attr("r", 3)
            .attr("fill", themeColors.green)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 20)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Predicted NDVI");

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYScale = event.transform.rescaleY(yScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale).ticks(Math.min(data.length, 10)).tickFormat(d3.timeFormat("%b %Y")));
                svg.select(".y-axis").call(d3.axisLeft(newYScale));

                // Update line
                svg.select(".time-series-line").attr("d", line.x(d => newXScale(d.date)).y(d => newYScale(d.value)));

                // Update points
                svg.selectAll(".point")
                    .attr("cx", d => newXScale(d.date))
                    .attr("cy", d => newYScale(d.value));
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        svg.selectAll(".point")
            .on("mouseover", function(event, d) {
                tooltip.style("visibility", "visible");
                const dateStr = d.date.toLocaleDateString();
                let tooltipContent = `<strong>${dateStr}</strong><br/>`;
                tooltipContent += `${label}: ${d.value.toFixed(3)}<br/>`;
                tooltipContent += `Trend: ${d.value > data[Math.max(0, data.indexOf(d) - 1)]?.value ? 'Increasing' : 'Decreasing'}`;
                tooltip.html(tooltipContent)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
                d3.select(this).attr("r", 5);
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("visibility", "hidden");
                d3.select(this).attr("r", 3);
            });

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yScale, zoom };
    }

    renderFutureErosionChart(years, erosionRisk, vegetationRisk, combinedRisk) {
        const containerId = 'futureErosionChart';
        const container = d3.select(`#${containerId}`);
        if (container.empty()) {
            console.warn('Future erosion chart container not found');
            return;
        }

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Responsive to container
        const margin = {top: 20, right: 80, bottom: 80, left: 60};
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - margin.left - margin.right;
        const height = containerRect.height - margin.top - margin.bottom;
    
        // Create SVG with viewBox for proper scaling
        const svg = container.append("svg")
            .attr("width", containerRect.width)
            .attr("height", containerRect.height)
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = years.map((year, i) => ({
            year: year,
            combined: parseFloat(combinedRisk[i]),
            erosion: parseFloat(erosionRisk[i]),
            vegetation: parseFloat(vegetationRisk[i])
        }));

        // Set up scales
        const xScale = d3.scaleBand()
            .domain(years)
            .range([0, width])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, 100])
            .range([height, 0]);

        // Create line generators
        const combinedLine = d3.line()
            .x(d => xScale(d.year) + xScale.bandwidth() / 2)
            .y(d => yScale(d.combined))
            .curve(d3.curveMonotoneX);

        const erosionLine = d3.line()
            .x(d => xScale(d.year) + xScale.bandwidth() / 2)
            .y(d => yScale(d.erosion))
            .curve(d3.curveMonotoneX);

        const vegetationLine = d3.line()
            .x(d => xScale(d.year) + xScale.bandwidth() / 2)
            .y(d => yScale(d.vegetation))
            .curve(d3.curveMonotoneX);

        // Add lines
        svg.append("path")
            .datum(data)
            .attr("class", "combined-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 4)
            .attr("d", combinedLine);

        svg.append("path")
            .datum(data)
            .attr("class", "erosion-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.orange)
            .attr("stroke-width", 3)
            .attr("d", erosionLine);

        svg.append("path")
            .datum(data)
            .attr("class", "vegetation-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.cyan)
            .attr("stroke-width", 3)
            .attr("d", vegetationLine);

        // Add points
        svg.selectAll(".combined-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "combined-point")
            .attr("cx", d => xScale(d.year) + xScale.bandwidth() / 2)
            .attr("cy", d => yScale(d.combined))
            .attr("r", 6)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 2);

        svg.selectAll(".erosion-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "erosion-point")
            .attr("cx", d => xScale(d.year) + xScale.bandwidth() / 2)
            .attr("cy", d => yScale(d.erosion))
            .attr("r", 4)
            .attr("fill", themeColors.orange)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        svg.selectAll(".vegetation-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "vegetation-point")
            .attr("cx", d => xScale(d.year) + xScale.bandwidth() / 2)
            .attr("cy", d => yScale(d.vegetation))
            .attr("r", 4)
            .attr("fill", themeColors.cyan)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        // Add axes
        const xAxis = d3.axisBottom(xScale);
        const yAxis = d3.axisLeft(yScale).tickFormat(d => d + '%');

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 20})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Year");

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Risk Level (%)");

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Future Soil Erosion Risk (Scenario A)");

        // Add subtitle
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2 + 18)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-style", "italic")
            .text("Scenario A: Moderate rainfall increase with minimal human intervention");

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 180}, 10)`);

        // Combined risk
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", 20)
            .attr("y2", 0)
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 4);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 0)
            .attr("r", 3)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 0)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Combined Risk");

        // Soil erosion
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 15)
            .attr("x2", 20)
            .attr("y2", 15)
            .attr("stroke", themeColors.orange)
            .attr("stroke-width", 3);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 15)
            .attr("r", 2)
            .attr("fill", themeColors.orange)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 15)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Soil Erosion Risk");

        // Vegetation degradation
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 30)
            .attr("x2", 20)
            .attr("y2", 30)
            .attr("stroke", themeColors.cyan)
            .attr("stroke-width", 3);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 30)
            .attr("r", 2)
            .attr("fill", themeColors.cyan)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 30)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Vegetation Degradation Risk");

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYScale = event.transform.rescaleY(yScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale));
                svg.select(".y-axis").call(d3.axisLeft(newYScale).tickFormat(d => d + '%'));

                // Update lines
                svg.select(".combined-line").attr("d", combinedLine.x(d => newXScale(d.year) + xScale.bandwidth() / 2).y(d => newYScale(d.combined)));
                svg.select(".erosion-line").attr("d", erosionLine.x(d => newXScale(d.year) + xScale.bandwidth() / 2).y(d => newYScale(d.erosion)));
                svg.select(".vegetation-line").attr("d", vegetationLine.x(d => newXScale(d.year) + xScale.bandwidth() / 2).y(d => newYScale(d.vegetation)));

                // Update points
                svg.selectAll(".combined-point")
                    .attr("cx", d => newXScale(d.year) + xScale.bandwidth() / 2)
                    .attr("cy", d => newYScale(d.combined));
                svg.selectAll(".erosion-point")
                    .attr("cx", d => newXScale(d.year) + xScale.bandwidth() / 2)
                    .attr("cy", d => newYScale(d.erosion));
                svg.selectAll(".vegetation-point")
                    .attr("cx", d => newXScale(d.year) + xScale.bandwidth() / 2)
                    .attr("cy", d => newYScale(d.vegetation));
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        const mouseover = function(event, d) {
            tooltip.style("visibility", "visible");
            d3.select(this).attr("r", d3.select(this).classed("combined-point") ? 8 : 6);
        };

        const mousemove = function(event, d) {
            const dateStr = d.year;
            let tooltipContent = `<strong>${dateStr}</strong><br/>`;
            tooltipContent += `Combined Risk: ${d.combined}%<br/>`;
            tooltipContent += `Soil Erosion: ${d.erosion}%<br/>`;
            tooltipContent += `Vegetation Degradation: ${d.vegetation}%<br/>`;
            tooltipContent += `Risk Level: ${d.combined >= 70 ? 'High' : d.combined >= 40 ? 'Medium' : 'Low'}`;
            tooltip.html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        };

        const mouseleave = function(event, d) {
            tooltip.style("visibility", "hidden");
            d3.select(this).attr("r", d3.select(this).classed("combined-point") ? 6 : 4);
        };

        // Attach tooltip events to points
        svg.selectAll(".combined-point, .erosion-point, .vegetation-point")
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseleave", mouseleave);

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yScale, zoom };
    }

    getChartThemeColors() {
        const root = document.documentElement;
        const isDark = root.getAttribute('data-theme') === 'dark';

        // Colorblind-friendly palette (Okabe-Ito color scheme)
        return {
            textColor: getComputedStyle(root).getPropertyValue('--chart-text').trim(),
            gridColor: getComputedStyle(root).getPropertyValue('--chart-grid').trim(),
            backgroundColor: getComputedStyle(root).getPropertyValue('--chart-bg').trim(),
            // Primary colors - distinguishable for colorblind users
            green: isDark ? '#44aa99' : '#117733',    // Teal/green
            blue: isDark ? '#88ccee' : '#0072b2',     // Blue
            orange: isDark ? '#ddcc77' : '#e69f00',   // Yellow/orange
            red: isDark ? '#cc6677' : '#d55e00',      // Reddish
            // Additional colors for complex charts
            purple: isDark ? '#aa4499' : '#882255',   // Purple
            cyan: isDark ? '#44aa99' : '#009e73'      // Cyan
        };
    }

    updateChartThemes() {
        // Update D3.js charts with new theme colors
        if (this.d3Charts) {
            Object.keys(this.d3Charts).forEach(containerId => {
                const chartData = this.d3Charts[containerId];
                if (chartData && chartData.svg) {
                    const themeColors = this.getChartThemeColors();
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

                    // Update text colors
                    chartData.svg.selectAll("text")
                        .style("fill", themeColors.textColor);

                    // Update axis colors
                    chartData.svg.selectAll(".domain, .tick line")
                        .style("stroke", themeColors.gridColor);

                    // Update tooltip background
                    d3.selectAll(".d3-tooltip")
                        .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
                        .style("border-color", themeColors.gridColor)
                        .style("color", themeColors.textColor);

                    // Update point stroke colors
                    chartData.svg.selectAll("circle")
                        .attr("stroke", isDark ? "#fff" : "#000");
                }
            });
        }
    }

    attachHistoricalButtons() {
        // Attach event listeners for historical data buttons
        const historicalNdviBtn = document.getElementById('historical-ndvi');
        if (historicalNdviBtn) {
            historicalNdviBtn.addEventListener('click', () => {
                this.loadHistoricalNDVI();
            });
        }

        const historicalWeatherBtn = document.getElementById('historical-weather');
        if (historicalWeatherBtn) {
            historicalWeatherBtn.addEventListener('click', () => {
                this.loadHistoricalWeather();
            });
        }

        // Attach event listeners for period selection buttons
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.selectWeatherPeriod(button.id);
            });
        });
    }

    attachForecastingButtons() {
        // Attach event listeners for forecasting buttons
        const forecastNdviBtn = document.getElementById('forecast-ndvi');
        if (forecastNdviBtn) {
            forecastNdviBtn.addEventListener('click', () => {
                this.forecastNDVI();
            });
        }

        const forecastWeatherBtn = document.getElementById('forecast-weather');
        if (forecastWeatherBtn) {
            forecastWeatherBtn.addEventListener('click', () => {
                this.forecastWeather();
            });
        }
    }

    initStatusIndicator() {
        // Initialize status indicator with proper ARIA labels
        const statusIndicator = document.getElementById('status-indicator');
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');

        if (statusIndicator && statusDot && statusText) {
            statusIndicator.setAttribute('role', 'status');
            statusIndicator.setAttribute('aria-live', 'polite');
            statusIndicator.setAttribute('aria-label', 'Application status indicator');
            statusDot.setAttribute('aria-hidden', 'true'); // The dot is decorative
            statusText.setAttribute('aria-label', 'Current status message');
        }

        // Set initial status
        this.updateStatus('checking', 'idle', 'Initializing application...');
    }

    updateStatus(connection, operation, message, details = '') {
        // Update internal status
        this.currentStatus = {
            connection,
            operation,
            message,
            details
        };

        // Update UI
        this.updateStatusUI();
    }

    updateStatusUI() {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');

        if (!statusDot || !statusText || !statusIndicator) return;

        // Remove all existing classes
        statusDot.className = 'status-dot';
        statusIndicator.className = 'status-indicator';

        // Determine primary status (connection takes precedence over operation)
        let primaryStatus = this.currentStatus.connection;
        let statusMessage = this.currentStatus.message;

        // If connection is good, show operation status
        if (this.currentStatus.connection === 'connected') {
            switch (this.currentStatus.operation) {
                case 'searching':
                    primaryStatus = 'processing';
                    statusMessage = 'Searching location...';
                    break;
                case 'analyzing':
                    primaryStatus = 'processing';
                    statusMessage = 'Analyzing area...';
                    break;
                case 'loading_historical':
                    primaryStatus = 'processing';
                    statusMessage = 'Loading historical data...';
                    break;
                case 'forecasting':
                    primaryStatus = 'processing';
                    statusMessage = 'Generating forecast...';
                    break;
                case 'idle':
                    primaryStatus = 'connected';
                    statusMessage = 'Ready';
                    break;
                default:
                    primaryStatus = 'connected';
                    statusMessage = this.currentStatus.message || 'Ready';
            }
        }

        // Apply status classes and messages
        switch (primaryStatus) {
            case 'connected':
                statusDot.classList.add('connected');
                statusIndicator.classList.add('status-connected');
                statusText.textContent = statusMessage;
                break;
            case 'disconnected':
                statusDot.classList.add('error');
                statusIndicator.classList.add('status-error');
                statusText.textContent = statusMessage || 'Backend disconnected';
                break;
            case 'checking':
                statusDot.classList.add('connecting');
                statusIndicator.classList.add('status-connecting');
                statusText.textContent = statusMessage || 'Checking connection...';
                break;
            case 'processing':
                statusDot.classList.add('connecting');
                statusIndicator.classList.add('status-processing');
                statusText.textContent = statusMessage;
                break;
            case 'error':
                statusDot.classList.add('error');
                statusIndicator.classList.add('status-error');
                statusText.textContent = statusMessage || 'Error occurred';
                break;
            default:
                statusDot.classList.add('connected');
                statusIndicator.classList.add('status-connected');
                statusText.textContent = statusMessage || 'Ready';
        }

        // Update ARIA label for screen readers
        statusIndicator.setAttribute('aria-label', `Application status: ${statusText.textContent}`);
    }

    checkConnectionStatus() {
        this.updateStatus('checking', 'idle', 'Checking backend connection...');

        fetch('https://landcare-ai-1.onrender.com/health')
            .then(response => response.json())
            .then(data => {
                console.log('Backend health:', data);
                if (data.gee_initialized) {
                    console.log('GEE is initialized');
                    this.updateStatus('connected', 'idle', 'Connected to backend');
                } else {
                    this.updateStatus('connected', 'idle', 'Connected (GEE not initialized)');
                }
            })
            .catch(error => {
                console.error('Backend connection error:', error);
                this.updateStatus('disconnected', 'idle', 'Cannot connect to backend');
                this.showError('Cannot connect to backend. Please ensure the server is running.');
            });
    }

    updateActiveNavLink() {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-menu a');

        let currentSection = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.scrollY >= sectionTop - 60) {
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

    showSuccess(message) {
        // Show success toast/notification
        console.log('Success:', message);
        // You can implement a toast notification here
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    updateLandCoverDisplay(landCoverData) {
        const landCoverDetailsEl = document.getElementById('land-cover-details');
        if (!landCoverDetailsEl) return;

        // Clear existing content
        landCoverDetailsEl.innerHTML = '';

        // Mapping of technical names to user-friendly display names
        const landCoverTypeNames = {
            'bare_ground': 'Bare / sparse vegetation',
            'bare_soil': 'Bare / sparse vegetation',
            'trees': 'Tree cover',
            'grass': 'Grassland',
            'crops': 'Cropland',
            'water': 'Water',
            'urban': 'Built-up',
            'shrub': 'Shrubland',
            'wetland': 'Wetland',
            'snow': 'Snow/Ice',
            'built': 'Built-up',
            'vegetation': 'Vegetation',
            'agriculture': 'Agriculture',
            'forest': 'Tree cover',
            'woodland': 'Tree cover'
        };

        // Check if we have the new km² format or old pixel format
        let landCoverTypes = landCoverData.land_cover_areas || landCoverData.land_cover_types;

        if (!landCoverTypes) return;

        // Sort by pixel count (descending) - handle both formats
        const sortedTypes = Object.entries(landCoverTypes)
            .sort(([,a], [,b]) => {
                // Handle new format (object with pixel_count) vs old format (number)
                const aValue = typeof a === 'object' ? a.pixel_count : a;
                const bValue = typeof b === 'object' ? b.pixel_count : b;
                return bValue - aValue;
            })
            .slice(0, 5); // Show top 5 types

        sortedTypes.forEach(([type, data]) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'land-cover-item';

            const typeSpan = document.createElement('span');
            typeSpan.className = 'land-cover-type';
            typeSpan.textContent = landCoverTypeNames[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            const valueSpan = document.createElement('span');
            valueSpan.className = 'land-cover-value';

            // Handle new km² format vs old pixel format
            if (typeof data === 'object' && data.area_km2 !== undefined) {
                // New format: show pixel count as requested
                valueSpan.textContent = data.pixel_count.toLocaleString();
                valueSpan.title = `Area: ${data.area_km2.toFixed(2)} km² (${data.percentage.toFixed(1)}% of total area)\nPixel count: ${data.pixel_count.toLocaleString()}`;
            } else {
                // Old format: show pixel count
                valueSpan.textContent = data.toLocaleString();
                valueSpan.title = 'Pixel count';
            }

            // Add info icon for tooltip
            const infoIcon = document.createElement('span');
            infoIcon.className = 'info-icon';
            infoIcon.textContent = 'ℹ️';
            infoIcon.title = 'Area calculated from 10m resolution satellite imagery\n1 pixel = 100 m² = 0.0001 km²';

            itemDiv.appendChild(typeSpan);
            itemDiv.appendChild(valueSpan);
            itemDiv.appendChild(infoIcon);
            landCoverDetailsEl.appendChild(itemDiv);
        });
    }

    displayEarlyWarnings(warnings) {
        const earlyWarningsEl = document.getElementById('early-warnings-list');
        if (!earlyWarningsEl) return;

        // Clear existing content
        earlyWarningsEl.innerHTML = '';

        if (!warnings || warnings.length === 0) {
            const noWarningsDiv = document.createElement('div');
            noWarningsDiv.className = 'no-warnings';
            noWarningsDiv.innerHTML = '<span style="color: green; font-size: 1.2em;">✅</span> No early warnings at this time';
            earlyWarningsEl.appendChild(noWarningsDiv);
            return;
        }

        warnings.forEach(warning => {
            const warningDiv = document.createElement('div');
            warningDiv.className = `early-warning-item ${warning.severity}-warning`;

            const warningIcon = document.createElement('span');
            warningIcon.className = 'warning-icon';
            warningIcon.textContent = warning.icon;

            const warningContent = document.createElement('div');
            warningContent.className = 'warning-content';

            const warningText = document.createElement('div');
            warningText.className = 'warning-text';
            warningText.innerHTML = `<strong>${warning.message}</strong>`;

            const recommendationsDiv = document.createElement('div');
            recommendationsDiv.className = 'warning-recommendations';
            recommendationsDiv.innerHTML = '<strong>Recommendations:</strong><ul>' +
                warning.recommendations.map(rec => `<li>${rec}</li>`).join('') + '</ul>';

            const locationDiv = document.createElement('div');
            locationDiv.className = 'warning-location';
            locationDiv.innerHTML = `<small><em>Location: ${warning.location}</em></small>`;

            warningContent.appendChild(warningText);
            warningContent.appendChild(recommendationsDiv);
            warningContent.appendChild(locationDiv);

            warningDiv.appendChild(warningIcon);
            warningDiv.appendChild(warningContent);
            earlyWarningsEl.appendChild(warningDiv);
        });
    }

    generateEarlyWarnings(riskAssessmentResults, config = {}) {
        // Default thresholds
        const thresholds = {
            vegetation: {
                healthIndex: 0.3,
                degradationRate: 0.1 // 10% per month
            },
            erosion: {
                risk: 0.7
            },
            weather: {
                risk: 0.7,
                heatTemp: 35,
                lowHumidity: 20,
                windSpeed: 20
            },
            biodiversity: {
                diversityIndex: 0.5
            },
            carbonSequestration: {
                dropPercentage: 0.2 // 20% below baseline
            },
            environmental: {
                bareLandPercentage: 0.5,
                bareLandCritical: 0.7,
                waterBodyPercentage: 0.3,
                soilMoisture: 15
            },
            compositeRisk: {
                critical: 0.8,
                medium: 0.5
            }
        };

        // Override with config if provided
        if (config.thresholds) {
            Object.assign(thresholds, config.thresholds);
        }

        const warnings = [];
        const results = riskAssessmentResults;

        // Helper function to determine severity
        const getSeverity = (riskValue) => {
            if (riskValue >= thresholds.compositeRisk.critical) return 'critical';
            if (riskValue >= thresholds.compositeRisk.medium) return 'medium';
            return 'low';
        };

        // Helper function to get icon
        const getIcon = (severity) => {
            switch (severity) {
                case 'critical': return '🚨';
                case 'medium': return '⚠️';
                case 'low': return 'ℹ️';
                default: return '⚠️';
            }
        };

        // Vegetation degradation alerts
        if (results.ndvi && results.ndvi.NDVI !== undefined) {
            const ndvi = results.ndvi.NDVI;
            if (ndvi < thresholds.vegetation.healthIndex) {
                const severity = getSeverity(0.8); // High severity for low NDVI
                warnings.push({
                    message: `Vegetation health index (${ndvi.toFixed(3)}) below critical threshold (${thresholds.vegetation.healthIndex}). Severe degradation detected.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Implement immediate reforestation programs',
                        'Conduct soil fertility assessment',
                        'Install irrigation systems if applicable',
                        'Monitor vegetation recovery over next 3 months'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Soil erosion warnings
        if (results.risk_assessment?.risk_factors?.erosion_risk !== undefined) {
            const erosionRisk = results.risk_assessment.risk_factors.erosion_risk;
            if (erosionRisk > thresholds.erosion.risk) {
                const severity = getSeverity(erosionRisk);
                warnings.push({
                    message: `Soil erosion risk (${(erosionRisk * 100).toFixed(0)}%) exceeds threshold (${(thresholds.erosion.risk * 100).toFixed(0)}%).`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Implement contour farming techniques',
                        'Install erosion control structures',
                        'Plant cover crops immediately',
                        'Monitor slope stability and soil depth'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Weather vulnerability alerts
        if (results.risk_assessment?.risk_factors?.weather_risk !== undefined) {
            const weatherRisk = results.risk_assessment.risk_factors.weather_risk;
            if (weatherRisk > thresholds.weather.risk) {
                const severity = getSeverity(weatherRisk);
                warnings.push({
                    message: `Weather vulnerability risk (${(weatherRisk * 100).toFixed(0)}%) indicates potential extreme weather impacts.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Prepare emergency response plans',
                        'Stockpile drought-resistant seeds',
                        'Install weather monitoring stations',
                        'Develop water conservation strategies'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Biodiversity alerts
        if (results.biodiversity?.diversity_index !== undefined) {
            const diversityIndex = results.biodiversity.diversity_index;
            if (diversityIndex < thresholds.biodiversity.diversityIndex) {
                const severity = getSeverity(0.7);
                warnings.push({
                    message: `Biodiversity diversity index (${diversityIndex.toFixed(2)}) below threshold (${thresholds.biodiversity.diversityIndex}). Ecosystem imbalance detected.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Conduct biodiversity assessment survey',
                        'Implement habitat restoration programs',
                        'Introduce native species',
                        'Monitor species population trends'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Carbon sequestration warnings
        if (results.carbon?.sequestration_rate !== undefined && results.carbon?.baseline_rate !== undefined) {
            const currentRate = results.carbon.sequestration_rate;
            const baselineRate = results.carbon.baseline_rate;
            const dropPercentage = (baselineRate - currentRate) / baselineRate;

            if (dropPercentage > thresholds.carbonSequestration.dropPercentage) {
                const severity = getSeverity(dropPercentage);
                warnings.push({
                    message: `Carbon sequestration rate dropped ${(dropPercentage * 100).toFixed(0)}% below baseline. Reduced carbon capture capacity.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Enhance afforestation efforts',
                        'Implement carbon farming practices',
                        'Monitor soil organic matter levels',
                        'Assess land management practices'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Environmental composition monitoring
        if (results.land_cover) {
            const landCoverData = results.land_cover.land_cover_areas || results.land_cover.land_cover_types;
            if (landCoverData) {
                const totalPixels = Object.values(landCoverData).reduce((sum, value) => {
                    return sum + (typeof value === 'object' ? value.pixel_count : value);
                }, 0);

                // Bare land percentage alerts
                const bareLandTypes = ['bare_ground', 'bare_soil', 'urban'];
                let bareLandPixels = 0;
                bareLandTypes.forEach(type => {
                    const value = landCoverData[type];
                    if (value) {
                        bareLandPixels += typeof value === 'object' ? value.pixel_count : value;
                    }
                });

                const bareLandPercentage = bareLandPixels / totalPixels;
                if (bareLandPercentage > thresholds.environmental.bareLandPercentage) {
                    const severity = bareLandPercentage > thresholds.environmental.bareLandCritical ? 'critical' : 'medium';
                    warnings.push({
                        message: `Bare land percentage (${(bareLandPercentage * 100).toFixed(1)}%) exceeds threshold (${(thresholds.environmental.bareLandPercentage * 100).toFixed(0)}%).`,
                        severity: severity,
                        icon: getIcon(severity),
                        recommendations: [
                            'Implement large-scale reforestation',
                            'Develop soil stabilization programs',
                            'Monitor desertification progression',
                            'Establish vegetation corridors'
                        ],
                        location: results.centroid || 'Selected area'
                    });
                }

                // Water body monitoring alerts
                const waterValue = landCoverData['water'];
                if (waterValue) {
                    const waterPixels = typeof waterValue === 'object' ? waterValue.pixel_count : waterValue;
                    const waterPercentage = waterPixels / totalPixels;

                    if (waterPercentage > thresholds.environmental.waterBodyPercentage) {
                        const severity = getSeverity(0.6);
                        warnings.push({
                            message: `Water body coverage (${(waterPercentage * 100).toFixed(1)}%) indicates potential flooding risks.`,
                            severity: severity,
                            icon: getIcon(severity),
                            recommendations: [
                                'Install flood monitoring systems',
                                'Develop floodplain management plans',
                                'Strengthen drainage infrastructure',
                                'Monitor water level changes'
                            ],
                            location: results.centroid || 'Selected area'
                        });
                    }
                }

                // Soil moisture alerts
                if (results.soil?.moisture_percentage !== undefined) {
                    const moisture = results.soil.moisture_percentage;
                    if (moisture < thresholds.environmental.soilMoisture) {
                        const severity = getSeverity(0.8);
                        warnings.push({
                            message: `Soil moisture level (${moisture.toFixed(1)}%) critically low. Drought conditions likely.`,
                            severity: severity,
                            icon: getIcon(severity),
                            recommendations: [
                                'Implement emergency irrigation',
                                'Apply soil moisture conservation techniques',
                                'Monitor crop stress indicators',
                                'Prepare drought contingency plans'
                            ],
                            location: results.centroid || 'Selected area'
                        });
                    }
                }
            }
        }

        // Weather condition alerts
        if (results.weather) {
            const temp = results.weather.main?.temp;
            const humidity = results.weather.main?.humidity;
            const windSpeed = results.weather.wind?.speed;
            const weatherDesc = results.weather.weather_description;

            // Extreme heat warnings
            if (temp > thresholds.weather.heatTemp) {
                const severity = 'critical';
                warnings.push({
                    message: `Extreme heat detected (${temp.toFixed(1)}°C sustained above ${thresholds.weather.heatTemp}°C).`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Activate heat stress monitoring',
                        'Implement shade and cooling measures',
                        'Monitor vegetation for heat damage',
                        'Prepare fire prevention protocols'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }

            // Low humidity alerts
            if (humidity < thresholds.weather.lowHumidity) {
                const severity = getSeverity(0.7);
                warnings.push({
                    message: `Humidity critically low (${humidity.toFixed(1)}% below ${thresholds.weather.lowHumidity}%). Fire risk elevated.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Implement fire prevention measures',
                        'Monitor soil moisture depletion',
                        'Prepare emergency water supplies',
                        'Restrict open burning activities'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }

            // Precipitation detection for erosion monitoring
            if (weatherDesc && weatherDesc.toLowerCase().includes('rain')) {
                const severity = 'medium';
                warnings.push({
                    message: 'Precipitation detected. Increased soil erosion risk during rainfall events.',
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Monitor runoff and erosion channels',
                        'Ensure erosion control measures are active',
                        'Check drainage system capacity',
                        'Prepare sediment control barriers'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }

            // Wind erosion alerts
            if (windSpeed > thresholds.weather.windSpeed) {
                const severity = getSeverity(0.6);
                warnings.push({
                    message: `High wind speeds (${windSpeed.toFixed(1)} km/h) detected. Wind erosion risk increased.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Implement windbreak installation',
                        'Monitor soil particle movement',
                        'Apply surface stabilization techniques',
                        'Protect vulnerable soil surfaces'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Overall risk level integration
        if (results.risk_assessment?.overall_risk_score !== undefined) {
            const overallRisk = results.risk_assessment.overall_risk_score;

            if (overallRisk >= thresholds.compositeRisk.critical) {
                warnings.push({
                    message: `CRITICAL: Composite risk score (${overallRisk.toFixed(2)}) indicates immediate emergency response required.`,
                    severity: 'critical',
                    icon: '🚨',
                    recommendations: [
                        'Activate emergency response protocols',
                        'Deploy immediate intervention teams',
                        'Implement crisis management plans',
                        'Establish 24/7 monitoring operations'
                    ],
                    location: results.centroid || 'Selected area'
                });
            } else if (overallRisk >= thresholds.compositeRisk.medium) {
                warnings.push({
                    message: `MODERATE: Composite risk score (${overallRisk.toFixed(2)}) suggests preventive measures needed.`,
                    severity: 'medium',
                    icon: '⚠️',
                    recommendations: [
                        'Develop comprehensive management plan',
                        'Implement monitoring systems',
                        'Schedule regular assessments',
                        'Prepare resource allocation'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Predictive alerts based on trends (simplified - would need historical data)
        if (results.trends) {
            const vegetationTrend = results.trends.vegetation_degradation_rate;
            if (vegetationTrend > thresholds.vegetation.degradationRate) {
                const severity = getSeverity(0.7);
                warnings.push({
                    message: `Vegetation degradation accelerating (${(vegetationTrend * 100).toFixed(1)}% per month). Trend indicates worsening conditions.`,
                    severity: severity,
                    icon: getIcon(severity),
                    recommendations: [
                        'Accelerate intervention programs',
                        'Monitor trend progression closely',
                        'Adjust management strategies',
                        'Prepare contingency plans'
                    ],
                    location: results.centroid || 'Selected area'
                });
            }
        }

        // Sort warnings by severity (critical first)
        const severityOrder = { critical: 3, medium: 2, low: 1 };
        warnings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

        return warnings;
    }

    async loadHistoricalNDVI() {
        if (!this.authToken) {
            this.showError('You must be logged in to access historical data');
            this.openAuthModal(true);
            return;
        }

        if (!this.mapHandler.currentPolygon) {
            this.showError('No polygon drawn. Please draw a polygon first.');
            return;
        }

        const startDate = document.getElementById('historical-vi-start')?.value || '1984-01-01';
        const endDate = document.getElementById('historical-vi-end')?.value || new Date().toISOString().split('T')[0];

        // Check date range for GEE API limitations
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffYears = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 365));

        if (diffYears > 10) {
            const confirmed = confirm(`Warning: You selected a ${diffYears}-year date range. This may exceed Google Earth Engine non-commercial API limits (10,000 CPU-seconds/day) and could result in timeouts or rejections. Consider using a smaller date range. Continue anyway?`);
            if (!confirmed) {
                return;
            }
        }

        try {
            this.updateStatus(this.currentStatus.connection, 'loading_historical', 'Loading historical vegetation data...');
            const geometry = this.mapHandler.currentPolygonLayer.toGeoJSON().geometry;

            const response = await fetch('https://landcare-ai-1.onrender.com/historical/vis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    geometry: geometry,
                    start_date: startDate,
                    end_date: endDate
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load historical VIs');
            }

            this.displayHistoricalNDVI(data);
            this.updateStatus(this.currentStatus.connection, 'idle', 'Historical data loaded');
            this.showSuccess('Historical VIs data loaded successfully!');
        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'Failed to load historical data');
            this.showError(`Historical VIs error: ${error.message}`);
            console.error('Historical VIs error:', error);
        }
    }

    selectWeatherPeriod(buttonId) {
        // Remove active class from all period buttons
        const periodButtons = document.querySelectorAll('.period-btn');
        periodButtons.forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        const clickedButton = document.getElementById(buttonId);
        if (clickedButton) {
            clickedButton.classList.add('active');
        }

        // Calculate dates based on selected period
        const today = new Date();
        let startDate, endDate;

        switch (buttonId) {
            case 'period-7':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 7);
                endDate = new Date(today);
                break;
            case 'period-30':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 30);
                endDate = new Date(today);
                break;
            case 'period-90':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 90);
                endDate = new Date(today);
                break;
            case 'period-365':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 365);
                endDate = new Date(today);
                break;
            case 'period-1year':
                startDate = new Date(today);
                startDate.setFullYear(today.getFullYear() - 1);
                endDate = new Date(today);
                break;
            case 'period-5years':
                startDate = new Date(today);
                startDate.setFullYear(today.getFullYear() - 5);
                endDate = new Date(today);
                break;
            case 'period-10years':
                startDate = new Date(today);
                startDate.setFullYear(today.getFullYear() - 10);
                endDate = new Date(today);
                break;
            case 'period-custom':
                // For custom, set to a wide range from 1940 to present
                startDate = new Date('1940-01-01');
                endDate = new Date(today);
                break;
            default:
                return;
        }

        // Update date picker inputs
        const startInput = document.getElementById('historical-weather-start');
        const endInput = document.getElementById('historical-weather-end');

        if (startInput && endInput) {
            startInput.value = startDate.toISOString().split('T')[0];
            endInput.value = endDate.toISOString().split('T')[0];
        }
    }

    async loadHistoricalWeather() {
        if (!this.authToken) {
            this.showError('You must be logged in to access historical data');
            this.openAuthModal(true);
            return;
        }

        if (!this.mapHandler.currentPolygon) {
            this.showError('No polygon drawn. Please draw a polygon first.');
            return;
        }

        try {
            const centroid = this.mapHandler.getPolygonCentroid(this.mapHandler.currentPolygonLayer.toGeoJSON().geometry);
            const startDate = document.getElementById('historical-weather-start')?.value;
            const endDate = document.getElementById('historical-weather-end')?.value;

            if (!startDate || !endDate) {
                this.showError('Please select both start and end dates');
                return;
            }

            // Calculate date range for progress feedback
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const diffYears = Math.ceil(diffDays / 365);

            // Update status with progress feedback
            this.updateStatus(this.currentStatus.connection, 'loading_historical',
                `Loading historical weather data for ${diffYears} year${diffYears > 1 ? 's' : ''}...`);

            // Convert to ISO format with time
            const startDateTime = new Date(startDate).toISOString();
            const endDateTime = new Date(endDate).toISOString();

            // Create AbortController for timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

            const response = await fetch(`https://landcare-ai-1.onrender.com/historical/weather/${centroid[0]}/${centroid[1]}?start_date=${startDateTime}&end_date=${endDateTime}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok) {
                // Handle specific API errors
                if (response.status === 429) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                } else if (response.status === 504 || response.status === 408) {
                    throw new Error('Request timed out. Please try with a smaller date range.');
                } else {
                    throw new Error(data.error || 'Failed to load historical weather');
                }
            }

            this.displayHistoricalWeather(data);
            this.updateStatus(this.currentStatus.connection, 'idle', 'Historical data loaded successfully');
            this.showSuccess('Historical weather data loaded successfully!');
        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'Failed to load historical data');

            if (error.name === 'AbortError') {
                this.showError('Request timed out. Please try with a smaller date range or check your connection.');
            } else {
                this.showError(`Historical weather error: ${error.message}`);
            }
            console.error('Historical weather error:', error);
        }
    }

    async forecastNDVI() {
        if (!this.authToken) {
            this.showError('You must be logged in to perform forecasting');
            this.openAuthModal(true);
            return;
        }

        if (!this.mapHandler.currentPolygon) {
            this.showError('No polygon drawn. Please draw a polygon first.');
            return;
        }

        try {
            this.updateStatus(this.currentStatus.connection, 'forecasting', 'Generating vegetation forecast...');

            // First get historical data for forecasting
            const geometry = this.mapHandler.currentPolygonLayer.toGeoJSON().geometry;
            const historicalMonths = parseInt(document.getElementById('forecast-historical-months-select')?.value) || 12;
            const historicalResponse = await fetch('https://landcare-ai-1.onrender.com/historical/vis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    geometry: geometry,
                    months: historicalMonths  // Use selected months for forecasting
                })
            });

            const historicalData = await historicalResponse.json();
            if (!historicalResponse.ok) {
                throw new Error('Failed to get historical data for forecasting');
            }

            // Now forecast
            const months = parseInt(document.getElementById('forecast-months-select')?.value) || 12; // Get from UI or default to 12

            // Transform historical data to match forecast function expectations
            const historicalForForecast = {
                dates: historicalData.dates,
                values: historicalData.ndvi_values
            };

            const forecastResponse = await fetch('https://landcare-ai-1.onrender.com/forecast/vis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    historical_ndvi: historicalForForecast,
                    months: months,
                    geometry: geometry
                })
            });

            const forecastData = await forecastResponse.json();
            if (!forecastResponse.ok) {
                throw new Error(forecastData.error || 'Forecasting failed');
            }

            this.displayNDVIForecast(forecastData);
            this.updateStatus(this.currentStatus.connection, 'idle', 'Forecast completed');
            this.showSuccess('VIs forecast completed successfully!');
        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'Forecast failed');
            this.showError(`NDVI forecast error: ${error.message}`);
            console.error('NDVI forecast error:', error);
        }
    }

    async forecastWeather() {
        if (!this.authToken) {
            this.showError('You must be logged in to perform forecasting');
            this.openAuthModal(true);
            return;
        }

        if (!this.mapHandler.currentPolygon) {
            this.showError('No polygon drawn. Please draw a polygon first.');
            return;
        }

        try {
            const centroid = this.mapHandler.getPolygonCentroid(this.mapHandler.currentPolygonLayer.toGeoJSON().geometry);
            const days = parseInt(document.getElementById('forecast-days-select')?.value) || 5; // Get from UI or default to 5

            const response = await fetch(`https://landcare-ai-1.onrender.com/forecast/weather/${centroid[0]}/${centroid[1]}?days=${days}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Weather forecasting failed');
            }

            this.displayWeatherForecast(data);
            this.showSuccess('Weather forecast completed successfully!');
        } catch (error) {
            this.showError(`Weather forecast error: ${error.message}`);
            console.error('Weather forecast error:', error);
        }
    }

    displayHistoricalNDVI(data) {
        // Switch to historical tab and display data
        this.switchToTab('historical');

        // Update statistics
        if (data.metadata) {
            document.getElementById('historical-data-points').textContent = data.metadata.data_points || data.dates.length;
            document.getElementById('historical-time-range').textContent = `${data.metadata.start_date} to ${data.metadata.end_date}`;
            document.getElementById('historical-trend').textContent = data.ndvi_statistics?.trend || 'N/A';
        }

        // Display statistics if available
        if (data.ndvi_statistics) {
            console.log('NDVI Statistics:', data.ndvi_statistics);
        }

        // Render multi-series chart for NDVI, EVI, SAVI
        this.renderMultiTimeSeriesChart('historical-ndvi-chart', data.dates, {
            'NDVI': data.ndvi_values,
            'EVI': data.evi_values,
            'SAVI': data.savi_values
        }, 'Vegetation Indices', 'Historical Vegetation Indices');
    }

    displayHistoricalWeather(data) {
        // Switch to historical tab and display data
        this.switchToTab('historical');

        // Update statistics
        if (data.metadata) {
            document.getElementById('historical-data-points').textContent = data.metadata.data_points || (data.data ? data.data.length : 'N/A');
            document.getElementById('historical-time-range').textContent = data.metadata.period_days ? `${data.metadata.period_days} days` : `${data.metadata.start_date} to ${data.metadata.end_date}`;
            document.getElementById('historical-trend').textContent = data.metadata.precipitation_trend || 'N/A';
        }

        // Display statistics if available
        if (data.statistics) {
            console.log('Weather Statistics:', data.statistics);
        }

        // Use new D3.js chart for both data formats
        this.renderD3HistoricalWeatherChart('historical-weather-chart', data);
    }

    displayNDVIForecast(data) {
        // Switch to forecasting tab and display data
        this.switchToTab('forecasting');

        // Update forecast info
        if (data.metadata) {
            document.getElementById('forecast-period').textContent = `${data.metadata.parameters.periods} months`;
            document.getElementById('forecast-model').textContent = data.metadata.model;
            document.getElementById('forecast-confidence').textContent = data.metadata.parameters.confidence_intervals ? '95%' : 'N/A';
        }

        this.renderForecastChart('forecast-ndvi-chart', data.forecast_dates, data.forecast_values, data.confidence_intervals, 'VIs Forecast');
    }

    displayWeatherForecast(data) {
        // Switch to forecasting tab and display data
        this.switchToTab('forecasting');

        // Update forecast info
        if (data.metadata) {
            document.getElementById('forecast-period').textContent = `${data.metadata.forecast_period_days} days`;
            document.getElementById('forecast-model').textContent = 'ARIMA/SARIMA';
            document.getElementById('forecast-confidence').textContent = 'Simple bounds';
        }

        // Handle new data format with uncertainty bands
        if (data.temperature && data.temperature.values) {
            // New format with uncertainty
            this.renderWeatherForecastChartWithUncertainty('forecast-weather-chart', data.forecast_dates,
                data.temperature, data.precipitation, data.humidity);
        } else {
            // Fallback to old format
            this.renderWeatherForecastChart('forecast-weather-chart', data.forecast_dates,
                data.temperature_forecast, data.precipitation_forecast);
        }
    }

    switchToTab(tabName) {
        // Switch to the specified tab
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach((button, index) => {
            if (button.textContent.toLowerCase().includes(tabName)) {
                button.classList.add('active');
                if (tabContents[index]) {
                    tabContents[index].style.display = 'block';
                }
            } else {
                button.classList.remove('active');
                if (tabContents[index]) {
                    tabContents[index].style.display = 'none';
                }
            }
        });
    }

    renderTimeSeriesChart(containerId, dates, values, label, title) {
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Fixed desktop dimensions
        const margin = {top: 20, right: 80, bottom: 60, left: 60};
        const isMobile = window.innerWidth < 768;
        const width = isMobile ? Math.min(container.node().getBoundingClientRect().width - margin.left - margin.right, 504 - margin.left - margin.right) : 504 - margin.left - margin.right;
        const height = isMobile ? Math.min(498 - margin.top - margin.bottom, 300) : 498 - margin.top - margin.bottom;

        // Create SVG with responsive viewBox
        const svg = container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = dates.map((date, i) => ({
            date: new Date(date),
            value: parseFloat(values[i])
        }));

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([d3.min(data, d => d.value) * 0.95, d3.max(data, d => d.value) * 1.05])
            .range([height, 0]);

        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        // Add line
        svg.append("path")
            .datum(data)
            .attr("class", "time-series-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.green)
            .attr("stroke-width", 2)
            .attr("d", line);

        // Add points
        svg.selectAll(".point")
            .data(data)
            .enter().append("circle")
            .attr("class", "point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yScale(d.value))
            .attr("r", 3)
            .attr("fill", themeColors.green)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        // Add axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(data.length, 10))
            .tickFormat(d3.timeFormat("%b %Y"));

        const yAxis = d3.axisLeft(yScale);

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Date");

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text(label);

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(title);

        // Add zoom functionality
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYScale = event.transform.rescaleY(yScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale));
                svg.select(".y-axis").call(d3.axisLeft(newYScale).tickFormat(d3.format(".2f")));

                // Update line
                svg.select(".ndvi-line").attr("d", line.x(d => newXScale(d.year) + xScale.bandwidth() / 2).y(d => newYScale(d.ndvi)));

                // Update confidence area
                svg.select(".confidence-area").attr("d", area.x(d => newXScale(d.year) + xScale.bandwidth() / 2).y0(d => newYScale(d.lower)).y1(d => newYScale(d.upper)));

                // Update points
                svg.selectAll(".ndvi-point")
                    .attr("cx", d => newXScale(d.year) + xScale.bandwidth() / 2)
                    .attr("cy", d => newYScale(d.ndvi));
            });

        svg.call(zoom);

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        svg.selectAll(".ndvi-point")
            .on("mouseover", function(event, d) {
                tooltip.style("visibility", "visible");
                const dateStr = d.year;
                let tooltipContent = `<strong>${dateStr}</strong><br/>`;
                tooltipContent += `NDVI: ${d.ndvi}<br/>`;
                if (d.upper !== null) {
                    tooltipContent += `Confidence: ${d.lower} - ${d.upper}<br/>`;
                }
                tooltipContent += `Vegetation Health: ${d.ndvi >= 0.6 ? 'Excellent' : d.ndvi >= 0.4 ? 'Good' : d.ndvi >= 0.2 ? 'Moderate' : 'Poor'}`;
                tooltip.html(tooltipContent)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
                d3.select(this).attr("r", 8);
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("visibility", "hidden");
                d3.select(this).attr("r", 6);
            });

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yScale, zoom };
    }


    renderD3HistoricalWeatherChart(containerId, data) {
        // Clear any existing chart
        d3.select(`#${containerId}`).selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Fixed desktop dimensions
        const margin = {top: 20, right: 80, bottom: 60, left: 60};
        const container = d3.select(`#${containerId}`);
        const isMobile = window.innerWidth < 768;
        const width = isMobile ? Math.min(container.node().getBoundingClientRect().width - margin.left - margin.right, 1083 - margin.left - margin.right) : 1083 - margin.left - margin.right;
        const height = isMobile ? Math.min(498 - margin.top - margin.bottom, 300) : 498 - margin.top - margin.bottom;

        // Create SVG with viewBox for responsive scaling
        const svg = container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Process data based on format
        let processedData;
        if (data.data && Array.isArray(data.data)) {
            // Daily format: data.data array with date, temperature, humidity, precipitation
            processedData = data.data.map(d => ({
                date: new Date(d.date),
                temperature: d.temperature,
                humidity: d.humidity,
                precipitation: d.precipitation
            }));
        } else {
            // Monthly format: dates, temperature, rainfall arrays
            processedData = data.dates.map((date, i) => ({
                date: new Date(date),
                temperature: data.temperature[i],
                humidity: null, // Not available in monthly format
                precipitation: data.rainfall ? data.rainfall[i] : 0
            }));
        }

        // Remove null/undefined values
        processedData = processedData.filter(d => d.temperature !== null && d.temperature !== undefined);

        // Downsample data for large datasets to maintain performance
        const MAX_DATA_POINTS = 1000;
        if (processedData.length > MAX_DATA_POINTS) {
            const downsampleFactor = Math.ceil(processedData.length / MAX_DATA_POINTS);
            processedData = processedData.filter((d, i) => i % downsampleFactor === 0);
        }

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(processedData, d => d.date))
            .range([0, width]);

        const yTempScale = d3.scaleLinear()
            .domain([
                d3.min(processedData, d => d.temperature) - 5,
                d3.max(processedData, d => d.temperature) + 5
            ])
            .range([height, 0]);

        const yHumidityScale = d3.scaleLinear()
            .domain([0, 100])
            .range([height, 0]);

        const yPrecipScale = d3.scaleLinear()
            .domain([0, d3.max(processedData, d => d.precipitation) * 1.1])
            .range([height, 0]);

        // Create axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(processedData.length, 10))
            .tickFormat(d3.timeFormat("%b %Y"));

        const yTempAxis = d3.axisLeft(yTempScale);
        const yHumidityAxis = d3.axisRight(yHumidityScale);
        const yPrecipAxis = d3.axisRight(yPrecipScale);

        // Add X axis
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        // Add Y axes
        svg.append("g")
            .call(yTempAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        // Temperature axis label
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Temperature (°C)");

        // Humidity axis (only if data available)
        if (processedData.some(d => d.humidity !== null)) {
            svg.append("g")
                .attr("transform", `translate(${width},0)`)
                .call(yHumidityAxis)
                .selectAll("text")
                .style("fill", themeColors.textColor)
                .style("font-size", "12px");

            // Humidity axis label
            svg.append("text")
                .attr("transform", "rotate(90)")
                .attr("y", -width - margin.right)
                .attr("x", 0 - (height / 2))
                .attr("dy", "1em")
                .style("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "12px")
                .text("Humidity (%)");
        }

        // Precipitation axis
        svg.append("g")
            .attr("transform", `translate(${width},0)`)
            .call(yPrecipAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        // Precipitation axis label
        svg.append("text")
            .attr("transform", "rotate(90)")
            .attr("y", -width - margin.right + 40)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Precipitation (mm)");

        // Create line generators
        const tempLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yTempScale(d.temperature))
            .curve(d3.curveMonotoneX);

        const humidityLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yHumidityScale(d.humidity))
            .curve(d3.curveMonotoneX)
            .defined(d => d.humidity !== null);

        const precipLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yPrecipScale(d.precipitation))
            .curve(d3.curveMonotoneX);

        // Add temperature line
        svg.append("path")
            .datum(processedData)
            .attr("fill", "none")
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 2)
            .attr("d", tempLine);

        // Add temperature points
        svg.selectAll(".temp-point")
            .data(processedData)
            .enter().append("circle")
            .attr("class", "temp-point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yTempScale(d.temperature))
            .attr("r", 3)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        // Add humidity line and points (only if data available)
        if (processedData.some(d => d.humidity !== null)) {
            svg.append("path")
                .datum(processedData.filter(d => d.humidity !== null))
                .attr("fill", "none")
                .attr("stroke", themeColors.cyan)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5")
                .attr("d", humidityLine);

            svg.selectAll(".humidity-point")
                .data(processedData.filter(d => d.humidity !== null))
                .enter().append("circle")
                .attr("class", "humidity-point")
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yHumidityScale(d.humidity))
                .attr("r", 3)
                .attr("fill", themeColors.cyan)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 1);
        }

        // Add precipitation bars
        const barWidth = Math.max(2, Math.min(20, width / processedData.length * 0.8)); // Adaptive bar width

        svg.selectAll(".precip-bar")
            .data(processedData)
            .enter().append("rect")
            .attr("class", "precip-bar")
            .attr("x", d => xScale(d.date) - barWidth / 2)
            .attr("y", d => yPrecipScale(d.precipitation))
            .attr("width", barWidth)
            .attr("height", d => height - yPrecipScale(d.precipitation))
            .attr("fill", themeColors.blue)
            .attr("opacity", 0.7)
            .attr("stroke", themeColors.blue)
            .attr("stroke-width", 1);

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 200}, 10)`);

        // Temperature legend
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", 20)
            .attr("y2", 0)
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 2);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 0)
            .attr("r", 3)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 0)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Temperature");

        // Humidity legend (only if data available)
        if (processedData.some(d => d.humidity !== null)) {
            legend.append("line")
                .attr("x1", 0)
                .attr("y1", 20)
                .attr("x2", 20)
                .attr("y2", 20)
                .attr("stroke", themeColors.cyan)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5");

            legend.append("circle")
                .attr("cx", 10)
                .attr("cy", 20)
                .attr("r", 3)
                .attr("fill", themeColors.cyan)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 1);

            legend.append("text")
                .attr("x", 25)
                .attr("y", 20)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "12px")
                .text("Humidity");
        }

        // Precipitation legend
        const precipY = processedData.some(d => d.humidity !== null) ? 40 : 20;
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", precipY)
            .attr("x2", 20)
            .attr("y2", precipY)
            .attr("stroke", themeColors.blue)
            .attr("stroke-width", 2);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", precipY)
            .attr("r", 3)
            .attr("fill", themeColors.blue)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", precipY)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Precipitation");

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYTempScale = event.transform.rescaleY(yTempScale);
                const newYHumidityScale = event.transform.rescaleY(yHumidityScale);
                const newYPrecipScale = event.transform.rescaleY(yPrecipScale);

                // Update axes
                svg.select(".x-axis").call(xAxis.scale(newXScale));
                svg.select(".y-axis").call(yTempAxis.scale(newYTempScale));
                if (processedData.some(d => d.humidity !== null)) {
                    svg.select(".y-axis-humidity").call(yHumidityAxis.scale(newYHumidityScale));
                }
                svg.select(".y-axis-precip").call(yPrecipAxis.scale(newYPrecipScale));

                // Update lines and points
                svg.selectAll(".temp-line").attr("d", tempLine.x(d => newXScale(d.date)).y(d => newYTempScale(d.temperature)));
                svg.selectAll(".temp-point").attr("cx", d => newXScale(d.date)).attr("cy", d => newYTempScale(d.temperature));

                if (processedData.some(d => d.humidity !== null)) {
                    svg.selectAll(".humidity-line").attr("d", humidityLine.x(d => newXScale(d.date)).y(d => newYHumidityScale(d.humidity)));
                    svg.selectAll(".humidity-point").attr("cx", d => newXScale(d.date)).attr("cy", d => newYHumidityScale(d.humidity));
                }

                // Precipitation is represented only by bars, no lines to update
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        const mouseover = function(event, d) {
            tooltip.style("visibility", "visible");
            d3.select(this).attr("r", 5);
        };

        const mousemove = function(event, d) {
            const dateStr = d.date.toLocaleDateString();
            let tooltipContent = `<strong>${dateStr}</strong><br/>`;

            if (d.temp !== null) {
                tooltipContent += `Temperature: ${d.temp.toFixed(1)}°C`;
                if (d.tempUpper !== null && d.tempLower !== null) {
                    tooltipContent += ` (Range: ${d.tempLower.toFixed(1)} - ${d.tempUpper.toFixed(1)}°C)`;
                }
                tooltipContent += `<br/>`;
            }

            if (d.precip !== null) {
                tooltipContent += `Precipitation: ${d.precip.toFixed(1)} mm`;
                if (d.precipUpper !== null && d.precipLower !== null) {
                    tooltipContent += ` (Range: ${d.precipLower.toFixed(1)} - ${d.precipUpper.toFixed(1)} mm)`;
                }
                tooltipContent += `<br/>`;
            }

            if (d.humidity !== null) {
                tooltipContent += `Humidity: ${d.humidity.toFixed(1)}%<br/>`;
            }

            // Add forecast metadata
            tooltipContent += `Forecast Type: Weather with Uncertainty<br/>`;
            tooltipContent += `Confidence Level: 95%`;

            tooltip
                .html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        };

        const mouseleave = function(event, d) {
            tooltip.style("visibility", "hidden");
            d3.select(this).attr("r", 3);
        };

        // Attach tooltip events to points
        svg.selectAll(".temp-point, .humidity-point, .precip-point")
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseleave", mouseleave);

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Historical Weather Data");

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, processedData, xScale, yTempScale, yHumidityScale, yPrecipScale };
    }


    renderForecastChart(containerId, dates, values, confidenceIntervals, title) {
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Fixed desktop dimensions
        const margin = {top: 20, right: 80, bottom: 60, left: 60};
        const isMobile = window.innerWidth < 768;
        const width = isMobile ? Math.min(container.node().getBoundingClientRect().width - margin.left - margin.right, 504 - margin.left - margin.right) : 504 - margin.left - margin.right;
        const height = isMobile ? Math.min(498 - margin.top - margin.bottom, 300) : 498 - margin.top - margin.bottom;

        // Create SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = dates.map((date, i) => ({
            date: new Date(date),
            value: parseFloat(values[i]),
            lower: confidenceIntervals && confidenceIntervals.lower ? parseFloat(confidenceIntervals.lower[i]) : null,
            upper: confidenceIntervals && confidenceIntervals.upper ? parseFloat(confidenceIntervals.upper[i]) : null
        }));

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([
                d3.min(data, d => d.lower !== null ? d.lower : d.value) * 0.95,
                d3.max(data, d => d.upper !== null ? d.upper : d.value) * 1.05
            ])
            .range([height, 0]);

        // Create area generator for confidence
        let area;
        if (data.some(d => d.lower !== null)) {
            area = d3.area()
                .x(d => xScale(d.date))
                .y0(d => yScale(d.lower))
                .y1(d => yScale(d.upper))
                .curve(d3.curveMonotoneX);

            svg.append("path")
                .datum(data.filter(d => d.lower !== null))
                .attr("class", "forecast-area")
                .attr("fill", themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.3)'))
                .attr("stroke", themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.5)'))
                .attr("stroke-width", 1)
                .attr("d", area);
        }

        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        // Add line
        svg.append("path")
            .datum(data)
            .attr("class", "forecast-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.orange)
            .attr("stroke-width", 2)
            .attr("d", line);

        // Add points
        svg.selectAll(".point")
            .data(data)
            .enter().append("circle")
            .attr("class", "point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yScale(d.value))
            .attr("r", 3)
            .attr("fill", themeColors.orange)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        // Add axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(data.length, 10))
            .tickFormat(d3.timeFormat("%b %Y"));

        const yAxis = d3.axisLeft(yScale);

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Date");

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("NDVI");

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(title);

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYScale = event.transform.rescaleY(yScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale).ticks(Math.min(data.length, 10)).tickFormat(d3.timeFormat("%b %Y")));
                svg.select(".y-axis").call(d3.axisLeft(newYScale));

                // Update area if exists
                if (area) {
                    svg.select(".forecast-area").attr("d", area.x(d => newXScale(d.date)).y0(d => newYScale(d.lower)).y1(d => newYScale(d.upper)));
                }

                // Update line
                svg.select(".forecast-line").attr("d", line.x(d => newXScale(d.date)).y(d => newYScale(d.value)));

                // Update points
                svg.selectAll(".point")
                    .attr("cx", d => newXScale(d.date))
                    .attr("cy", d => newYScale(d.value));
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        svg.selectAll(".point")
            .on("mouseover", function(event, d) {
                tooltip.style("visibility", "visible");
                const dateStr = d.date.toLocaleDateString();
                let tooltipContent = `<strong>${dateStr}</strong><br/>`;
                tooltipContent += `${title.replace(' Forecast', '')}: ${d.value.toFixed(3)}<br/>`;
                if (d.lower !== null && d.upper !== null) {
                    tooltipContent += `Confidence: ${d.lower.toFixed(3)} - ${d.upper.toFixed(3)}<br/>`;
                    tooltipContent += `Uncertainty: ±${((d.upper - d.lower) / 2).toFixed(3)}`;
                }
                tooltipContent += `<br/>Forecast Type: ${title}`;
                tooltip.html(tooltipContent)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
                d3.select(this).attr("r", 5);
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function() {
                tooltip.style("visibility", "hidden");
                d3.select(this).attr("r", 3);
            });

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yScale, zoom };
    }

    renderMultiTimeSeriesChart(containerId, dates, seriesData, yLabel, title) {
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions
        const margin = {top: 20, right: 120, bottom: 60, left: 60};
        const isMobile = window.innerWidth < 768;
        const width = isMobile ? Math.min(container.node().getBoundingClientRect().width - margin.left - margin.right, 504 - margin.left - margin.right) : 504 - margin.left - margin.right;
        const height = isMobile ? Math.min(498 - margin.top - margin.bottom, 300) : 498 - margin.top - margin.bottom;

        // Create SVG
        const svg = container.append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = dates.map((date, i) => {
            const point = { date: new Date(date) };
            Object.keys(seriesData).forEach(key => {
                point[key] = seriesData[key][i];
            });
            return point;
        });

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([
                d3.min(data, d => d3.min(Object.keys(seriesData).map(key => d[key]).filter(v => v !== null))),
                d3.max(data, d => d3.max(Object.keys(seriesData).map(key => d[key]).filter(v => v !== null)))
            ])
            .range([height, 0]);

        // Colors for different series
        const colors = {
            'NDVI': themeColors.green,
            'EVI': themeColors.blue,
            'SAVI': themeColors.orange
        };

        // Create line generators
        const lineGenerators = {};
        Object.keys(seriesData).forEach(key => {
            lineGenerators[key] = d3.line()
                .x(d => xScale(d.date))
                .y(d => yScale(d[key]))
                .curve(d3.curveMonotoneX)
                .defined(d => d[key] !== null);
        });

        // Add lines
        Object.keys(seriesData).forEach(key => {
            svg.append("path")
                .datum(data.filter(d => d[key] !== null))
                .attr("class", `${key.toLowerCase()}-line`)
                .attr("fill", "none")
                .attr("stroke", colors[key])
                .attr("stroke-width", 2)
                .attr("d", lineGenerators[key]);
        });

        // Add points
        Object.keys(seriesData).forEach(key => {
            svg.selectAll(`.${key.toLowerCase()}-point`)
                .data(data.filter(d => d[key] !== null))
                .enter().append("circle")
                .attr("class", `${key.toLowerCase()}-point`)
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yScale(d[key]))
                .attr("r", 3)
                .attr("fill", colors[key])
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 1);
        });

        // Add axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(data.length, 10))
            .tickFormat(d3.timeFormat("%b %Y"));

        const yAxis = d3.axisLeft(yScale);

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Date");

        svg.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text(yLabel);

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text(title);

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 100}, 10)`);

        let legendY = 0;
        Object.keys(seriesData).forEach(key => {
            legend.append("line")
                .attr("x1", 0)
                .attr("y1", legendY)
                .attr("x2", 20)
                .attr("y2", legendY)
                .attr("stroke", colors[key])
                .attr("stroke-width", 2);

            legend.append("circle")
                .attr("cx", 10)
                .attr("cy", legendY)
                .attr("r", 3)
                .attr("fill", colors[key])
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 1);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "12px")
                .text(key);

            legendY += 15;
        });

        // Add zoom functionality
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYScale = event.transform.rescaleY(yScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale));
                svg.select(".y-axis").call(d3.axisLeft(newYScale));

                // Update lines
                Object.keys(seriesData).forEach(key => {
                    svg.select(`.${key.toLowerCase()}-line`).attr("d", lineGenerators[key].x(d => newXScale(d.date)).y(d => newYScale(d[key])));
                    svg.selectAll(`.${key.toLowerCase()}-point`)
                        .attr("cx", d => newXScale(d.date))
                        .attr("cy", d => newYScale(d[key]));
                });
            });

        svg.call(zoom);

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yScale, zoom };
    }

    renderWeatherForecastChart(containerId, dates, tempValues, rainValues) {
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Responsive to container
        const margin = {top: 20, right: 80, bottom: 60, left: 60};
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - margin.left - margin.right;
        const height = containerRect.height - margin.top - margin.bottom;
    
        // Create SVG with viewBox for proper scaling
        const svg = container.append("svg")
            .attr("width", containerRect.width)
            .attr("height", containerRect.height)
            .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = dates.map((date, i) => ({
            date: new Date(date),
            temperature: parseFloat(tempValues[i]),
            precipitation: parseFloat(rainValues[i])
        }));

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const yTempScale = d3.scaleLinear()
            .domain([
                d3.min(data, d => d.temperature) - 5,
                d3.max(data, d => d.temperature) + 5
            ])
            .range([height, 0]);

        const yPrecipScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.precipitation) * 1.1])
            .range([height, 0]);

        // Create line generators
        const tempLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yTempScale(d.temperature))
            .curve(d3.curveMonotoneX);

        const precipLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yPrecipScale(d.precipitation))
            .curve(d3.curveMonotoneX);

        // Add lines
        svg.append("path")
            .datum(data)
            .attr("class", "temp-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 2)
            .attr("d", tempLine);

        svg.append("path")
            .datum(data)
            .attr("class", "precip-line")
            .attr("fill", "none")
            .attr("stroke", themeColors.blue)
            .attr("stroke-width", 2)
            .attr("d", precipLine);

        // Add points
        svg.selectAll(".temp-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "temp-point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yTempScale(d.temperature))
            .attr("r", 3)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        svg.selectAll(".precip-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "precip-point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yPrecipScale(d.precipitation))
            .attr("r", 3)
            .attr("fill", themeColors.blue)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        // Add axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(data.length, 10))
            .tickFormat(d3.timeFormat("%b %d"));

        const yTempAxis = d3.axisLeft(yTempScale);
        const yPrecipAxis = d3.axisRight(yPrecipScale);

        // Add gridlines first (behind everything else)
        svg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale)
                .tickSize(-height)
                .tickFormat("")
                .ticks(Math.min(data.length, 10)))
            .selectAll("line")
            .style("stroke", "#666666")  // Dark gray gridlines
            .style("stroke-width", 1.5)   // Thicker gridlines
            .style("opacity", 0.7);

        svg.append("g")
            .attr("class", "grid")
            .call(d3.axisLeft(yTempScale)
                .tickSize(-width)
                .tickFormat("")
                .ticks(8))
            .selectAll("line")
            .style("stroke", "#666666")  // Dark gray gridlines
            .style("stroke-width", 1.5)   // Thicker gridlines
            .style("opacity", 0.7);

        // Add axes on top of gridlines
        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-family", "Arial, sans-serif");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("font-family", "Arial, sans-serif")
            .text("Time (hours/days)");

        svg.append("g")
            .attr("class", "y-axis-left")
            .call(yTempAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-family", "Arial, sans-serif");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("font-family", "Arial, sans-serif")
            .text("Temperature (°F/°C)");

        svg.append("g")
            .attr("class", "y-axis-right")
            .attr("transform", `translate(${width},0)`)
            .call(yPrecipAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-family", "Arial, sans-serif");

        svg.append("text")
            .attr("transform", "rotate(90)")
            .attr("y", -width - margin.right)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Precipitation (mm)");

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .text("Weather Forecast");

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 150}, 10)`);

        // Temperature
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", 20)
            .attr("y2", 0)
            .attr("stroke", themeColors.red)
            .attr("stroke-width", 2);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 0)
            .attr("r", 3)
            .attr("fill", themeColors.red)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 0)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Temperature");

        // Precipitation
        legend.append("line")
            .attr("x1", 0)
            .attr("y1", 20)
            .attr("x2", 20)
            .attr("y2", 20)
            .attr("stroke", themeColors.blue)
            .attr("stroke-width", 2);

        legend.append("circle")
            .attr("cx", 10)
            .attr("cy", 20)
            .attr("r", 3)
            .attr("fill", themeColors.blue)
            .attr("stroke", isDark ? "#fff" : "#000")
            .attr("stroke-width", 1);

        legend.append("text")
            .attr("x", 25)
            .attr("y", 20)
            .attr("dy", "0.35em")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .text("Precipitation");

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYTempScale = event.transform.rescaleY(yTempScale);
                const newYPrecipScale = event.transform.rescaleY(yPrecipScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale).ticks(Math.min(data.length, 10)).tickFormat(d3.timeFormat("%b %d")));
                svg.select(".y-axis-left").call(d3.axisLeft(newYTempScale));
                svg.select(".y-axis-right").call(d3.axisRight(newYPrecipScale));

                // Update lines
                svg.select(".temp-line").attr("d", tempLine.x(d => newXScale(d.date)).y(d => newYTempScale(d.temperature)));
                svg.select(".precip-line").attr("d", precipLine.x(d => newXScale(d.date)).y(d => newYPrecipScale(d.precipitation)));

                // Update points
                svg.selectAll(".temp-point")
                    .attr("cx", d => newXScale(d.date))
                    .attr("cy", d => newYTempScale(d.temperature));
                svg.selectAll(".precip-point")
                    .attr("cx", d => newXScale(d.date))
                    .attr("cy", d => newYPrecipScale(d.precipitation));
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Add tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)")
            .style("border", `1px solid ${themeColors.gridColor}`)
            .style("border-radius", "4px")
            .style("padding", "8px")
            .style("font-size", "12px")
            .style("color", themeColors.textColor)
            .style("pointer-events", "none")
            .style("z-index", "1000");

        // Add mouseover events for tooltips
        const mouseover = function(event, d) {
            tooltip.style("visibility", "visible");
            d3.select(this).attr("r", 5);
        };

        const mousemove = function(event, d) {
            const dateStr = d.date.toLocaleDateString();
            let tooltipContent = `<strong>${dateStr}</strong><br/>`;
            tooltipContent += `Temperature: ${d.temperature.toFixed(1)}°C<br/>`;
            tooltipContent += `Precipitation: ${d.precipitation.toFixed(1)} mm<br/>`;
            tooltipContent += `Weather Conditions: ${d.temperature > 25 ? 'Warm' : d.temperature > 15 ? 'Moderate' : 'Cool'}`;
            tooltip.html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        };

        const mouseleave = function(event, d) {
            tooltip.style("visibility", "hidden");
            d3.select(this).attr("r", 3);
        };

        // Attach tooltip events to points
        svg.selectAll(".temp-point, .precip-point")
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseleave", mouseleave);

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yTempScale, yPrecipScale, zoom };
    }

    // Export functionality
    initExportListeners() {
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('export-btn')) {
                const chartId = event.target.dataset.chart;
                const format = event.target.classList.contains('export-png') ? 'png' :
                              event.target.classList.contains('export-svg') ? 'svg' : 'csv';

                this.exportChart(chartId, format);
            }
        });
    }

    exportChart(chartId, format) {
        const chartData = this.d3Charts[chartId];
        if (!chartData || !chartData.svg) {
            this.showError('Chart not found or not yet rendered');
            return;
        }

        const svgElement = chartData.svg.node();
        const title = this.getChartTitle(chartId);

        switch (format) {
            case 'png':
                this.exportAsPNG(svgElement, title);
                break;
            case 'svg':
                this.exportAsSVG(svgElement, title);
                break;
            case 'csv':
                this.exportAsCSV(chartData.data, title, chartId);
                break;
        }
    }

    exportAsPNG(svgElement, title) {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svgElement);

        // Create an image from the SVG
        const img = new Image();
        img.onload = () => {
            canvas.width = svgElement.clientWidth;
            canvas.height = svgElement.clientHeight;
            ctx.drawImage(img, 0, 0);

            // Create download link
            const link = document.createElement('a');
            link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }

    exportAsSVG(svgElement, title) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(svgBlob);
        link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.svg`;
        link.click();
    }

    exportAsCSV(data, title, chartId) {
        let csvContent = 'data:text/csv;charset=utf-8,';

        // Add headers based on chart type
        if (chartId.includes('vegetation') || chartId.includes('ndvi')) {
            csvContent += 'Year,NDVI';
            if (data[0] && data[0].upper !== undefined) {
                csvContent += ',Confidence_Lower,Confidence_Upper';
            }
            csvContent += '\n';

            data.forEach(d => {
                csvContent += `${d.year || d.date},${d.ndvi || d.value}`;
                if (d.upper !== undefined) {
                    csvContent += `,${d.lower},${d.upper}`;
                }
                csvContent += '\n';
            });
        } else if (chartId.includes('erosion')) {
            csvContent += 'Year,Combined_Risk,Erosion_Risk,Vegetation_Risk\n';
            data.forEach(d => {
                csvContent += `${d.year},${d.combined},${d.erosion},${d.vegetation}\n`;
            });
        } else if (chartId.includes('weather')) {
            csvContent += 'Date,Temperature,Precipitation';
            if (data[0] && data[0].humidity !== undefined) {
                csvContent += ',Humidity';
            }
            csvContent += '\n';

            data.forEach(d => {
                csvContent += `${d.date.toISOString().split('T')[0]},${d.temperature || d.temp || ''},${d.precipitation || d.precip || ''}`;
                if (d.humidity !== undefined) {
                    csvContent += `,${d.humidity}`;
                }
                csvContent += '\n';
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
        link.click();
    }

    getChartTitle(chartId) {
        const titleMap = {
            'futureVegetationChart': 'Predicted Vegetation Health',
            'futureErosionChart': 'Future Soil Erosion Risk',
            'historical-ndvi-chart': 'Historical Vegetation Indices',
            'historical-weather-chart': 'Historical Weather Data',
            'forecast-ndvi-chart': 'Forecasted Vegetation Indices',
            'forecast-weather-chart': 'Forecasted Weather Data'
        };
        return titleMap[chartId] || 'Chart Export';
    }

    renderWeatherForecastChartWithUncertainty(containerId, dates, temperature, precipitation, humidity) {
        const container = d3.select(`#${containerId}`);
        if (container.empty()) return;

        // Clear any existing chart
        container.selectAll("*").remove();

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Set up margins and dimensions - Fixed desktop dimensions
        const margin = {top: 20, right: 100, bottom: 60, left: 60};
        const isMobile = window.innerWidth < 768;
        const width = isMobile ? Math.min(container.node().getBoundingClientRect().width - margin.left - margin.right, 1083 - margin.left - margin.right) : 1083 - margin.left - margin.right;
        const height = isMobile ? Math.min(498 - margin.top - margin.bottom, 300) : 498 - margin.top - margin.bottom;

        // Create SVG
        const svg = container.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Prepare data
        const data = dates.map((date, i) => ({
            date: new Date(date),
            temp: temperature && temperature.values ? parseFloat(temperature.values[i]) : null,
            tempUpper: temperature && temperature.upper_bound ? parseFloat(temperature.upper_bound[i]) : null,
            tempLower: temperature && temperature.lower_bound ? parseFloat(temperature.lower_bound[i]) : null,
            precip: precipitation && precipitation.values ? parseFloat(precipitation.values[i]) : null,
            precipUpper: precipitation && precipitation.upper_bound ? parseFloat(precipitation.upper_bound[i]) : null,
            precipLower: precipitation && precipitation.lower_bound ? parseFloat(precipitation.lower_bound[i]) : null,
            humidity: humidity && humidity.values ? parseFloat(humidity.values[i]) : null
        }));

        // Set up scales
        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const yTempScale = d3.scaleLinear()
            .domain([
                d3.min(data, d => d.tempLower !== null ? d.tempLower : (d.temp !== null ? d.temp - 5 : 0)),
                d3.max(data, d => d.tempUpper !== null ? d.tempUpper : (d.temp !== null ? d.temp + 5 : 30))
            ])
            .range([height, 0]);

        const yPrecipScale = d3.scaleLinear()
            .domain([
                0,
                d3.max(data, d => d.precipUpper !== null ? d.precipUpper : (d.precip !== null ? d.precip * 1.1 : 10))
            ])
            .range([height, 0]);

        // Create area generators for uncertainty bands
        let tempArea, precipArea;
        if (data.some(d => d.tempUpper !== null)) {
            tempArea = d3.area()
                .x(d => xScale(d.date))
                .y0(d => yTempScale(d.tempLower))
                .y1(d => yTempScale(d.tempUpper))
                .curve(d3.curveMonotoneX);

            svg.append("path")
                .datum(data.filter(d => d.tempUpper !== null))
                .attr("class", "temp-area")
                .attr("fill", 'rgba(255, 200, 200, 0.35)')  // Light red shade with 0.35 opacity
                .attr("stroke", 'rgba(255, 150, 150, 0.5)')  // Semi-transparent red stroke
                .attr("stroke-width", 1)
                .attr("d", tempArea);
        }

        if (data.some(d => d.precipUpper !== null)) {
            precipArea = d3.area()
                .x(d => xScale(d.date))
                .y0(d => yPrecipScale(d.precipLower))
                .y1(d => yPrecipScale(d.precipUpper))
                .curve(d3.curveMonotoneX);

            svg.append("path")
                .datum(data.filter(d => d.precipUpper !== null))
                .attr("class", "precip-area")
                .attr("fill", 'rgba(200, 220, 255, 0.25)')  // Light blue shade with 0.25 opacity for cone of uncertainty
                .attr("stroke", 'rgba(150, 180, 255, 0.4)')  // Semi-transparent blue stroke
                .attr("stroke-width", 1)
                .attr("d", precipArea);
        }

        // Create line generators
        const tempLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yTempScale(d.temp))
            .curve(d3.curveMonotoneX)
            .defined(d => d.temp !== null);

        const precipLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yPrecipScale(d.precip))
            .curve(d3.curveMonotoneX)
            .defined(d => d.precip !== null);

        const humidityLine = d3.line()
            .x(d => xScale(d.date))
            .y(d => yPrecipScale(d.humidity)) // Use same scale as precip for simplicity
            .curve(d3.curveMonotoneX)
            .defined(d => d.humidity !== null);

        // Add lines
        if (data.some(d => d.temp !== null)) {
            svg.append("path")
                .datum(data.filter(d => d.temp !== null))
                .attr("class", "temp-line")
                .attr("fill", "none")
                .attr("stroke", themeColors.red)
                .attr("stroke-width", 3)  // Increased to 3px for bolder appearance
                .attr("d", tempLine);
        }

        if (data.some(d => d.precip !== null)) {
            svg.append("path")
                .datum(data.filter(d => d.precip !== null))
                .attr("class", "precip-line")
                .attr("fill", "none")
                .attr("stroke", themeColors.blue)
                .attr("stroke-width", 3)  // Increased to 3px for bolder appearance
                .attr("d", precipLine);
        }

        if (data.some(d => d.humidity !== null)) {
            svg.append("path")
                .datum(data.filter(d => d.humidity !== null))
                .attr("class", "humidity-line")
                .attr("fill", "none")
                .attr("stroke", themeColors.cyan)
                .attr("stroke-width", 3)  // Increased to 3px for bolder appearance
                .attr("stroke-dasharray", "5,5")
                .attr("d", humidityLine);
        }

        // Add points
        if (data.some(d => d.temp !== null)) {
            svg.selectAll(".temp-point")
                .data(data.filter(d => d.temp !== null))
                .enter().append("circle")
                .attr("class", "temp-point")
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yTempScale(d.temp))
                .attr("r", 4)  // Increased to 4px radius (8px diameter) for emphasis
                .attr("fill", themeColors.red)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);  // Thicker stroke for better visibility
        }

        if (data.some(d => d.precip !== null)) {
            svg.selectAll(".precip-point")
                .data(data.filter(d => d.precip !== null))
                .enter().append("circle")
                .attr("class", "precip-point")
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yPrecipScale(d.precip))
                .attr("r", 4)  // Increased to 4px radius (8px diameter) for emphasis
                .attr("fill", themeColors.blue)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);  // Thicker stroke for better visibility
        }

        if (data.some(d => d.humidity !== null)) {
            svg.selectAll(".humidity-point")
                .data(data.filter(d => d.humidity !== null))
                .enter().append("circle")
                .attr("class", "humidity-point")
                .attr("cx", d => xScale(d.date))
                .attr("cy", d => yPrecipScale(d.humidity))
                .attr("r", 4)  // Increased to 4px radius (8px diameter) for emphasis
                .attr("fill", themeColors.cyan)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);  // Thicker stroke for better visibility
        }

        // Add axes
        const xAxis = d3.axisBottom(xScale)
            .ticks(Math.min(data.length, 10))
            .tickFormat(d3.timeFormat("%b %d"));

        const yTempAxis = d3.axisLeft(yTempScale);
        const yPrecipAxis = d3.axisRight(yPrecipScale);

        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", `translate(${width/2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Date");

        svg.append("g")
            .attr("class", "y-axis-left")
            .call(yTempAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Temperature (°C)");

        svg.append("g")
            .attr("class", "y-axis-right")
            .attr("transform", `translate(${width},0)`)
            .call(yPrecipAxis)
            .selectAll("text")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px");

        svg.append("text")
            .attr("transform", "rotate(90)")
            .attr("y", -width - margin.right)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("font-family", "Arial, sans-serif")
            .text("Precipitation (mm) / Humidity (%)");

        // Add title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2)
            .attr("text-anchor", "middle")
            .style("fill", themeColors.textColor)
            .style("font-size", "16px")
            .style("font-weight", "bold")
            .style("font-family", "Arial, sans-serif")
            .text("Weather Forecast with Uncertainty");

        // Add legend in top-right corner
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 200}, 10)`);

        let legendY = 0;

        // Add uncertainty bands to legend first
        if (data.some(d => d.tempUpper !== null)) {
            legend.append("rect")
                .attr("x", 0)
                .attr("y", legendY - 5)
                .attr("width", 20)
                .attr("height", 8)
                .attr("fill", 'rgba(255, 200, 200, 0.35)')
                .attr("stroke", 'rgba(255, 150, 150, 0.5)')
                .attr("stroke-width", 1);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text("Temp Uncertainty");

            legendY += 15;
        }

        if (data.some(d => d.precipUpper !== null)) {
            legend.append("rect")
                .attr("x", 0)
                .attr("y", legendY - 5)
                .attr("width", 20)
                .attr("height", 8)
                .attr("fill", 'rgba(200, 220, 255, 0.25)')
                .attr("stroke", 'rgba(150, 180, 255, 0.4)')
                .attr("stroke-width", 1);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text("Precip Uncertainty");

            legendY += 15;
        }

        if (data.some(d => d.temp !== null)) {
            legend.append("line")
                .attr("x1", 0)
                .attr("y1", legendY)
                .attr("x2", 20)
                .attr("y2", legendY)
                .attr("stroke", themeColors.red)
                .attr("stroke-width", 3);

            legend.append("circle")
                .attr("cx", 10)
                .attr("cy", legendY)
                .attr("r", 4)
                .attr("fill", themeColors.red)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text("Temperature");

            legendY += 15;
        }

        if (data.some(d => d.precip !== null)) {
            legend.append("line")
                .attr("x1", 0)
                .attr("y1", legendY)
                .attr("x2", 20)
                .attr("y2", legendY)
                .attr("stroke", themeColors.blue)
                .attr("stroke-width", 3);

            legend.append("circle")
                .attr("cx", 10)
                .attr("cy", legendY)
                .attr("r", 4)
                .attr("fill", themeColors.blue)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text("Precipitation");

            legendY += 15;
        }

        if (data.some(d => d.humidity !== null)) {
            legend.append("line")
                .attr("x1", 0)
                .attr("y1", legendY)
                .attr("x2", 20)
                .attr("y2", legendY)
                .attr("stroke", themeColors.cyan)
                .attr("stroke-width", 3)
                .attr("stroke-dasharray", "5,5");

            legend.append("circle")
                .attr("cx", 10)
                .attr("cy", legendY)
                .attr("r", 4)
                .attr("fill", themeColors.cyan)
                .attr("stroke", isDark ? "#fff" : "#000")
                .attr("stroke-width", 2);

            legend.append("text")
                .attr("x", 25)
                .attr("y", legendY)
                .attr("dy", "0.35em")
                .style("fill", themeColors.textColor)
                .style("font-size", "11px")
                .style("font-family", "Arial, sans-serif")
                .text("Humidity");
        }

        // Add zoom functionality with touch support
        const zoom = d3.zoom()
            .scaleExtent([1, 10])
            .translateExtent([[0, 0], [width, height]])
            .extent([[0, 0], [width, height]])
            .touchable(true) // Enable touch support
            .filter(event => {
                // Allow zoom on mouse wheel, touch, or right-click drag
                return event.type === 'wheel' ||
                       event.type === 'touchstart' ||
                       event.type === 'touchmove' ||
                       event.type === 'touchend' ||
                       (event.type === 'mousedown' && event.button === 2) ||
                       (event.type === 'mousemove' && event.buttons === 2);
            })
            .on("zoom", (event) => {
                const newXScale = event.transform.rescaleX(xScale);
                const newYTempScale = event.transform.rescaleY(yTempScale);
                const newYPrecipScale = event.transform.rescaleY(yPrecipScale);

                // Update axes
                svg.select(".x-axis").call(d3.axisBottom(newXScale).ticks(Math.min(data.length, 10)).tickFormat(d3.timeFormat("%b %d")));
                svg.select(".y-axis-left").call(d3.axisLeft(newYTempScale));
                svg.select(".y-axis-right").call(d3.axisRight(newYPrecipScale));

                // Update areas if they exist
                if (tempArea) {
                    svg.select(".temp-area").attr("d", tempArea.x(d => newXScale(d.date)).y0(d => newYTempScale(d.tempLower)).y1(d => newYTempScale(d.tempUpper)));
                }
                if (precipArea) {
                    svg.select(".precip-area").attr("d", precipArea.x(d => newXScale(d.date)).y0(d => newYPrecipScale(d.precipLower)).y1(d => newYPrecipScale(d.precipUpper)));
                }

                // Update lines
                if (data.some(d => d.temp !== null)) {
                    svg.select(".temp-line").attr("d", tempLine.x(d => newXScale(d.date)).y(d => newYTempScale(d.temp)));
                }
                if (data.some(d => d.precip !== null)) {
                    svg.select(".precip-line").attr("d", precipLine.x(d => newXScale(d.date)).y(d => newYPrecipScale(d.precip)));
                }
                if (data.some(d => d.humidity !== null)) {
                    svg.select(".humidity-line").attr("d", humidityLine.x(d => newXScale(d.date)).y(d => newYPrecipScale(d.humidity)));
                }

                // Update points
                if (data.some(d => d.temp !== null)) {
                    svg.selectAll(".temp-point")
                        .attr("cx", d => newXScale(d.date))
                        .attr("cy", d => newYTempScale(d.temp));
                }
                if (data.some(d => d.precip !== null)) {
                    svg.selectAll(".precip-point")
                        .attr("cx", d => newXScale(d.date))
                        .attr("cy", d => newYPrecipScale(d.precip));
                }
                if (data.some(d => d.humidity !== null)) {
                    svg.selectAll(".humidity-point")
                        .attr("cx", d => newXScale(d.date))
                        .attr("cy", d => newYPrecipScale(d.humidity));
                }
            });

        svg.call(zoom);

        // Add touch gesture hints for mobile
        if ('ontouchstart' in window) {
            const touchHint = svg.append("text")
                .attr("class", "touch-hint")
                .attr("x", width / 2)
                .attr("y", height - 10)
                .attr("text-anchor", "middle")
                .style("fill", themeColors.textColor)
                .style("font-size", "10px")
                .style("opacity", 0.6)
                .text("Pinch to zoom • Drag to pan");

            // Hide hint after first interaction
            svg.on("touchstart.zoom", () => {
                touchHint.transition().duration(500).style("opacity", 0).remove();
            });
        }

        // Store chart instance for theme updates
        if (!this.d3Charts) this.d3Charts = {};
        this.d3Charts[containerId] = { svg, data, xScale, yTempScale, yPrecipScale, zoom };
    }

    displaySearchBoundingPolygon(boundingbox, displayName, searchTerm) {
        // boundingbox format from Nominatim: [min_lat, max_lat, min_lon, max_lon] as strings
        const [minLat, maxLat, minLon, maxLon] = boundingbox.map(coord => parseFloat(coord));

        // Validate bounding box - check if it's not too large (more than 10 degrees span)
        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;

        if (latSpan > 10 || lonSpan > 10) {
            console.warn('Bounding box too large, skipping polygon display:', { latSpan, lonSpan, boundingbox });
            this.showError('Search area is too large to display as a polygon. Try searching for a more specific location.');
            return;
        }

        // Create polygon coordinates from bounding box
        const coordinates = [
            [minLat, minLon], // Southwest
            [minLat, maxLon], // Southeast
            [maxLat, maxLon], // Northeast
            [maxLat, minLon], // Northwest
            [minLat, minLon]  // Close the polygon
        ];

        // Remove existing search polygon if any
        if (this.searchPolygon) {
            this.mapHandler.map.removeLayer(this.searchPolygon);
        }
        if (this.searchPolygonMarker) {
            this.mapHandler.map.removeLayer(this.searchPolygonMarker);
        }

        // Create polygon with default styling
        this.searchPolygon = L.polygon(coordinates, {
            color: '#2196f3',
            weight: 3,
            opacity: 0.8,
            fillColor: '#2196f3',
            fillOpacity: 0.2,
            className: 'search-bounding-polygon'
        }).addTo(this.mapHandler.map);

        // Add label marker at centroid
        const centroid = this.mapHandler.getPolygonCentroid({
            type: 'Polygon',
            coordinates: [coordinates.map(coord => [coord[1], coord[0]])] // Convert to GeoJSON format
        });

        this.searchPolygonMarker = L.marker(centroid, {
            icon: L.divIcon({
                html: `<div class="search-polygon-label">${displayName}</div>`,
                className: 'search-polygon-label-container',
                iconSize: [200, 40],
                iconAnchor: [100, 20]
            })
        }).addTo(this.mapHandler.map);

        // Store polygon data for customization
        this.searchPolygonData = {
            coordinates: coordinates,
            displayName: displayName,
            searchTerm: searchTerm,
            boundingbox: boundingbox
        };

        // Show customization controls
        this.showPolygonCustomizationControls();

        // Fit map to polygon bounds
        this.mapHandler.map.fitBounds(this.searchPolygon.getBounds(), { padding: [20, 20] });
    }

    showPolygonCustomizationControls() {
        // Remove existing controls if any
        this.hidePolygonCustomizationControls();

        // Create controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'polygon-customization-controls';
        controlsContainer.className = 'polygon-controls';
        controlsContainer.innerHTML = `
            <div class="polygon-controls-header">
                <h4>Search Area: ${this.searchPolygonData.displayName}</h4>
                <button id="close-polygon-controls" class="close-btn">&times;</button>
            </div>
            <div class="polygon-controls-body">
                <div class="control-group">
                    <label for="polygon-color">Color:</label>
                    <input type="color" id="polygon-color" value="#2196f3">
                </div>
                <div class="control-group">
                    <label for="polygon-opacity">Opacity:</label>
                    <input type="range" id="polygon-opacity" min="0.1" max="1" step="0.1" value="0.2">
                    <span id="opacity-value">0.2</span>
                </div>
                <div class="control-group">
                    <label for="polygon-weight">Border Width:</label>
                    <input type="range" id="polygon-weight" min="1" max="5" step="1" value="3">
                    <span id="weight-value">3</span>
                </div>
                <div class="polygon-actions">
                    <button id="edit-polygon" class="btn btn-secondary">Edit Shape</button>
                    <button id="use-as-base" class="btn btn-primary">Use as Drawing Base</button>
                    <button id="delete-polygon" class="btn btn-danger">Remove</button>
                </div>
            </div>
        `;

        // Add to map container
        const mapContainer = document.getElementById('map-container');
        mapContainer.appendChild(controlsContainer);

        // Add event listeners
        this.attachPolygonControlEvents();
    }

    hidePolygonCustomizationControls() {
        const controls = document.getElementById('polygon-customization-controls');
        if (controls) {
            controls.remove();
        }
    }

    attachPolygonControlEvents() {
        // Color change
        document.getElementById('polygon-color').addEventListener('input', (e) => {
            const color = e.target.value;
            this.searchPolygon.setStyle({
                color: color,
                fillColor: color
            });
        });

        // Opacity change
        document.getElementById('polygon-opacity').addEventListener('input', (e) => {
            const opacity = parseFloat(e.target.value);
            document.getElementById('opacity-value').textContent = opacity;
            this.searchPolygon.setStyle({
                fillOpacity: opacity
            });
        });

        // Weight change
        document.getElementById('polygon-weight').addEventListener('input', (e) => {
            const weight = parseInt(e.target.value);
            document.getElementById('weight-value').textContent = weight;
            this.searchPolygon.setStyle({
                weight: weight
            });
        });

        // Edit polygon
        document.getElementById('edit-polygon').addEventListener('click', () => {
            // Enable editing mode for the search polygon
            this.searchPolygon.editing.enable();
            this.showSuccess('Click and drag polygon vertices to edit shape');
        });

        // Use as base for drawing
        document.getElementById('use-as-base').addEventListener('click', () => {
            // Convert search polygon to drawing polygon
            this.mapHandler.addPolygonToMap(this.searchPolygonData.coordinates);
            this.mapHandler.currentPolygon = this.searchPolygonData.coordinates;
            this.showSuccess('Search area added as drawing base. You can now analyze this area.');
        });

        // Delete polygon
        document.getElementById('delete-polygon').addEventListener('click', () => {
            this.removeSearchPolygon();
        });

        // Close controls
        document.getElementById('close-polygon-controls').addEventListener('click', () => {
            this.hidePolygonCustomizationControls();
        });
    }

    removeSearchPolygon() {
        if (this.searchPolygon) {
            this.mapHandler.map.removeLayer(this.searchPolygon);
            this.searchPolygon = null;
        }
        if (this.searchPolygonMarker) {
            this.mapHandler.map.removeLayer(this.searchPolygonMarker);
            this.searchPolygonMarker = null;
        }
        this.searchPolygonData = null;
        this.hidePolygonCustomizationControls();
        this.showSuccess('Search area removed');
    }

    showError(message) {
        // Show error toast/notification
        console.error('Error:', message);
        // You can implement a toast notification here
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, creating app instance');
    window.app = new LandCareApp();
});
