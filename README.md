# Vedic Kundali Generator

A comprehensive Vedic astrology birth chart generator powered by **PyJHora**.

![Vedic Kundali Generator](https://img.shields.io/badge/Vedic-Astrology-purple)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **D1 Rasi Chart** - Lagna chart with all 9 planets + Ascendant
- **D9 Navamsa Chart** - Spouse and dharma chart
- **Bhava Chalit** - Equal house system with cusp degrees
- **Divisional Charts** - D3, D12, D45, D60
- **Ashtakavarga** - Bhinnashtakavarga + Sarvashtakavarga (337 points)
- **Shadbala** - 6-fold planetary strength
- **Nakshatra & Pada** - Full nakshatra details for all planets
- **Retrograde Detection** - Accurate planetary motion status
- **Export** - Markdown and PDF export options

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js (optional, for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/vedic-kundali-generator.git
cd vedic-kundali-generator

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install pyjhora fastapi uvicorn requests

# Start the API server
python api_server.py
```

### Running the App

1. Start the API server:
```bash
python api_server.py
```

2. In another terminal, serve the frontend:
```bash
python3 -m http.server 8080
```

3. Open http://localhost:8080 in your browser

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/complete` | POST | Get all charts and data in one call |
| `/api/kundali` | POST | Basic birth chart |
| `/api/ashtakavarga` | POST | Ashtakavarga scores |
| `/api/shadbala` | POST | Planetary strength |
| `/api/dasha` | POST | Vimshottari Dasha |

### Example Request

```bash
curl -X POST "http://localhost:8000/api/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "year": 2004, "month": 1, "day": 21,
    "hour": 13, "minute": 10, "second": 0,
    "latitude": 23.2585, "longitude": 77.4020,
    "timezone": 5.5, "ayanamsa": "LAHIRI"
  }'
```

## 🛠️ Tech Stack

- **Backend**: FastAPI + PyJHora
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Calculations**: PyJHora (Swiss Ephemeris based)

## 📁 Project Structure

```
├── api_server.py      # FastAPI backend
├── app.js             # Frontend JavaScript
├── index.html         # Main HTML page
├── styles.css         # Styling
├── requirements.txt   # Python dependencies
└── README.md
```

## 🔮 Supported Ayanamsas

- Lahiri (Indian Standard)
- KP (Krishnamurti)
- True Citra
- B.V. Raman
- Yukteshwar
- Fagan
- And more...

## 📝 License

MIT License - feel free to use for personal and commercial projects.

## 🙏 Acknowledgments

- [PyJHora](https://github.com/naturalstupid/PyJHora) - Core astrological calculations
- Swiss Ephemeris - Planetary positions

---

Made with ❤️ for the Vedic Astrology community
