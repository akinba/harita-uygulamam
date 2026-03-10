/* =========================================
   1. HARİTA (MAPLIBRE GL JS) BAŞLATMA
   ========================================= */
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'carto-light': {
                'type': 'raster',
                'tiles': [
                    'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
                ],
                'tileSize': 256
            },
            'terrainSource': {
                'type': 'raster-dem',
                'tiles': ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                'encoding': 'terrarium',
                'tileSize': 256,
                'maxzoom': 14
            }
        },
        layers: [
            {
                'id': 'carto-light-layer',
                'type': 'raster',
                'source': 'carto-light',
                'minzoom': 0,
                'maxzoom': 22
            }
        ],
        terrain: {
            source: 'terrainSource',
            exaggeration: 1.5 // Abartma katsayısı, dağların daha belirgin olması için
        }
    },
    center: [28.9784, 41.0082], // [Boylam, Enlem] (İstanbul Merkezi)
    zoom: 10,
    pitch: 60, // 3D görünüm için kamera açısı
    bearing: -20, // Kameranın bakış yönü
    maxPitch: 85
});

// Map kontrolleri eklendi (Zomm in/out, pusula vs)
map.addControl(new maplibregl.NavigationControl({
    visualizePitch: true,
    showZoom: true,
    showCompass: true
}), 'top-left');

/* =========================================
   2. PROJ4JS - KOORDİNAT SİSTEMLERİ
   ========================================= */
proj4.defs("EPSG:32635", "+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:32636", "+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:32637", "+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs");

let currentCrs = "EPSG:4326";

document.getElementById('crsSelect').addEventListener('change', function (e) {
    currentCrs = e.target.value;
    updateCoordinateDisplays();
});

/* =========================================
   3. DEĞİŞKENLER VE DOM ELEMANLARI
   ========================================= */
let markers = []; // [marker1, marker2]
let markerCoords = []; // [[lng1, lat1], [lng2, lat2]]
let elevationChart = null; // Chart.js nesnesi
let hoverMarker = null; // Harita üstünde chart hoverı için çıkan işaretçi

const p1CoordsText = document.getElementById('point1-coords');
const p2CoordsText = document.getElementById('point2-coords');
const distanceResult = document.getElementById('distance-result');
const resetBtn = document.getElementById('resetBtn');
const bottomPanel = document.getElementById('bottom-panel');
const intervalSelect = document.getElementById('intervalSelect');
const closeChartBtn = document.getElementById('closeChartBtn');

map.on('load', () => {
    // Çizgi ve noktalar için boş kaynaklar oluşturuyoruz
    map.addSource('route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': []
            }
        }
    });

    // Çizgi (Route) Katmanı
    map.addLayer({
        'id': 'route-line',
        'type': 'line',
        'source': 'route',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#1f2937', // Koyu gri/lacivert (Açık haritada daha iyi görünür)
            'line-width': 4,
            'line-dasharray': [2, 2] // Kesik kesik
        }
    });
});

/* =========================================
   4. HARİTAYA TIKLAMA (ÖLÇÜM) MANTIĞI
   ========================================= */
map.on('click', function (e) {
    const lngLat = [e.lngLat.lng, e.lngLat.lat];

    if (markers.length >= 2) return;

    // Özel Marker DOM Elemanı oluştur
    const el = document.createElement('div');
    el.className = 'custom-marker';

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);

    markers.push(marker);
    markerCoords.push(lngLat);

    updateCoordinateDisplays();

    if (markers.length === 2) {
        drawLineAndCalculate();
        generateElevationProfile();
    }
});

/* =========================================
   5. ÇİZGİ ÇİZME VE MESAFE HESAPLAMASI
   ========================================= */
