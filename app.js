/**
 * Vedic Kundali Generator - Main Application
 * Uses VedAstro API for astrological calculations
 */

// ========================================
// Constants & Configuration
// ========================================
const PYJHORA_API_BASE = 'http://localhost:8000';
const VEDASTRO_API_BASE = 'https://api.vedastro.org/api'; // Fallback
const NOMINATIM_API = 'https://nominatim.openstreetmap.org';
const USE_LOCAL_API = true; // Toggle between local PyJHora and VedAstro

const PLANET_SYMBOLS = {
    Sun: '☉',
    Moon: '☽',
    Mars: '♂',
    Mercury: '☿',
    Jupiter: '♃',
    Venus: '♀',
    Saturn: '♄',
    Rahu: '☊',
    Ketu: '☋',
    Ascendant: '↑'
};

const SIGN_NAMES = {
    1: 'Aries',
    2: 'Taurus',
    3: 'Gemini',
    4: 'Cancer',
    5: 'Leo',
    6: 'Virgo',
    7: 'Libra',
    8: 'Scorpio',
    9: 'Sagittarius',
    10: 'Capricorn',
    11: 'Aquarius',
    12: 'Pisces'
};

const HOUSE_LORDS = {
    Aries: 'Mars',
    Taurus: 'Venus',
    Gemini: 'Mercury',
    Cancer: 'Moon',
    Leo: 'Sun',
    Virgo: 'Mercury',
    Libra: 'Venus',
    Scorpio: 'Mars',
    Sagittarius: 'Jupiter',
    Capricorn: 'Saturn',
    Aquarius: 'Saturn',
    Pisces: 'Jupiter'
};

// South Indian states approximate bounding boxes (lat ranges)
// South India: Tamil Nadu, Kerala, Karnataka, Andhra Pradesh, Telangana
// Roughly below latitude 16°N
const SOUTH_INDIA_LATITUDE_THRESHOLD = 16;
const EAST_INDIA_STATES = ['West Bengal', 'Odisha', 'Assam', 'Bihar', 'Jharkhand'];

// ========================================
// DOM Elements
// ========================================
const formSection = document.getElementById('formSection');
const resultsSection = document.getElementById('resultsSection');
const kundaliForm = document.getElementById('kundaliForm');
const submitBtn = document.getElementById('submitBtn');
const backBtn = document.getElementById('backBtn');
const errorToast = document.getElementById('errorToast');
const toastMessage = document.getElementById('toastMessage');
const birthPlaceInput = document.getElementById('birthPlace');
const placeSuggestions = document.getElementById('placeSuggestions');
const coordinatesRow = document.getElementById('coordinatesRow');

// ========================================
// State
// ========================================
let selectedPlace = null;
let debounceTimer = null;

// ========================================
// Event Listeners
// ========================================
document.addEventListener('DOMContentLoaded', initApp);

let currentKundaliData = null; // Store for export

function initApp() {
    kundaliForm.addEventListener('submit', handleFormSubmit);
    backBtn.addEventListener('click', showForm);
    birthPlaceInput.addEventListener('input', handlePlaceInput);

    // Export buttons
    document.getElementById('exportMdBtn')?.addEventListener('click', exportToMarkdown);
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportToPdf);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.form-group')) {
            placeSuggestions.classList.remove('active');
        }
    });

    // Set default date to a sample date for testing
    const today = new Date();
    document.getElementById('birthDate').valueAsDate = today;
}

// ========================================
// Place Search (Geocoding)
// ========================================
function handlePlaceInput(e) {
    const query = e.target.value.trim();

    clearTimeout(debounceTimer);

    if (query.length < 3) {
        placeSuggestions.classList.remove('active');
        return;
    }

    debounceTimer = setTimeout(() => searchPlaces(query), 300);
}

