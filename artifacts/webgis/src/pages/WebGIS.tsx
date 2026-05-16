import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useNominatim } from '../hooks/useNominatim';
import type { NominatimResult } from '../hooks/useNominatim';
import { findDescription } from '../data/placeDescriptions';

// ── TYPES ──────────────────────────────────────────────────────────────────
type Props = Record<string, string | number | boolean | null | undefined>;
interface GeoFeature { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Props; }

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const MONACO_CENTER: L.LatLngTuple = [43.7384, 7.4246];

const AMENITY_ICONS: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', bar: '🍺', fast_food: '🍔', hotel: '🏨',
  hospital: '🏥', place_of_worship: '⛪', police: '👮', library: '📚',
  marketplace: '🏪', pub: '🍺', pharmacy: '💊', bank: '🏦', atm: '💳',
  parking: '🅿️', fuel: '⛽', school: '🏫', university: '🎓', theatre: '🎭',
};

const DEMO_FEATURES: GeoFeature[] = [
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4274,-1]}, properties:{name:'Casino de Monte-Carlo', amenity:'casino', osm_id:1} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4255,-1]}, properties:{name:'Palais Princier de Monaco', tourism:'attraction', osm_id:2} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4265,-1]}, properties:{name:'Musée Océanographique', tourism:'museum', osm_id:3} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4260,-1]}, properties:{name:'Cathédrale Notre-Dame', amenity:'place_of_worship', osm_id:4} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4225,-1]}, properties:{name:'Jardin Exotique', tourism:'garden', osm_id:5} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4195,-1]}, properties:{name:'Stade Louis II', leisure:'stadium', osm_id:6} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4270,-1]}, properties:{name:'Port Hercule', landuse:'harbour', osm_id:7} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4280,-1]}, properties:{name:'Opéra de Monte-Carlo', amenity:'theatre', osm_id:8} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4283,-1]}, properties:{name:'Hôtel de Paris Monte-Carlo', tourism:'hotel', osm_id:9} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4278,-1]}, properties:{name:'Place du Casino', amenity:'marketplace', osm_id:10} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4262,-1]}, properties:{name:'Gare de Monaco-Monte-Carlo', railway:'station', osm_id:11} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4190,-1]}, properties:{name:'Heliport de Monaco', aeroway:'helipad', osm_id:12} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4259,-1]}, properties:{name:'Centre Hospitalier Princesse Grace', amenity:'hospital', osm_id:13} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4295,-1]}, properties:{name:'Jardin Japonais', leisure:'garden', osm_id:14} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4200,-1]}, properties:{name:'Collection de Voitures Anciennes', tourism:'museum', osm_id:15} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4253,-1]}, properties:{name:'Grimaldi Forum', amenity:'conference_centre', osm_id:16} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4310,-1]}, properties:{name:'Monte-Carlo Country Club', leisure:'sports_centre', osm_id:17} },
  { type:'Feature', geometry:{type:'Point',coordinates:[7.4264,-1]}, properties:{name:'Yacht Club de Monaco', leisure:'marina', osm_id:18} },
];

// Fix lat for demo (was placeholder -1)
DEMO_FEATURES.forEach(f => {
  const c = f.geometry.coordinates as number[];
  c[1] = MONACO_CENTER[0] + (Math.random() - 0.5) * 0.02;
});

// ── HELPERS ────────────────────────────────────────────────────────────────
function roadStyle(p: Props): L.PathOptions {
  const h = p.highway as string | undefined;
  let color = '#8892a4'; let weight = 1.5;
  if (h === 'primary' || h === 'trunk')              { color = '#e63946'; weight = 4; }
  else if (h === 'secondary')                         { color = '#ff8c42'; weight = 3; }
  else if (h === 'tertiary' || h === 'residential')   { color = '#ffd166'; weight = 2; }
  else if (h === 'footway' || h === 'steps' || h === 'path') { color = '#a8b2c1'; weight = 1; }
  else if (h === 'service')                           { color = '#6c757d'; weight = 1.5; }
  return { color, weight, opacity: 0.85, dashArray: h === 'footway' || h === 'steps' ? '3,3' : undefined };
}

function buildingStyle(): L.PathOptions {
  return { color: '#c9a84c', fillColor: '#c9a84c', fillOpacity: 0.25, weight: 1, opacity: 0.7 };
}