function drawLineAndCalculate() {
    // GeoJSON datasını güncelle
    const geojson = {
        'type': 'Feature',
        'properties': {},
        'geometry': {
            'type': 'LineString',
            'coordinates': markerCoords
        }
    };
    if (map.getSource('route')) {
        map.getSource('route').setData(geojson);
    }

    // Turf.js ile Mesafe (Jeodezik)
    const p1 = turf.point(markerCoords[0]);
    const p2 = turf.point(markerCoords[1]);
    const distanceKm = turf.distance(p1, p2, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;

    if (distanceM >= 1000) {
        distanceResult.innerHTML = `${distanceKm.toFixed(2)} <span>km</span>`;
    } else {
        distanceResult.innerHTML = `${distanceM.toFixed(1)} <span>m</span>`;
    }

    // Kamera'yı çizgiye odakla (Bbox oluştur)
    const bbox = turf.bbox(geojson);
    map.fitBounds(bbox, {
        padding: { top: 50, bottom: 300, left: 50, right: 350 }, // UI panellerine göre padding
        maxZoom: 15,
        pitch: 65,  // 3D için açılı
        speed: 1.5
    });
}

/* =========================================
   6. 3D KOT (ELEVATION) ANALİZİ VE GRAFİK
   ========================================= */
intervalSelect.addEventListener('change', () => {
    // Sadece eğer aralık değiştirilirse ve iki nokta seçilmişse yeniden çiz
    if (markers.length === 2) {
        generateElevationProfile();
    }
});

async function generateElevationProfile() {
    // Interval ayarı alınır (Kullanıcı seçimi)
    const intervalMeters = parseFloat(intervalSelect.value);
    const intervalKm = intervalMeters / 1000;

    const line = turf.lineString(markerCoords);
    const lineLength = turf.length(line, { units: 'kilometers' });

    // Turf.js ile çizgiyi belirlenen aralıklarla noktalara böleriz
    let profilePoints = [];

    // Mesafeye göre noktaları interpolasyonla
    for (let dist = 0; dist <= lineLength; dist += intervalKm) {
        const point = turf.along(line, dist, { units: 'kilometers' });
        profilePoints.push({
            distance: dist * 1000,
            lng: point.geometry.coordinates[0],
            lat: point.geometry.coordinates[1]
        });
    }

    // Son noktayı (Bitiş noktasını) tam olarak ekleyelim (Eğer döngü dıșında kaldıysa)
    const lastPointDist = lineLength * 1000;
    if (profilePoints.length > 0 && Math.abs(profilePoints[profilePoints.length - 1].distance - lastPointDist) > 0.1) {
        profilePoints.push({
            distance: lastPointDist,
            lng: markerCoords[1][0],
            lat: markerCoords[1][1]
        });
    }

    // Verilerin haritadan yüklenip render edilmesini bekle ki elevation değerleri gelsin
    // Daha çok nokta varsa yavaşlayabilir ama client-side olarak MapLibre tile cache'nden okur
    const graphData = [];

    for (let i = 0; i < profilePoints.length; i++) {
        const pt = profilePoints[i];

        // map.queryTerrainElevation metodu belirtilen koordinattaki terrain verisini (Z değeri metre) döndürür
        let ele = map.queryTerrainElevation([pt.lng, pt.lat]);
        if (ele === null || ele === undefined) {
            // Eğer yükseklik verisi o Tile için taranmamışsa 0 veya basit tutulur.
            ele = 0;
        }

        graphData.push({
            x: pt.distance, // x ekseni (Gidilen Mesafe - metre)
            y: ele,         // y ekseni (Yükseklik/Kot - metre)
            lng: pt.lng,
            lat: pt.lat
        });
    }

    drawChart(graphData);
}

function drawChart(data) {
    const ctx = document.getElementById('elevationChart').getContext('2d');

    // Alt paneli görünür yap
    bottomPanel.classList.remove('hidden');

    // Eğer eski grafik varsa sil (yeniden çizmek için)
    if (elevationChart) {
        elevationChart.destroy();
    }

    // Chart.js objesi oluştur
    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            // X ekseni (Mesafeler)
            labels: data.map(d => d.x.toFixed(0) + 'm'),
            datasets: [{
                label: 'Arazi Kot (Yükseklik - m)',
                data: data.map(d => d.y),
                borderColor: '#00d2ff',
                backgroundColor: 'rgba(0, 210, 255, 0.2)', // Alan dolgusu
                borderWidth: 2,
                fill: true,
                tension: 0.4, // Çizginin yumuşak/kıvrımlı olması
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#ff4757',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false }, // Lejantı gizle
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ' Yükseklik: ' + context.parsed.y.toFixed(2) + 'm';
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0a0a0', maxTicksLimit: 10 }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Z (Kot) - Metre', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' }
                }
            },
            onHover: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const idx = activeElements[0].index;
                    const pointInfo = data[idx];
                    showHoverMarkerOnMap(pointInfo.lng, pointInfo.lat);
                } else {
                    hideHoverMarkerOnMap();
                }
            }
        }
    });

    // Mouse Chart üzerinden çıkınca dinamik markeri gizle
    document.getElementById('elevationChart').addEventListener('mouseleave', () => {
        hideHoverMarkerOnMap();
    });
}

function showHoverMarkerOnMap(lng, lat) {
    if (!hoverMarker) {
        const el = document.createElement('div');
        el.className = 'hover-marker';
        hoverMarker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
    } else {
        hoverMarker.setLngLat([lng, lat]);
    }
}

function hideHoverMarkerOnMap() {
    if (hoverMarker) {
        hoverMarker.remove();
        hoverMarker = null;
    }
}

/* =========================================
   7. KOORDİNAT SİSTEMİ DÖNÜŞÜMÜ VE KULLANICI ARAYÜZÜ
   ========================================= */
function updateCoordinateDisplays() {
    if (markerCoords[0]) {
        p1CoordsText.innerText = convertAndFormatCoords(markerCoords[0][0], markerCoords[0][1], currentCrs);
    } else {
        p1CoordsText.innerText = "-";
    }

    if (markerCoords[1]) {
        p2CoordsText.innerText = convertAndFormatCoords(markerCoords[1][0], markerCoords[1][1], currentCrs);
    } else {
        p2CoordsText.innerText = "-";
    }
}

function convertAndFormatCoords(lng, lat, targetCrs) {
    if (targetCrs === "EPSG:4326") {
        return `Enlem: ${lat.toFixed(6)} \nBoylam: ${lng.toFixed(6)}`;
    } else {
        const result = proj4("EPSG:4326", targetCrs, [lng, lat]);
        return `X: ${result[0].toFixed(3)} \nY: ${result[1].toFixed(3)}`;
    }
}

/* =========================================
   8. SIFIRLA (TEMİZLE) İŞLEMİ
   ========================================= */
resetBtn.addEventListener('click', function () {
    // Marker nesnelerini haritadan kaldır ve diziyi temizle
    markers.forEach(m => m.remove());
    markers = [];
    markerCoords = [];

    // Çizgiyi haritadan temizle
    if (map.getSource('route')) {
        map.getSource('route').setData({
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': []
            }
        });
    }

    // Arayüz sıfırlama
    p1CoordsText.innerText = "-";
    p2CoordsText.innerText = "-";
    distanceResult.innerHTML = "0.00 <span>km</span>";
    bottomPanel.classList.add('hidden'); // Grafiği gizle

    if (elevationChart) {
        elevationChart.destroy();
        elevationChart = null;
    }

    hideHoverMarkerOnMap();
});

// Çarpı (Kapat) butonu ile chartı gizleme
closeChartBtn.addEventListener('click', () => {
    bottomPanel.classList.add('hidden');
});