async function searchPlaces(query) {
    try {
        const response = await fetch(
            `${NOMINATIM_API}/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
            {
                headers: { 'Accept-Language': 'en' }
            }
        );

        const places = await response.json();

        if (places.length === 0) {
            placeSuggestions.innerHTML = '<div class="place-suggestion-item">No results found</div>';
            placeSuggestions.classList.add('active');
            return;
        }

        placeSuggestions.innerHTML = places.map(place => `
            <div class="place-suggestion-item" 
                 data-lat="${place.lat}" 
                 data-lon="${place.lon}"
                 data-name="${place.display_name}">
                ${place.display_name}
            </div>
        `).join('');

        placeSuggestions.querySelectorAll('.place-suggestion-item').forEach(item => {
            item.addEventListener('click', () => selectPlace(item));
        });

        placeSuggestions.classList.add('active');
    } catch (error) {
        console.error('Place search error:', error);
        showToast('Failed to search places. Please enter coordinates manually.');
        coordinatesRow.style.display = 'flex';
    }
}

function selectPlace(item) {
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;

    selectedPlace = { lat, lon, name };
    birthPlaceInput.value = name.split(',')[0];

    document.getElementById('latitude').value = lat.toFixed(4);
    document.getElementById('longitude').value = lon.toFixed(4);
    coordinatesRow.style.display = 'flex';

    // Auto-detect and set chart style based on location
    const chartStyleSelect = document.getElementById('chartStyle');
    if (chartStyleSelect.value === 'Auto') {
        const detectedStyle = detectChartStyle(lat, name);
        showToast(`Chart style auto-detected: ${detectedStyle} Indian`, 'info');
    }

    placeSuggestions.classList.remove('active');
}

/**
 * Auto-detect chart style based on latitude and place name
 * - South Indian: Tamil Nadu, Kerala, Karnataka, Andhra Pradesh, Telangana (south of ~16°N)
 * - East Indian: West Bengal, Odisha, Assam, Bihar, Jharkhand
 * - North Indian: Rest of India
 */
function detectChartStyle(latitude, placeName) {
    const placeNameLower = placeName.toLowerCase();

    // Check for East Indian states first (by name)
    for (const state of EAST_INDIA_STATES) {
        if (placeNameLower.includes(state.toLowerCase())) {
            return 'East';
        }
    }

    // Check specific state names in place string
    const southIndianStates = ['tamil nadu', 'kerala', 'karnataka', 'andhra pradesh', 'telangana', 'puducherry', 'pondicherry'];
    for (const state of southIndianStates) {
        if (placeNameLower.includes(state)) {
            return 'South';
        }
    }

    // Fallback to latitude-based detection
    if (latitude < SOUTH_INDIA_LATITUDE_THRESHOLD) {
        return 'South';
    }

    return 'North';
}

// ========================================
// Form Submission
// ========================================
async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(kundaliForm);
    const data = Object.fromEntries(formData);

    // Validate coordinates
    let lat = parseFloat(data.latitude);
    let lng = parseFloat(data.longitude);

    if (isNaN(lat) || isNaN(lng)) {
        if (selectedPlace) {
            lat = selectedPlace.lat;
            lng = selectedPlace.lon;
        } else {
            showToast('Please select a place or enter coordinates manually');
            coordinatesRow.style.display = 'flex';
            return;
        }
    }

    // Parse date and time
    const date = new Date(data.birthDate);
    const [hours, minutes] = data.birthTime.split(':');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const timeStr = `${hours}:${minutes}`;
    const timezone = data.timezone || '+05:30';
    const ayanamsa = data.ayanamsa;

    // Handle chart style - auto-detect if set to 'Auto'
    let chartStyle = data.chartStyle;
    if (chartStyle === 'Auto') {
        chartStyle = detectChartStyle(lat, data.birthPlace || selectedPlace?.name || '');
    }

    // Show loading state
    setLoading(true);

    try {
        // Use local PyJHora API - Complete endpoint
        const birthData = {
            name: data.name || 'Birth Chart',
            year: parseInt(year),
            month: parseInt(month),
            day: parseInt(day),
            hour: parseInt(hours),
            minute: parseInt(minutes),
            second: 0,
            latitude: lat,
            longitude: lng,
            timezone: parseTimezoneOffset(timezone),
            ayanamsa: ayanamsa
        };

        const completeData = await fetchPyJhoraComplete(birthData);
        currentKundaliData = { ...completeData, formData: data }; // Store for export

        // Display all results using complete data
        displayPersonInfo(data);
        displayPlanetDataFromComplete(completeData.charts.rasi);
        displayHouseDataFromComplete(completeData.charts.bhavaChalit);
        displayAshtakavargaLocal(completeData.ashtakavarga);
        displayShadbalaData(completeData.shadbala);
        displayChartFromComplete('lagnaChart', completeData.charts.rasi, chartStyle);
        displayChartFromComplete('navamsaChart', completeData.charts.d9_navamsa, chartStyle);
        displayDivisionalCharts(completeData.charts);

        // New features
        displayDignityData(completeData.dignity);
        displayBhavaBalaData(completeData.bhavaBala);
        displayCharaKarakas(completeData.charaKarakas);
        displaySpecialLagnas(completeData.specialLagnas);
        displayThreeRashis(completeData.charts.rasi);

        showResults();
    } catch (error) {
        console.error('API Error:', error);
        showToast(`Error fetching data: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

// ========================================
// API Calls
// ========================================
async function fetchPlanetData(lat, lng, time, day, month, year, timezone, ayanamsa) {
    const url = `${VEDASTRO_API_BASE}/Calculate/AllPlanetData/PlanetName/All/Location/${lat},${lng}/Time/${time}/${day}/${month}/${year}/${timezone}/Ayanamsa/${ayanamsa}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch planet data');

    const data = await response.json();
    return data.Payload?.AllPlanetData || data;
}

async function fetchHouseData(lat, lng, time, day, month, year, timezone, ayanamsa) {
    const url = `${VEDASTRO_API_BASE}/Calculate/AllHouseData/HouseName/All/Location/${lat},${lng}/Time/${time}/${day}/${month}/${year}/${timezone}/Ayanamsa/${ayanamsa}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch house data');

    const data = await response.json();
    return data.Payload?.AllHouseData || data;
}

async function fetchDashaData(lat, lng, time, day, month, year, timezone, ayanamsa) {
    const url = `${VEDASTRO_API_BASE}/Calculate/DasaAtBirth/Location/${lat},${lng}/Time/${time}/${day}/${month}/${year}/${timezone}/Ayanamsa/${ayanamsa}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        return data.Payload?.DasaAtBirth || data.Payload || null;
    } catch {
        return null;
    }
}

async function fetchChart(lat, lng, time, day, month, year, timezone, ayanamsa, style, chartType) {
    const url = `${VEDASTRO_API_BASE}/Calculate/${style}IndianChart/${chartType}Chart/Location/${lat},${lng}/Time/${time}/${day}/${month}/${year}/${timezone}/Ayanamsa/${ayanamsa}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image/svg')) {
            return await response.text();
        }

        const data = await response.json();
        return data.Payload || null;
    } catch {
        return null;
    }
}

// ========================================
// Display Functions
// ========================================
function displayPersonInfo(data) {
    document.getElementById('personName').textContent = data.name || 'Birth Chart';

    const date = new Date(data.birthDate);
    document.getElementById('displayDate').textContent = date.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    document.getElementById('displayTime').textContent = formatTime12Hour(data.birthTime);
    document.getElementById('displayPlace').textContent = data.birthPlace || `${data.latitude}, ${data.longitude}`;
}

function displayPlanetData(planetData) {
    const tbody = document.getElementById('planetTableBody');

    if (!planetData || typeof planetData !== 'object') {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No planet data available</td></tr>';
        return;
    }

    const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    let rows = '';

    planets.forEach(planet => {
        const pData = findPlanetData(planetData, planet);
        if (pData) {
            const sign = pData.PlanetZodiacSign?.Name || pData.ZodiacSign || '-';
            const degree = pData.PlanetLongitude?.DegreeMinuteSecond || pData.Longitude || '-';
            const nakshatra = pData.PlanetConstellation?.Name || pData.Constellation || '-';
            const pada = pData.PlanetConstellation?.Pada || pData.Pada || '-';
            const house = pData.HousePosition || pData.House || '-';
            const isRetro = pData.IsRetrograde || pData.Motion === 'Retrograde';

            const statusBadge = isRetro
                ? '<span class="status-badge retrograde">R</span>'
                : '<span class="status-badge direct">D</span>';

            rows += `
                <tr>
                    <td>${PLANET_SYMBOLS[planet] || ''} ${planet}</td>
                    <td>${sign}</td>
                    <td>${degree}</td>
                    <td>${nakshatra}</td>
                    <td>${pada}</td>
                    <td>${house}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = rows || '<tr><td colspan="7" class="loading-cell">No planet data available</td></tr>';
}

function findPlanetData(data, planetName) {
    if (Array.isArray(data)) {
        return data.find(p => p.Name === planetName || p.Planet === planetName || p.PlanetName === planetName);
    }

    if (typeof data === 'object') {
        for (const key of Object.keys(data)) {
            if (key.toLowerCase().includes(planetName.toLowerCase())) {
                return data[key];
            }
        }

        if (data[planetName]) return data[planetName];
    }

    return null;
}

function displayHouseData(houseData) {
    const tbody = document.getElementById('houseTableBody');

    if (!houseData || typeof houseData !== 'object') {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No house data available</td></tr>';
        return;
    }

    let rows = '';

    for (let i = 1; i <= 12; i++) {
        const houseName = `House${i}`;
        const hData = findHouseData(houseData, i);

        if (hData) {
            const sign = hData.ZodiacSign?.Name || hData.SignName || SIGN_NAMES[i] || '-';
            const degree = hData.BeginDegree || hData.Degree || '-';
            const lord = HOUSE_LORDS[sign] || '-';

            rows += `
                <tr>
                    <td>House ${i}</td>
                    <td>${sign}</td>
                    <td>${degree}</td>
                    <td>${lord}</td>
                </tr>
            `;
        } else {
            rows += `
                <tr>
                    <td>House ${i}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = rows;
}

function findHouseData(data, houseNum) {
    if (Array.isArray(data)) {
        return data.find(h =>
            h.HouseNumber === houseNum ||
            h.Number === houseNum ||
            h.Name === `House${houseNum}`
        );
    }

    if (typeof data === 'object') {
        const keys = [`House${houseNum}`, `house${houseNum}`, houseNum.toString()];
        for (const key of keys) {
            if (data[key]) return data[key];
        }
    }

    return null;
}

function displayDashaData(dashaData) {
    const container = document.getElementById('dashaContainer');

    if (!dashaData) {
        container.innerHTML = '<div class="dasha-loading">Dasha data not available for this API endpoint</div>';
        return;
    }

    let html = '';

    if (dashaData.Dasha) {
        html += createDashaLevel('Mahadasha', dashaData.Dasha);
    }
    if (dashaData.Bhukti) {
        html += createDashaLevel('Antardasha (Bhukti)', dashaData.Bhukti);
    }
    if (dashaData.Antaram) {
        html += createDashaLevel('Pratyantardasha', dashaData.Antaram);
    }

    if (html === '') {
        html = '<div class="dasha-loading">Dasha periods will appear here</div>';
    }

    container.innerHTML = html;
}

function createDashaLevel(title, data) {
    if (!data) return '';

    const planet = data.Planet || data.Name || data;
    const start = data.StartDate || '';
    const end = data.EndDate || '';
    const period = start && end ? `${formatDate(start)} - ${formatDate(end)}` : '';

    return `
        <div class="dasha-level">
            <div class="dasha-level-title">${title}</div>
            <div class="dasha-info">
                <span class="dasha-planet">${PLANET_SYMBOLS[planet] || ''} ${planet}</span>
                ${period ? `<span class="dasha-period">${period}</span>` : ''}
            </div>
        </div>
    `;
}

function displayChart(containerId, svgData) {
    const container = document.getElementById(containerId);

    if (!svgData) {
        container.innerHTML = '<div class="chart-loading">Chart not available</div>';
        return;
    }

    if (typeof svgData === 'string' && svgData.includes('<svg')) {
        container.innerHTML = svgData;
    } else if (svgData.Svg || svgData.svg) {
        container.innerHTML = svgData.Svg || svgData.svg;
    } else {
        container.innerHTML = '<div class="chart-loading">Chart format not supported</div>';
    }
}

function displayNakshatraDetails(planetData) {
    const container = document.getElementById('nakshatraDetails');

    const moonData = findPlanetData(planetData, 'Moon');

    if (!moonData) {
        container.innerHTML = '<div class="nakshatra-loading">Nakshatra details not available</div>';
        return;
    }

    const nakshatra = moonData.PlanetConstellation?.Name || moonData.Constellation || 'N/A';
    const nakshatraLord = moonData.PlanetConstellation?.Lord || getNakshatraLord(nakshatra);
    const pada = moonData.PlanetConstellation?.Pada || moonData.Pada || 'N/A';
    const moonSign = moonData.PlanetZodiacSign?.Name || moonData.ZodiacSign || 'N/A';

    container.innerHTML = `
        <div class="nakshatra-item">
            <div class="nakshatra-label">Moon Sign (Rashi)</div>
            <div class="nakshatra-value">${moonSign}</div>
        </div>
        <div class="nakshatra-item">
            <div class="nakshatra-label">Birth Nakshatra</div>
            <div class="nakshatra-value">${nakshatra}</div>
        </div>
        <div class="nakshatra-item">
            <div class="nakshatra-label">Nakshatra Lord</div>
            <div class="nakshatra-value">${nakshatraLord}</div>
        </div>
        <div class="nakshatra-item">
            <div class="nakshatra-label">Nakshatra Pada</div>
            <div class="nakshatra-value">${pada}</div>
        </div>
    `;
}

function getNakshatraLord(nakshatra) {
    const lords = {
        'Ashwini': 'Ketu', 'Bharani': 'Venus', 'Krittika': 'Sun',
        'Rohini': 'Moon', 'Mrigashira': 'Mars', 'Ardra': 'Rahu',
        'Punarvasu': 'Jupiter', 'Pushya': 'Saturn', 'Ashlesha': 'Mercury',
        'Magha': 'Ketu', 'Purva Phalguni': 'Venus', 'Uttara Phalguni': 'Sun',
        'Hasta': 'Moon', 'Chitra': 'Mars', 'Swati': 'Rahu',
        'Vishakha': 'Jupiter', 'Anuradha': 'Saturn', 'Jyeshtha': 'Mercury',
        'Mula': 'Ketu', 'Purva Ashadha': 'Venus', 'Uttara Ashadha': 'Sun',
        'Shravana': 'Moon', 'Dhanishta': 'Mars', 'Shatabhisha': 'Rahu',
        'Purva Bhadrapada': 'Jupiter', 'Uttara Bhadrapada': 'Saturn', 'Revati': 'Mercury'
    };
    return lords[nakshatra] || 'N/A';
}

// ========================================
// UI Helpers
// ========================================
function setLoading(isLoading) {
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    submitBtn.disabled = isLoading;
    btnText.style.display = isLoading ? 'none' : 'inline';
    btnLoader.style.display = isLoading ? 'flex' : 'none';
}

function showResults() {
    formSection.style.display = 'none';
    resultsSection.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showForm() {
    resultsSection.style.display = 'none';
    formSection.style.display = 'flex';
}

function showToast(message, type = 'error') {
    toastMessage.textContent = message;

    // Remove all type classes first
    errorToast.classList.remove('error', 'info', 'success');
    errorToast.classList.add(type);
    errorToast.classList.add('active');

    // Update icon based on type
    const toastIcon = errorToast.querySelector('.toast-icon');
    if (toastIcon) {
        const icons = { error: '⚠️', info: 'ℹ️', success: '✅' };
        toastIcon.textContent = icons[type] || '⚠️';
    }

    setTimeout(() => {
        errorToast.classList.remove('active');
    }, 4000);
}

function formatTime12Hour(time24) {
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

// ========================================
// PyJHora Local API Functions
// ========================================

function parseTimezoneOffset(tz) {
    // Convert "+05:30" to 5.5
    if (typeof tz === 'number') return tz;
    const match = tz.match(/([+-]?)(\d{2}):(\d{2})/);
    if (match) {
        const sign = match[1] === '-' ? -1 : 1;
        const hours = parseInt(match[2]);
        const minutes = parseInt(match[3]);
        return sign * (hours + minutes / 60);
    }
    return 5.5; // Default IST
}

async function fetchPyJhoraKundali(birthData) {
    const response = await fetch(`${PYJHORA_API_BASE}/api/kundali`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(birthData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch kundali data');
    }

    const result = await response.json();
    return result.data;
}

function displayPlanetDataLocal(planets) {
    const tbody = document.getElementById('planetTableBody');

    if (!planets || !Array.isArray(planets)) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No planet data available</td></tr>';
        return;
    }

    const planetOrder = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Ascendant'];
    let rows = '';

    planetOrder.forEach(planetName => {
        const pData = planets.find(p => p.name === planetName);
        if (pData) {
            const sign = pData.sign || '-';
            const degree = pData.degree !== undefined
                ? `${pData.degree}° ${pData.minute || 0}' ${pData.second || 0}"`
                : '-';
            const nakshatra = '-'; // PyJHora doesn't return nakshatra in this format yet
            const pada = '-';
            const house = '-'; // Would need house mapping
            const isRetro = pData.isRetrograde;

            const statusBadge = isRetro
                ? '<span class="status-badge retrograde">R</span>'
                : '<span class="status-badge direct">D</span>';

            rows += `
                <tr>
                    <td>${PLANET_SYMBOLS[planetName] || ''} ${planetName}</td>
                    <td>${sign}</td>
                    <td>${degree}</td>
                    <td>${nakshatra}</td>
                    <td>${pada}</td>
                    <td>${house}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = rows || '<tr><td colspan="7" class="loading-cell">No planet data available</td></tr>';
}

function displayHouseDataLocal(houses) {
    const tbody = document.getElementById('houseTableBody');

    if (!houses || !Array.isArray(houses)) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No house data available</td></tr>';
        return;
    }

    let rows = '';
    houses.forEach((house, index) => {
        const houseNum = house.house || (index + 1);
        const planets = house.planets || [];
        const planetStr = planets.length > 0 ? planets.join(', ') : '-';

        // Get sign from ascendant position (house 1 = ascendant sign, then follow zodiac)
        const signIndex = (index) % 12;
        const signName = Object.values(SIGN_NAMES)[signIndex] || '-';
        const lord = HOUSE_LORDS[signName] || '-';

        rows += `
            <tr>
                <td>House ${houseNum}</td>
                <td>${planetStr}</td>
                <td>${signName}</td>
                <td>${lord}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows || '<tr><td colspan="4" class="loading-cell">No house data available</td></tr>';
}

function displayCalendarInfo(calendar) {
    // Display panchanga/calendar info if available
    const dashaContainer = document.getElementById('dashaTableBody');
    if (!calendar || !dashaContainer) return;

    let rows = '';
    const displayKeys = ['Tithi', 'Nakshatram', 'Yoga', 'Karana', 'Day', 'Sun Rise', 'Sun Set'];

    displayKeys.forEach(key => {
        if (calendar[key]) {
            rows += `
                <tr>
                    <td colspan="2" style="font-weight: 600">${key}</td>
                    <td colspan="2">${calendar[key]}</td>
                </tr>
            `;
        }
    });

    if (rows) {
        dashaContainer.innerHTML = rows;
    }
}

function displayChartLocal(chartId, houses, style) {
    const container = document.getElementById(chartId);
    if (!container) return;

    // Create a simple text-based chart representation
    const chartHtml = generateSimpleChart(houses, style);
    container.innerHTML = chartHtml;
}

function generateSimpleChart(houses, style) {
    if (!houses || !Array.isArray(houses)) {
        return '<div class="chart-placeholder">Chart unavailable</div>';
    }

    // Create a grid-based chart
    let html = '<div class="simple-chart">';

    if (style === 'South') {
        // South Indian style - 4x4 grid
        const southLayout = [
            [12, 1, 2, 3],
            [11, null, null, 4],
            [10, null, null, 5],
            [9, 8, 7, 6]
        ];

        html += '<div class="chart-grid south-chart">';
        southLayout.forEach(row => {
            row.forEach(houseNum => {
                if (houseNum === null) {
                    html += '<div class="chart-cell center-cell"></div>';
                } else {
                    const house = houses.find(h => h.house === houseNum) || { planets: [] };
                    const planets = house.planets || [];
                    html += `<div class="chart-cell">
                        <span class="house-num">${houseNum}</span>
                        <span class="planet-list">${planets.join(' ')}</span>
                    </div>`;
                }
            });
        });
        html += '</div>';
    } else {
        // North Indian style - diamond pattern (simplified as list)
        html += '<div class="chart-grid north-chart">';
        for (let i = 1; i <= 12; i++) {
            const house = houses.find(h => h.house === i) || { planets: [] };
            const planets = house.planets || [];
            html += `<div class="chart-cell">
                <span class="house-num">${i}</span>
                <span class="planet-list">${planets.join(' ')}</span>
            </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function displayNakshatraDetailsLocal(planets) {
    const tbody = document.getElementById('nakshatraTableBody');
    if (!tbody) return;

    // PyJHora kundali endpoint doesn't return detailed nakshatra info yet
    // Display karakas if available
    let rows = '';

    if (planets && Array.isArray(planets)) {
        planets.forEach(p => {
            if (p.karaka) {
                rows += `
                    <tr>
                        <td>${PLANET_SYMBOLS[p.name] || ''} ${p.name}</td>
                        <td>${p.karaka}</td>
                        <td>${p.sign || '-'}</td>
                        <td>${p.totalDegree ? p.totalDegree.toFixed(2) + '°' : '-'}</td>
                    </tr>
                `;
            }
        });
    }

    tbody.innerHTML = rows || '<tr><td colspan="4" class="loading-cell">Karaka data shown above</td></tr>';
}

// Ashtakavarga Functions
async function fetchPyJhoraAshtakavarga(birthData) {
    try {
        const response = await fetch(`${PYJHORA_API_BASE}/api/ashtakavarga`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(birthData)
        });

        if (!response.ok) {
            console.warn('Ashtakavarga fetch failed');
            return null;
        }

        const result = await response.json();
        return result.ashtakavarga;
    } catch (error) {
        console.error('Ashtakavarga error:', error);
        return null;
    }
}

function displayAshtakavargaLocal(ashtakavarga) {
    const tbody = document.getElementById('ashtakavargaTableBody');
    const summaryDiv = document.getElementById('sarvashtakavargaSummary');
    const savTotalSpan = document.getElementById('savTotal');

    if (!tbody) return;

    if (!ashtakavarga || !ashtakavarga.bhinnashtakavarga) {
        tbody.innerHTML = '<tr><td colspan="14" class="loading-cell">Ashtakavarga data unavailable</td></tr>';
        return;
    }

    const bav = ashtakavarga.bhinnashtakavarga;
    const sav = ashtakavarga.sarvashtakavarga;
    const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

    let rows = '';

    // Display Bhinnashtakavarga for each planet
    planets.forEach(planet => {
        if (bav[planet]) {
            const points = bav[planet].points;
            const total = bav[planet].total;

            rows += `<tr>
                <td><strong>${PLANET_SYMBOLS[planet] || ''} ${planet}</strong></td>
                ${points.map(p => `<td class="${p >= 4 ? 'highlight-good' : p <= 2 ? 'highlight-bad' : ''}">${p}</td>`).join('')}
                <td><strong>${total}</strong></td>
            </tr>`;
        }
    });

    // Add Sarvashtakavarga row
    if (sav && sav.points) {
        rows += `<tr class="sav-row">
            <td><strong>SAV</strong></td>
            ${sav.points.map(p => `<td class="${p >= 28 ? 'highlight-good' : p <= 22 ? 'highlight-bad' : ''}">${p}</td>`).join('')}
            <td><strong>${sav.total}</strong></td>
        </tr>`;

        // Show summary
        if (summaryDiv && savTotalSpan) {
            savTotalSpan.textContent = sav.total;
            summaryDiv.style.display = 'block';
        }
    }

    tbody.innerHTML = rows || '<tr><td colspan="14" class="loading-cell">No data</td></tr>';
}

// ========================================
// Complete API Functions
// ========================================

async function fetchPyJhoraComplete(birthData) {
    const response = await fetch(`${PYJHORA_API_BASE}/api/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(birthData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch complete data');
    }

    const result = await response.json();
    return result.data;
}

function displayPlanetDataFromComplete(rasiChart) {
    const tbody = document.getElementById('planetTableBody');
    if (!tbody || !rasiChart) return;

    const planetOrder = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Ascendant'];
    let rows = '';

    planetOrder.forEach(planetName => {
        const pData = rasiChart.find(p => p.planet === planetName);
        if (pData) {
            const degree = pData.degree ? `${Math.floor(pData.degree)}° ${Math.floor((pData.degree % 1) * 60)}' ${Math.floor((((pData.degree % 1) * 60) % 1) * 60)}"` : '-';
            const nakshatra = pData.nakshatra || '-';
            const pada = pData.pada || '-';
            const house = pData.house || '-';
            const isRetro = pData.isRetrograde;

            const statusBadge = isRetro
                ? '<span class="status-badge retrograde">R</span>'
                : '<span class="status-badge direct">D</span>';

            rows += `
                <tr>
                    <td>${PLANET_SYMBOLS[planetName] || ''} ${planetName}</td>
                    <td>${pData.sign || '-'}</td>
                    <td>${degree}</td>
                    <td>${nakshatra}</td>
                    <td>${pada}</td>
                    <td>${house}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = rows || '<tr><td colspan="7" class="loading-cell">No planet data</td></tr>';
}

function displayHouseDataFromComplete(bhavaChalit) {
    const tbody = document.getElementById('houseTableBody');
    if (!tbody || !bhavaChalit) return;

    // Calculate sign for each house based on cusp degree
    const signNames = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
        'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

    const houseLords = {
        'Aries': 'Mars', 'Taurus': 'Venus', 'Gemini': 'Mercury', 'Cancer': 'Moon',
        'Leo': 'Sun', 'Virgo': 'Mercury', 'Libra': 'Venus', 'Scorpio': 'Mars',
        'Sagittarius': 'Jupiter', 'Capricorn': 'Saturn', 'Aquarius': 'Saturn', 'Pisces': 'Jupiter'
    };

    let rows = '';
    bhavaChalit.forEach(house => {
        const planetStr = house.planets && house.planets.length > 0 ? house.planets.join(', ') : '-';

        // Calculate sign from mid-degree
        const midDeg = house.midDegree || 0;
        const signIndex = Math.floor(midDeg / 30) % 12;
        const sign = signNames[signIndex];
        const lord = houseLords[sign] || '-';

        // Format degree as D° M' S" (degree within sign)
        const degreeInSign = midDeg % 30;
        const d = Math.floor(degreeInSign);
        const mFloat = (degreeInSign - d) * 60;
        const m = Math.floor(mFloat);
        const s = Math.floor((mFloat - m) * 60);
        const degreeFormatted = `${d}° ${m}' ${s}"`;

        rows += `
            <tr>
                <td>House ${house.house}</td>
                <td>${sign}</td>
                <td>${degreeFormatted}</td>
                <td>${lord}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted)">${planetStr}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rows || '<tr><td colspan="5" class="loading-cell">No house data</td></tr>';
}

function displayChartFromComplete(chartId, chartData, style) {
    const container = document.getElementById(chartId);
    if (!container || !chartData) return;

    // Build house-to-planets mapping
    const houseData = [];
    for (let i = 0; i < 12; i++) {
        houseData.push({ house: i + 1, planets: [] });
    }

    chartData.forEach(p => {
        const houseNum = p.signIndex;
        if (houseNum >= 0 && houseNum < 12) {
            houseData[houseNum].planets.push(p.planet);
        }
    });

    const chartHtml = generateSimpleChart(houseData, style);
    container.innerHTML = chartHtml;
}

function displayShadbalaData(shadbala) {
    const container = document.getElementById('nakshatraDetails');
    if (!container || !shadbala) return;

    const labels = ['Sthana', 'Dig', 'Kaala', 'Cheshta', 'Naisargika', 'Drik', 'Total'];

    let html = '<div class="shadbala-container"><h4 style="margin-bottom: 1rem;">Shadbala (Planetary Strength)</h4>';
    html += '<table class="data-table"><thead><tr><th>Planet</th>';
    labels.forEach(l => html += `<th>${l}</th>`);
    html += '</tr></thead><tbody>';

    Object.entries(shadbala).forEach(([planet, data]) => {
        if (data && data.total) {
            const values = Array.isArray(data.total) ? data.total : [data.total];
            html += `<tr><td><strong>${PLANET_SYMBOLS[planet] || ''} ${planet}</strong></td>`;
            values.forEach(v => html += `<td>${typeof v === 'number' ? v.toFixed(1) : v}</td>`);
            // Fill remaining cells if less than 7 values
            for (let i = values.length; i < 7; i++) html += '<td>-</td>';
            html += '</tr>';
        }
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function displayDivisionalCharts(charts) {
    const dashaContainer = document.getElementById('dashaContainer');
    if (!dashaContainer) return;

    let html = '<div class="divisional-charts">';

    // D3 Drekkana
    if (charts.d3_drekkana) {
        html += '<div class="div-chart-section">';
        html += '<h4>D3 - Drekkana (Siblings/Courage)</h4>';
        html += '<div class="mini-planet-list">';
        charts.d3_drekkana.forEach(p => {
            html += `<span class="mini-planet">${p.planet}: ${p.sign}</span>`;
        });
        html += '</div></div>';
    }

    // D12 Dwadashamsha
    if (charts.d12_dwadashamsha) {
        html += '<div class="div-chart-section">';
        html += '<h4>D12 - Dwadashamsha (Parents/Lineage)</h4>';
        html += '<div class="mini-planet-list">';
        charts.d12_dwadashamsha.forEach(p => {
            html += `<span class="mini-planet">${p.planet}: ${p.sign}</span>`;
        });
        html += '</div></div>';
    }

    // D60 Shashtiamsha
    if (charts.d60_shashtiamsha) {
        html += '<div class="div-chart-section">';
        html += '<h4>D60 - Shashtiamsha (Past Life Karma)</h4>';
        html += '<div class="mini-planet-list">';
        charts.d60_shashtiamsha.forEach(p => {
            html += `<span class="mini-planet">${p.planet}: ${p.sign}</span>`;
        });
        html += '</div></div>';
    }

    html += '</div>';
    dashaContainer.innerHTML = html;
}

// ========================================
// Export Functions
// ========================================

function exportToMarkdown() {
    if (!currentKundaliData) {
        showToast('No data to export. Generate a Kundali first.');
        return;
    }

    const d = currentKundaliData;
    const f = d.formData || {};
    const birth = d.birthData || {};

    let md = `# Vedic Kundali Report\n\n`;
    md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    md += `---\n\n`;

    // Birth Details
    md += `## Birth Details\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Name | ${f.name || birth.name || '-'} |\n`;
    md += `| Date | ${birth.date || '-'} |\n`;
    md += `| Time | ${birth.time || '-'} |\n`;
    md += `| Place | ${f.birthPlace || '-'} |\n`;
    md += `| Latitude | ${birth.latitude || '-'} |\n`;
    md += `| Longitude | ${birth.longitude || '-'} |\n`;
    md += `| Timezone | ${birth.timezone || '-'} |\n`;
    md += `| Ayanamsa | ${birth.ayanamsa || '-'} |\n\n`;

    // 3 Key Rashis
    if (d.charts?.rasi) {
        const ascendant = d.charts.rasi.find(p => p.planet === 'Ascendant');
        const moon = d.charts.rasi.find(p => p.planet === 'Moon');
        const sun = d.charts.rasi.find(p => p.planet === 'Sun');

        md += `## Primary Rashis (Key Signs)\n\n`;
        md += `| Concept | Sign | Meaning |\n|---------|------|---------|\n`;
        if (ascendant) md += `| **Lagna Rashi** | ${ascendant.sign} | Physical Body & Self (Ascendant) |\n`;
        if (moon) md += `| **Chandra Rashi** | ${moon.sign} | Mind & Emotions (Moon Sign) |\n`;
        if (sun) md += `| **Surya Rashi** | ${sun.sign} | Soul & Authority (Sun Sign) |\n`;
        md += `\n`;
    }

    // D1 Rasi Chart
    md += `## D1 - Rasi Chart (Lagna)\n\n`;
    md += `| Planet | Sign | Degree |\n|--------|------|--------|\n`;
    if (d.charts?.rasi) {
        d.charts.rasi.forEach(p => {
            md += `| ${p.planet} | ${p.sign} | ${p.degree?.toFixed(2)}° |\n`;
        });
    }
    md += `\n`;

    // D9 Navamsa
    md += `## D9 - Navamsa Chart\n\n`;
    md += `| Planet | Sign | Degree |\n|--------|------|--------|\n`;
    if (d.charts?.d9_navamsa) {
        d.charts.d9_navamsa.forEach(p => {
            md += `| ${p.planet} | ${p.sign} | ${p.degree?.toFixed(2)}° |\n`;
        });
    }
    md += `\n`;

    // Bhava Chalit
    md += `## Bhava Chalit (House Cusps)\n\n`;
    md += `| House | Planets | Mid Degree |\n|-------|---------|------------|\n`;
    if (d.charts?.bhavaChalit) {
        d.charts.bhavaChalit.forEach(h => {
            const planets = h.planets?.join(', ') || '-';
            md += `| ${h.house} | ${planets} | ${h.midDegree}° |\n`;
        });
    }
    md += `\n`;

    // Ashtakavarga
    md += `## Ashtakavarga\n\n`;
    if (d.ashtakavarga?.bhinnashtakavarga) {
        md += `### Bhinnashtakavarga (Individual Planet Points)\n\n`;
        md += `| Planet | Ari | Tau | Gem | Can | Leo | Vir | Lib | Sco | Sag | Cap | Aqu | Pis | Total |\n`;
        md += `|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-------|\n`;
        Object.entries(d.ashtakavarga.bhinnashtakavarga).forEach(([planet, data]) => {
            if (data.points) {
                md += `| ${planet} | ${data.points.join(' | ')} | ${data.total} |\n`;
            }
        });
        md += `\n`;

        if (d.ashtakavarga.sarvashtakavarga) {
            md += `### Sarvashtakavarga Total: **${d.ashtakavarga.sarvashtakavarga.total}**\n\n`;
        }
    }

    // Shadbala
    md += `## Shadbala (Planetary Strength)\n\n`;
    md += `| Planet | Strength Values |\n|--------|-----------------|\n`;
    if (d.shadbala) {
        Object.entries(d.shadbala).forEach(([planet, data]) => {
            const values = Array.isArray(data.total) ? data.total.map(v => v.toFixed(1)).join(', ') : data.total;
            md += `| ${planet} | ${values} |\n`;
        });
    }
    md += `\n`;

    // Divisional Charts
    const divCharts = [
        { key: 'd3_drekkana', name: 'D3 - Drekkana (Siblings/Courage)' },
        { key: 'd12_dwadashamsha', name: 'D12 - Dwadashamsha (Parents/Lineage)' },
        { key: 'd45_akshavedamsha', name: 'D45 - Akshavedamsha (Character/Ethics)' },
        { key: 'd60_shashtiamsha', name: 'D60 - Shashtiamsha (Past Life Karma)' }
    ];

    divCharts.forEach(chart => {
        if (d.charts?.[chart.key]) {
            md += `## ${chart.name}\n\n`;
            md += `| Planet | Sign |\n|--------|------|\n`;
            d.charts[chart.key].forEach(p => {
                md += `| ${p.planet} | ${p.sign} |\n`;
            });
            md += `\n`;
        }
    });

    // NEW: Planetary Dignity & Combustion
    md += `## Planetary Dignity & Combustion\n\n`;
    md += `| Planet | Dignity | Sun Distance | Combust |\n|--------|---------|--------------|--------|\n`;
    if (d.dignity) {
        Object.entries(d.dignity).forEach(([planet, data]) => {
            const dist = data.sunDistance !== null ? `${data.sunDistance}°` : '-';
            const combust = data.isCombust ? '🔥 YES' : 'No';
            md += `| ${planet} | ${data.dignity} | ${dist} | ${combust} |\n`;
        });
    }
    md += `\n`;

    // NEW: Bhava Bala
    md += `## Bhava Bala (House Strength)\n\n`;
    md += `| House | Strength | Ratio | Status |\n|-------|----------|-------|--------|\n`;
    if (d.bhavaBala) {
        for (let i = 1; i <= 12; i++) {
            const house = d.bhavaBala[`House ${i}`];
            if (house) {
                const status = house.ratio >= 1.1 ? 'Strong' : house.ratio >= 0.9 ? 'Average' : 'Weak';
                md += `| House ${i} | ${house.strength} | ${house.ratio}x | ${status} |\n`;
            }
        }
    }
    md += `\n`;

    // NEW: Chara Karakas
    md += `## Chara Karakas (Jaimini)\n\n`;
    md += `| Karaka | House |\n|--------|-------|\n`;
    if (d.charaKarakas) {
        Object.entries(d.charaKarakas).forEach(([name, data]) => {
            md += `| ${name} | House ${data.house} |\n`;
        });
    }
    md += `\n`;

    // NEW: Special Lagnas
    md += `## Special Lagnas\n\n`;
    md += `| Lagna | House |\n|-------|-------|\n`;
    if (d.specialLagnas) {
        Object.entries(d.specialLagnas).forEach(([name, data]) => {
            md += `| ${name} | House ${data.house} |\n`;
        });
    }
    md += `\n`;

    // NEW: Sphutas
    md += `## Sphutas (Sensitive Points)\n\n`;
    md += `| Sphuta | House |\n|--------|-------|\n`;
    if (d.sphutas) {
        Object.entries(d.sphutas).forEach(([name, data]) => {
            md += `| ${name} | House ${data.house} |\n`;
        });
    }
    md += `\n`;

    md += `---\n\n`;
    md += `*Generated by Vedic Kundali Generator using PyJHora*\n`;

    // Download the file
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kundali_${(f.name || 'report').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Markdown report downloaded!', 'success');
}

function exportToPdf() {
    window.print();
}

// ========================================
// New Feature Display Functions
// ========================================

function displayDignityData(dignity) {
    const tbody = document.getElementById('dignityTableBody');
    if (!tbody || !dignity) return;

    const planetOrder = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
    let rows = '';

    planetOrder.forEach(planet => {
        const d = dignity[planet];
        if (d) {
            const dignityClass = `dignity-${d.dignity.toLowerCase().replace(' ', '')}`;
            const dignityBadge = `<span class="dignity-badge ${dignityClass}">${d.dignity}</span>`;

            const sunDist = d.sunDistance !== null ? `${d.sunDistance}°` : '-';

            const combustBadge = d.isCombust
                ? '<span class="combust-badge">🔥 COMBUST</span>'
                : '<span class="safe-badge">Safe</span>';

            rows += `
                <tr>
                    <td>${PLANET_SYMBOLS[planet] || ''} ${planet}</td>
                    <td>${dignityBadge}</td>
                    <td>${sunDist}</td>
                    <td>${planet === 'Sun' ? '-' : combustBadge}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = rows || '<tr><td colspan="4" class="loading-cell">No data</td></tr>';
}

function displayBhavaBalaData(bhavaBala) {
    const tbody = document.getElementById('bhavaBalaTableBody');
    if (!tbody || !bhavaBala) return;

    // Find max strength for scaling
    const strengths = Object.values(bhavaBala).map(h => h.strength);
    const maxStrength = Math.max(...strengths);

    let rows = '';
    for (let i = 1; i <= 12; i++) {
        const house = bhavaBala[`House ${i}`];
        if (house) {
            const pct = (house.strength / maxStrength) * 100;
            const strengthClass = house.ratio >= 1.1 ? 'strength-strong' :
                house.ratio >= 0.9 ? 'strength-medium' : 'strength-weak';
            const status = house.ratio >= 1.1 ? 'Strong' :
                house.ratio >= 0.9 ? 'Average' : 'Weak';

            rows += `
                <tr>
                    <td>House ${i}</td>
                    <td>
                        <div class="strength-bar">
                            <div class="strength-fill ${strengthClass}" style="width: ${pct}%"></div>
                        </div>
                        ${house.strength}
                    </td>
                    <td>${house.ratio}x</td>
                    <td><span class="dignity-badge ${strengthClass.replace('strength-', 'dignity-').replace('strong', 'exalted').replace('medium', 'neutral').replace('weak', 'debilitated')}">${status}</span></td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = rows || '<tr><td colspan="4" class="loading-cell">No data</td></tr>';
}

function displayCharaKarakas(karakas) {
    const container = document.getElementById('charaKarakasContainer');
    if (!container || !karakas) return;

    let html = '';
    Object.entries(karakas).forEach(([name, data]) => {
        html += `
            <div class="karaka-item">
                <span class="karaka-name">${name}</span>
                <span class="karaka-house">House ${data.house}</span>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="loading-cell">No karaka data</div>';
}

function displaySpecialLagnas(lagnas) {
    const container = document.getElementById('specialLagnasContainer');
    if (!container || !lagnas) return;

    let html = '';
    Object.entries(lagnas).forEach(([name, data]) => {
        html += `
            <div class="lagna-item">
                <span class="lagna-name">${name}</span>
                <span class="lagna-house">House ${data.house}</span>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="loading-cell">No lagna data</div>';
}

function displayThreeRashis(rasiChart) {
    if (!rasiChart) return;

    const signSymbols = {
        'Aries': '♈ Aries', 'Taurus': '♉ Taurus', 'Gemini': '♊ Gemini',
        'Cancer': '♋ Cancer', 'Leo': '♌ Leo', 'Virgo': '♍ Virgo',
        'Libra': '♎ Libra', 'Scorpio': '♏ Scorpio', 'Sagittarius': '♐ Sagittarius',
        'Capricorn': '♑ Capricorn', 'Aquarius': '♒ Aquarius', 'Pisces': '♓ Pisces'
    };

    // Find Ascendant, Moon, and Sun
    const ascendant = rasiChart.find(p => p.planet === 'Ascendant');
    const moon = rasiChart.find(p => p.planet === 'Moon');
    const sun = rasiChart.find(p => p.planet === 'Sun');

    const lagnaRashiEl = document.getElementById('lagnaRashi');
    const chandraRashiEl = document.getElementById('chandraRashi');
    const suryaRashiEl = document.getElementById('suryaRashi');

    if (lagnaRashiEl && ascendant) {
        lagnaRashiEl.textContent = signSymbols[ascendant.sign] || ascendant.sign;
    }
    if (chandraRashiEl && moon) {
        chandraRashiEl.textContent = signSymbols[moon.sign] || moon.sign;
    }
    if (suryaRashiEl && sun) {
        suryaRashiEl.textContent = signSymbols[sun.sign] || sun.sign;
    }
}
