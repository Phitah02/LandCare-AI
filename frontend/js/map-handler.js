console.log('map-handler.js loaded');

// Map handling with Leaflet
class MapHandler {
    constructor() {
        console.log('MapHandler constructor called');
        this.map = null;
        this.drawnItems = null;
        this.drawControl = null;
        this.currentPolygon = null;

        this.initMap();
        this.initDrawing();
    }

    initMap() {
        console.log('initMap called');
        // Initialize map centered on Kenya (can be made configurable)
        this.map = L.map('map').setView([-0.0236, 37.9062], 6);
        console.log('Map initialized');

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 18,
        });

        // Add default layer
        osmLayer.addTo(this.map);

        // Add layer control
        const baseMaps = {
            "OpenStreetMap": osmLayer,
            "Satellite": satelliteLayer
        };
        L.control.layers(baseMaps).addTo(this.map);

        // Create layer group for drawn items
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        console.log('Drawn items layer added');
    }

    initDrawing() {
        console.log('initDrawing called');
        // Initialize draw control
        this.drawControl = new L.Control.Draw({
            draw: {
                polygon: {
                    shapeOptions: {
                        color: '#4caf50',
                        weight: 2,
                        opacity: 0.8,
                        fillColor: '#4caf50',
                        fillOpacity: 0.2
                    }
                },
                polyline: false,
                rectangle: false,
                circle: false,
                marker: false,
                circlemarker: false
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        });
        
        // Add the draw control to the map
        this.map.addControl(this.drawControl);
        console.log('Draw control initialized and added to map');

        // Handle draw events
        this.map.on(L.Draw.Event.CREATED, (event) => {
            console.log('Draw event CREATED fired', event);
            const layer = event.layer;
            this.drawnItems.addLayer(layer);
            this.currentPolygon = layer.getLatLngs()[0];
            this.currentPolygonLayer = layer; // Store the actual layer for styling
            console.log('Polygon added to map, currentPolygon set:', this.currentPolygon);
        });

        this.map.on(L.Draw.Event.DELETED, () => {
            console.log('Draw event DELETED fired');
            this.currentPolygon = null;
            this.currentPolygonLayer = null; // Clear the layer reference
        });

        this.map.on(L.Draw.Event.EDITED, (event) => {
            console.log('Draw event EDITED fired', event);
            event.layers.eachLayer((layer) => {
                if (layer instanceof L.Polygon) {
                    this.currentPolygon = layer.getLatLngs()[0];
                    this.currentPolygonLayer = layer; // Update the layer reference
                    console.log('Polygon edited, updated currentPolygon:', this.currentPolygon);
                }
            });
        });
        console.log('Draw events listeners added');
    }

    startDrawing() {
        console.log('Draw Polygon button clicked - enabling drawing');
        // Clear existing drawings to ensure only one polygon is active
        this.clearDrawings();

        // Programmatically enable the polygon drawing tool
        new L.Draw.Polygon(this.map, this.drawControl.options.draw.polygon).enable();
    }

    clearDrawings() {
        this.drawnItems.clearLayers();
        this.currentPolygon = null;
        this.currentPolygonLayer = null; // Clear the layer reference
        
        // Don't remove the draw control, just clear the drawings
        console.log('Drawings cleared, draw control remains active');
    }

    getCurrentPolygon() {
        return this.currentPolygon;
    }

    addPolygonToMap(coordinates) {
        const polygon = L.polygon(coordinates, {
            color: '#4caf50',
            weight: 2,
            opacity: 0.8,
            fillColor: '#4caf50',
            fillOpacity: 0.2
        });
        this.drawnItems.addLayer(polygon);
        this.currentPolygon = coordinates;
        this.currentPolygonLayer = polygon;
    }

    // updatePolygonColor method removed - polygon color is now updated in updatePolygonRiskTag

    addNDVIOverlay(geometry, ndviData) {
        // Create NDVI color overlay
        if (this.ndviOverlay) {
            this.map.removeLayer(this.ndviOverlay);
        }

        const ndvi = ndviData.NDVI || 0.5;
        let color = '#d32f2f'; // Red for low NDVI
        
        if (ndvi > 0.8) color = '#388e3c'; // Dark green
        else if (ndvi > 0.6) color = '#4caf50'; // Green
        else if (ndvi > 0.4) color = '#ffc107'; // Yellow
        else if (ndvi > 0.2) color = '#ff9800'; // Orange

        // Create a semi-transparent overlay
        const bounds = L.polygon(geometry.coordinates[0]).getBounds();
        const overlay = L.rectangle(bounds, {
            color: color,
            fillColor: color,
            fillOpacity: 0.4,
            weight: 0
        });

        overlay.addTo(this.map);
        this.ndviOverlay = overlay;
    }

    fitBoundsToPolygon() {
        if (this.currentPolygon) {
            this.map.fitBounds(this.currentPolygon);
        }
    }

    getPolygonCentroid(geometry) {
        // Calculate centroid of a polygon from GeoJSON geometry
        if (!geometry || geometry.type !== 'Polygon') {
            return null;
        }

        const coordinates = geometry.coordinates[0];
        let sumLat = 0, sumLon = 0;

        for (const coord of coordinates) {
            sumLon += coord[0];
            sumLat += coord[1];
        }

        const centroidLon = sumLon / coordinates.length;
        const centroidLat = sumLat / coordinates.length;

        return [centroidLat, centroidLon]; // Return as [lat, lon]
    }

    startDrawing() {
        if (this.drawControl) {
            // Enable drawing mode
            console.log('Drawing mode enabled');
        }
    }

    updatePolygonVegetationColor(ndviValue) {
        if (!this.currentPolygonLayer) return;

        // Determine color based on NDVI value (matching the legend)
        let vegetationColor = '#d32f2f'; // Default: Very Low Vegetation (<0.2) - red

        if (ndviValue >= 0.8) {
            vegetationColor = '#388e3c'; // High Vegetation (0.8+) - dark green
        } else if (ndviValue >= 0.6) {
            vegetationColor = '#4caf50'; // Good Vegetation (0.6-0.8) - green
        } else if (ndviValue >= 0.4) {
            vegetationColor = '#ffc107'; // Moderate Vegetation (0.4-0.6) - yellow
        } else if (ndviValue >= 0.2) {
            vegetationColor = '#ff9800'; // Low Vegetation (0.2-0.4) - orange
        }
        // ndviValue < 0.2 remains #d32f2f (red)

        // Update polygon color based on vegetation index
        if (this.currentPolygonLayer) {
            this.currentPolygonLayer.setStyle({
                color: vegetationColor,
                fillColor: vegetationColor,
                fillOpacity: 0.3
            });
        }
    }

    updatePolygonRiskTag(riskLevel, riskScore) {
        if (!this.currentPolygonLayer) return;

        // Remove existing risk tag if any
        this.clearPolygonRiskTag();

        // Get risk color for styling
        let riskColor = '#28a745'; // Default low risk
        if (riskLevel.toLowerCase() === 'high') {
            riskColor = '#d32f2f';
        } else if (riskLevel.toLowerCase() === 'medium') {
            riskColor = '#ffc107';
        }

        // Create risk tag element with bold risk and score, and colored background
        const riskTag = L.divIcon({
            html: `<div class="polygon-risk-tag ${riskLevel.toLowerCase().replace(' ', '-')}-risk" style="background-color: white; color: ${riskColor}; border-color: ${riskColor}; border: 2px solid ${riskColor}; font-size: 14px; padding: 4px;">
                <strong style="font-size: 16px;">${riskLevel}</strong><br><small><strong style="font-size: 14px;">${(riskScore * 100).toFixed(0)}%</strong></small>
            </div>`,
            className: 'polygon-risk-tag-container',
            iconSize: [140, 70],
            iconAnchor: [70, 35]
        });

        // Calculate centroid for tag placement
        const centroid = this.getPolygonCentroid(this.currentPolygonLayer.toGeoJSON().geometry);

        // Add marker with risk tag
        this.riskTagMarker = L.marker(centroid, { icon: riskTag }).addTo(this.map);
    }

    clearPolygonRiskTag() {
        if (this.riskTagMarker) {
            this.map.removeLayer(this.riskTagMarker);
            this.riskTagMarker = null;
        }
    }

    clearDrawings() {
        this.drawnItems.clearLayers();
        this.currentPolygon = null;
        this.currentPolygonLayer = null;
        this.ndviOverlay = null;
        this.clearPolygonRiskTag();
        console.log('Drawings cleared');
    }
}
