class ChartHandler {
    constructor() {
        this.charts = {};
        this.theme = {
            textColor: '#333333',
            gridColor: '#e0e0e0',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        };
        // Initialize theme based on current document state
        this.updateThemeColors();
    }

    updateThemeColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            this.theme = {
                textColor: '#e0e0e0',
                gridColor: '#444444',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                backgroundColor: '#1a1a1a'
            };
        } else {
            this.theme = {
                textColor: '#333333',
                gridColor: '#e0e0e0',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                backgroundColor: '#ffffff'
            };
        }
    }

    updateTheme() {
        this.updateThemeColors();
        Object.values(this.charts).forEach(chart => {
            if (chart) {
                chart.options.scales.x.ticks.color = this.theme.textColor;
                chart.options.scales.x.grid.color = this.theme.gridColor;
                chart.options.scales.y.ticks.color = this.theme.textColor;
                chart.options.scales.y.grid.color = this.theme.gridColor;

                if (chart.options.scales.y1) {
                    chart.options.scales.y1.ticks.color = this.theme.textColor;
                    chart.options.scales.y1.grid.color = this.theme.gridColor;
                }

                chart.options.plugins.legend.labels.color = this.theme.textColor;
                chart.options.plugins.title.color = this.theme.textColor;

                chart.update();
            }
        });
    }

    destroyChart(containerId) {
        if (this.charts[containerId]) {
            this.charts[containerId].destroy();
            delete this.charts[containerId];
        }
    }

    getCanvas(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Clear container
        container.innerHTML = '';

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        return canvas;
    }

    renderFutureVegetationChart(containerId, data) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        const labels = data.map(d => d.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }));
        const values = data.map(d => d.value);
        const lower = data.map(d => d.lower);
        const upper = data.map(d => d.upper);

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Projected NDVI',
                        data: values,
                        borderColor: '#4CAF50',
                        backgroundColor: '#4CAF50',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Confidence Interval Upper',
                        data: upper,
                        borderColor: 'transparent',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        fill: '+1', // Fill to next dataset (Lower)
                        pointRadius: 0
                    },
                    {
                        label: 'Confidence Interval Lower',
                        data: lower,
                        borderColor: 'transparent',
                        backgroundColor: 'transparent',
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Predicted Vegetation Health (5 Years)',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor },
                        filter: item => item.text === 'Projected NDVI' // Hide confidence intervals from legend
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                if (context.dataset.label === 'Projected NDVI') {
                                    return `NDVI: ${context.raw.toFixed(2)}`;
                                }
                                return null;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: 'NDVI',
                            color: this.theme.textColor
                        }
                    }
                }
            }
        });
    }

    renderFutureErosionChart(containerId, data) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.year),
                datasets: [
                    {
                        label: 'Combined Risk',
                        data: data.map(d => d.combined),
                        borderColor: '#f44336',
                        backgroundColor: '#f44336',
                        tension: 0.4,
                        borderWidth: 3
                    },
                    {
                        label: 'Erosion Risk',
                        data: data.map(d => d.erosion),
                        borderColor: '#ff9800',
                        backgroundColor: '#ff9800',
                        borderDash: [5, 5],
                        tension: 0.4
                    },
                    {
                        label: 'Vegetation Degradation',
                        data: data.map(d => d.vegetation),
                        borderColor: '#4CAF50',
                        backgroundColor: '#4CAF50',
                        borderDash: [2, 2],
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Future Soil Erosion Risk',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        ticks: {
                            color: this.theme.textColor,
                            callback: value => value + '%'
                        },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: 'Risk Level (%)',
                            color: this.theme.textColor
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }

    renderMultiTimeSeriesChart(containerId, dates, seriesData, yLabel, title) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        const datasets = [];
        const colors = {
            'NDVI': '#4CAF50', // Green
            'EVI': '#2196F3',  // Blue
            'SAVI': '#FF9800'  // Orange
        };

        Object.keys(seriesData).forEach(key => {
            datasets.push({
                label: key,
                data: seriesData[key],
                borderColor: colors[key] || '#999',
                backgroundColor: colors[key] || '#999',
                tension: 0.3,
                pointRadius: 2,
                fill: false
            });
        });

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString()),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: yLabel,
                            color: this.theme.textColor
                        }
                    }
                }
            }
        });
    }

    renderHistoricalWeatherChart(containerId, data) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        let processedData;
        if (data.data && Array.isArray(data.data)) {
            processedData = data.data.map(d => ({
                date: new Date(d.date),
                temperature: d.temperature,
                humidity: d.humidity,
                precipitation: d.precipitation
            }));
        } else {
            processedData = data.dates.map((date, i) => ({
                date: new Date(date),
                temperature: data.temperature[i],
                humidity: null,
                precipitation: data.rainfall ? data.rainfall[i] : 0
            }));
        }

        // Downsample if needed
        const MAX_POINTS = 500;
        if (processedData.length > MAX_POINTS) {
            const factor = Math.ceil(processedData.length / MAX_POINTS);
            processedData = processedData.filter((_, i) => i % factor === 0);
        }

        const labels = processedData.map(d => d.date.toLocaleDateString());

        this.charts[containerId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Precipitation (mm)',
                        data: processedData.map(d => d.precipitation),
                        backgroundColor: 'rgba(33, 150, 243, 0.6)',
                        borderColor: 'rgba(33, 150, 243, 1)',
                        borderWidth: 1,
                        yAxisID: 'y1',
                        type: 'bar'
                    },
                    {
                        label: 'Temperature (°C)',
                        data: processedData.map(d => d.temperature),
                        borderColor: '#f44336',
                        backgroundColor: '#f44336',
                        tension: 0.4,
                        yAxisID: 'y',
                        type: 'line',
                        pointRadius: 1
                    },
                    {
                        label: 'Humidity (%)',
                        data: processedData.map(d => d.humidity),
                        borderColor: '#00BCD4',
                        backgroundColor: '#00BCD4',
                        borderDash: [5, 5],
                        tension: 0.4,
                        yAxisID: 'y1', // Share axis with precip or create y2
                        type: 'line',
                        pointRadius: 1,
                        hidden: !processedData.some(d => d.humidity !== null)
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical Weather Data',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: 'Temperature (°C)',
                            color: this.theme.textColor
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: this.theme.textColor },
                        grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
                        title: {
                            display: true,
                            text: 'Precipitation (mm) / Humidity (%)',
                            color: this.theme.textColor
                        }
                    }
                }
            }
        });
    }

    renderForecastChart(containerId, dates, values, confidenceIntervals, title) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        const labels = dates.map(d => new Date(d).toLocaleDateString());
        const lower = confidenceIntervals ? confidenceIntervals.lower : [];
        const upper = confidenceIntervals ? confidenceIntervals.upper : [];

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Forecast',
                        data: values,
                        borderColor: '#FF9800',
                        backgroundColor: '#FF9800',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Confidence Upper',
                        data: upper,
                        borderColor: 'transparent',
                        backgroundColor: 'rgba(255, 152, 0, 0.2)',
                        fill: '+1',
                        pointRadius: 0
                    },
                    {
                        label: 'Confidence Lower',
                        data: lower,
                        borderColor: 'transparent',
                        backgroundColor: 'transparent',
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor },
                        filter: item => item.text === 'Forecast'
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    }
                }
            }
        });
    }

    renderWeatherForecastChart(containerId, dates, tempValues, rainValues) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString()),
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: tempValues,
                        borderColor: '#f44336',
                        backgroundColor: '#f44336',
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Precipitation (mm)',
                        data: rainValues,
                        borderColor: '#2196F3',
                        backgroundColor: '#2196F3',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: { display: true, text: 'Temperature (°C)', color: this.theme.textColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: this.theme.textColor },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Precipitation (mm)', color: this.theme.textColor }
                    }
                }
            }
        });
    }

    renderWeatherForecastChartWithUncertainty(containerId, dates, temperature, precipitation, humidity) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        const labels = dates.map(d => new Date(d).toLocaleDateString());

        const datasets = [];

        // Temperature
        if (temperature && temperature.values) {
            datasets.push({
                label: 'Temperature (°C)',
                data: temperature.values,
                borderColor: '#f44336',
                backgroundColor: '#f44336',
                tension: 0.4,
                yAxisID: 'y',
                order: 1
            });

            if (temperature.upper_bound && temperature.lower_bound) {
                datasets.push({
                    label: 'Temp Upper',
                    data: temperature.upper_bound,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(244, 67, 54, 0.2)',
                    fill: '+1',
                    pointRadius: 0,
                    yAxisID: 'y',
                    order: 2
                });
                datasets.push({
                    label: 'Temp Lower',
                    data: temperature.lower_bound,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'y',
                    order: 3
                });
            }
        }

        // Precipitation
        if (precipitation && precipitation.values) {
            datasets.push({
                label: 'Precipitation (mm)',
                data: precipitation.values,
                borderColor: '#2196F3',
                backgroundColor: '#2196F3',
                tension: 0.4,
                yAxisID: 'y1',
                order: 4
            });

            if (precipitation.upper_bound && precipitation.lower_bound) {
                datasets.push({
                    label: 'Precip Upper',
                    data: precipitation.upper_bound,
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(33, 150, 243, 0.2)',
                    fill: '+1',
                    pointRadius: 0,
                    yAxisID: 'y1',
                    order: 5
                });
                datasets.push({
                    label: 'Precip Lower',
                    data: precipitation.lower_bound,
                    borderColor: 'transparent',
                    backgroundColor: 'transparent',
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'y1',
                    order: 6
                });
            }
        }

        // Humidity
        if (humidity && humidity.values) {
            datasets.push({
                label: 'Humidity (%)',
                data: humidity.values,
                borderColor: '#00BCD4',
                backgroundColor: '#00BCD4',
                borderDash: [5, 5],
                tension: 0.4,
                yAxisID: 'y1',
                order: 7
            });
        }

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Weather Forecast with Uncertainty',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor },
                        filter: item => !item.text.includes('Upper') && !item.text.includes('Lower')
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: { display: true, text: 'Temperature (°C)', color: this.theme.textColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: this.theme.textColor },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Precipitation (mm) / Humidity (%)', color: this.theme.textColor }
                    }
                }
            }
        });
    }

    exportChart(chartId, format) {
        const chart = this.charts[chartId];
        if (!chart) {
            console.error('Chart not found:', chartId);
            return;
        }

        const title = chart.options.plugins.title.text || 'chart';
        const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

        if (format === 'png') {
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = chart.toBase64Image();
            link.click();
        } else if (format === 'csv') {
            // Basic CSV export logic
            // This is a simplified version; complex datasets might need more robust handling
            const labels = chart.data.labels;
            const datasets = chart.data.datasets;

            let csvContent = "data:text/csv;charset=utf-8,Date";
            datasets.forEach(ds => {
                if (!ds.label.includes('Upper') && !ds.label.includes('Lower')) {
                    csvContent += `,${ds.label}`;
                }
            });
            csvContent += "\n";

            labels.forEach((label, i) => {
                let row = `${label}`;
                datasets.forEach(ds => {
                    if (!ds.label.includes('Upper') && !ds.label.includes('Lower')) {
                        row += `,${ds.data[i]}`;
                    }
                });
                csvContent += row + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `${filename}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'svg') {
            console.warn('SVG export not natively supported by Chart.js without plugins. Using PNG fallback.');
            this.exportChart(chartId, 'png');
        }
    }
    renderMLForecastChart(containerId, data) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        const allData = [...data.historical, ...data.forecast];
        const labels = allData.map(d => new Date(d.date).toLocaleDateString());

        const datasets = [];

        // Historical NDVI
        const historicalData = data.historical;
        if (historicalData.length > 0) {
            datasets.push({
                label: 'Historical NDVI',
                data: allData.map(d => d.type === 'historical' ? d.ndvi : null),
                borderColor: '#4CAF50',
                backgroundColor: '#4CAF50',
                tension: 0.4,
                pointRadius: 2
            });

            datasets.push({
                label: 'Historical EVI',
                data: allData.map(d => d.type === 'historical' ? d.evi : null),
                borderColor: '#2196F3',
                backgroundColor: '#2196F3',
                borderDash: [5, 5],
                tension: 0.4,
                pointRadius: 0,
                hidden: true
            });

            datasets.push({
                label: 'Historical SAVI',
                data: allData.map(d => d.type === 'historical' ? d.savi : null),
                borderColor: '#FF9800',
                backgroundColor: '#FF9800',
                borderDash: [10, 5],
                tension: 0.4,
                pointRadius: 0,
                hidden: true
            });
        }

        // ML Forecast
        if (data.modelType === 'ml' || data.modelType === 'compare') {
            datasets.push({
                label: 'ML Forecast',
                data: allData.map(d => d.type === 'ml_forecast' ? d.ndvi : null),
                borderColor: '#4CAF50',
                backgroundColor: '#4CAF50',
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 0
            });

            // Confidence Interval
            datasets.push({
                label: 'ML Confidence Upper',
                data: allData.map(d => d.type === 'ml_forecast' ? d.ndviUpper : null),
                borderColor: 'transparent',
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                fill: '+1',
                pointRadius: 0
            });

            datasets.push({
                label: 'ML Confidence Lower',
                data: allData.map(d => d.type === 'ml_forecast' ? d.ndviLower : null),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                fill: false,
                pointRadius: 0
            });
        }

        // Statistical Forecast
        if (data.modelType === 'statistical' || data.modelType === 'compare') {
            datasets.push({
                label: 'Statistical Forecast',
                data: allData.map(d => d.type === 'statistical_forecast' ? d.ndvi : null),
                borderColor: '#f44336',
                backgroundColor: '#f44336',
                borderDash: [5, 5],
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            });
        }

        this.charts[containerId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'ML Vegetation Forecast',
                        color: this.theme.textColor
                    },
                    legend: {
                        labels: { color: this.theme.textColor },
                        filter: item => !item.text.includes('Confidence')
                    }
                },
                scales: {
                    x: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor }
                    },
                    y: {
                        ticks: { color: this.theme.textColor },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: 'Vegetation Index Value',
                            color: this.theme.textColor
                        },
                        min: 0,
                        max: 1
                    }
                }
            }
        });
    }

    renderFeatureImportanceChart(containerId, featureImportance) {
        this.destroyChart(containerId);
        const ctx = this.getCanvas(containerId);
        if (!ctx) return;

        // Sort by importance
        const sortedData = [...featureImportance].sort((a, b) => b.importance - a.importance);

        this.charts[containerId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedData.map(d => d.feature),
                datasets: [{
                    label: 'Importance',
                    data: sortedData.map(d => d.importance),
                    backgroundColor: '#2196F3',
                    borderColor: '#2196F3',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Feature Importance',
                        color: this.theme.textColor
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Importance: ${(context.raw * 100).toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: this.theme.textColor,
                            callback: value => (value * 100).toFixed(0) + '%'
                        },
                        grid: { color: this.theme.gridColor },
                        title: {
                            display: true,
                            text: 'Importance',
                            color: this.theme.textColor
                        }
                    },
                    y: {
                        ticks: { color: this.theme.textColor },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}
