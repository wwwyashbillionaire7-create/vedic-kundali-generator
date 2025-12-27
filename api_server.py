"""
Vedic Kundali API Server
Uses PyJHora for comprehensive astrological calculations
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback
import re

# PyJHora imports
from jhora.horoscope.main import Horoscope
from jhora.panchanga.drik import Date
from jhora.horoscope.chart import charts, strength, ashtakavarga
from jhora.panchanga import drik
from jhora import utils

app = FastAPI(
    title="Vedic Kundali API",
    description="Open-source Kundali generation API using PyJHora",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BirthData(BaseModel):
    name: str
    year: int
    month: int
    day: int
    hour: int
    minute: int
    second: int = 0
    latitude: float
    longitude: float
    timezone: float = 5.5
    ayanamsa: str = "LAHIRI"


PLANET_SYMBOLS = {
    'Sun☉': 'Sun', 'Moon☾': 'Moon', 'Mars♂': 'Mars',
    'Mercury☿': 'Mercury', 'Jupiter♃': 'Jupiter', 'Venus♀': 'Venus',
    'Saturn♄': 'Saturn', 'Raagu☊': 'Rahu', 'Kethu☋': 'Ketu',
    'Ascendantℒ': 'Ascendant'
}

SIGN_SYMBOLS = {
    '♈︎': 'Aries', '♉︎': 'Taurus', '♊︎': 'Gemini', '♋︎': 'Cancer',
    '♌︎': 'Leo', '♍︎': 'Virgo', '♎︎': 'Libra', '♏︎': 'Scorpio',
    '♐︎': 'Sagittarius', '♑︎': 'Capricorn', '♒︎': 'Aquarius', '♓︎': 'Pisces'
}

NAKSHATRA_NAMES = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
]

# Planetary Dignity - Sign indices
EXALTED_SIGNS = {0: 0, 1: 1, 2: 9, 3: 5, 4: 3, 5: 11, 6: 6}  # Sun=Aries, Moon=Taurus...
DEBILITATED_SIGNS = {0: 6, 1: 7, 2: 3, 3: 11, 4: 9, 5: 5, 6: 0}
OWN_SIGNS = {0: [4], 1: [3], 2: [0, 7], 3: [2, 5], 4: [8, 11], 5: [1, 6], 6: [9, 10]}
MOOLATRIKONA_SIGNS = {0: 4, 1: 1, 2: 0, 3: 5, 4: 8, 5: 6, 6: 10}

# Combustion degrees from Sun
COMBUSTION_DEGREES = {1: 12, 2: 17, 3: 14, 4: 11, 5: 10, 6: 15}

# Chara Karaka names
KARAKA_NAMES = {
    'AK': 'Atmakaraka', 'AmK': 'Amatyakaraka', 'BK': 'Bhratrikaraka',
    'MK': 'Matrikaraka', 'PuK': 'Putrakaraka', 'GK': 'Gnatikaraka',
    'DK': 'Darakaraka', 'PiK': 'Pitrikaraka', 'JK': 'Jaimini Karaka'
}

# Special Lagna names
SPECIAL_LAGNA_NAMES = {
    'BL': 'Bhava Lagna', 'HL': 'Hora Lagna', 'GL': 'Ghati Lagna',
    'VL': 'Varnada Lagna', 'SL': 'Shree Lagna', 'PL': 'Pranapada Lagna',
    'IL': 'Indu Lagna', 'KL': 'Karakamsha Lagna', 'BB': 'Bhrigu Bindu'
}



def parse_position(pos_str):
    """Parse position string like '♑︎Capricorn 1° 3' 56\"' into structured data"""
    result = {'raw': pos_str}
    
    # Extract sign
    for sym, name in SIGN_SYMBOLS.items():
        if sym in pos_str or name in pos_str:
            result['sign'] = name
            break
    
    # Extract degrees: pattern matches "X° Y' Z" or similar
    deg_match = re.search(r'(\d+)\u00b0\s*(\d+)\D+(\d+)', pos_str)
    if deg_match:
        result['degree'] = int(deg_match.group(1))
        result['minute'] = int(deg_match.group(2))
        result['second'] = int(deg_match.group(3))
        result['totalDegree'] = round(result['degree'] + result['minute']/60 + result['second']/3600, 4)
    
    # Check retrograde
    result['isRetrograde'] = '℞' in pos_str
    
    # Extract Karaka
    if 'Karaka' in pos_str:
        karaka_match = re.search(r'\(([^)]+Karaka)\)', pos_str)
        if karaka_match:
            result['karaka'] = karaka_match.group(1)
    
    return result


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Vedic Kundali API powered by PyJHora",
        "version": "1.0.0",
        "endpoints": ["/api/kundali", "/api/planets", "/api/ashtakavarga", "/api/shadbala", "/api/dasha"]
    }


