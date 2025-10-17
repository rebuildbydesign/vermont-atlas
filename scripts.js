mapboxgl.accessToken = 'pk.eyJ1IjoiajAwYnkiLCJhIjoiY2x1bHUzbXZnMGhuczJxcG83YXY4czJ3ayJ9.S5PZpU9VDwLMjoX_0x5FDQ';

// -------------------- GLOBALS --------------------
var currentPopup = null;
let VT_CONGRESS_GEOJSON = null;
let VT_HOUSE_GEOJSON = null;
let VT_SENATE_GEOJSON = null;


// INITIALIZE MAP
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-72.66422, 43.96237], // CENTERED ON VERMONT
    zoom: 7.5,
    minZoom: 5.8
});

// RESPONSIVE INITIAL ZOOM FOR MOBILE
if (window.innerWidth <= 700) {
    map.setZoom(5.8);
}

// ADD MAPBOX GEOCODER (ADDRESS SEARCH)
var geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    marker: false,
    placeholder: 'Search for an address',
    flyTo: {
        zoom: 9,
        speed: 1.2,
        curve: 1
    }
});
document.getElementById('geocoder').appendChild(geocoder.onAdd(map));

// When user searches, build popup from county + districts (regardless of visibility)
geocoder.on('result', function (e) {
  const lngLat = e.result.center;
  const pointPx = map.project(lngLat);

  const countyFeatures = map.queryRenderedFeatures(pointPx, { layers: ['femaDisasters'] });

  // If user has any district layers visible, include rendered hits too (nice to have)
  const renderedDistricts = map.queryRenderedFeatures(pointPx, {
    layers: ['congressionalDistricts', 'houseDistricts', 'senateDistricts']
  });

  const districtsFromMemory = getDistrictFeaturesFromMemory(lngLat);

  const allFeatures = countyFeatures.concat(renderedDistricts, districtsFromMemory);

  if (allFeatures.length > 0) {
    const featureData = consolidateFeatureData(allFeatures);
    const popupContent = createPopupContent(featureData);

    const femaFeature = countyFeatures.find(f => f.layer && f.layer.id === 'femaDisasters');
    if (femaFeature && typeof turf !== 'undefined') {
      const centroid = turf.centroid({
        type: 'Feature',
        geometry: femaFeature.geometry,
        properties: femaFeature.properties
      }).geometry.coordinates;
      showPopup({ lng: centroid[0], lat: centroid[1] }, popupContent);
    } else {
      showPopup(lngLat, popupContent);
    }
  } else {
    showPopup(lngLat, "<div style='color:#222'>No county or district data at this location.</div>");
  }
});

// LOAD MAP AND LAYERS, SETUP TOOLTIP INTERACTION
map.on('load', function () {
  addLayers();         // FEMA + district layers
  handleMapClick();    // click logic
  setupLayerToggles(); // UI toggles

  // Tooltip for county hover
  const tooltip = document.getElementById('map-tooltip');
  map.on('mousemove', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['femaDisasters'] });
    if (features.length > 0) {
      map.getCanvas().style.cursor = 'pointer';
      tooltip.style.display = 'block';
      tooltip.style.left = e.point.x + 15 + 'px';
      tooltip.style.top = e.point.y + 15 + 'px';
      tooltip.innerHTML = `Click to learn more<br><strong>${features[0].properties.NAMELSAD}</strong>`;
    } else {
      map.getCanvas().style.cursor = '';
      tooltip.style.display = 'none';
    }
  });
});


const tooltip = document.getElementById('map-tooltip');



// Disable scroll zoom initially
map.scrollZoom.disable();
map.on('click', () => map.scrollZoom.enable());



