import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  CATEGORIES, CATEGORY_EMOJIS,
  getCategory, getColor, getFeatureName, getFeatureSubtype,
  type GeoFeature, type GeoFeatureProperties,
} from '../utils/geoUtils';
import { useNominatim, type NominatimResult } from '../hooks/useNominatim';

const AUCKLAND_CENTER: L.LatLngTuple = [-36.8659, 174.7627];
const MAX_SIDEBAR_ITEMS = 300;
const GEOJSON_URL = 'https://raw.githubusercontent.com/andreazorzetto/auckland-geojson/main/auckland_processed.geojson';

const INFO_KEYS = [
  'amenity','highway','shop','tourism','railway','building',
  'surface','opening_hours','operator','addr_street',
  'addr_housenumber','parking','public_transport','osm_type','osm_id',
];

function makeIcon(cat: string): L.DivIcon {
  const c = getColor(cat);
  const emoji = CATEGORY_EMOJIS[cat] ?? '📍';
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid rgba(255,255,255,0.4);box-shadow:0 2px 6px rgba(0,0,0,0.5);">${emoji}</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function WebGIS() {
  const mapRef = useRef<L.Map | null>(null);
  const clustersRef = useRef<L.MarkerClusterGroup | null>(null);
  const activeLayerRef = useRef<string>('Street');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allFeatures, setAllFeatures] = useState<GeoFeature[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<GeoFeatureProperties | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [shownCount, setShownCount] = useState<number | null>(null);
  const [coords, setCoords] = useState('-36.86° S, 174.76° E');
  const [loading, setLoading] = useState(true);
  const [loadText, setLoadText] = useState('Loading Auckland GeoJSON…');
  const [loadProgress, setLoadProgress] = useState('Please wait, this may take a moment');
  const [activeBaseLayer, setActiveBaseLayer] = useState<string>('Street');
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  // Nominatim geocoder for Monaco mode
  const { results: geocodeResults, loading: geocodeLoading, search: geocodeSearch, clear: geocodeClear } = useNominatim();
  const [gmapsQuery, setGmapsQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const gmapsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gmapsInputRef = useRef<HTMLInputElement | null>(null);

  const isMonacoActive = activeBaseLayer === 'Monaco';

  // Init map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('map', { center: AUCKLAND_CENTER, zoom: 13, zoomControl: true });
    mapRef.current = map;

    const baseLayers: Record<string, L.TileLayer> = {
      'Street': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM contributors', maxZoom: 19,
      }),
      'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB &copy; OSM', maxZoom: 19, subdomains: 'abcd',
      }),
      'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri', maxZoom: 19,
      }),
      'Monaco': L.tileLayer('https://tile.thunderforest.com/transport-dark/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38', {
        attribution: '&copy; <a href="https://www.thunderforest.com">Thunderforest</a> &copy; OSM',
        maxZoom: 22,
      }),
    };

    baseLayers['Street'].addTo(map);
    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    map.on('mousemove', (e) => {
      setCoords(`${e.latlng.lat.toFixed(5)}°, ${e.latlng.lng.toFixed(5)}°`);
    });

    map.on('baselayerchange', (e: L.LayersControlEvent) => {
      activeLayerRef.current = e.name;
      setActiveBaseLayer(e.name);
    });

    const clusters = (L as unknown as { markerClusterGroup: (opts?: object) => L.MarkerClusterGroup })
      .markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster: L.MarkerCluster) => {
          const c = cluster.getChildCount();
          const sz = c > 500 ? 50 : c > 100 ? 42 : 36;
          return L.divIcon({
            html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(56,189,248,0.85);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:#fff;border:2px solid #38bdf8;box-shadow:0 0 12px rgba(56,189,248,0.4);">${c}</div>`,
            className: '',
            iconSize: [sz, sz],
          });
        },
      });
    map.addLayer(clusters);
    clustersRef.current = clusters;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load GeoJSON
  useEffect(() => {
    async function load() {
      try {
        setLoadText('Loading Auckland GeoJSON…');
        setLoadProgress('Fetching from OpenStreetMap data…');
        // Use demo data if the fetch fails
        const resp = await fetch(GEOJSON_URL).catch(() => null);
        if (!resp || !resp.ok) {
          // Generate placeholder demo data around Auckland
          setLoadText('⚠ Using demo data');
          setLoadProgress('Could not load remote GeoJSON — showing sample features');
          processDemoData();
          return;
        }
        setLoadProgress('Parsing features…');
        const data = await resp.json();
        processFeatures(data.features ?? []);
      } catch {
        processDemoData();
      }
    }
    load();
  }, []);

  function processDemoData() {
    const demoFeatures: GeoFeature[] = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7627, -36.8659] }, properties: { name: 'Sky Tower', tourism: 'attraction', osm_id: 1 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7700, -36.8400] }, properties: { name: 'Auckland City Library', amenity: 'library', osm_id: 2 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7500, -36.8700] }, properties: { name: 'Auckland Harbour', tourism: 'attraction', osm_id: 3 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7800, -36.8600] }, properties: { name: 'Britomart Train Station', railway: 'station', osm_id: 4 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7650, -36.8550] }, properties: { name: 'Victoria Park', amenity: 'park', osm_id: 5 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7580, -36.8720] }, properties: { name: 'Queens Wharf', tourism: 'attraction', osm_id: 6 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7720, -36.8480] }, properties: { name: 'Newmarket Station', railway: 'station', osm_id: 7 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7530, -36.8620] }, properties: { name: 'Countdown Supermarket', shop: 'supermarket', osm_id: 8 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7690, -36.8590] }, properties: { name: 'Auckland Hospital', amenity: 'hospital', osm_id: 9 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [174.7610, -36.8630] }, properties: { name: 'ANZ Bank', amenity: 'bank', osm_id: 10 } },
    ];
    for (let i = 0; i < 50; i++) {
      const cats = ['amenity', 'shop', 'highway', 'building'];
      const cat = cats[i % cats.length];
      demoFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [174.7627 + (Math.random() - 0.5) * 0.08, -36.8659 + (Math.random() - 0.5) * 0.06],
        },
        properties: { [cat]: cat, osm_id: 100 + i },
      });
    }
    processFeatures(demoFeatures);
  }

  function processFeatures(features: GeoFeature[]) {
    setLoadProgress(`Processing ${features.length.toLocaleString()} features…`);
    const clusters = clustersRef.current;
    const map = mapRef.current;
    if (!clusters || !map) return;

    const points = features.filter(f => f.geometry?.type === 'Point');
    const polys = features.filter(f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    const lines = features.filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString');

    if (polys.length) {
      L.geoJSON({ type: 'FeatureCollection', features: polys } as GeoJSON.FeatureCollection, {
        style: (f) => {
          const cat = getCategory((f as GeoFeature).properties ?? {});
          return { color: getColor(cat), weight: 1.5, fillOpacity: 0.25, fillColor: getColor(cat) };
        },
        onEachFeature: (f, layer) => {
          layer.on('click', () => setSelectedFeature((f as GeoFeature).properties ?? {}));
        },
      }).addTo(map);
    }

    if (lines.length) {
      L.geoJSON({ type: 'FeatureCollection', features: lines } as GeoJSON.FeatureCollection, {
        style: (f) => {
          const cat = getCategory((f as GeoFeature).properties ?? {});
          return { color: getColor(cat), weight: 2, opacity: 0.7 };
        },
        onEachFeature: (f, layer) => {
          layer.on('click', () => setSelectedFeature((f as GeoFeature).properties ?? {}));
        },
      }).addTo(map);
    }

    points.forEach(f => {
      const coords = f.geometry.coordinates as number[];
      const [lng, lat] = coords;
      const cat = getCategory(f.properties ?? {});
      const marker = L.marker([lat, lng], { icon: makeIcon(cat) });
      marker.on('click', () => setSelectedFeature(f.properties ?? {}));
      clusters.addLayer(marker);
      f._marker = marker;
    });

    setTotalCount(features.length);
    setShownCount(points.length);
    setAllFeatures(features);
    setLoading(false);
    setTimeout(() => map.invalidateSize(), 100);
  }

  // Filter chips data
  const categoryCounts = allFeatures.reduce((acc, f) => {
    const c = getCategory(f.properties ?? {});
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleSetFilter = useCallback((cat: string) => {
    setActiveFilter(cat);
    const clusters = clustersRef.current;
    if (!clusters) return;
    clusters.clearLayers();
    const pts = allFeatures.filter(f => f.geometry?.type === 'Point');
    const filtered = cat === 'all' ? pts : pts.filter(f => getCategory(f.properties ?? {}) === cat);
    filtered.forEach(f => { if (f._marker) clusters.addLayer(f._marker); });
    setShownCount(filtered.length);
  }, [allFeatures]);

  // Feature list
  const filteredForList = activeFilter === 'all'
    ? allFeatures
    : allFeatures.filter(f => getCategory(f.properties ?? {}) === activeFilter);

  const searchFiltered = searchQuery
    ? filteredForList.filter(f => getFeatureName(f.properties ?? {}).toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredForList;

  const namedFeatures = searchFiltered.filter(f => f.properties?.name);
  const listItems = namedFeatures.slice(0, MAX_SIDEBAR_ITEMS);

  const flyToFeature = (f: GeoFeature, idx: number) => {
    setSelectedFeature(f.properties ?? {});
    setActiveItemIdx(idx);
    if (f.geometry?.type === 'Point' && mapRef.current) {
      const [lng, lat] = f.geometry.coordinates as number[];
      mapRef.current.flyTo([lat, lng], 17, { duration: 1.2 });
    }
  };

  // Google Maps (Nominatim) search handler
  const handleGmapsInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGmapsQuery(val);
    setShowSuggestions(true);
    if (gmapsDebounceRef.current) clearTimeout(gmapsDebounceRef.current);
    if (val.trim().length >= 2) {
      gmapsDebounceRef.current = setTimeout(() => geocodeSearch(val), 400);
    } else {
      geocodeClear();
    }
  };

  const handleSelectSuggestion = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (mapRef.current && !isNaN(lat) && !isNaN(lon)) {
      mapRef.current.flyTo([lat, lon], 15, { duration: 1.5 });
      L.popup()
        .setLatLng([lat, lon])
        .setContent(`<div style="color:#1a1a2e;font-weight:600;font-size:13px;">📍 ${result.display_name.split(',')[0]}</div>`)
        .openOn(mapRef.current);
    }
    setGmapsQuery(result.display_name.split(',')[0]);
    setShowSuggestions(false);
    geocodeClear();
  };

  const getResultIcon = (type: string, cls: string) => {
    if (cls === 'amenity') return '🏛';
    if (cls === 'shop') return '🛍';
    if (type === 'city' || type === 'town' || type === 'village') return '🏙';
    if (cls === 'highway') return '🛣';
    if (cls === 'railway') return '🚉';
    if (cls === 'tourism') return '🗺';
    return '📍';
  };

  const getSuggestionSub = (result: NominatimResult) => {
    const parts = result.display_name.split(',');
    return parts.slice(1, 3).join(',').trim() || result.type;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#0f1117', color: '#e2e8f0' }}>
      {/* HEADER */}
      <div id="header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="header-title">🗺 Auckland WebGIS</span>
          <span className="header-subtitle">New Zealand · OpenStreetMap Data</span>
        </div>
        <div className="stats-bar">
          <div className="stat-badge">Features: <span>{totalCount !== null ? totalCount.toLocaleString() : '—'}</span></div>
          <div className="stat-badge">Shown: <span>{shownCount !== null ? shownCount.toLocaleString() : '—'}</span></div>
          <div className="stat-badge">📍 <span>{coords}</span></div>
          {isMonacoActive && (
            <div className="stat-badge" style={{ borderColor: 'rgba(66,133,244,0.4)', color: '#4285f4' }}>
              <span style={{ color: '#4285f4' }}>Monaco</span> Mode
            </div>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="app-layout">
        {/* SIDEBAR */}
        <div className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
          {isMonacoActive && (
            <div className="monaco-active-bar">
              <div className="monaco-dot" />
              Monaco Layer — Google Maps Search aktif
            </div>
          )}
          <div className="sidebar-header">
            <h2>Feature Explorer</h2>

            {isMonacoActive ? (
              /* GOOGLE MAPS GEOCODER SEARCH */
              <div>
                <div className="search-mode-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Google Maps Search
                </div>
                <div className="gmaps-search-wrap">
                  <span className="gmaps-search-icon">🔍</span>
                  <input
                    ref={gmapsInputRef}
                    type="text"
                    className="gmaps-search-box"
                    placeholder="Cari lokasi di peta…"
                    value={gmapsQuery}
                    onChange={handleGmapsInput}
                    onFocus={() => geocodeResults.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    autoComplete="off"
                  />
                  {showSuggestions && (geocodeResults.length > 0 || geocodeLoading) && (
                    <div className="gmaps-suggestions">
                      {geocodeLoading && (
                        <div className="gmaps-suggestion-item" style={{ justifyContent: 'center', color: '#64748b' }}>
                          <span style={{ fontSize: '.75rem' }}>Mencari…</span>
                        </div>
                      )}
                      {!geocodeLoading && geocodeResults.map(r => (
                        <div
                          key={r.place_id}
                          className="gmaps-suggestion-item"
                          onMouseDown={() => handleSelectSuggestion(r)}
                        >
                          <span className="gmaps-suggestion-icon">{getResultIcon(r.type, r.class)}</span>
                          <div>
                            <div className="gmaps-suggestion-main">{r.display_name.split(',')[0]}</div>
                            <div className="gmaps-suggestion-sub">{getSuggestionSub(r)}</div>
                          </div>
                        </div>
                      ))}
                      <div className="gmaps-powered">
                        Powered by <span className="gmaps-badge">Google Maps</span> Geocoding
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* NORMAL FEATURE SEARCH */
              <input
                type="text"
                className="search-box"
                placeholder="Search features…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            )}
          </div>

          {/* FILTER CHIPS */}
          {!isMonacoActive && (
            <div className="filter-section">
              <span className="filter-label">FILTER BY CATEGORY</span>
              <div className="filter-chips">
                <div
                  className={`chip${activeFilter === 'all' ? '' : ' inactive'}`}
                  style={activeFilter === 'all' ? { background: '#38bdf8', color: '#fff' } : {}}
                  onClick={() => handleSetFilter('all')}
                >
                  All ({allFeatures.length.toLocaleString()})
                </div>
                {Object.entries(categoryCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, cnt]) => (
                    <div
                      key={cat}
                      className={`chip${activeFilter === cat ? '' : ' inactive'}`}
                      style={activeFilter === cat ? { background: getColor(cat), color: '#fff' } : {}}
                      onClick={() => handleSetFilter(cat)}
                    >
                      {CATEGORIES[cat]?.label ?? cat} ({cnt.toLocaleString()})
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* FEATURE LIST (hidden in Monaco mode to keep it clean) */}
          {!isMonacoActive && (
            <div className="feature-list-wrap">
              {listItems.length === 0 && (
                <div className="no-features-msg">No named features found</div>
              )}
              {listItems.map((f, idx) => {
                const cat = getCategory(f.properties ?? {});
                return (
                  <div
                    key={idx}
                    className={`feature-item${activeItemIdx === idx ? ' active' : ''}`}
                    onClick={() => flyToFeature(f, idx)}
                  >
                    <div className="fi-name">
                      <span className="fi-dot" style={{ background: getColor(cat) }} />
                      {getFeatureName(f.properties ?? {})}
                    </div>
                    <div className="fi-type">{getFeatureSubtype(f.properties ?? {})}</div>
                  </div>
                );
              })}
              {namedFeatures.length > MAX_SIDEBAR_ITEMS && (
                <div className="more-features-msg">
                  + {(namedFeatures.length - MAX_SIDEBAR_ITEMS).toLocaleString()} more — use filters to narrow
                </div>
              )}
            </div>
          )}

          {/* In Monaco mode show a geocoding hint */}
          {isMonacoActive && (
            <div className="feature-list-wrap">
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🗺</div>
                <div style={{ fontSize: '.82rem', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                  Mode Google Maps Search
                </div>
                <div style={{ fontSize: '.73rem', color: '#475569', lineHeight: 1.5 }}>
                  Ketik nama tempat atau alamat di kotak pencarian untuk menavigasi langsung ke lokasi di peta Monaco.
                </div>
                <div style={{ marginTop: '12px', fontSize: '.7rem', color: '#334155' }}>
                  Ganti ke layer lain untuk kembali ke pencarian fitur OSM.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MAP AREA */}
        <div className="map-wrapper">
          <div id="map" />

          {/* SIDEBAR TOGGLE */}
          <button
            className={`toggle-sidebar-btn${sidebarCollapsed ? ' collapsed' : ''}`}
            style={{ left: sidebarCollapsed ? 0 : 320 }}
            onClick={() => setSidebarCollapsed(p => !p)}
            title="Toggle sidebar"
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {/* INFO PANEL */}
          {selectedFeature && (
            <div className="info-panel">
              <button className="info-close" onClick={() => setSelectedFeature(null)}>✕</button>
              <div className="ip-title">{getFeatureName(selectedFeature)}</div>
              <div>
                {INFO_KEYS.filter(k => selectedFeature[k] != null).length === 0 ? (
                  <div className="ip-row"><span className="ip-key">No extra data</span></div>
                ) : (
                  INFO_KEYS.filter(k => selectedFeature[k] != null).map(k => (
                    <div key={k} className="ip-row">
                      <span className="ip-key">{k.replace('_', ' ')}</span>
                      <span className="ip-val">{String(selectedFeature[k])}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* LEGEND */}
          <div className="legend">
            <h4>Legend</h4>
            {Object.entries(CATEGORIES).map(([key, val]) => (
              <div key={key} className="leg-item">
                <div className="leg-dot" style={{ background: val.color }} />
                {val.label}
              </div>
            ))}
          </div>

          {/* LOADER */}
          {loading && (
            <div className="loader">
              <div className="loader-ring" />
              <div className="load-text">{loadText}</div>
              <div className="load-progress">{loadProgress}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