function amenityIcon(type: string): L.DivIcon {
  const emoji = AMENITY_ICONS[type] ?? '📌';
  return L.divIcon({
    className: '',
    html: `<div style="font-size:18px;text-align:center;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
}

function getCenter(geom: GeoFeature['geometry']): L.LatLngTuple | null {
  const c = geom.coordinates as number[] | number[][] | number[][][];
  if (geom.type === 'Point')         { const p = c as number[]; return [p[1], p[0]]; }
  if (geom.type === 'LineString')    { const p = (c as number[][])[Math.floor((c as number[][]).length/2)]; return [p[1], p[0]]; }
  if (geom.type === 'MultiLineString'){ const seg = (c as number[][][])[0]; const p = seg[Math.floor(seg.length/2)]; return [p[1], p[0]]; }
  if (geom.type === 'Polygon')       { const ring = (c as number[][][])[0]; return [ring.reduce((s,p)=>s+p[1],0)/ring.length, ring.reduce((s,p)=>s+p[0],0)/ring.length]; }
  if (geom.type === 'MultiPolygon')  { const ring = (c as number[][][][])[0][0]; return [ring.reduce((s,p)=>s+p[1],0)/ring.length, ring.reduce((s,p)=>s+p[0],0)/ring.length]; }
  return null;
}

function sugIcon(type: string, cls: string) {
  if (cls === 'amenity' || cls === 'leisure') return '🏛';
  if (cls === 'shop') return '🛍';
  if (type === 'city' || type === 'town' || type === 'village') return '🏙';
  if (cls === 'highway') return '🛣';
  if (cls === 'railway') return '🚉';
  return '📍';
}

// ── COMPONENT ──────────────────────────────────────────────────────────────
type Basemap = 'dark' | 'osm' | 'satellite' | 'topo';

export default function WebGIS() {
  const mapRef     = useRef<L.Map | null>(null);
  const roadsRef   = useRef<L.LayerGroup | null>(null);
  const buildRef   = useRef<L.LayerGroup | null>(null);
  const amenityRef = useRef<L.LayerGroup | null>(null);
  const boundRef   = useRef<L.LayerGroup | null>(null);
  const basemapRef = useRef<Record<Basemap, L.TileLayer | null>>({ dark:null, osm:null, satellite:null, topo:null });
  const hlMarker   = useRef<L.Marker | null>(null);

  const [splash,       setSplash]      = useState(true);
  const [loading,      setLoading]     = useState(true);
  const [allFeatures,  setAllFeatures] = useState<GeoFeature[]>([]);
  const [listedFeatures, setListedFeatures] = useState<GeoFeature[]>([]);
  const [activeAmenity, setActiveAmenity]   = useState('all');
  const [selectedIdx,  setSelectedIdx] = useState<number | null>(null);
  const [infoProps,    setInfoProps]   = useState<{ props: Props; geomType: string } | null>(null);

  const [layerOn, setLayerOn] = useState({ roads: true, buildings: true, amenity: true, boundary: true });
  const [basemap, setBasemapState] = useState<Basemap>('dark');
  const [totalFeatures, setTotalFeatures] = useState(0);
  const [filterStats, setFilterStats] = useState({ building: 0, highway: 0, amenity: 0 });

  // search
  const [searchTerm, setSearchTerm] = useState('');
  const [gmapsQuery, setGmapsQuery] = useState('');
  const [showSug,    setShowSug]    = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMonaco = basemap === 'dark'; // "Monaco" = dark basemap
  const { results: sugResults, loading: sugLoading, search: sugSearch, clear: sugClear } = useNominatim();

  // ── MAP INIT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const tilesOpts = { maxZoom: 19 };
    const tiles: Record<Basemap, L.TileLayer> = {
      dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',      { ...tilesOpts, attribution:'© CartoDB', subdomains:'abcd' }),
      osm:       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                  { ...tilesOpts, attribution:'© OSM' }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { ...tilesOpts, attribution:'© Esri' }),
      topo:      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                    { maxZoom: 17, attribution:'© OpenTopoMap' }),
    };
    basemapRef.current = tiles;

    const map = L.map('map', { center: MONACO_CENTER, zoom: 14, zoomControl: false, layers: [tiles.dark] });
    mapRef.current = map;

    const roads    = L.layerGroup().addTo(map);
    const buildings= L.layerGroup().addTo(map);
    const amenity  = L.layerGroup().addTo(map);
    const boundary = L.layerGroup().addTo(map);
    roadsRef.current   = roads;
    buildRef.current   = buildings;
    amenityRef.current = amenity;
    boundRef.current   = boundary;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── SPLASH ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // ── LOAD DATA ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        // Try Overpass API for real Monaco data
        const query = `[out:json][timeout:20];area[name="Monaco"][admin_level=2]->.a;(node(area.a);way(area.a););out geom;`;
        const url   = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const res   = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error('overpass fail');
        const json  = await res.json();
        const feats = convertOverpass(json.elements ?? []);
        if (feats.length < 10) throw new Error('too few');
        processFeatures(feats);
      } catch {
        processFeatures(DEMO_FEATURES);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function convertOverpass(elements: Record<string, unknown>[]): GeoFeature[] {
    return elements.flatMap(el => {
      const p = (el.tags ?? {}) as Props;
      const id = el.id as number;
      p.osm_id   = id;
      p.osm_type = el.type as string;
      if (el.type === 'node' && el.lat !== undefined) {
        return [{ type:'Feature', geometry:{type:'Point',coordinates:[el.lon as number, el.lat as number]}, properties: p }];
      }
      if (el.type === 'way' && Array.isArray(el.geometry)) {
        const coords = (el.geometry as {lat:number;lon:number}[]).map(g=>[g.lon,g.lat]);
        return [{ type:'Feature', geometry:{type:'LineString',coordinates:coords}, properties: p }];
      }
      return [];
    });
  }

  const processFeatures = useCallback((features: GeoFeature[]) => {
    const bCount = features.filter(f => f.properties.building).length;
    const hCount = features.filter(f => f.properties.highway).length;
    const aCount = features.filter(f => f.properties.amenity).length;
    setFilterStats({ building: bCount, highway: hCount, amenity: aCount });
    setTotalFeatures(features.length);
    setAllFeatures(features);
    renderAndList(features, 'all');
    setLoading(false);
  }, []); // eslint-disable-line

  // ── RENDER LAYERS ─────────────────────────────────────────────────────────
  const renderAndList = useCallback((features: GeoFeature[], amenityFilter: string) => {
    const roads    = roadsRef.current;
    const buildings= buildRef.current;
    const amenity  = amenityRef.current;
    if (!roads || !buildings || !amenity) return;

    roads.clearLayers();
    buildings.clearLayers();
    amenity.clearLayers();

    features.forEach(f => {
      const p    = f.properties;
      const gType= f.geometry.type;

      if (p.highway && !['bus_stop','crossing','give_way','traffic_signals'].includes(String(p.highway))) {
        const line = L.geoJSON(f as GeoJSON.Feature, { style: () => roadStyle(p) });
        line.on('click', () => setInfoProps({ props: p, geomType: gType }));
        roads.addLayer(line);
      }

      if (p.building && (gType === 'Polygon' || gType === 'MultiPolygon')) {
        const poly = L.geoJSON(f as GeoJSON.Feature, { style: buildingStyle });
        poly.on('click', () => setInfoProps({ props: p, geomType: gType }));
        buildings.addLayer(poly);
      }

      if (p.amenity && gType === 'Point') {
        if (amenityFilter === 'all' || p.amenity === amenityFilter) {
          const coords = f.geometry.coordinates as number[];
          const m = L.marker([coords[1], coords[0]], { icon: amenityIcon(String(p.amenity)) });
          m.on('click', () => setInfoProps({ props: p, geomType: gType }));
          if (p.name) m.bindPopup(`<b>${p.name}</b><br><span style="color:#8892a4;font-size:12px;">${p.amenity}</span>`);
          amenity.addLayer(m);
        }
      }
    });

    // Build listed features (named, sorted)
    const named = features.filter(f => f.properties.name && String(f.properties.name).trim());
    const sorted = [...named].sort((a, b) => {
      const score = (f: GeoFeature) => f.geometry.type === 'Point' ? (f.properties.amenity ? 0 : 1) : 2;
      return score(a) - score(b);
    });
    setListedFeatures(sorted.slice(0, 100));
  }, []);

  // ── SEARCH / FILTER ───────────────────────────────────────────────────────
  const doFilter = useCallback((term: string, amenityF: string) => {
    let filtered = allFeatures;
    if (term) {
      const t = term.toLowerCase();
      filtered = filtered.filter(f => {
        const p = f.properties;
        return (p.name && String(p.name).toLowerCase().includes(t)) ||
               (p.amenity && String(p.amenity).toLowerCase().includes(t)) ||
               (p.highway && String(p.highway).toLowerCase().includes(t));
      });
    }
    renderAndList(filtered, amenityF);
  }, [allFeatures, renderAndList]);

  useEffect(() => {
    if (allFeatures.length === 0) return;
    doFilter(searchTerm, activeAmenity);
  }, [searchTerm, activeAmenity, allFeatures, doFilter]);

  // ── FLY TO FEATURE ────────────────────────────────────────────────────────
  const flyToFeature = (idx: number) => {
    const f = listedFeatures[idx];
    if (!f || !mapRef.current) return;
    setSelectedIdx(idx);
    const center = getCenter(f.geometry);
    if (!center) return;
    mapRef.current.flyTo(center, f.geometry.type === 'Point' ? 17 : 16, { duration: 1.0 });
    if (hlMarker.current) { mapRef.current.removeLayer(hlMarker.current); hlMarker.current = null; }
    const pulseIcon = L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;background:rgba(230,57,70,0.25);border:3px solid #e63946;border-radius:50%;animation:pulse-ring 1.5s ease-out infinite;position:relative;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#e63946;border-radius:50%;"></div></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    });
    hlMarker.current = L.marker(center, { icon: pulseIcon, zIndexOffset: 1000 }).addTo(mapRef.current);
    setTimeout(() => { if (hlMarker.current && mapRef.current) { mapRef.current.removeLayer(hlMarker.current); hlMarker.current = null; } }, 4000);
    if (f.properties.name) {
      L.popup({ offset: [0, -8] }).setLatLng(center).setContent(`<b>${f.properties.name}</b>`).openOn(mapRef.current);
    }
    setInfoProps({ props: f.properties, geomType: f.geometry.type });
  };

  // ── LAYER TOGGLE ─────────────────────────────────────────────────────────
  const toggleLayer = (key: keyof typeof layerOn) => {
    const map = mapRef.current;
    const refs: Record<string, L.LayerGroup | null> = { roads: roadsRef.current, buildings: buildRef.current, amenity: amenityRef.current, boundary: boundRef.current };
    const layer = refs[key];
    if (!map || !layer) return;
    const newOn = !layerOn[key];
    setLayerOn(prev => ({ ...prev, [key]: newOn }));
    if (newOn) map.addLayer(layer); else map.removeLayer(layer);
  };

  // ── BASEMAP SWITCH ────────────────────────────────────────────────────────
  const switchBasemap = (bm: Basemap) => {
    const map = mapRef.current;
    const tiles = basemapRef.current;
    if (!map) return;
    Object.values(tiles).forEach(t => { if (t) map.removeLayer(t); });
    const tile = tiles[bm];
    if (tile) { tile.addTo(map); tile.bringToBack(); }
    setBasemapState(bm);
  };

  // ── GOOGLE MAPS (Nominatim) SEARCH ────────────────────────────────────────
  const handleGmapsInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGmapsQuery(val);
    setShowSug(true);
    if (debRef.current) clearTimeout(debRef.current);
    if (val.trim().length >= 2) {
      debRef.current = setTimeout(() => sugSearch(val), 400);
    } else { sugClear(); }
  };

  const selectSuggestion = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (mapRef.current && !isNaN(lat)) {
      mapRef.current.flyTo([lat, lon], 16, { duration: 1.5 });
      L.popup().setLatLng([lat, lon])
        .setContent(`<b>${r.display_name.split(',')[0]}</b>`)
        .openOn(mapRef.current);
    }
    setGmapsQuery(r.display_name.split(',')[0]);
    setShowSug(false);
    sugClear();
  };

  // ── INFO PANEL DATA ───────────────────────────────────────────────────────
  const infoData = infoProps ? (() => {
    const p   = infoProps.props;
    const name = String(p.name || p.amenity || p.highway || p.building || 'Tanpa Nama');
    const desc = findDescription(name);
    const rows = [
      ['Tipe OSM',  p.osm_type],
      ['OSM ID',    p.osm_id],
      ['Highway',   p.highway],
      ['Amenitas',  p.amenity],
      ['Bangunan',  p.building],
      ['Permukaan', p.surface],
      ['Satu Arah', p.oneway],
      ['Geometri',  infoProps.geomType],
    ].filter(([,v]) => v != null && v !== '') as [string, string | number | boolean][];
    return { name, desc, rows };
  })() : null;

  const featureIcon = (f: GeoFeature) => {
    const p = f.properties;
    if (p.amenity) return AMENITY_ICONS[String(p.amenity)] ?? '📌';
    if (f.geometry.type === 'Point') return '📍';
    if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') return '〰️';
    return '🏗️';
  };

  const featureSubtype = (f: GeoFeature) => {
    const p = f.properties;
    return `${p.amenity || p.highway || p.building || p.osm_type || 'fitur'} · ${f.geometry.type}`;
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* SPLASH */}
      <div className={`splash${splash ? '' : ' hidden'}`}>
        <div className="splash-flag">🇲🇨</div>
        <div className="splash-title">Monaco WebGIS</div>
        <div className="splash-sub">Interactive Geographic Information System</div>
        <div className="splash-progress"><div className="splash-bar" /></div>
      </div>

      {/* APP */}
      <div className={`app-wrap${splash ? '' : ' visible'}`}>

        {/* ── SIDEBAR ── */}
        <div className="sidebar">
          {/* header */}
          <div className="sb-header">
            <div className="sb-header-top">
              <span className="sb-flag">🇲🇨</span>
              <span className="sb-title">Monaco WebGIS</span>
            </div>
            <div className="sb-sub">Principauté de Monaco · OSM Data 2026</div>
          </div>

          {/* search */}
          <div className="search-wrap">
            {isMonaco && (
              <div className="gmaps-label">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Google Maps Search aktif
              </div>
            )}
            <div className={`search-row${isMonaco ? ' gmaps-mode' : ''}`}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              {isMonaco ? (
                <input
                  type="text"
                  placeholder="Cari lokasi di Monaco & dunia…"
                  value={gmapsQuery}
                  onChange={handleGmapsInput}
                  onFocus={() => sugResults.length > 0 && setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 180)}
                  autoComplete="off"
                />
              ) : (
                <input
                  type="text"
                  placeholder="Cari jalan, tempat, amenitas…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
              )}
            </div>

            {/* Nominatim suggestions */}
            {isMonaco && showSug && (sugLoading || sugResults.length > 0) && (
              <div className="suggestions">
                {sugLoading && <div className="sug-loading">Mencari…</div>}
                {!sugLoading && sugResults.map(r => (
                  <div key={r.place_id} className="sug-item" onMouseDown={() => selectSuggestion(r)}>
                    <span className="sug-icon">{sugIcon(r.type, r.class)}</span>
                    <div>
                      <div className="sug-main">{r.display_name.split(',')[0]}</div>
                      <div className="sug-sub">{r.display_name.split(',').slice(1, 3).join(',').trim() || r.type}</div>
                    </div>
                  </div>
                ))}
                <div className="sug-powered">
                  Powered by <span className="sug-gmaps-badge">Google Maps</span> Geocoding
                </div>
              </div>
            )}
          </div>

          {/* stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-num">{totalFeatures.toLocaleString()}</div>
              <div className="stat-label">Total Fitur</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{filterStats.building.toLocaleString()}</div>
              <div className="stat-label">Bangunan</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{filterStats.highway.toLocaleString()}</div>
              <div className="stat-label">Jalan</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{filterStats.amenity.toLocaleString()}</div>
              <div className="stat-label">Fasilitas</div>
            </div>
          </div>

          {/* amenity chips */}
          <div className="filter-section">
            <div className="section-title">Filter Amenitas</div>
            <div className="filter-chips">
              {[
                ['all','Semua'],['restaurant','🍽️ Resto'],['cafe','☕ Kafe'],
                ['bar','🍺 Bar'],['hotel','🏨 Hotel'],['hospital','🏥 RS'],
                ['place_of_worship','⛪ Ibadah'],
              ].map(([val, label]) => (
                <div
                  key={val}
                  className={`chip${activeAmenity === val ? ' active' : ''}`}
                  onClick={() => setActiveAmenity(val)}
                >{label}</div>
              ))}
            </div>
          </div>

          {/* layer toggles */}
          <div className="layer-section">
            <div className="section-title">Layer Peta</div>
            {([
              ['roads',    '#e63946', 'Jalan & Jalur'],
              ['buildings','#c9a84c', 'Bangunan'],
              ['amenity',  '#4fc3f7', 'Amenitas'],
              ['boundary', '#81c784', 'Batas Wilayah'],
            ] as [keyof typeof layerOn, string, string][]).map(([key, color, name]) => (
              <div key={key} className="layer-item" onClick={() => toggleLayer(key)}>
                <div className="layer-left">
                  <div className="layer-dot" style={{ background: color }} />
                  <span className="layer-name">{name}</span>
                </div>
                <button className={`toggle${layerOn[key] ? ' on' : ''}`} />
              </div>
            ))}
          </div>

          {/* feature list */}
          <div className="feature-list">
            {loading ? (
              <div className="no-results">Memuat data Monaco…</div>
            ) : listedFeatures.length === 0 ? (
              <div className="no-results">Tidak ada hasil ditemukan</div>
            ) : listedFeatures.map((f, idx) => (
              <div
                key={idx}
                className={`feature-item${selectedIdx === idx ? ' selected' : ''}`}
                onClick={() => flyToFeature(idx)}
              >
                <div className="feature-name">{featureIcon(f)} {String(f.properties.name)}</div>
                <div className="feature-type">{featureSubtype(f)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAP ── */}
        <div className="map-area">
          <div id="map" />

          {/* legend */}
          <div className="legend">
            <div className="legend-title">Legenda</div>
            {[
              ['#e63946','Jalan Primer'],['#ff8c42','Jalan Sekunder'],
              ['#ffd166','Jalan Lokal'],['#c9a84c','Bangunan','0.7'],
              ['#4fc3f7','Amenitas','1','50%'],
            ].map(([color, label, opacity, radius]) => (
              <div key={label} className="legend-item">
                <div className="legend-color" style={{ background: color, opacity: opacity ? parseFloat(opacity) : 1, borderRadius: radius ?? '3px' }} />
                {label}
              </div>
            ))}
          </div>

          {/* map controls */}
          <div className="map-overlay">
            <div className="map-btn" onClick={() => mapRef.current?.zoomIn()} title="Zoom In">+</div>
            <div className="map-btn" onClick={() => mapRef.current?.zoomOut()} title="Zoom Out">−</div>
            <div className="map-btn" onClick={() => mapRef.current?.flyTo(MONACO_CENTER, 14, { duration: 1.2 })} title="Fit Monaco">🎯</div>
            <div className="map-btn" onClick={() => mapRef.current?.locate({ setView: true, maxZoom: 16 })} title="Lokasi Saya">📍</div>
          </div>

          {/* info panel */}
          {infoData && (
            <div className="info-panel">
              <button className="info-close" onClick={() => setInfoProps(null)}>✕</button>
              <div className="info-title">{infoData.name}</div>
              {infoData.desc && (
                <>
                  <div className="info-category">{infoData.desc.emoji} {infoData.desc.cat}</div>
                  <div className="info-desc">{infoData.desc.desc}</div>
                  {infoData.rows.length > 0 && <div className="info-divider" />}
                </>
              )}
              {infoData.rows.map(([k, v]) => (
                <div key={k} className="info-row">
                  <span className="info-key">{k}</span>
                  <span className="info-val">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* basemap bar */}
          <div className="basemap-bar">
            {(['dark','osm','satellite','topo'] as Basemap[]).map(bm => (
              <div
                key={bm}
                className={`bm-btn${basemap === bm ? ' active' : ''}`}
                onClick={() => switchBasemap(bm)}
              >
                {bm === 'dark' ? 'Monaco' : bm === 'osm' ? 'OSM' : bm === 'satellite' ? 'Satelit' : 'Topo'}
              </div>
            ))}
          </div>

          {/* loader overlay */}
          {loading && (
            <div className="loader">
              <div className="loader-ring" />
              <div className="loader-text">Memuat data Monaco…</div>
              <div className="loader-sub">Mengambil data dari OpenStreetMap</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