// -------------------- LAYERS ---------------------
function addLayers() {
  // FEMA Counties (always visible)
  map.addSource('vermontFema', { type: 'geojson', data: 'data/VT_FEMA_County.geojson' });

  map.addLayer({
    id: 'femaDisasters',
    type: 'fill',
    source: 'vermontFema',
    paint: {
      'fill-color': [
        'match',
        ['to-number', ['get', 'COUNTY_DISASTER_COUNT'], 0],
        0, '#ffffff', 1, '#fee5d9', 2, '#fee5d9',
        3, '#fcae91', 4, '#fcae91', 5, '#fb6a4a',
        6, '#fb6a4a', 7, '#de2d26', 8, '#de2d26',
        9, '#de2d26', 10, '#a50f15', 11, '#a50f15',
        12, '#a50f15', 13, '#a50f15', 14, '#a50f15',
        15, '#a50f15', 16, '#a50f15', 17, '#a50f15', 18, '#a50f15', 19, '#a50f15', 20, '#a50f15', 21, '#a50f15', 22, '#a50f15', '#ffffff'
      ],
      'fill-opacity': 1
    }
  });

  map.addLayer({
    id: 'femaDisasters-stroke',
    type: 'line',
    source: 'vermontFema',
    paint: { 'line-color': '#fff', 'line-width': 1 }
  });

  // DISTRICT LAYERS: load data into memory + add layers (hidden by default)
  addCongressionalLayers();
  addHouseLayers();
  addSenateLayers();
}


// ---------------------
// CONGRESSIONAL LAYERS
// ---------------------
function addCongressionalLayers() {
  fetch('data/VT_Congress.geojson')
    .then(r => r.json())
    .then(data => {
      VT_CONGRESS_GEOJSON = data;
      map.addSource('vtCongress', { type: 'geojson', data });

      // Polygon fill (transparent so we only see outline/labels)
      map.addLayer({
        id: 'congressionalDistricts',
        type: 'fill',
        source: 'vtCongress',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': 'transparent',
          'fill-opacity': 1
        }
      });

      // Outline stroke (adjust line-width here)
      map.addLayer({
        id: 'congressionalDistrictsOutline',
        type: 'line',
        source: 'vtCongress',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#000',
          'line-width': 1.5   // 👈 change this value for stroke thickness
        }
      });

      // Labels
      map.addLayer({
        id: 'congressionalLabels',
        type: 'symbol',
        source: 'vtCongress',
        layout: {
          'visibility': 'none',
          'text-field': ['get', 'NAMELSAD'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 20
        },
        paint: {
          'text-color': '#000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5
        }
      });
    });
}

// ---------------------
// HOUSE LAYERS
// ---------------------
function addHouseLayers() {
  fetch('data/VT_House.geojson')
    .then(r => r.json())
    .then(data => {
      KY_HOUSE_GEOJSON = data;
      map.addSource('vtHouse', { type: 'geojson', data });

      // Polygon fill
map.addLayer({
  id: 'houseDistricts',
  type: 'fill',
  source: 'vtHouse',
  layout: { visibility: 'visible' },   // 👈 default ON
  paint: {
    'fill-color': 'transparent',
    'fill-opacity': 1
  }
});

// Outline stroke
map.addLayer({
  id: 'houseDistrictsOutline',
  type: 'line',
  source: 'vtHouse',
  layout: { visibility: 'visible' },   // 👈 default ON
  paint: {
    'line-color': '#000',
    'line-width': 1.5
  }
});

// Labels
map.addLayer({
  id: 'houseLabels',
  type: 'symbol',
  source: 'vtHouse',
  layout: {
    'visibility': 'visible',           // 👈 default ON
    'text-field': ['get', 'distname'],
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-size': 14
  },
  paint: {
    'text-color': '#000',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5
  }
});

    });
}

// ---------------------
// SENATE LAYERS
// ---------------------
function addSenateLayers() {
  fetch('data/VT_Senate.geojson')
    .then(r => r.json())
    .then(data => {
      VT_SENATE_GEOJSON = data;
      map.addSource('vtSenate', { type: 'geojson', data });

      // Polygon fill
      map.addLayer({
        id: 'senateDistricts',
        type: 'fill',
        source: 'vtSenate',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': 'transparent',
          'fill-opacity': 1
        }
      });

      // Outline stroke
      map.addLayer({
        id: 'senateDistrictsOutline',
        type: 'line',
        source: 'vtSenate',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#000',
          'line-width': 1.5
        }
      });

      // Labels
      map.addLayer({
        id: 'senateLabels',
        type: 'symbol',
        source: 'vtSenate',
        layout: {
          'visibility': 'none',
          'text-field': ['get', 'dis'], // <-- senate district field
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 14
        },
        paint: {
          'text-color': '#000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5
        }
      });
    });
}




