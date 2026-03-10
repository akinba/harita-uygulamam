/* =========================================
   1. HARİTA (LEAFLET) AYARLARI
   ========================================= */
// Haritayı başlatıyoruz, merkezi İstanbul olarak ayarladık
const map = L.map('map').setView([41.0082, 28.9784], 10); // Enlem, Boylam, Zoom Seviyesi

// CartoDB Dark Matter harita altlığını ekliyoruz (Modern karanlık görünüm)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

/* =========================================
   2. PROJ4JS - KOORDİNAT SİSTEMLERİ
   ========================================= */
// WGS84 (Standart Enlem/Boylam - EPSG:4326) ve Web Mercator (EPSG:3857) Proj4js'te dahili gelir.
// UTM zonlarına ait EPSG tanımlarını yapalım (Örn: Türkiye için 35N, 36N, 37N)

proj4.defs("EPSG:32635", "+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:32636", "+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs");
proj4.defs("EPSG:32637", "+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs");

let currentCrs = "EPSG:4326"; // Varsayılan projeksiyon

// Dropdown'dan (Açılır Menü) Seçim Değiştiğinde
document.getElementById('crsSelect').addEventListener('change', function(e) {
    currentCrs = e.target.value;
    updateCoordinateDisplays(); // UI'ı yeni sisteme göre güncelle
});

/* =========================================
   3. DEĞİŞKENLER VE DOM ELEMANLARI
   ========================================= */
let markers = []; // Haritaya eklenen pinleri (noktaları) tutacak dizi
let polyline = null; // İki nokta arasına çizilecek çizgi

const p1CoordsText = document.getElementById('point1-coords');
const p2CoordsText = document.getElementById('point2-coords');
const distanceResult = document.getElementById('distance-result');
const resetBtn = document.getElementById('resetBtn');

/* =========================================
   4. HARİTAYA TIKLAMA (ÖLÇÜM) MANTIĞI
   ========================================= */
map.on('click', function(e) {
    // Haritaya tıklanılan noktanın WGS84 Enlem (lat) ve Boylam (lng) değerleri
    const latLng = e.latlng; 

    // İkiden fazla noktaya izin vermiyoruz
    if (markers.length >= 2) {
        return; 
    }

    // 1. Yeni işaretçi (marker) ekle
    const marker = L.marker(latLng).addTo(map);
    markers.push(marker);

    // 2. Arayüzde Tıklanan Noktanın Koordinatlarını Göster
    updateCoordinateDisplays();

    // 3. Eğer 2 nokta da seçildiyse: Çizgi çiz ve Mesafeyi hesapla
    if (markers.length === 2) {
        drawPolyline();
        calculateDistance();
    }
});

/* =========================================
   5. ÇİZGİ ÇİZME VE MESAFE HESAPLAMA
   ========================================= */
function drawPolyline() {
    const p1 = markers[0].getLatLng();
    const p2 = markers[1].getLatLng();

    polyline = L.polyline([p1, p2], {
        color: '#00d2ff', // Neon mavi
        weight: 4,        // Çizgi kalınlığı
        opacity: 0.8,
        dashArray: '10, 10' // Kesik kesik çizgi görünümü
    }).addTo(map);

    // Haritayı çizgiye sığdır (İki noktayı da görebilmek için animasyonlu zoom)
    map.fitBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 15 });
}

function calculateDistance() {
    const p1 = markers[0].getLatLng();
    const p2 = markers[1].getLatLng();

    // Leaflet'in dahili p1.distanceTo(p2) metodu, WGS84 ellipsoid'ine (Vincenty/Haversine formüllerine)
    // dayanarak gerçek jeodezik fiziksel mesafeyi (metre cinsinden) döndürür. Projeksiyondan bağımsızdır.
    let distanceInMeters = p1.distanceTo(p2); 
    
    // UI'ı güncelle - Eğer 1000m altındaysa Metre, üstündeyse KM göster
    if (distanceInMeters >= 1000) {
        const distanceInKm = (distanceInMeters / 1000).toFixed(2);
        distanceResult.innerHTML = `${distanceInKm} <span>km</span>`;
    } else {
        distanceResult.innerHTML = `${distanceInMeters.toFixed(1)} <span>m</span>`;
    }
}

/* =========================================
   6. KOORDİNAT SİSTEMİ DÖNÜŞÜMÜ VE KULLANICI ARAYÜZÜ (UI) GÜNCELLEMESİ
   ========================================= */
function updateCoordinateDisplays() {
    // 1. Nokta için güncelleme
    if (markers[0]) {
        const p1 = markers[0].getLatLng();
        p1CoordsText.innerText = convertAndFormatCoords(p1.lng, p1.lat, currentCrs);
    } else {
        p1CoordsText.innerText = "-";
    }

    // 2. Nokta için güncelleme
    if (markers[1]) {
        const p2 = markers[1].getLatLng();
        p2CoordsText.innerText = convertAndFormatCoords(p2.lng, p2.lat, currentCrs);
    } else {
        p2CoordsText.innerText = "-";
    }
}

function convertAndFormatCoords(lng, lat, targetCrs) {
    if (targetCrs === "EPSG:4326") {
        // Enlem Boylam Formatı
        return `Enlem: ${lat.toFixed(6)} \nBoylam: ${lng.toFixed(6)}`;
    } else {
        // XY (Easting, Northing) Dönüşümü
        // Leaflet.js'den gelen değerler WGS84 (EPSG:4326) olduğu için oradan hedef sisteme dönüştürüyoruz
        const result = proj4("EPSG:4326", targetCrs, [lng, lat]); // [X, Y]
        return `X: ${result[0].toFixed(3)} \nY: ${result[1].toFixed(3)}`;
    }
}

/* =========================================
   7. SIFIRLA (TEMİZLE) İŞLEMİ
   ========================================= */
resetBtn.addEventListener('click', function() {
    // Tüm marker'ları sil
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Çizgiyi sil
    if (polyline) {
        map.removeLayer(polyline);
        polyline = null;
    }

    // Arayüzü/Uı sıfırla
    p1CoordsText.innerText = "-";
    p2CoordsText.innerText = "-";
    distanceResult.innerHTML = "0.00 <span>km</span>";
    
    // (Bilinçli tercih: Harita zoomunu veya pozisyonunu ilk baştaki haline Geri ALMIYORUZ 
    // ki kullanıcı kaldığı yerden başka ölçüm yapabilsin.)
});
