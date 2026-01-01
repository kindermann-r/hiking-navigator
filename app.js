/**
 * Hiking Navigator - Main Application
 * Mobile-friendly GPS trail navigation with elevation tracking
 */

// ============================================
// Global State
// ============================================
const state = {
    map: null,
    trackLayer: null,
    userMarker: null,
    startMarker: null,
    endMarker: null,
    elevationChart: null,
    trackData: [],
    watchId: null,
    userPosition: null,
    isElevationVisible: true
};

// ============================================
// DOM Elements
// ============================================
const elements = {
    dropZone: document.getElementById('dropZone'),
    closeDropZone: document.getElementById('closeDropZone'),
    fileInput: document.getElementById('fileInput'),
    selectFileBtn: document.getElementById('selectFileBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    header: document.getElementById('header'),
    bottomPanel: document.getElementById('bottomPanel'),
    trailName: document.getElementById('trailName'),
    statDistance: document.getElementById('statDistance'),
    statElevation: document.getElementById('statElevation'),
    elevationContainer: document.getElementById('elevationContainer'),
    elevationChart: document.getElementById('elevationChart'),
    elevMin: document.getElementById('elevMin'),
    elevMax: document.getElementById('elevMax'),
    elevGain: document.getElementById('elevGain'),
    gpsStatus: document.getElementById('gpsStatus'),
    distanceIndicator: document.getElementById('distanceIndicator'),
    btnLocate: document.getElementById('btnLocate'),
    btnFitTrack: document.getElementById('btnFitTrack'),
    btnLoadNew: document.getElementById('btnLoadNew'),
    btnToggleElevation: document.getElementById('btnToggleElevation')
};

// ============================================
// Initialization
// ============================================
function init() {
    initMap();
    setupEventListeners();
    setupDragAndDrop();
}

function initMap() {
    // Initialize Leaflet map
    state.map = L.map('map', {
        center: [34.9, 32.4], // Cyprus default
        zoom: 10,
        zoomControl: true,
        attributionControl: true
    });

    // Add dark tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.map);

    // Alternative: OpenStreetMap for outdoor detail
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19
    });

    // OpenTopoMap for hiking
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17
    });

    // Layer control
    L.control.layers({
        'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd', maxZoom: 19
        }).addTo(state.map),
        'Street': osmLayer,
        'Topo': topoLayer
    }, null, { position: 'topright' }).addTo(state.map);

    // Position zoom control
    state.map.zoomControl.setPosition('topright');
}

function setupEventListeners() {
    // File selection
    elements.selectFileBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Close drop zone
    elements.closeDropZone.addEventListener('click', hideDropZone);

    // Control buttons
    elements.btnLocate.addEventListener('click', locateUser);
    elements.btnFitTrack.addEventListener('click', fitTrackToView);
    elements.btnLoadNew.addEventListener('click', showDropZone);
    elements.btnToggleElevation.addEventListener('click', toggleElevation);

    // Hide/show UI on map interaction
    let hideTimeout;
    state.map.on('movestart', () => {
        elements.header.classList.add('hidden');
        clearTimeout(hideTimeout);
    });
    state.map.on('moveend', () => {
        hideTimeout = setTimeout(() => {
            elements.header.classList.remove('hidden');
        }, 1500);
    });
}

function setupDragAndDrop() {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, () => {
            elements.dropZone.classList.add('highlight');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        elements.dropZone.addEventListener(eventName, () => {
            elements.dropZone.classList.remove('highlight');
        });
    });

    // Handle drop
    elements.dropZone.addEventListener('drop', handleDrop);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// ============================================
// File Handling
// ============================================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function handleDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    if (!file.name.endsWith('.json')) {
        alert('Please select a JSON file');
        return;
    }

    showLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            loadTrackData(json, file.name);
        } catch (error) {
            alert('Error parsing JSON file: ' + error.message);
            showLoading(false);
        }
    };
    reader.onerror = () => {
        alert('Error reading file');
        showLoading(false);
    };
    reader.readAsText(file);
}