// -------------------- CLICK POPUP ----------------
function handleMapClick() {
  map.on('click', function (e) {
    const lngLat = [e.lngLat.lng, e.lngLat.lat];

    // FEMA (visible)
    const countyFeatures = map.queryRenderedFeatures(e.point, { layers: ['femaDisasters'] });

    // Districts from visible layers (optional boost) + memory (always)
    const renderedDistricts = map.queryRenderedFeatures(e.point, {
      layers: ['congressionalDistricts', 'houseDistricts', 'senateDistricts']
    });

    const districtsFromMemory = getDistrictFeaturesFromMemory(lngLat);

    const allFeatures = countyFeatures.concat(renderedDistricts, districtsFromMemory);

    if (allFeatures.length > 0) {
      const featureData = consolidateFeatureData(allFeatures);
      const popupContent = createPopupContent(featureData);

      const femaFeature = countyFeatures.find(f => f.layer && f.layer.id === 'femaDisasters');
      const isMobile = window.innerWidth <= 700;

      if (femaFeature && typeof turf !== 'undefined' && !isMobile) {
        const centroid = turf.centroid({
          type: 'Feature',
          geometry: femaFeature.geometry,
          properties: femaFeature.properties
        }).geometry.coordinates;
        showPopup({ lng: centroid[0], lat: centroid[1] }, popupContent);
      } else {
        showPopup(e.lngLat, popupContent);
      }
    }
  });
}

// -------------------- TOGGLES --------------------
function setupLayerToggles() {
  // Congressional Toggle
  document.getElementById('toggle-congress').addEventListener('change', function (e) {
    const visibility = e.target.checked ? 'visible' : 'none';
    map.setLayoutProperty('congressionalDistricts', 'visibility', visibility);
    map.setLayoutProperty('congressionalDistrictsOutline', 'visibility', visibility);
    map.setLayoutProperty('congressionalLabels', 'visibility', visibility);
  });

  // House Toggle
  document.getElementById('toggle-house').addEventListener('change', function (e) {
    const visibility = e.target.checked ? 'visible' : 'none';
    map.setLayoutProperty('houseDistricts', 'visibility', visibility);
    map.setLayoutProperty('houseDistrictsOutline', 'visibility', visibility);
    map.setLayoutProperty('houseLabels', 'visibility', visibility);
  });

  // Senate Toggle
  document.getElementById('toggle-senate').addEventListener('change', function (e) {
    const visibility = e.target.checked ? 'visible' : 'none';
    map.setLayoutProperty('senateDistricts', 'visibility', visibility);
    map.setLayoutProperty('senateDistrictsOutline', 'visibility', visibility);
    map.setLayoutProperty('senateLabels', 'visibility', visibility);
  });
}

// -------------------- DATA FUSION ----------------
function consolidateFeatureData(features) {
  const featureData = {
    countyName: '',
    disasters: '',
    femaObligations: '',
    countyPopulation: '',
    countyPerCapita: '',
    countySVI: '',
    congressionalDist: '',
    congressRepName: '',
    houseDist: '',
    houseRepName: '',
    senateDist: '',
    senateRepName: ''
  };

  features.forEach(function (feature) {
    const layerId = feature.layer && feature.layer.id;
    if (!layerId) return;

    switch (layerId) {
      case 'femaDisasters':
        featureData.countyName = feature.properties.NAMELSAD;
        featureData.disasters = feature.properties.COUNTY_DISASTER_COUNT;
        featureData.femaObligations = feature.properties.COUNTY_TOTAL_FEMA;
        featureData.countyPopulation = feature.properties.COUNTY_POPULATION;
        featureData.countyPerCapita = feature.properties.COUNTY_PER_CAPITA;
        featureData.countySVI = feature.properties.SVI_2022;
        break;

      case 'congressionalDistricts':
        // Vermont uses NAMELSAD for congressional district name
        featureData.congressionalDist = feature.properties.NAMELSAD;
        featureData.congressRepName =
          [feature.properties.FIRSTNAME, feature.properties.LASTNAME].filter(Boolean).join(' ');
        break;

      case 'houseDistricts':
        // Vermont House uses distname for district label
        featureData.houseDist = feature.properties.distname;
        featureData.houseRepName = feature.properties.Full_Name || 'N/A';
        break;

      case 'senateDistricts':
        // Vermont Senate uses dis for district label
        featureData.senateDist = feature.properties.dis;
        featureData.senateRepName = feature.properties.Full_Name || 'N/A';
        break;
    }
  });

  return featureData;
}


