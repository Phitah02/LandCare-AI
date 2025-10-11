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

    updatePolygonColor(color) {
        console.log('updatePolygonColor called with color:', color);
        console.log('currentPolygonLayer exists:', !!this.currentPolygonLayer);
        
        let polygonLayer = this.currentPolygonLayer;
        
        // Fallback: if currentPolygonLayer is not available, try to find it from drawnItems
        if (!polygonLayer && this.drawnItems.getLayers().length > 0) {
            console.log('currentPolygonLayer not found, searching in drawnItems...');
            const layers = this.drawnItems.getLayers();
            polygonLayer = layers.find(layer => layer instanceof L.Polygon);
            if (polygonLayer) {
                console.log('Found polygon layer in drawnItems, updating reference');
                this.currentPolygonLayer = polygonLayer;
            }
        }
        
        if (polygonLayer) {
            console.log('Updating polygon style with color:', color);
            
            // Update the polygon with risk-based color and enhanced styling
            polygonLayer.setStyle({
                color: color,
                fillColor: color,
                fillOpacity: 0.4,
                weight: 3,
                opacity: 0.8
            });
            
            // Add a pulsing effect to make it more noticeable
            polygonLayer.on('mouseover', function() {
                this.setStyle({
                    weight: 4,
                    opacity: 1.0
                });
            });
            
            polygonLayer.on('mouseout', function() {
                this.setStyle({
                    weight: 3,
                    opacity: 0.8
                });
            });
            
            console.log('Polygon color successfully updated to:', color);
        } else {
            console.error('No polygon layer found for color update');
            console.log('Available layers in drawnItems:', this.drawnItems.getLayers());
            console.log('drawnItems layer count:', this.drawnItems.getLayers().length);
        }
    }

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
}