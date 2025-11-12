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

        this.initTheme();
        this.initEventListeners();
        this.initTabs();
        this.initFutureCharts();
        this.initAuth(); // Initialize auth
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
            const response = await fetch('http://localhost:5000/auth/me', {
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
            const response = await fetch('http://localhost:5000/auth/login', {
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
            const response = await fetch('http://localhost:5000/auth/register', {
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
            const analyzeBtn = document.getElementById('analyze');
            if (analyzeBtn) {
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = 'Analyzing...';
            }
            const geometry = this.mapHandler.currentPolygonLayer.toGeoJSON().geometry;
            const centroid = this.mapHandler.getPolygonCentroid(geometry);

            const response = await fetch('http://localhost:5000/analyze', {
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
            this.showSuccess('Analysis completed successfully!');
        } catch (error) {
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

        // Update risk tag on polygon
        if (results.risk_assessment && results.risk_assessment.risk_level) {
            const riskLevel = results.risk_assessment.risk_level;
            const riskScore = results.risk_assessment.overall_risk_score;
            this.mapHandler.updatePolygonRiskTag(riskLevel, riskScore);

            // Polygon color is now updated in map-handler.js updatePolygonRiskTag method
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

            // Update early warnings if available
            if (results.risk_assessment.recommendations) {
                this.updateEarlyWarnings(results.risk_assessment.recommendations);
            } else {
                // Generate early warnings based on statistics and risk analysis
                this.generateEarlyWarnings(results);
            }
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

        try {
            const response = await fetch('http://localhost:5000/geocode', {
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
            this.showSuccess(`Found: ${data.display_name}`);
        } catch (error) {
            this.showError(`Search error: ${error.message}`);
            console.error('Geocoding error:', error);
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
        // Placeholder for future chart initialization
        // Will be called when forecasting data is available
        console.log('Future charts initialized');
    }

    checkConnectionStatus() {
        // Check backend connectivity
        fetch('http://localhost:5000/health')
            .then(response => response.json())
            .then(data => {
                console.log('Backend health:', data);
                if (data.gee_initialized) {
                    console.log('GEE is initialized');
                }
            })
            .catch(error => {
                console.error('Backend connection error:', error);
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

    updateEarlyWarnings(recommendations) {
        const earlyWarningsEl = document.getElementById('early-warnings-list');
        if (!earlyWarningsEl) return;

        // Clear existing content
        earlyWarningsEl.innerHTML = '';

        if (!recommendations || recommendations.length === 0) {
            const noWarningsDiv = document.createElement('div');
            noWarningsDiv.className = 'no-warnings';
            noWarningsDiv.textContent = 'No early warnings at this time';
            earlyWarningsEl.appendChild(noWarningsDiv);
            return;
        }

        recommendations.forEach(recommendation => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'early-warning-item';

            const warningIcon = document.createElement('span');
            warningIcon.className = 'warning-icon';
            warningIcon.textContent = '⚠️';

            const warningText = document.createElement('span');
            warningText.className = 'warning-text';
            warningText.innerHTML = `<strong>${recommendation}</strong>`;

            warningDiv.appendChild(warningIcon);
            warningDiv.appendChild(warningText);
            earlyWarningsEl.appendChild(warningDiv);
        });
    }

    generateEarlyWarnings(results) {
        const earlyWarningsEl = document.getElementById('early-warnings-list');
        if (!earlyWarningsEl) return;

        // Clear existing content
        earlyWarningsEl.innerHTML = '';

        const warnings = [];

        // Analyze risk factors and generate warnings
        if (results.risk_assessment && results.risk_assessment.risk_factors) {
            const riskFactors = results.risk_assessment.risk_factors;
            const riskLevel = results.risk_assessment.risk_level;

            // High vegetation risk
            if (riskFactors.vegetation_risk > 0.7) {
                warnings.push('High vegetation degradation risk detected. Consider implementing reforestation programs.');
            }

            // High erosion risk
            if (riskFactors.erosion_risk > 0.7) {
                warnings.push('Severe soil erosion risk. Implement soil conservation measures immediately.');
            }

            // High weather risk
            if (riskFactors.weather_risk > 0.7) {
                warnings.push('Extreme weather vulnerability. Prepare for potential flooding or drought conditions.');
            }

            // Land cover issues
            if (results.land_cover && results.land_cover.land_cover_types) {
                const landCoverTypes = results.land_cover.land_cover_types;
                const totalPixels = Object.values(landCoverTypes).reduce((sum, count) => sum + count, 0);

                // Check for high bare land percentage
                const bareLandTypes = ['bare_ground', 'bare_soil', 'urban'];
                let bareLandPixels = 0;
                bareLandTypes.forEach(type => {
                    if (landCoverTypes[type]) bareLandPixels += landCoverTypes[type];
                });

                if (bareLandPixels / totalPixels > 0.5) {
                    warnings.push('High percentage of bare land detected. Increased risk of soil erosion and desertification.');
                }

                // Check for water body presence
                if (landCoverTypes['water'] && landCoverTypes['water'] / totalPixels > 0.3) {
                    warnings.push('Significant water body presence. Monitor for potential flooding risks.');
                }
            }

            // Weather-based warnings
            if (results.weather) {
                const temp = results.weather.main?.temp;
                const humidity = results.weather.main?.humidity;
                const weatherDesc = results.weather.weather_description;

                if (temp > 35) {
                    warnings.push('Extreme heat conditions detected. High risk of vegetation stress and wildfires.');
                }

                if (humidity < 20) {
                    warnings.push('Very low humidity levels. Increased fire risk and soil moisture depletion.');
                }

                if (weatherDesc && weatherDesc.toLowerCase().includes('rain')) {
                    warnings.push('Precipitation detected. Monitor for potential soil erosion and flooding.');
                }
            }

            // Overall risk level warnings
            if (riskLevel === 'High') {
                warnings.push('Critical risk level detected. Immediate intervention required to prevent land degradation.');
            } else if (riskLevel === 'Medium') {
                warnings.push('Moderate risk level. Implement preventive measures to maintain land health.');
            }
        }

        if (warnings.length === 0) {
            const noWarningsDiv = document.createElement('div');
            noWarningsDiv.className = 'no-warnings';
            noWarningsDiv.textContent = 'No early warnings at this time';
            earlyWarningsEl.appendChild(noWarningsDiv);
            return;
        }

        warnings.forEach(warning => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'early-warning-item';

            const warningIcon = document.createElement('span');
            warningIcon.className = 'warning-icon';
            warningIcon.textContent = '⚠️';

            const warningText = document.createElement('span');
            warningText.className = 'warning-text';
            warningText.innerHTML = `<strong>${warning}</strong>`;

            warningDiv.appendChild(warningIcon);
            warningDiv.appendChild(warningText);
            earlyWarningsEl.appendChild(warningDiv);
        });
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
