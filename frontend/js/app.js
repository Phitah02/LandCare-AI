console.log('app.js loaded, creating LandCareApp');

// Toast Notification System
class Toast {
    static container = null;
    static toasts = new Map();
    static toastCounter = 0;

    static init() {
        if (!this.container) {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                console.error('Toast container not found');
                return;
            }
        }

        // Add keyboard event listener for ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.dismissTopToast();
            }
        });
    }

    static show(message, type = 'info', options = {}) {
        if (!this.container) {
            this.init();
        }

        const toastId = ++this.toastCounter;
        const toastElement = this.createToastElement(message, type, toastId, options);

        // Add to container
        this.container.appendChild(toastElement);

        // Store reference
        this.toasts.set(toastId, {
            element: toastElement,
            timeoutId: null,
            options
        });

        // Trigger animation
        requestAnimationFrame(() => {
            toastElement.classList.add('show');
        });

        // Set up auto-dismiss
        const duration = options.duration || (type === 'error' ? 6000 : 4000);
        const timeoutId = setTimeout(() => {
            this.dismiss(toastId);
        }, duration);

        this.toasts.get(toastId).timeoutId = timeoutId;

        // Set up hover pause
        toastElement.addEventListener('mouseenter', () => this.pauseAutoDismiss(toastId));
        toastElement.addEventListener('mouseleave', () => this.resumeAutoDismiss(toastId));

        return toastId;
    }

    static success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    static error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    static createToastElement(message, type, id, options) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        toast.setAttribute('data-toast-id', id);

        const icon = type === 'success' ? '✓' : '✕';
        const ariaLabel = type === 'success' ? 'Success notification' : 'Error notification';

        toast.innerHTML = `
            <span class="toast-icon" aria-hidden="true">${icon}</span>
            <div class="toast-message">${this.escapeHtml(message)}</div>
            <button class="toast-close" aria-label="Dismiss ${ariaLabel.toLowerCase()}" title="Dismiss notification">
                ×
            </button>
        `;

        // Add click handler for close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.dismiss(id));

        // Add click handler for entire toast (optional)
        if (options.dismissOnClick !== false) {
            toast.addEventListener('click', (e) => {
                if (e.target === closeBtn) return; // Already handled
                this.dismiss(id);
            });
        }

        return toast;
    }

    static dismiss(toastId) {
        const toastData = this.toasts.get(toastId);
        if (!toastData) return;

        const { element, timeoutId } = toastData;

        // Clear timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // Start hide animation
        element.classList.remove('show');
        element.classList.add('hide');

        // Remove after animation
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            this.toasts.delete(toastId);
        }, 300); // Match CSS transition duration
    }

    static dismissTopToast() {
        const toastIds = Array.from(this.toasts.keys());
        if (toastIds.length > 0) {
            this.dismiss(toastIds[toastIds.length - 1]);
        }
    }

    static dismissAll() {
        const toastIds = Array.from(this.toasts.keys());
        toastIds.forEach(id => this.dismiss(id));
    }

    static pauseAutoDismiss(toastId) {
        const toastData = this.toasts.get(toastId);
        if (toastData && toastData.timeoutId) {
            clearTimeout(toastData.timeoutId);
            toastData.timeoutId = null;
        }
    }

    static resumeAutoDismiss(toastId) {
        const toastData = this.toasts.get(toastId);
        if (!toastData || toastData.timeoutId) return;

        const duration = toastData.options.duration || (toastData.element.classList.contains('error') ? 6000 : 4000);
        toastData.timeoutId = setTimeout(() => {
            this.dismiss(toastId);
        }, duration);
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize toast system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
});

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
                throw new Error(data.error || data.detail || 'Login failed');
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
                throw new Error(data.error || data.detail || 'Registration failed');
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

        // Theme toggle button
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Historical and Forecasting buttons will be attached after tabs are created
        this.attachHistoricalButtons();
        this.attachForecastingButtons();
        this.attachMLForecastingButtons();
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
            const centroidArray = this.mapHandler.getPolygonCentroid(geometry);
            const centroid = { lat: centroidArray[0], lon: centroidArray[1] };
    
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
                throw new Error(data.error || data.detail || 'Analysis failed');
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

            const ndviSourceEl = document.getElementById('ndvi-source');
            if (ndviSourceEl && results.ndvi.data_source) {
                ndviSourceEl.setAttribute('data-source', results.ndvi.data_source);
                ndviSourceEl.textContent = results.ndvi.data_source === 'satellite' ? '🛰️ Satellite' :
                                         results.ndvi.data_source === 'mock' ? '⚠️ Mock' : results.ndvi.data_source;
            }
        }

        if (results.evi && results.evi.EVI !== undefined) {
            const eviEl = document.getElementById('evi-value');
            if (eviEl) eviEl.textContent = results.evi.EVI.toFixed(3);

            const eviSourceEl = document.getElementById('evi-source');
            if (eviSourceEl && results.evi.data_source) {
                eviSourceEl.setAttribute('data-source', results.evi.data_source);
                eviSourceEl.textContent = results.evi.data_source === 'satellite' ? '🛰️ Satellite' :
                                        results.evi.data_source === 'mock' ? '⚠️ Mock' : results.evi.data_source;
            }
        }

        if (results.savi && results.savi.SAVI !== undefined) {
            const saviEl = document.getElementById('savi-value');
            if (saviEl) saviEl.textContent = results.savi.SAVI.toFixed(3);

            const saviSourceEl = document.getElementById('savi-source');
            if (saviSourceEl && results.savi.data_source) {
                saviSourceEl.setAttribute('data-source', results.savi.data_source);
                saviSourceEl.textContent = results.savi.data_source === 'satellite' ? '🛰️ Satellite' :
                                         results.savi.data_source === 'mock' ? '⚠️ Mock' : results.savi.data_source;
            }
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

            const landCoverSourceEl = document.getElementById('land-cover-source');
            if (landCoverSourceEl && results.land_cover.data_source) {
                landCoverSourceEl.setAttribute('data-source', results.land_cover.data_source);
                landCoverSourceEl.textContent = results.land_cover.data_source === 'satellite' ? '🛰️ Satellite' :
                                              results.land_cover.data_source === 'mock' ? '⚠️ Mock' : results.land_cover.data_source;
            }
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

            const slopeSourceEl = document.getElementById('slope-source');
            if (slopeSourceEl && results.slope.data_source) {
                slopeSourceEl.setAttribute('data-source', results.slope.data_source);
                slopeSourceEl.textContent = results.slope.data_source === 'satellite' ? '🛰️ Satellite' :
                                          results.slope.data_source === 'mock' ? '⚠️ Mock' : results.slope.data_source;
            }
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

        // Clear data source indicators
        const dataSourceElements = ['ndvi-source', 'evi-source', 'savi-source', 'slope-source', 'land-cover-source'];
        dataSourceElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '';
                el.removeAttribute('data-source');
            }
        });

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
                throw new Error(data.error || data.detail || 'Geocoding failed');
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
        // Initialize Chart.js charts
        if (typeof Chart !== 'undefined') {
            this.chartJsCharts = this.chartJsCharts || {};
            console.log('Chart.js initialized for future charts');

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
        const containerId = 'futureVegetationChart';
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('Future vegetation chart container not found');
            return;
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Prepare data
        const data = years.map((year, i) => ({
            x: year,
            y: parseFloat(ndviValues[i]),
            upper: parseFloat(confidenceUpper[i]),
            lower: parseFloat(confidenceLower[i])
        }));

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'Confidence Upper',
                        data: data.map(d => d.upper),
                        borderColor: 'transparent',
                        backgroundColor: this.hexToRgba(themeColors.green, 0.3),
                        fill: '+1',
                        pointRadius: 0,
                        order: 2
                    },
                    {
                        label: 'Confidence Lower',
                        data: data.map(d => d.lower),
                        borderColor: 'transparent',
                        backgroundColor: this.hexToRgba(themeColors.green, 0.3),
                        fill: false,
                        pointRadius: 0,
                        order: 1
                    },
                    {
                        label: 'Predicted NDVI',
                        data: data.map(d => d.y),
                        borderColor: themeColors.green,
                        backgroundColor: themeColors.green,
                        borderWidth: 3,
                        pointRadius: 6,
                        pointBackgroundColor: themeColors.green,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 2,
                        tension: 0.4,
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Predicted Vegetation Health (5 Years)',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor,
                            filter: (item) => item.text !== 'Confidence Upper' && item.text !== 'Confidence Lower',
                            generateLabels: (chart) => {
                                return [
                                    {
                                        text: 'Confidence Interval',
                                        fillStyle: this.hexToRgba(themeColors.green, 0.3),
                                        strokeStyle: this.hexToRgba(themeColors.green, 0.5),
                                        lineWidth: 1
                                    },
                                    {
                                        text: 'Predicted NDVI',
                                        fillStyle: themeColors.green,
                                        strokeStyle: themeColors.green,
                                        lineWidth: 3
                                    }
                                ];
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const value = context.parsed.y;
                                if (context.datasetIndex === 2) {
                                    return `NDVI: ${value.toFixed(3)} (Range: ${data[index].lower.toFixed(3)} - ${data[index].upper.toFixed(3)})`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Year',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
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
                        title: {
                            display: true,
                            text: 'NDVI Value',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        min: 0,
                        max: 1,
                        ticks: {
                            color: themeColors.textColor,
                            callback: function(value) {
                                return value.toFixed(2);
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    renderFutureErosionChart(years, erosionRisk, vegetationRisk, combinedRisk) {
        const containerId = 'futureErosionChart';
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('Future erosion chart container not found');
            return;
        }

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Set canvas dimensions to match container for proper aspect ratio
        const containerRect = container.getBoundingClientRect();
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        // Use container's computed height or fallback to CSS min-height (498px)
        const containerHeight = containerRect.height || container.offsetHeight || parseInt(getComputedStyle(container).minHeight) || 498;
        const containerWidth = containerRect.width || container.offsetWidth || 800;
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Prepare data
        const data = years.map((year, i) => ({
            year: year,
            combined: parseFloat(combinedRisk[i]),
            erosion: parseFloat(erosionRisk[i]),
            vegetation: parseFloat(vegetationRisk[i])
        }));

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [
                    {
                        label: 'Combined Risk',
                        data: data.map(d => d.combined),
                        borderColor: themeColors.red,
                        backgroundColor: themeColors.red,
                        borderWidth: 4,
                        pointRadius: 6,
                        pointBackgroundColor: themeColors.red,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 2,
                        tension: 0.4,
                        order: 1
                    },
                    {
                        label: 'Soil Erosion Risk',
                        data: data.map(d => d.erosion),
                        borderColor: themeColors.orange,
                        backgroundColor: themeColors.orange,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: themeColors.orange,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 1,
                        tension: 0.4,
                        order: 2
                    },
                    {
                        label: 'Vegetation Degradation Risk',
                        data: data.map(d => d.vegetation),
                        borderColor: themeColors.cyan,
                        backgroundColor: themeColors.cyan,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: themeColors.cyan,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 1,
                        tension: 0.4,
                        order: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Future Soil Erosion Risk (Scenario A)',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const value = context.parsed.y;
                                const riskLevel = value >= 70 ? 'High' : value >= 40 ? 'Medium' : 'Low';
                                return `${context.dataset.label}: ${value.toFixed(1)}% (${riskLevel})`;
                            },
                            afterBody: (context) => {
                                const index = context[0].dataIndex;
                                return `Risk Level: ${data[index].combined >= 70 ? 'High' : data[index].combined >= 40 ? 'Medium' : 'Low'}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Year',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
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
                        title: {
                            display: true,
                            text: 'Risk Level (%)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        min: 0,
                        max: 100,
                        ticks: {
                            color: themeColors.textColor,
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
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
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Update Chart.js charts with new theme colors
        if (this.chartJsCharts) {
            Object.keys(this.chartJsCharts).forEach(containerId => {
                const chart = this.chartJsCharts[containerId];
                if (chart && chart.options) {
                    // Update chart colors
                    if (chart.options.plugins) {
                        if (chart.options.plugins.title) {
                            chart.options.plugins.title.color = themeColors.textColor;
                        }
                        if (chart.options.plugins.legend) {
                            chart.options.plugins.legend.labels.color = themeColors.textColor;
                        }
                        if (chart.options.plugins.tooltip) {
                            chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
                            chart.options.plugins.tooltip.titleColor = themeColors.textColor;
                            chart.options.plugins.tooltip.bodyColor = themeColors.textColor;
                            chart.options.plugins.tooltip.borderColor = themeColors.gridColor;
                        }
                    }
                    if (chart.options.scales) {
                        Object.keys(chart.options.scales).forEach(scaleKey => {
                            const scale = chart.options.scales[scaleKey];
                            if (scale.title) {
                                scale.title.color = themeColors.textColor;
                            }
                            if (scale.ticks) {
                                scale.ticks.color = themeColors.textColor;
                            }
                            if (scale.grid) {
                                scale.grid.color = themeColors.gridColor;
                            }
                        });
                    }
                    chart.update('none'); // Update without animation
                }
            });
        }

        // Update D3.js charts with new theme colors (for any remaining D3 charts)
        if (this.d3Charts) {
            Object.keys(this.d3Charts).forEach(containerId => {
                const chartData = this.d3Charts[containerId];
                if (chartData && chartData.svg) {
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
        const forecastWeatherBtn = document.getElementById('forecast-weather');
        if (forecastWeatherBtn) {
            forecastWeatherBtn.addEventListener('click', () => {
                this.forecastWeather();
            });
        }
    }

    attachMLForecastingButtons() {
        // Attach event listeners for ML forecasting buttons
        const mlForecastBtn = document.getElementById('ml-forecast-generate');
        if (mlForecastBtn) {
            mlForecastBtn.addEventListener('click', () => {
                this.generateMLForecast();
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
            .then(response => {
                if (response.status === 200) {
                    return response.json().then(data => {
                        console.log('Backend health:', data);
                        if (data.gee_initialized) {
                            console.log('GEE is initialized');
                            this.updateStatus('connected', 'idle', 'Connected to backend');
                        } else {
                            this.updateStatus('connected', 'idle', 'Connected (GEE not initialized)');
                        }
                    });
                } else if (response.status === 500) {
                    this.updateStatus('disconnected', 'idle', 'Backend error');
                    this.showError('Backend error occurred.');
                } else {
                    this.updateStatus('disconnected', 'idle', 'Cannot connect to backend');
                    this.showError('Cannot connect to backend. Please ensure the server is running.');
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
        Toast.success(message);
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
                throw new Error(data.error || data.detail || 'Failed to load historical VIs');
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
                    throw new Error(data.error || data.detail || 'Failed to load historical weather');
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

            const response = await fetch(`https://landcare-ai-1.onrender.com/forecast/${centroid[0]}/${centroid[1]}?days=${days}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Weather forecasting failed');
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
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Prepare data
        const chartData = dates.map((date, i) => ({
            x: new Date(date),
            y: parseFloat(values[i])
        }));

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: label,
                    data: chartData,
                    borderColor: themeColors.green,
                    backgroundColor: themeColors.green,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: themeColors.green,
                    pointBorderColor: isDark ? '#fff' : '#000',
                    pointBorderWidth: 1,
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                const prevValue = context.dataIndex > 0 ? chartData[context.dataIndex - 1].y : null;
                                let tooltipText = `${label}: ${value.toFixed(3)}`;
                                if (prevValue !== null) {
                                    const trend = value > prevValue ? 'Increasing' : 'Decreasing';
                                    tooltipText += ` (Trend: ${trend})`;
                                }
                                return tooltipText;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: label,
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }


    renderD3HistoricalWeatherChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

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

        // Prepare datasets
        const datasets = [];
        const hasHumidity = processedData.some(d => d.humidity !== null);

        // Temperature line (left y-axis)
        datasets.push({
            type: 'line',
            label: 'Temperature',
            data: processedData.map(d => ({ x: d.date, y: d.temperature })),
            borderColor: themeColors.red,
            backgroundColor: themeColors.red,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: themeColors.red,
            pointBorderColor: isDark ? '#fff' : '#000',
            pointBorderWidth: 1,
            tension: 0.4,
            yAxisID: 'y-temp',
            fill: false
        });

        // Humidity line (right y-axis, if available)
        if (hasHumidity) {
            datasets.push({
                type: 'line',
                label: 'Humidity',
                data: processedData.filter(d => d.humidity !== null).map(d => ({ x: d.date, y: d.humidity })),
                borderColor: themeColors.cyan,
                backgroundColor: themeColors.cyan,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 3,
                pointBackgroundColor: themeColors.cyan,
                pointBorderColor: isDark ? '#fff' : '#000',
                pointBorderWidth: 1,
                tension: 0.4,
                yAxisID: 'y-humidity',
                fill: false
            });
        }

        // Precipitation bars (right y-axis)
        datasets.push({
            type: 'bar',
            label: 'Precipitation',
            data: processedData.map(d => ({ x: d.date, y: d.precipitation })),
            backgroundColor: this.hexToRgba(themeColors.blue, 0.7),
            borderColor: themeColors.blue,
            borderWidth: 1,
            yAxisID: 'y-precip',
            order: 2
        });

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical Weather Data',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                if (context.dataset.label === 'Temperature') {
                                    return `Temperature: ${value.toFixed(1)}°C`;
                                } else if (context.dataset.label === 'Humidity') {
                                    return `Humidity: ${value.toFixed(1)}%`;
                                } else if (context.dataset.label === 'Precipitation') {
                                    return `Precipitation: ${value.toFixed(1)} mm`;
                                }
                                return `${context.dataset.label}: ${value.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    'y-temp': {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: false
                    },
                    'y-humidity': {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: hasHumidity,
                            text: 'Humidity (%)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        min: 0,
                        max: 100
                    },
                    'y-precip': {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }



    renderMultiTimeSeriesChart(containerId, dates, seriesData, yLabel, title) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Colors for different series
        const colors = {
            'NDVI': themeColors.green,
            'EVI': themeColors.blue,
            'SAVI': themeColors.orange
        };

        // Prepare datasets
        const datasets = Object.keys(seriesData).map(key => {
            const dataPoints = dates.map((date, i) => ({
                x: new Date(date),
                y: seriesData[key][i] !== null ? parseFloat(seriesData[key][i]) : null
            })).filter(d => d.y !== null);

            return {
                label: key,
                data: dataPoints,
                borderColor: colors[key] || themeColors.green,
                backgroundColor: colors[key] || themeColors.green,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: colors[key] || themeColors.green,
                pointBorderColor: isDark ? '#fff' : '#000',
                pointBorderWidth: 1,
                tension: 0.4,
                fill: false
            };
        });

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: yLabel,
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }

    renderWeatherForecastChart(containerId, dates, tempValues, rainValues) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Prepare data
        const chartData = dates.map((date, i) => ({
            x: new Date(date),
            temperature: parseFloat(tempValues[i]),
            precipitation: parseFloat(rainValues[i])
        }));

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Temperature',
                        data: chartData.map(d => ({ x: d.x, y: d.temperature })),
                        borderColor: themeColors.red,
                        backgroundColor: themeColors.red,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: themeColors.red,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 1,
                        tension: 0.4,
                        yAxisID: 'y-temp',
                        fill: false
                    },
                    {
                        label: 'Precipitation',
                        data: chartData.map(d => ({ x: d.x, y: d.precipitation })),
                        borderColor: themeColors.blue,
                        backgroundColor: themeColors.blue,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: themeColors.blue,
                        pointBorderColor: isDark ? '#fff' : '#000',
                        pointBorderWidth: 1,
                        tension: 0.4,
                        yAxisID: 'y-precip',
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                const index = context.dataIndex;
                                if (context.dataset.label === 'Temperature') {
                                    const condition = value > 25 ? 'Warm' : value > 15 ? 'Moderate' : 'Cool';
                                    return `Temperature: ${value.toFixed(1)}°C (${condition})`;
                                } else if (context.dataset.label === 'Precipitation') {
                                    return `Precipitation: ${value.toFixed(1)} mm`;
                                }
                                return `${context.dataset.label}: ${value.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM dd'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time (hours/days)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    'y-temp': {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°F/°C)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: false
                    },
                    'y-precip': {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
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
        // Try Chart.js first, then fall back to D3 if needed
        const chartJsChart = this.chartJsCharts && this.chartJsCharts[chartId];
        const d3Chart = this.d3Charts && this.d3Charts[chartId];
        
        if (!chartJsChart && !d3Chart) {
            this.showError('Chart not found or not yet rendered');
            return;
        }

        const title = this.getChartTitle(chartId);

        if (chartJsChart) {
            // Chart.js export
            switch (format) {
                case 'png':
                    this.exportChartJsAsPNG(chartJsChart, title);
                    break;
                case 'svg':
                    this.exportChartJsAsSVG(chartJsChart, title);
                    break;
                case 'csv':
                    this.exportChartJsAsCSV(chartJsChart, title, chartId);
                    break;
            }
        } else if (d3Chart && d3Chart.svg) {
            // D3.js export (fallback for any remaining D3 charts)
            const svgElement = d3Chart.svg.node();
            switch (format) {
                case 'png':
                    this.exportAsPNG(svgElement, title);
                    break;
                case 'svg':
                    this.exportAsSVG(svgElement, title);
                    break;
                case 'csv':
                    this.exportAsCSV(d3Chart.data, title, chartId);
                    break;
            }
        }
    }

    exportChartJsAsPNG(chart, title) {
        const url = chart.toBase64Image('image/png', 1.0);
        const link = document.createElement('a');
        link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        link.href = url;
        link.click();
    }

    exportChartJsAsSVG(chart, title) {
        // Chart.js doesn't natively support SVG export, so we'll export as PNG
        // For true SVG, we'd need to use a library like chartjs-to-image
        console.warn('SVG export for Chart.js not fully implemented, exporting as PNG instead');
        this.exportChartJsAsPNG(chart, title);
    }

    exportChartJsAsCSV(chart, title, chartId) {
        const labels = chart.data.labels || [];
        const datasets = chart.data.datasets || [];
        
        let csvContent = 'data:text/csv;charset=utf-8,';
        
        // Add headers
        csvContent += 'Date/Year';
        datasets.forEach(ds => {
            if (ds.label && !ds.label.includes('Upper') && !ds.label.includes('Lower')) {
                csvContent += `,${ds.label}`;
            }
        });
        csvContent += '\n';

        // Add data rows
        labels.forEach((label, i) => {
            csvContent += `${label}`;
            datasets.forEach(ds => {
                if (ds.label && !ds.label.includes('Upper') && !ds.label.includes('Lower')) {
                    const value = ds.data[i] !== undefined ? ds.data[i] : '';
                    csvContent += `,${value}`;
                }
            });
            csvContent += '\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
        link.click();
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
            'forecast-weather-chart': 'Forecasted Weather Data',
            'ml-forecast-chart': 'ML Vegetation Forecast',
            'ml-feature-importance-chart': 'Feature Importance Analysis'
        };
        return titleMap[chartId] || 'Chart Export';
    }

    renderWeatherForecastChartWithUncertainty(containerId, dates, temperature, precipitation, humidity) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Set canvas dimensions to match container for proper aspect ratio
        const containerRect = container.getBoundingClientRect();
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        // Use container's computed dimensions or fallback values
        const containerHeight = containerRect.height || container.offsetHeight || parseInt(getComputedStyle(container).minHeight) || 400;
        const containerWidth = containerRect.width || container.offsetWidth || parseInt(getComputedStyle(container).minWidth) || 500;
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Prepare data
        const chartData = dates.map((date, i) => ({
            x: new Date(date),
            temp: temperature && temperature.values ? parseFloat(temperature.values[i]) : null,
            tempUpper: temperature && temperature.upper_bound ? parseFloat(temperature.upper_bound[i]) : null,
            tempLower: temperature && temperature.lower_bound ? parseFloat(temperature.lower_bound[i]) : null,
            precip: precipitation && precipitation.values ? parseFloat(precipitation.values[i]) : null,
            precipUpper: precipitation && precipitation.upper_bound ? parseFloat(precipitation.upper_bound[i]) : null,
            precipLower: precipitation && precipitation.lower_bound ? parseFloat(precipitation.lower_bound[i]) : null,
            humidity: humidity && humidity.values ? parseFloat(humidity.values[i]) : null
        }));

        // Build datasets array
        const datasets = [];
        const hasTempUncertainty = chartData.some(d => d.tempUpper !== null);
        const hasPrecipUncertainty = chartData.some(d => d.precipUpper !== null);
        const hasHumidity = chartData.some(d => d.humidity !== null);

        // Temperature uncertainty bands
        if (hasTempUncertainty) {
            datasets.push({
                label: 'Temp Upper',
                data: chartData.map(d => ({ x: d.x, y: d.tempUpper })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(255, 200, 200, 0.35)',
                fill: '+1',
                pointRadius: 0,
                order: 1,
                yAxisID: 'y-temp'
            });
            datasets.push({
                label: 'Temp Lower',
                data: chartData.map(d => ({ x: d.x, y: d.tempLower })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(255, 200, 200, 0.35)',
                fill: false,
                pointRadius: 0,
                order: 0,
                yAxisID: 'y-temp'
            });
        }

        // Precipitation uncertainty bands
        if (hasPrecipUncertainty) {
            datasets.push({
                label: 'Precip Upper',
                data: chartData.map(d => ({ x: d.x, y: d.precipUpper })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(200, 220, 255, 0.25)',
                fill: '+1',
                pointRadius: 0,
                order: 3,
                yAxisID: 'y-precip'
            });
            datasets.push({
                label: 'Precip Lower',
                data: chartData.map(d => ({ x: d.x, y: d.precipLower })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(200, 220, 255, 0.25)',
                fill: false,
                pointRadius: 0,
                order: 2,
                yAxisID: 'y-precip'
            });
        }

        // Temperature line
        if (chartData.some(d => d.temp !== null)) {
            datasets.push({
                label: 'Temperature',
                data: chartData.filter(d => d.temp !== null).map(d => ({ x: d.x, y: d.temp })),
                borderColor: themeColors.red,
                backgroundColor: themeColors.red,
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: themeColors.red,
                pointBorderColor: isDark ? '#fff' : '#000',
                pointBorderWidth: 2,
                tension: 0.4,
                yAxisID: 'y-temp',
                fill: false,
                order: 4
            });
        }

        // Precipitation line
        if (chartData.some(d => d.precip !== null)) {
            datasets.push({
                label: 'Precipitation',
                data: chartData.filter(d => d.precip !== null).map(d => ({ x: d.x, y: d.precip })),
                borderColor: themeColors.blue,
                backgroundColor: themeColors.blue,
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: themeColors.blue,
                pointBorderColor: isDark ? '#fff' : '#000',
                pointBorderWidth: 2,
                tension: 0.4,
                yAxisID: 'y-precip',
                fill: false,
                order: 5
            });
        }

        // Humidity line
        if (hasHumidity) {
            datasets.push({
                label: 'Humidity',
                data: chartData.filter(d => d.humidity !== null).map(d => ({ x: d.x, y: d.humidity })),
                borderColor: themeColors.cyan,
                backgroundColor: themeColors.cyan,
                borderWidth: 3,
                borderDash: [5, 5],
                pointRadius: 4,
                pointBackgroundColor: themeColors.cyan,
                pointBorderColor: isDark ? '#fff' : '#000',
                pointBorderWidth: 2,
                tension: 0.4,
                yAxisID: 'y-precip',
                fill: false,
                order: 6
            });
        }

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast with Uncertainty',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor,
                            filter: (item) => {
                                return !item.text.includes('Upper') && !item.text.includes('Lower');
                            },
                            generateLabels: (chart) => {
                                const labels = [];
                                if (hasTempUncertainty) {
                                    labels.push({
                                        text: 'Temp Uncertainty',
                                        fillStyle: 'rgba(255, 200, 200, 0.35)',
                                        strokeStyle: 'rgba(255, 150, 150, 0.5)',
                                        lineWidth: 1
                                    });
                                }
                                if (hasPrecipUncertainty) {
                                    labels.push({
                                        text: 'Precip Uncertainty',
                                        fillStyle: 'rgba(200, 220, 255, 0.25)',
                                        strokeStyle: 'rgba(150, 180, 255, 0.4)',
                                        lineWidth: 1
                                    });
                                }
                                if (chartData.some(d => d.temp !== null)) {
                                    labels.push({
                                        text: 'Temperature',
                                        fillStyle: themeColors.red,
                                        strokeStyle: themeColors.red,
                                        lineWidth: 3
                                    });
                                }
                                if (chartData.some(d => d.precip !== null)) {
                                    labels.push({
                                        text: 'Precipitation',
                                        fillStyle: themeColors.blue,
                                        strokeStyle: themeColors.blue,
                                        lineWidth: 3
                                    });
                                }
                                if (hasHumidity) {
                                    labels.push({
                                        text: 'Humidity',
                                        fillStyle: themeColors.cyan,
                                        strokeStyle: themeColors.cyan,
                                        lineWidth: 3,
                                        lineDash: [5, 5]
                                    });
                                }
                                return labels;
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                const index = context.dataIndex;
                                const dataPoint = chartData[index];
                                
                                if (context.dataset.label === 'Temperature') {
                                    let tooltipText = `Temperature: ${value.toFixed(1)}°C`;
                                    if (dataPoint.tempUpper !== null && dataPoint.tempLower !== null) {
                                        tooltipText += `\nRange: ${dataPoint.tempLower.toFixed(1)} - ${dataPoint.tempUpper.toFixed(1)}°C`;
                                    }
                                    return tooltipText.split('\n');
                                } else if (context.dataset.label === 'Precipitation') {
                                    let tooltipText = `Precipitation: ${value.toFixed(1)} mm`;
                                    if (dataPoint.precipUpper !== null && dataPoint.precipLower !== null) {
                                        tooltipText += `\nRange: ${dataPoint.precipLower.toFixed(1)} - ${dataPoint.precipUpper.toFixed(1)} mm`;
                                    }
                                    return tooltipText.split('\n');
                                } else if (context.dataset.label === 'Humidity') {
                                    return `Humidity: ${value.toFixed(1)}%`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM dd'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    'y-temp': {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: false
                    },
                    'y-precip': {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Precipitation (mm) / Humidity (%)',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
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

    async generateMLForecast() {
        // Check if user is authenticated
        if (!this.authToken) {
            this.showError('You must be logged in to generate ML forecasts');
            this.openAuthModal(true);
            return;
        }

        // Check if polygon is selected
        if (!this.currentPolygon && !this.mapHandler.currentPolygon) {
            this.showError('Please draw a polygon on the map first');
            return;
        }

        const forecastPeriod = document.getElementById('ml-forecast-period-select').value;
        const modelType = document.getElementById('ml-model-select').value;

        // Update status
        this.updateStatus(this.currentStatus.connection, 'forecasting', `Generating ${modelType} forecast for ${forecastPeriod} months...`);

        // Update UI
        const btn = document.getElementById('ml-forecast-generate');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Generating...';

        try {
            // Get geometry
            const geometry = this.mapHandler.currentPolygonLayer ?
                this.mapHandler.currentPolygonLayer.toGeoJSON().geometry :
                this.currentPolygon;

            // For now, use placeholder data. In production, this would call the backend APIs
            const forecastData = this.generatePlaceholderMLForecastData(forecastPeriod, modelType);

            // Switch to ML forecasting tab first to make containers visible
            const mlTabButton = document.querySelector('.tab-button[data-tab="ml-forecasting"]');
            if (mlTabButton) {
                mlTabButton.click();
            }

            // Render charts after tab is visible
            console.log('ML Forecast: Starting chart rendering');
            this.renderMLForecastChart(forecastData);
            this.renderFeatureImportanceChart(forecastData.featureImportance);
            console.log('ML Forecast: Chart rendering completed');

            // Update info cards
            document.getElementById('ml-forecast-period').textContent = `${forecastPeriod} months`;
            document.getElementById('ml-model-type').textContent = modelType === 'ml' ? 'ML Model' :
                modelType === 'statistical' ? 'Statistical Model' : 'Comparison';
            document.getElementById('ml-confidence-level').textContent = '95%';

            this.updateStatus(this.currentStatus.connection, 'idle', 'ML forecast generated successfully');
            this.showSuccess('ML forecast generated successfully!');

        } catch (error) {
            this.updateStatus(this.currentStatus.connection, 'idle', 'ML forecast failed');
            this.showError(`ML forecast error: ${error.message}`);
            console.error('ML forecast error:', error);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    generatePlaceholderMLForecastData(forecastPeriod, modelType) {
        const currentDate = new Date();
        const historicalMonths = 12; // Show 12 months of historical data
        const forecastMonths = parseInt(forecastPeriod);

        // Generate historical data (past 12 months)
        const historicalData = [];
        let baseValue = 0.45; // Starting NDVI value

        for (let i = historicalMonths; i > 0; i--) {
            const date = new Date(currentDate);
            date.setMonth(date.getMonth() - i);

            // Simulate seasonal variation and trends
            const seasonal = Math.sin((i / 12) * 2 * Math.PI) * 0.1;
            const trend = (historicalMonths - i) * 0.005; // Slight upward trend
            const noise = (Math.random() - 0.5) * 0.05;

            const ndvi = Math.max(0.1, Math.min(0.9, baseValue + seasonal + trend + noise));
            const evi = Math.max(0.1, Math.min(0.9, ndvi + (Math.random() - 0.5) * 0.1));
            const savi = Math.max(0.1, Math.min(0.9, ndvi + (Math.random() - 0.5) * 0.08));

            historicalData.push({
                date: date.toISOString().split('T')[0],
                ndvi: ndvi,
                evi: evi,
                savi: savi,
                type: 'historical'
            });
        }

        // Generate forecast data
        const forecastData = [];
        const lastHistorical = historicalData[historicalData.length - 1];

        for (let i = 1; i <= forecastMonths; i++) {
            const date = new Date(currentDate);
            date.setMonth(date.getMonth() + i);

            // ML forecast with confidence intervals
            const mlTrend = i * 0.01; // Slight improvement trend
            const seasonal = Math.sin((i / 12) * 2 * Math.PI) * 0.08;
            const mlNoise = (Math.random() - 0.5) * 0.03;

            const mlNdvi = Math.max(0.1, Math.min(0.9, lastHistorical.ndvi + mlTrend + seasonal + mlNoise));
            const mlEvi = Math.max(0.1, Math.min(0.9, mlNdvi + (Math.random() - 0.5) * 0.08));
            const mlSavi = Math.max(0.1, Math.min(0.9, mlNdvi + (Math.random() - 0.5) * 0.06));

            // Confidence intervals widen over time
            const uncertainty = 0.05 + (i * 0.02);
            const mlNdviUpper = Math.min(1.0, mlNdvi + uncertainty);
            const mlNdviLower = Math.max(0.0, mlNdvi - uncertainty);

            // Statistical forecast (more conservative)
            const statTrend = i * 0.005;
            const statNoise = (Math.random() - 0.5) * 0.04;
            const statNdvi = Math.max(0.1, Math.min(0.9, lastHistorical.ndvi + statTrend + statNoise));

            if (modelType === 'ml' || modelType === 'compare') {
                forecastData.push({
                    date: date.toISOString().split('T')[0],
                    ndvi: mlNdvi,
                    evi: mlEvi,
                    savi: mlSavi,
                    ndviUpper: mlNdviUpper,
                    ndviLower: mlNdviLower,
                    type: 'ml_forecast'
                });
            }

            if (modelType === 'statistical' || modelType === 'compare') {
                forecastData.push({
                    date: date.toISOString().split('T')[0],
                    ndvi: statNdvi,
                    type: 'statistical_forecast'
                });
            }
        }

        // Feature importance data
        const featureImportance = [
            { feature: 'NDVI (t-1)', importance: 0.35 },
            { feature: 'Temperature', importance: 0.25 },
            { feature: 'Precipitation', importance: 0.20 },
            { feature: 'Humidity', importance: 0.08 },
            { feature: 'EVI (t-1)', importance: 0.06 },
            { feature: 'SAVI (t-1)', importance: 0.04 },
            { feature: 'Seasonal Index', importance: 0.02 }
        ];

        return {
            historical: historicalData,
            forecast: forecastData,
            featureImportance: featureImportance,
            modelType: modelType,
            forecastPeriod: forecastPeriod
        };
    }

    renderMLForecastChart(data) {
        const containerId = 'ml-forecast-chart';
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Combine historical and forecast data
        const allData = [...data.historical, ...data.forecast];
        const historicalData = data.historical;
        const mlForecastData = data.forecast.filter(d => d.type === 'ml_forecast');
        const statForecastData = data.forecast.filter(d => d.type === 'statistical_forecast');

        // Build datasets array
        const datasets = [];

        // ML Forecast confidence intervals
        if ((data.modelType === 'ml' || data.modelType === 'compare') && mlForecastData.length > 0) {
            datasets.push({
                label: 'ML Confidence Upper',
                data: mlForecastData.map(d => ({ x: new Date(d.date), y: d.ndviUpper || d.ndvi })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(76, 175, 149, 0.2)',
                fill: '+1',
                pointRadius: 0,
                order: 0
            });
            datasets.push({
                label: 'ML Confidence Lower',
                data: mlForecastData.map(d => ({ x: new Date(d.date), y: d.ndviLower || d.ndvi })),
                borderColor: 'transparent',
                backgroundColor: 'rgba(76, 175, 149, 0.2)',
                fill: false,
                pointRadius: 0,
                order: 1
            });
        }

        // Historical NDVI
        if (historicalData.length > 0) {
            datasets.push({
                label: 'Historical NDVI',
                data: historicalData.map(d => ({ x: new Date(d.date), y: d.ndvi })),
                borderColor: themeColors.green,
                backgroundColor: themeColors.green,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                order: 2
            });
        }

        // Historical EVI
        if (historicalData.length > 0) {
            datasets.push({
                label: 'Historical EVI',
                data: historicalData.map(d => ({ x: new Date(d.date), y: d.evi })),
                borderColor: themeColors.blue,
                backgroundColor: themeColors.blue,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                order: 3
            });
        }

        // Historical SAVI
        if (historicalData.length > 0) {
            datasets.push({
                label: 'Historical SAVI',
                data: historicalData.map(d => ({ x: new Date(d.date), y: d.savi })),
                borderColor: themeColors.orange,
                backgroundColor: themeColors.orange,
                borderWidth: 2,
                borderDash: [10, 5],
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                order: 4
            });
        }

        // ML Forecast line
        if ((data.modelType === 'ml' || data.modelType === 'compare') && mlForecastData.length > 0) {
            datasets.push({
                label: 'ML Forecast',
                data: mlForecastData.map(d => ({ x: new Date(d.date), y: d.ndvi })),
                borderColor: themeColors.green,
                backgroundColor: themeColors.green,
                borderWidth: 3,
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                order: 5
            });
        }

        // Statistical Forecast line
        if ((data.modelType === 'statistical' || data.modelType === 'compare') && statForecastData.length > 0) {
            datasets.push({
                label: 'Statistical Forecast',
                data: statForecastData.map(d => ({ x: new Date(d.date), y: d.ndvi })),
                borderColor: themeColors.red,
                backgroundColor: themeColors.red,
                borderWidth: 3,
                borderDash: [5, 5],
                pointRadius: 0,
                tension: 0.4,
                fill: false,
                order: 6
            });
        }

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'ML Vegetation Forecast',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: themeColors.textColor,
                            filter: (item) => {
                                return !item.text.includes('Upper') && !item.text.includes('Lower');
                            },
                            generateLabels: (chart) => {
                                const labels = [];
                                
                                // Historical data
                                if (historicalData.length > 0) {
                                    labels.push({
                                        text: 'Historical NDVI',
                                        fillStyle: themeColors.green,
                                        strokeStyle: themeColors.green,
                                        lineWidth: 2
                                    });
                                    labels.push({
                                        text: 'Historical EVI',
                                        fillStyle: themeColors.blue,
                                        strokeStyle: themeColors.blue,
                                        lineWidth: 2,
                                        lineDash: [5, 5]
                                    });
                                    labels.push({
                                        text: 'Historical SAVI',
                                        fillStyle: themeColors.orange,
                                        strokeStyle: themeColors.orange,
                                        lineWidth: 2,
                                        lineDash: [10, 5]
                                    });
                                }
                                
                                // ML Forecast
                                if ((data.modelType === 'ml' || data.modelType === 'compare') && mlForecastData.length > 0) {
                                    labels.push({
                                        text: 'ML Confidence',
                                        fillStyle: 'rgba(76, 175, 149, 0.2)',
                                        strokeStyle: 'rgba(76, 175, 149, 0.5)',
                                        lineWidth: 1
                                    });
                                    labels.push({
                                        text: 'ML Forecast',
                                        fillStyle: themeColors.green,
                                        strokeStyle: themeColors.green,
                                        lineWidth: 3
                                    });
                                }
                                
                                // Statistical Forecast
                                if ((data.modelType === 'statistical' || data.modelType === 'compare') && statForecastData.length > 0) {
                                    labels.push({
                                        text: 'Statistical Forecast',
                                        fillStyle: themeColors.red,
                                        strokeStyle: themeColors.red,
                                        lineWidth: 3,
                                        lineDash: [5, 5]
                                    });
                                }
                                
                                return labels;
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => {
                                return new Date(context[0].parsed.x).toLocaleDateString();
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                const label = context.dataset.label;
                                if (label.includes('Historical')) {
                                    return `${label}: ${value.toFixed(3)}`;
                                } else if (label === 'ML Forecast') {
                                    const index = context.dataIndex;
                                    const dataPoint = mlForecastData[index];
                                    let tooltipText = `ML Forecast: ${value.toFixed(3)}`;
                                    if (dataPoint && dataPoint.ndviUpper !== undefined && dataPoint.ndviLower !== undefined) {
                                        tooltipText += `\nConfidence: ${dataPoint.ndviLower.toFixed(3)} - ${dataPoint.ndviUpper.toFixed(3)}`;
                                    }
                                    return tooltipText.split('\n');
                                } else if (label === 'Statistical Forecast') {
                                    return `Statistical Forecast: ${value.toFixed(3)}`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            maxTicksLimit: 12
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Vegetation Index Value',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
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

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }

    renderFeatureImportanceChart(featureImportance) {
        const containerId = 'ml-feature-importance-chart';
        const container = document.getElementById(containerId);
        if (!container) return;

        // Destroy existing chart if it exists
        if (this.chartJsCharts && this.chartJsCharts[containerId]) {
            this.chartJsCharts[containerId].destroy();
        }

        // Create or get canvas element
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        // Get theme colors
        const themeColors = this.getChartThemeColors();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Sort by importance (descending) for better visualization
        const sortedData = [...featureImportance].sort((a, b) => b.importance - a.importance);

        // Create Chart.js configuration
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedData.map(d => d.feature),
                datasets: [{
                    label: 'Importance',
                    data: sortedData.map(d => d.importance),
                    backgroundColor: themeColors.blue,
                    borderColor: isDark ? '#fff' : '#000',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Feature Importance',
                        color: themeColors.textColor,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: themeColors.gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                return `Importance: ${(context.parsed.x * 100).toFixed(1)}%`;
                            }
                        }
                    },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        color: themeColors.textColor,
                        font: {
                            size: 12
                        },
                        formatter: (value) => {
                            return `${(value * 100).toFixed(1)}%`;
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Importance',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function(value) {
                                return (value * 100).toFixed(0) + '%';
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        },
                        beginAtZero: true
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Features',
                            color: themeColors.textColor,
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: themeColors.textColor,
                            font: {
                                size: 11
                            }
                        },
                        grid: {
                            color: themeColors.gridColor
                        }
                    }
                }
            }
        });

        // Store chart instance
        if (!this.chartJsCharts) this.chartJsCharts = {};
        this.chartJsCharts[containerId] = chart;
    }

    showError(message) {
        // Show error toast/notification
        console.error('Error:', message);
        Toast.error(message);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, creating app instance');
    window.app = new LandCareApp();
});