@app.post("/api/kundali")
async def get_complete_kundali(data: BirthData):
    """Get complete Kundali data"""
    try:
        h = Horoscope(
            latitude=data.latitude,
            longitude=data.longitude,
            timezone_offset=data.timezone,
            date_in=Date(data.year, data.month, data.day),
            birth_time=f'{data.hour:02d}:{data.minute:02d}:{data.second:02d}',
            ayanamsa_mode=data.ayanamsa.upper()
        )
        
        info = h.get_horoscope_information()
        chart_info = h.get_horoscope_information_for_chart()
        
        # Parse planets
        planets = []
        for sym, name in PLANET_SYMBOLS.items():
            key = f'Raasi-{sym}'
            if key in info[0]:
                pos = parse_position(info[0][key])
                pos['name'] = name
                planets.append(pos)
        
        # Parse houses from chart_info[1]
        houses = []
        house_list = chart_info[1]
        for i, planet_str in enumerate(house_list):
            houses.append({
                'house': i + 1,
                'planets': [p.strip().replace('℞', '').replace('\n', '') for p in planet_str.split('\n') if p.strip()]
            })
        
        return {
            "status": "success",
            "data": {
                "name": data.name,
                "birthData": {
                    "date": f"{data.year}-{data.month:02d}-{data.day:02d}",
                    "time": f"{data.hour:02d}:{data.minute:02d}:{data.second:02d}",
                    "latitude": data.latitude,
                    "longitude": data.longitude,
                    "timezone": data.timezone,
                    "ayanamsa": data.ayanamsa
                },
                "planets": planets,
                "houses": houses,
                "calendar": h.calendar_info,
                "ascendant": chart_info[2] if len(chart_info) > 2 else None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}\n{traceback.format_exc()}")


@app.post("/api/planets")
async def get_planets(data: BirthData):
    """Get planetary positions"""
    try:
        h = Horoscope(
            latitude=data.latitude,
            longitude=data.longitude,
            timezone_offset=data.timezone,
            date_in=Date(data.year, data.month, data.day),
            birth_time=f'{data.hour:02d}:{data.minute:02d}:{data.second:02d}',
            ayanamsa_mode=data.ayanamsa.upper()
        )
        
        info = h.get_horoscope_information()
        planets = []
        
        for sym, name in PLANET_SYMBOLS.items():
            key = f'Raasi-{sym}'
            if key in info[0]:
                pos = parse_position(info[0][key])
                pos['name'] = name
                planets.append(pos)
        
        return {"status": "success", "planets": planets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ashtakavarga")
async def get_ashtakavarga_data(data: BirthData):
    """Get Ashtakavarga (Bhinnashtakavarga and Sarvashtakavarga)"""
    try:
        drik.set_ayanamsa_mode(data.ayanamsa.upper())
        place = drik.Place('Birth', data.latitude, data.longitude, data.timezone)
        dob = (data.year, data.month, data.day)
        tob = (data.hour, data.minute, data.second)
        jd = utils.julian_day_number(dob, tob)
        
        # Get rasi chart
        rasi = charts.rasi_chart(jd, place)
        
        # Convert to house_to_planet format expected by ashtakavarga
        house_to_planet = ['' for _ in range(12)]
        for item in rasi:
            planet_id = item[0]
            house = item[1][0]
            planet_str = 'L' if planet_id == 'L' else str(planet_id)
            
            if house_to_planet[house]:
                house_to_planet[house] += '/' + planet_str
            else:
                house_to_planet[house] = planet_str
        
        # Calculate Ashtakavarga
        bav, sav, pav = ashtakavarga.get_ashtaka_varga(house_to_planet)
        
        # Format results
        planet_names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Ascendant']
        sign_names = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
        
        bhinnashtakavarga = {}
        for i, name in enumerate(planet_names):
            if i < len(bav):
                bhinnashtakavarga[name] = {
                    "points": bav[i],
                    "total": sum(bav[i]),
                    "bySign": {sign_names[j]: bav[i][j] for j in range(12)}
                }
        
        sarvashtakavarga = {
            "points": sav,
            "total": sum(sav),
            "bySign": {sign_names[i]: sav[i] for i in range(12)}
        }
        
        return {
            "status": "success",
            "ashtakavarga": {
                "bhinnashtakavarga": bhinnashtakavarga,
                "sarvashtakavarga": sarvashtakavarga
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}\n{traceback.format_exc()}")


@app.post("/api/shadbala")
async def get_shadbala(data: BirthData):
    """Get Shadbala (planetary strength)"""
    try:
        drik.set_ayanamsa_mode(data.ayanamsa.upper())
        place = drik.Place('Birth', data.latitude, data.longitude, data.timezone)
        dob = (data.year, data.month, data.day)
        tob = (data.hour, data.minute, data.second)
        jd = utils.julian_day_number(dob, tob)
        
        sb = strength.shad_bala(jd, place)
        
        planet_names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
        result = {}
        
        if sb:
            for i, name in enumerate(planet_names):
                if i < len(sb):
                    result[name] = {
                        'total': round(sb[i], 2) if isinstance(sb[i], (int, float)) else sb[i]
                    }
        
        return {"status": "success", "shadbala": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dasha")
async def get_dasha(data: BirthData):
    """Get Vimshottari Dasha periods"""
    try:
        h = Horoscope(
            latitude=data.latitude,
            longitude=data.longitude,
            timezone_offset=data.timezone,
            date_in=Date(data.year, data.month, data.day),
            birth_time=f'{data.hour:02d}:{data.minute:02d}:{data.second:02d}',
            ayanamsa_mode=data.ayanamsa.upper()
        )
        
        # Extract dasha info from calendar_info
        cal = h.calendar_info
        dasha_info = {k: v for k, v in cal.items() if 'dasha' in k.lower() or 'dhasa' in k.lower()}
        
        return {"status": "success", "dasha": dasha_info, "calendar": cal}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/complete")
async def get_complete_data(data: BirthData):
    """Get ALL charts and data at once - comprehensive endpoint"""
    try:
        drik.set_ayanamsa_mode(data.ayanamsa.upper())
        place = drik.Place('Birth', data.latitude, data.longitude, data.timezone)
        dob = (data.year, data.month, data.day)
        tob = (data.hour, data.minute, data.second)
        jd = utils.julian_day_number(dob, tob)
        
        planet_names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']
        sign_names = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']
        
        # Get speed info for retrograde detection
        speed_info = drik.planets_speed_info(jd, place)
        
        def get_nakshatra_pada(longitude):
            """Calculate nakshatra and pada from absolute longitude"""
            nak_span = 360 / 27  # 13.333...degrees per nakshatra
            pada_span = nak_span / 4
            nak_index = int(longitude / nak_span) % 27
            pada = int((longitude % nak_span) / pada_span) + 1
            return NAKSHATRA_NAMES[nak_index], pada
        
        def is_retrograde(planet_idx):
            """Check if planet is retrograde based on speed"""
            if planet_idx in speed_info:
                # Speed is in index 3 (daily motion), negative = retrograde
                return speed_info[planet_idx][3] < 0
            return False
        
        def format_chart(chart_data, bhava_data=None):
            """Format chart data into readable structure with nakshatra, pada, house"""
            result = []
            
            # Build house lookup from bhava data
            house_lookup = {}
            if bhava_data:
                for item in bhava_data:
                    planets_in_house = item[2] if len(item) > 2 else []
                    house_num = item[0] + 1
                    for p in planets_in_house:
                        house_lookup[p] = house_num
            
            for item in chart_data:
                planet_id = item[0]
                if planet_id == 'L':
                    name = 'Ascendant'
                    p_idx = -1
                elif isinstance(planet_id, int) and planet_id < len(planet_names):
                    name = planet_names[planet_id]
                    p_idx = planet_id
                else:
                    name = str(planet_id)
                    p_idx = -1
                
                pos_data = item[1]
                if isinstance(pos_data, tuple) and len(pos_data) >= 2:
                    sign_idx = pos_data[0] if isinstance(pos_data[0], int) else 0
                    degree = pos_data[1] if len(pos_data) > 1 else pos_data[0]
                elif isinstance(pos_data, list) and len(pos_data) >= 2:
                    sign_idx = pos_data[0]
                    degree = pos_data[1]
                else:
                    sign_idx = 0
                    degree = 0
                
                # Calculate absolute longitude for nakshatra
                abs_longitude = (sign_idx % 12) * 30 + degree
                nakshatra, pada = get_nakshatra_pada(abs_longitude)
                
                # Get house position
                house = house_lookup.get(planet_id, sign_idx + 1)  # Default to sign-based
                
                # Check retrograde (only for planets, not Lagna)
                retro = is_retrograde(p_idx) if p_idx >= 0 and p_idx <= 6 else False
                
                result.append({
                    'planet': name,
                    'sign': sign_names[sign_idx % 12],
                    'signIndex': sign_idx % 12,
                    'degree': round(degree, 4) if isinstance(degree, float) else degree,
                    'nakshatra': nakshatra,
                    'pada': pada,
                    'house': house,
                    'isRetrograde': retro
                })
            return result
        
        def format_bhava(bhava_data):
            """Format Bhava Chalit data"""
            result = []
            for item in bhava_data:
                house_num = item[0] + 1
                degrees = item[1]
                planets_in_house = item[2] if len(item) > 2 else []
                
                planet_list = []
                for p in planets_in_house:
                    if p == 'L':
                        planet_list.append('Ascendant')
                    elif isinstance(p, int) and p < len(planet_names):
                        planet_list.append(planet_names[p])
                
                result.append({
                    'house': house_num,
                    'startDegree': round(degrees[0], 2),
                    'midDegree': round(degrees[1], 2),
                    'endDegree': round(degrees[2], 2),
                    'planets': planet_list
                })
            return result
        
        # Get all charts
        rasi = charts.rasi_chart(jd, place)
        bhava = charts.bhava_chart(jd, place)
        
        # Divisional charts
        d3 = charts.divisional_chart(jd, place, divisional_chart_factor=3)   # Drekkana
        d9 = charts.divisional_chart(jd, place, divisional_chart_factor=9)   # Navamsa
        d12 = charts.divisional_chart(jd, place, divisional_chart_factor=12) # Dwadashamsha
        d45 = charts.divisional_chart(jd, place, divisional_chart_factor=45) # Akshavedamsha
        d60 = charts.divisional_chart(jd, place, divisional_chart_factor=60) # Shashtiamsha
        
        # Ashtakavarga
        house_to_planet = ['' for _ in range(12)]
        for item in rasi:
            planet_id = item[0]
            house = item[1][0]
            planet_str = 'L' if planet_id == 'L' else str(planet_id)
            if house_to_planet[house]:
                house_to_planet[house] += '/' + planet_str
            else:
                house_to_planet[house] = planet_str
        
        bav, sav, _ = ashtakavarga.get_ashtaka_varga(house_to_planet)
        
        ashtakavarga_result = {
            'bhinnashtakavarga': {},
            'sarvashtakavarga': {'points': sav, 'total': sum(sav)}
        }
        for i, name in enumerate(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']):
            if i < len(bav):
                ashtakavarga_result['bhinnashtakavarga'][name] = {
                    'points': bav[i],
                    'total': sum(bav[i])
                }
        
        # Shadbala
        sb = strength.shad_bala(jd, place)
        shadbala_result = {}
        if sb:
            for i, name in enumerate(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']):
                if i < len(sb):
                    shadbala_result[name] = {
                        'total': round(sb[i], 2) if isinstance(sb[i], (int, float)) else sb[i]
                    }
        
        # NEW: Bhava Bala (House Strength)
        bhava_bala_raw = strength.bhava_bala(jd, place)
        bhava_bala_result = {}
        if bhava_bala_raw and len(bhava_bala_raw) >= 1:
            for i in range(12):
                bhava_bala_result[f'House {i+1}'] = {
                    'strength': round(bhava_bala_raw[0][i], 2) if i < len(bhava_bala_raw[0]) else 0,
                    'ratio': round(bhava_bala_raw[2][i], 2) if len(bhava_bala_raw) > 2 and i < len(bhava_bala_raw[2]) else 0
                }
        
        # NEW: Planetary Dignity & Combustion
        sun_longitude = None
        for item in rasi:
            if item[0] == 0:  # Sun
                sun_longitude = item[1][0] * 30 + item[1][1]
                break
        
        dignity_result = {}
        for item in rasi:
            p_id = item[0]
            if isinstance(p_id, int) and p_id < 7:
                sign_idx = item[1][0]
                planet_long = sign_idx * 30 + item[1][1]
                
                # Dignity
                dignity = 'Neutral'
                if sign_idx == EXALTED_SIGNS.get(p_id):
                    dignity = 'Exalted'
                elif sign_idx == DEBILITATED_SIGNS.get(p_id):
                    dignity = 'Debilitated'
                elif sign_idx in OWN_SIGNS.get(p_id, []):
                    dignity = 'Own Sign'
                elif sign_idx == MOOLATRIKONA_SIGNS.get(p_id):
                    dignity = 'Moolatrikona'
                
                # Combustion (only for Moon-Saturn, not Sun itself)
                is_combust = False
                sun_distance = None
                if p_id >= 1 and p_id <= 6 and sun_longitude is not None:
                    diff = abs(planet_long - sun_longitude)
                    if diff > 180:
                        diff = 360 - diff
                    sun_distance = round(diff, 2)
                    is_combust = diff < COMBUSTION_DEGREES.get(p_id, 15)
                
                planet_name = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'][p_id]
                dignity_result[planet_name] = {
                    'dignity': dignity,
                    'isCombust': is_combust,
                    'sunDistance': sun_distance
                }
        
        # NEW: Chara Karakas (from Horoscope class)
        h = Horoscope(
            latitude=data.latitude,
            longitude=data.longitude,
            timezone_offset=data.timezone,
            date_in=Date(data.year, data.month, data.day),
            birth_time=f'{data.hour:02d}:{data.minute:02d}:{data.second:02d}',
            ayanamsa_mode=data.ayanamsa.upper()
        )
        
        chara_karakas_raw = h.get_chara_karakas_for_chart(jd, place)
        chara_karakas = {}
        if chara_karakas_raw and 'Karakas' in chara_karakas_raw:
            for i, karakas_str in enumerate(chara_karakas_raw['Karakas']):
                if karakas_str.strip():
                    house_karakas = [k.strip() for k in karakas_str.strip().split('\n') if k.strip()]
                    for k in house_karakas:
                        full_name = KARAKA_NAMES.get(k, k)
                        chara_karakas[full_name] = {'house': i + 1, 'abbreviation': k}
        
        # NEW: Special Lagnas
        special_lagnas_raw = h.get_special_lagnas_for_chart(jd, place)
        special_lagnas = {}
        if special_lagnas_raw and 'Special Lagnas' in special_lagnas_raw:
            for i, lagnas_str in enumerate(special_lagnas_raw['Special Lagnas']):
                if lagnas_str.strip():
                    house_lagnas = [l.strip() for l in lagnas_str.strip().split('\n') if l.strip()]
                    for l in house_lagnas:
                        full_name = SPECIAL_LAGNA_NAMES.get(l, l)
                        special_lagnas[full_name] = {'house': i + 1, 'abbreviation': l}
        
        # NEW: Sphutas
        sphutas_raw = h.get_sphutas_for_chart(jd, place)
        sphutas = {}
        if sphutas_raw and 'Sphuta' in sphutas_raw:
            for i, sphuta_str in enumerate(sphutas_raw['Sphuta']):
                if sphuta_str.strip():
                    house_sphutas = [s.strip() for s in sphuta_str.strip().split('\n') if s.strip()]
                    for s in house_sphutas:
                        sphutas[s] = {'house': i + 1}
        
        return {
            "status": "success",
            "data": {
                "birthData": {
                    "name": data.name,
                    "date": f"{data.year}-{data.month:02d}-{data.day:02d}",
                    "time": f"{data.hour:02d}:{data.minute:02d}:{data.second:02d}",
                    "latitude": data.latitude,
                    "longitude": data.longitude,
                    "timezone": data.timezone,
                    "ayanamsa": data.ayanamsa
                },
                "charts": {
                    "rasi": format_chart(rasi, bhava),
                    "bhavaChalit": format_bhava(bhava),
                    "d3_drekkana": format_chart(d3) if d3 else None,
                    "d9_navamsa": format_chart(d9) if d9 else None,
                    "d12_dwadashamsha": format_chart(d12) if d12 else None,
                    "d45_akshavedamsha": format_chart(d45) if d45 else None,
                    "d60_shashtiamsha": format_chart(d60) if d60 else None
                },
                "ashtakavarga": ashtakavarga_result,
                "shadbala": shadbala_result,
                "bhavaBala": bhava_bala_result,
                "dignity": dignity_result,
                "charaKarakas": chara_karakas,
                "specialLagnas": special_lagnas,
                "sphutas": sphutas
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}\n{traceback.format_exc()}")


if __name__ == "__main__":
    import uvicorn
    print("Starting Vedic Kundali API on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)