function loadTrackData(json, filename) {
    // Parse the track data based on known format
    let coords = [];

    // Try different formats
    if (json.data && json.data.trackData) {
        // Format: {"data":{"trackData":[[{lon, lat, ele}, ...]]}}
        const trackData = json.data.trackData;
        if (Array.isArray(trackData) && trackData.length > 0) {
            coords = Array.isArray(trackData[0]) ? trackData[0] : trackData;
        }
    } else if (Array.isArray(json)) {
        // Format: [{lon, lat, ele}, ...]
        coords = json;
    } else if (json.coordinates) {
        // GeoJSON-like
        coords = json.coordinates.map(c => ({ lon: c[0], lat: c[1], ele: c[2] || 0 }));
    }

    if (coords.length === 0) {
        alert('Could not find track data in file');
        showLoading(false);
        return;
    }

    state.trackData = coords;

    // Update UI
    const trailName = filename.replace('.json', '').replace(/_/g, ' ');
    elements.trailName.textContent = trailName;

    // Clear existing layers
    if (state.trackLayer) state.map.removeLayer(state.trackLayer);
    if (state.startMarker) state.map.removeLayer(state.startMarker);
    if (state.endMarker) state.map.removeLayer(state.endMarker);

    // Draw track on map
    drawTrack(coords);

    // Update stats
    updateStats(coords);

    // Draw elevation chart
    drawElevationChart(coords);

    // Hide drop zone
    elements.dropZone.classList.add('hidden');
    showLoading(false);

    // Start GPS tracking
    startGPSTracking();
}

