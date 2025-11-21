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
        // Initialize Chart.js if available
        if (typeof Chart !== 'undefined') {
            this.chartInstances = {};
            console.log('Chart.js initialized');

            // Initialize future charts with realistic mock data after a short delay
            // to ensure DOM elements are fully loaded
            setTimeout(() => {
                this.initFutureVegetationChart();
                this.initFutureErosionChart();
            }, 100);
        } else {
            console.log('Chart.js not available, charts disabled');
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
        if (!this.chartInstances) return;

        const ctx = document.getElementById('futureVegetationChart');
        if (!ctx) {
            console.warn('Future vegetation chart canvas not found');
            return;
        }

        const themeColors = this.getChartThemeColors();

        this.chartInstances['futureVegetationChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Predicted NDVI',
                    data: ndviValues,
                    borderColor: themeColors.green,
                    backgroundColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: themeColors.green,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }, {
                    label: 'Upper Confidence',
                    data: confidenceUpper,
                    borderColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.4)'),
                    backgroundColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: '+1', // Fill to next dataset
                    tension: 0.3,
                    pointRadius: 0
                }, {
                    label: 'Lower Confidence',
                    data: confidenceLower,
                    borderColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.4)'),
                    backgroundColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2, // 2:1 aspect ratio for better mobile display
                plugins: {
                    title: {
                        display: true,
                        text: 'Predicted Vegetation Health (5 Years)',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor,
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        callbacks: {
                            label: function(context) {
                                if (context.datasetIndex === 0) {
                                    return `NDVI: ${context.parsed.y} (${context.label})`;
                                }
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Year',
                            color: themeColors.textColor,
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'NDVI Value',
                            color: themeColors.textColor,
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        min: 0,
                        max: 1
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    renderFutureErosionChart(years, erosionRisk, vegetationRisk, combinedRisk) {
        if (!this.chartInstances) return;

        const ctx = document.getElementById('futureErosionChart');
        if (!ctx) {
            console.warn('Future erosion chart canvas not found');
            return;
        }

        const themeColors = this.getChartThemeColors();

        this.chartInstances['futureErosionChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Combined Risk',
                    data: combinedRisk,
                    borderColor: themeColors.red,
                    backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    borderWidth: 4,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: themeColors.red,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 8,
                    pointHoverRadius: 10
                }, {
                    label: 'Soil Erosion Risk',
                    data: erosionRisk,
                    borderColor: themeColors.orange,
                    backgroundColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: themeColors.orange,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }, {
                    label: 'Vegetation Degradation Risk',
                    data: vegetationRisk,
                    borderColor: themeColors.blue,
                    backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    borderWidth: 3,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: themeColors.blue,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2, // 2:1 aspect ratio for better mobile display
                plugins: {
                    title: {
                        display: true,
                        text: 'Future Soil Erosion Risk (Scenario A)',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    subtitle: {
                        display: true,
                        text: 'Scenario A: Moderate rainfall increase with minimal human intervention',
                        color: themeColors.textColor,
                        font: {
                            size: 12,
                            style: 'italic'
                        },
                        padding: {
                            bottom: 10
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor,
                            usePointStyle: true,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}% (${context.label})`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Year',
                            color: themeColors.textColor,
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Risk Level (%)',
                            color: themeColors.textColor,
                            font: {
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        min: 0,
                        max: 100
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    getChartThemeColors() {
        const root = document.documentElement;
        const isDark = root.getAttribute('data-theme') === 'dark';

        return {
            textColor: getComputedStyle(root).getPropertyValue('--chart-text').trim(),
            gridColor: getComputedStyle(root).getPropertyValue('--chart-grid').trim(),
            backgroundColor: getComputedStyle(root).getPropertyValue('--chart-bg').trim(),
            green: isDark ? '#4caf50' : '#2e7d32',
            blue: isDark ? '#1976d2' : '#1565c0',
            orange: isDark ? '#f57c00' : '#f57c00',
            red: isDark ? '#d32f2f' : '#d32f2f'
        };
    }

    updateChartThemes() {
        // Update existing charts with new theme colors
        // Note: This is a simplified approach. In a full implementation,
        // you'd store chart data and re-render with new colors
        if (this.chartInstances) {
            Object.keys(this.chartInstances).forEach(canvasId => {
                const chart = this.chartInstances[canvasId];
                if (chart) {
                    const themeColors = this.getChartThemeColors();
                    // Update title color
                    if (chart.options.plugins && chart.options.plugins.title) {
                        chart.options.plugins.title.color = themeColors.textColor;
                    }
                    // Update subtitle color for future charts
                    if (chart.options.plugins && chart.options.plugins.subtitle) {
                        chart.options.plugins.subtitle.color = themeColors.textColor;
                    }
                    // Update legend colors
                    if (chart.options.plugins && chart.options.plugins.legend) {
                        chart.options.plugins.legend.labels.color = themeColors.textColor;
                    }
                    // Update scale colors
                    if (chart.options.scales) {
                        Object.keys(chart.options.scales).forEach(scaleKey => {
                            const scale = chart.options.scales[scaleKey];
                            if (scale.title) scale.title.color = themeColors.textColor;
                            if (scale.ticks) scale.ticks.color = themeColors.textColor;
                            if (scale.grid && scale.grid.color !== undefined) {
                                scale.grid.color = themeColors.gridColor;
                            }
                        });
                    }
                    chart.update();
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

        try {
            this.updateStatus(this.currentStatus.connection, 'loading_historical', 'Loading historical vegetation data...');
            const geometry = this.mapHandler.currentPolygonLayer.toGeoJSON().geometry;
            const months = parseInt(document.getElementById('historical-months-select')?.value) || 12; // Get from UI or default to 12

            const response = await fetch('https://landcare-ai-1.onrender.com/historical/vis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    geometry: geometry,
                    months: months
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load historical NDVI');
            }

            this.displayHistoricalNDVI(data);
            this.updateStatus(this.currentStatus.connection, 'idle', 'Historical data loaded');
            this.showSuccess('Historical VIs data loaded successfully!');
        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'Failed to load historical data');
            this.showError(`Historical NDVI error: ${error.message}`);
            console.error('Historical NDVI error:', error);
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
            const days = parseInt(document.getElementById('historical-days-select')?.value) || 5; // Get from UI or default to 5

            const response = await fetch(`https://landcare-ai-1.onrender.com/historical/weather/${centroid[0]}/${centroid[1]}?days=${days}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load historical weather');
            }

            this.displayHistoricalWeather(data);
            this.showSuccess('Historical weather data loaded successfully!');
        } catch (error) {
            this.showError(`Historical weather error: ${error.message}`);
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
            document.getElementById('historical-data-points').textContent = data.metadata.data_points || data.ndvi_values.length;
            document.getElementById('historical-time-range').textContent = `${data.metadata.period_months} months`;
            document.getElementById('historical-trend').textContent = data.metadata.trend || 'N/A';
        }

        // Display statistics if available
        if (data.statistics) {
            console.log('NDVI Statistics:', data.statistics);
        }

        this.renderTimeSeriesChart('historical-ndvi-chart', data.dates, data.ndvi_values, 'VIs', 'Historical VIs');
    }

    displayHistoricalWeather(data) {
        // Switch to historical tab and display data
        this.switchToTab('historical');

        // Update statistics
        if (data.metadata) {
            document.getElementById('historical-data-points').textContent = data.metadata.data_points || (data.data ? data.data.length : 'N/A');
            document.getElementById('historical-time-range').textContent = `${data.metadata.period_days} days`;
            document.getElementById('historical-trend').textContent = data.metadata.precipitation_trend || 'N/A';
        }

        // Display statistics if available
        if (data.statistics) {
            console.log('Weather Statistics:', data.statistics);
        }

        // Handle new data format with daily summaries
        if (data.data && Array.isArray(data.data)) {
            const dates = data.data.map(day => day.date);
            const temperatures = data.data.map(day => day.temperature);
            const humidities = data.data.map(day => day.humidity);
            const precipitations = data.data.map(day => day.precipitation);

            // Display temperature and precipitation
            this.renderDualTimeSeriesChart('historical-weather-chart', dates, temperatures, precipitations, 'Temperature (°C)', 'Precipitation (mm)');
        } else {
            // Fallback to old format
            this.renderDualTimeSeriesChart('historical-weather-chart', data.dates, data.temperature, data.rainfall, 'Temperature (°C)', 'Rainfall (mm)');
        }
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

    renderTimeSeriesChart(canvasId, dates, values, label, title) {
        if (!this.chartInstances) return;

        // Destroy existing chart if it exists
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const themeColors = this.getChartThemeColors();

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: label,
                    data: values,
                    borderColor: themeColors.green,
                    backgroundColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: themeColors.textColor
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: label,
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    }
                }
            }
        });
    }

    renderDualTimeSeriesChart(canvasId, dates, tempValues, rainValues, tempLabel, rainLabel) {
        if (!this.chartInstances) return;

        // Destroy existing chart if it exists
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const themeColors = this.getChartThemeColors();

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: tempLabel,
                    data: tempValues,
                    borderColor: themeColors.red,
                    backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    yAxisID: 'y',
                    tension: 0.1
                }, {
                    label: rainLabel,
                    data: rainValues,
                    borderColor: themeColors.blue,
                    backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    yAxisID: 'y1',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                stacked: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical Weather Data',
                        color: themeColors.textColor
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: tempLabel,
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: rainLabel,
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
    }

    renderForecastChart(canvasId, dates, values, confidenceIntervals, title) {
        if (!this.chartInstances) return;

        // Destroy existing chart if it exists
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const themeColors = this.getChartThemeColors();

        const datasets = [{
            label: 'Forecast',
            data: values,
            borderColor: themeColors.orange,
            backgroundColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.2)'),
            tension: 0.1
        }];

        // Add confidence intervals if available
        if (confidenceIntervals && confidenceIntervals.lower && confidenceIntervals.upper) {
            datasets.push({
                label: 'Confidence Lower',
                data: confidenceIntervals.lower,
                borderColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                backgroundColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                fill: false,
                tension: 0.1,
                pointRadius: 0
            });
            datasets.push({
                label: 'Confidence Upper',
                data: confidenceIntervals.upper,
                borderColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                backgroundColor: themeColors.orange.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                fill: '-1', // Fill to previous dataset
                tension: 0.1,
                pointRadius: 0
            });
        }

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: themeColors.textColor
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'NDVI',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    }
                }
            }
        });
    }

    renderWeatherForecastChart(canvasId, dates, tempValues, rainValues) {
        if (!this.chartInstances) return;

        // Destroy existing chart if it exists
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const themeColors = this.getChartThemeColors();

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Temperature Forecast (°C)',
                    data: tempValues,
                    borderColor: themeColors.red,
                    backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    yAxisID: 'y',
                    tension: 0.1
                }, {
                    label: 'Precipitation Forecast (mm)',
                    data: rainValues,
                    borderColor: themeColors.blue,
                    backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                    yAxisID: 'y1',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                stacked: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast',
                        color: themeColors.textColor
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
    }

    renderWeatherForecastChartWithUncertainty(canvasId, dates, temperature, precipitation, humidity) {
        if (!this.chartInstances) return;

        // Destroy existing chart if it exists
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const themeColors = this.getChartThemeColors();

        const datasets = [];

        // Temperature with uncertainty
        if (temperature && temperature.values) {
            datasets.push({
                label: 'Temperature (°C)',
                data: temperature.values,
                borderColor: themeColors.red,
                backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                yAxisID: 'y',
                tension: 0.1
            });

            // Temperature uncertainty bands
            if (temperature.upper_bound && temperature.lower_bound) {
                datasets.push({
                    label: 'Temp Upper Bound',
                    data: temperature.upper_bound,
                    borderColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                    backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    fill: false,
                    pointRadius: 0,
                    tension: 0.1
                });
                datasets.push({
                    label: 'Temp Lower Bound',
                    data: temperature.lower_bound,
                    borderColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                    backgroundColor: themeColors.red.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    fill: '-1', // Fill to previous dataset
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        }

        // Precipitation with uncertainty
        if (precipitation && precipitation.values) {
            datasets.push({
                label: 'Precipitation (mm)',
                data: precipitation.values,
                borderColor: themeColors.blue,
                backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                yAxisID: 'y1',
                tension: 0.1
            });

            // Precipitation uncertainty bands
            if (precipitation.upper_bound && precipitation.lower_bound) {
                datasets.push({
                    label: 'Precip Upper Bound',
                    data: precipitation.upper_bound,
                    borderColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                    backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    fill: false,
                    pointRadius: 0,
                    tension: 0.1
                });
                datasets.push({
                    label: 'Precip Lower Bound',
                    data: precipitation.lower_bound,
                    borderColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.3)'),
                    backgroundColor: themeColors.blue.replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    fill: false,
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        }

        // Humidity with uncertainty (optional)
        if (humidity && humidity.values) {
            datasets.push({
                label: 'Humidity (%)',
                data: humidity.values,
                borderColor: themeColors.green,
                backgroundColor: themeColors.green.replace('rgb', 'rgba').replace(')', ', 0.2)'),
                yAxisID: 'y2',
                tension: 0.1
            });
        }

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: datasets
            },
            options: {
                responsive: true,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                stacked: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast with Uncertainty',
                        color: themeColors.textColor
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: themeColors.textColor
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    },
                    y2: {
                        type: 'linear',
                        display: false, // Hide humidity axis by default
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Humidity (%)',
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
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