// -------------------- POPUP ----------------------
function createPopupContent(featureData) {
  return `
    <div style="color:#222; font-family:inherit;">
      <div style="
          background:#f5e6e6;color:#444;font-size:0.98em;font-weight:600;
          padding:7px 12px;margin-bottom:1em;border-left:5px solid #a50f15;">
        Information for Selected Location
      </div>
      <div style="font-size:0.96em;color:#444;margin-bottom:0.9em;">
        This summary shows federally declared disaster data and elected officials for the area you selected or searched.
      </div>
      <div style="margin-bottom:0.55em;">
        <div style="font-size:1.18em;font-weight:bold;color:#a50f15;letter-spacing:0.02em;">
          ${featureData.countyName || 'County'}
        </div>
      </div>
      <div style="margin-bottom:0.75em;line-height:1.55;">
        <strong>Federal Disaster Declarations:</strong> ${featureData.disasters ?? 'N/A'}<br>
        <strong>FEMA Obligations (PA+HM):</strong> ${
          featureData.femaObligations
            ? `${parseFloat(featureData.femaObligations).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
            : 'N/A'
        }<br>
        <strong>County Population:</strong> ${
          featureData.countyPopulation ? parseInt(featureData.countyPopulation).toLocaleString('en-US') : 'N/A'
        }<br>
        <strong>Per Capita FEMA Aid:</strong> ${
          featureData.countyPerCapita
            ? `${parseFloat(featureData.countyPerCapita).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
            : 'N/A'
        }<br>
        <strong>SVI Score:</strong> ${featureData.countySVI ?? 'N/A'}
      </div>
      <div style="border-top:1px solid #ececec;margin:1em 0;"></div>
      <div style="font-size:1.18em;font-weight:bold;color:#a50f15;letter-spacing:0.02em;">
        Elected Officials Covering This Location
      </div>
      <ul style="list-style:none;padding:0;margin:0 0 0.9em 0;">
        <li style="margin-bottom:3px;"><strong>U.S. Senate:</strong> Bernie Sanders (D), Peter Welch (D)</li>
        <li style="margin-bottom:3px;"><strong>U.S. House:</strong> ${featureData.congressRepName || 'N/A'} (${featureData.congressionalDist || 'N/A'})</li>
        <li style="margin-bottom:3px;"><strong>State Senate:</strong> ${featureData.senateRepName || 'N/A'} (${featureData.senateDist || 'N/A'})</li>
        <li style="margin-bottom:3px;"><strong>State House:</strong> ${featureData.houseRepName || 'N/A'} (${featureData.houseDist || 'N/A'})</li>
      </ul>
      <div style="color:gray;font-style:italic;font-size:0.85em;">
        * <a href="https://rebuildbydesign.org/atlas-of-disaster" target="_blank" style="color:gray;">Atlas of Disaster (2011–2024) by Rebuild by Design</a>
      </div>
    </div>
  `;
}

// -------------------- SHOW POPUP ----------------------
function showPopup(lngLat, content) {
  if (currentPopup) currentPopup.remove();
  currentPopup = new mapboxgl.Popup().setLngLat(lngLat).setHTML(content).addTo(map);
}

// -------------------- POINT-IN-POLYGON FIX -------------------
function getDistrictFeaturesFromMemory(lngLat) {
  const pt = turf.point(lngLat);
  const hits = [];

  function addHits(geojson, layerId) {
    if (!geojson || !geojson.features) return;
    for (const f of geojson.features) {
      if (turf.booleanPointInPolygon(pt, f)) {
        hits.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties,
          layer: { id: layerId }
        });
        break;
      }
    }
  }

  addHits(VT_CONGRESS_GEOJSON, 'congressionalDistricts');
  addHits(VT_HOUSE_GEOJSON, 'houseDistricts');
  addHits(VT_SENATE_GEOJSON, 'senateDistricts');

  return hits;
}