// ============================================
// Map Drawing
// ============================================
function drawTrack(coords) {
    // Convert to Leaflet format [lat, lng]
    const latLngs = coords.map(c => [c.lat, c.lon]);

    // Create polyline with glow effect
    const glowLine = L.polyline(latLngs, {
        color: 'rgba(0, 217, 255, 0.3)',
        weight: 12,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(state.map);

    // Main track line
    const trackLine = L.polyline(latLngs, {
        color: '#00d9ff',
        weight: 4,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(state.map);

    // Group layers
    state.trackLayer = L.layerGroup([glowLine, trackLine]).addTo(state.map);

    // Start marker
    const startIcon = L.divIcon({
        className: 'custom-marker start',
        html: '🚩',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    state.startMarker = L.marker([coords[0].lat, coords[0].lon], { icon: startIcon })
        .bindPopup('<b>Start</b><br>Elevation: ' + coords[0].ele + 'm')
        .addTo(state.map);

    // End marker
    const endIcon = L.divIcon({
        className: 'custom-marker end',
        html: '🏁',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    const lastCoord = coords[coords.length - 1];
    state.endMarker = L.marker([lastCoord.lat, lastCoord.lon], { icon: endIcon })
        .bindPopup('<b>End</b><br>Elevation: ' + lastCoord.ele + 'm')
        .addTo(state.map);

    // Fit map to track
    state.map.fitBounds(trackLine.getBounds(), { padding: [50, 50] });
}

// ============================================
// Statistics
// ============================================
function updateStats(coords) {
    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < coords.length; i++) {
        totalDistance += haversineDistance(
            coords[i - 1].lat, coords[i - 1].lon,
            coords[i].lat, coords[i].lon
        );
    }

    // Calculate elevation gain
    let elevationGain = 0;
    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let i = 0; i < coords.length; i++) {
        const ele = coords[i].ele;
        if (ele < minElev) minElev = ele;
        if (ele > maxElev) maxElev = ele;

        if (i > 0) {
            const diff = coords[i].ele - coords[i - 1].ele;
            if (diff > 0) elevationGain += diff;
        }
    }

    // Update display
    elements.statDistance.textContent = (totalDistance / 1000).toFixed(2) + ' km';
    elements.statElevation.textContent = '↑ ' + Math.round(elevationGain) + ' m';
    elements.elevMin.textContent = Math.round(minElev) + ' m';
    elements.elevMax.textContent = Math.round(maxElev) + ' m';
    elements.elevGain.textContent = Math.round(elevationGain) + ' m';
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// ============================================
// Elevation Chart
// ============================================
function drawElevationChart(coords) {
    const ctx = elements.elevationChart.getContext('2d');

    // Calculate cumulative distance for x-axis
    let distances = [0];
    let cumulative = 0;
    for (let i = 1; i < coords.length; i++) {
        cumulative += haversineDistance(
            coords[i - 1].lat, coords[i - 1].lon,
            coords[i].lat, coords[i].lon
        );
        distances.push(cumulative / 1000); // Convert to km
    }

    // Destroy existing chart
    if (state.elevationChart) {
        state.elevationChart.destroy();
    }

    // Create new chart
    state.elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: distances.map(d => d.toFixed(1)),
            datasets: [{
                label: 'Elevation',
                data: coords.map(c => c.ele),
                fill: true,
                backgroundColor: 'rgba(0, 217, 255, 0.2)',
                borderColor: '#00d9ff',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 46, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#00d9ff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y}m`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.4)',
                        font: { size: 10 },
                        maxTicksLimit: 5
                    },
                    title: {
                        display: true,
                        text: 'km',
                        color: 'rgba(255,255,255,0.4)',
                        font: { size: 10 }
                    }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.4)',
                        font: { size: 10 },
                        maxTicksLimit: 4
                    },
                    title: {
                        display: true,
                        text: 'm',
                        color: 'rgba(255,255,255,0.4)',
                        font: { size: 10 }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// ============================================
// GPS Tracking
// ============================================
function startGPSTracking() {
    if (!navigator.geolocation) {
        updateGPSStatus('error', 'GPS not supported');
        return;
    }

    state.watchId = navigator.geolocation.watchPosition(
        onPositionUpdate,
        onPositionError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
        }
    );

    updateGPSStatus('searching', 'Searching...');
}

function onPositionUpdate(position) {
    const { latitude, longitude, accuracy } = position.coords;
    state.userPosition = { lat: latitude, lon: longitude, accuracy };

    updateGPSStatus('active', `± ${Math.round(accuracy)}m`);

    // Update or create user marker
    if (state.userMarker) {
        state.userMarker.setLatLng([latitude, longitude]);
    } else {
        const userIcon = L.divIcon({
            className: 'user-location-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        state.userMarker = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 })
            .addTo(state.map);
    }

    // Update distance to trail
    if (state.trackData.length > 0) {
        const distToTrail = getDistanceToTrail(latitude, longitude);
        updateDistanceIndicator(distToTrail);
    }
}

function onPositionError(error) {
    let message = 'GPS Error';
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message = 'Permission denied';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Position unavailable';
            break;
        case error.TIMEOUT:
            message = 'Timeout';
            break;
    }
    updateGPSStatus('error', message);
}

function updateGPSStatus(status, text) {
    elements.gpsStatus.className = 'gps-status ' + status;
    elements.gpsStatus.querySelector('.gps-text').textContent = text;
}

function getDistanceToTrail(lat, lon) {
    let minDist = Infinity;
    for (const coord of state.trackData) {
        const dist = haversineDistance(lat, lon, coord.lat, coord.lon);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

function updateDistanceIndicator(distance) {
    const indicator = elements.distanceIndicator;
    indicator.hidden = false;

    const value = indicator.querySelector('.distance-value');
    if (distance < 1000) {
        value.textContent = Math.round(distance) + 'm';
    } else {
        value.textContent = (distance / 1000).toFixed(1) + 'km';
    }

    // Color based on distance
    if (distance < 50) {
        value.style.color = '#10b981'; // On trail
    } else if (distance < 200) {
        value.style.color = '#00d9ff'; // Near trail
    } else {
        value.style.color = '#f59e0b'; // Off trail
    }
}

// ============================================
// Control Functions
// ============================================
function locateUser() {
    if (state.userPosition) {
        state.map.setView([state.userPosition.lat, state.userPosition.lon], 17);
    } else {
        state.map.locate({ setView: true, maxZoom: 16 });
    }
}

function fitTrackToView() {
    if (state.trackLayer) {
        state.map.fitBounds(state.trackLayer.getBounds(), { padding: [50, 50] });
    }
}

function showDropZone() {
    elements.dropZone.classList.remove('hidden');
}

function hideDropZone() {
    elements.dropZone.classList.add('hidden');
}

function toggleElevation() {
    state.isElevationVisible = !state.isElevationVisible;
    elements.elevationContainer.classList.toggle('collapsed', !state.isElevationVisible);
    elements.btnToggleElevation.textContent = state.isElevationVisible ? '📈' : '📉';
}

function showLoading(show) {
    elements.loadingOverlay.classList.toggle('visible', show);
}

// ============================================
// Start App
// ============================================
document.addEventListener('DOMContentLoaded', init);
