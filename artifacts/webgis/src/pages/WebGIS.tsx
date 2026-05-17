import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { useNominatim } from '../hooks/useNominatim';
import type { NominatimResult } from '../hooks/useNominatim';
import { findDescription } from '../data/placeDescriptions';

// ── TYPES ──────────────────────────────────────────────────────────────────
type Props = Record<string, string | number | boolean | null | undefined>;
interface GeoFeature { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties: Props; }
type Basemap = 'dark' | 'osm' | 'satellite' | 'topo';
type SideTab = 'explore' | 'route';
type RouteProfile = 'driving' | 'walking' | 'cycling';

interface RoutePoint { lat: number; lng: number; label: string; }
interface RouteStep  { maneuver: string; name: string; distance: number; }
interface RouteResult { distanceKm: number; durationMin: number; steps: RouteStep[]; }

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const MONACO_CENTER: L.LatLngTuple = [43.7384, 7.4246];

const AMENITY_ICONS: Record<string, string> = {
  restaurant:'🍽️', cafe:'☕', bar:'🍺', fast_food:'🍔', hotel:'🏨',
  hospital:'🏥', place_of_worship:'⛪', police:'👮', library:'📚',
  marketplace:'🏪', pub:'🍺', pharmacy:'💊', bank:'🏦', atm:'💳',
  parking:'🅿️', fuel:'⛽', school:'🏫', university:'🎓', theatre:'🎭',
};

const MANEUVER_ICONS: Record<string, string> = {
  turn:         '↩',
  'new name':   '→',
  depart:       '🚀',
  arrive:       '🏁',
  merge:        '⇉',
  'on ramp':    '↗',
  'off ramp':   '↘',
  fork:         '⑂',
  'end of road':'⤵',
  roundabout:   '🔄',
  rotary:       '🔄',
  default:      '→',
};

// ── DEMO DATA ──────────────────────────────────────────────────────────────
const DEMO_FEATURES: GeoFeature[] = [
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4274,43.7390]},properties:{name:'Casino de Monte-Carlo',amenity:'casino',osm_id:1}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4249,43.7310]},properties:{name:'Palais Princier de Monaco',tourism:'attraction',osm_id:2}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4265,43.7308]},properties:{name:'Musée Océanographique',tourism:'museum',osm_id:3}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4255,43.7320]},properties:{name:'Cathédrale Notre-Dame',amenity:'place_of_worship',osm_id:4}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4138,43.7344]},properties:{name:'Jardin Exotique',tourism:'garden',osm_id:5}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4130,43.7269]},properties:{name:'Stade Louis II',leisure:'stadium',osm_id:6}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4255,43.7366]},properties:{name:'Port Hercule',landuse:'harbour',osm_id:7}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4280,43.7393]},properties:{name:'Opéra de Monte-Carlo',amenity:'theatre',osm_id:8}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4283,43.7384]},properties:{name:'Hôtel de Paris Monte-Carlo',tourism:'hotel',osm_id:9}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4278,43.7387]},properties:{name:'Place du Casino',amenity:'marketplace',osm_id:10}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4193,43.7341]},properties:{name:'Gare de Monaco-Monte-Carlo',railway:'station',osm_id:11}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4128,43.7252]},properties:{name:'Heliport de Monaco',aeroway:'helipad',osm_id:12}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4191,43.7346]},properties:{name:'Centre Hospitalier Princesse Grace',amenity:'hospital',osm_id:13}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4345,43.7439]},properties:{name:'Jardin Japonais',leisure:'garden',osm_id:14}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4142,43.7260]},properties:{name:'Collection de Voitures Anciennes',tourism:'museum',osm_id:15}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4302,43.7405]},properties:{name:'Grimaldi Forum',amenity:'conference_centre',osm_id:16}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4425,43.7495]},properties:{name:'Monte-Carlo Country Club',leisure:'sports_centre',osm_id:17}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4264,43.7360]},properties:{name:'Yacht Club de Monaco',leisure:'marina',osm_id:18}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4245,43.7348]},properties:{name:'Stars n Bars',amenity:'bar',osm_id:19}},
  {type:'Feature',geometry:{type:'Point',coordinates:[7.4278,43.7395]},properties:{name:'Café de Paris Monte-Carlo',amenity:'cafe',osm_id:20}},
];

// ── HELPERS ────────────────────────────────────────────────────────────────
function roadStyle(p: Props): L.PathOptions {
  const h = p.highway as string | undefined;
  let color = '#8892a4', weight = 1.5;
  if (h==='primary'||h==='trunk')                   { color='#e63946'; weight=4; }
  else if (h==='secondary')                          { color='#ff8c42'; weight=3; }
  else if (h==='tertiary'||h==='residential')        { color='#ffd166'; weight=2; }
  else if (h==='footway'||h==='steps'||h==='path')   { color='#a8b2c1'; weight=1; }
  else if (h==='service')                            { color='#6c757d'; weight=1.5; }
  return { color, weight, opacity:0.85, dashArray: h==='footway'||h==='steps'?'3,3':undefined };
}

function buildingStyle(): L.PathOptions {
  return { color:'#c9a84c', fillColor:'#c9a84c', fillOpacity:0.25, weight:1, opacity:0.7 };
}

function amenityIcon(type: string): L.DivIcon {
  const emoji = AMENITY_ICONS[type] ?? '📌';
  return L.divIcon({
    className:'',
    html:`<div style="font-size:18px;text-align:center;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
    iconSize:[24,24], iconAnchor:[12,12],
  });
}

function pinIcon(color: string, emoji: string): L.DivIcon {
  return L.divIcon({
    className:'',
    html:`<div style="position:relative;width:32px;height:40px;">
      <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid rgba(255,255,255,0.6);box-shadow:0 3px 10px rgba(0,0,0,0.5);"></div>
      <div style="position:absolute;top:5px;left:50%;transform:translateX(-50%);font-size:13px;line-height:1;">${emoji}</div>
    </div>`,
    iconSize:[32,40], iconAnchor:[16,40],
  });
}

function getCenter(geom: GeoFeature['geometry']): L.LatLngTuple | null {
  const c = geom.coordinates as number[]|number[][]|number[][][];
  if (geom.type==='Point')           { const p=c as number[];                  return [p[1],p[0]]; }
  if (geom.type==='LineString')      { const p=(c as number[][])[Math.floor((c as number[][]).length/2)]; return [p[1],p[0]]; }
  if (geom.type==='MultiLineString') { const seg=(c as number[][][])[0]; const p=seg[Math.floor(seg.length/2)]; return [p[1],p[0]]; }
  if (geom.type==='Polygon')         { const ring=(c as number[][][])[0]; return [ring.reduce((s,p)=>s+p[1],0)/ring.length, ring.reduce((s,p)=>s+p[0],0)/ring.length]; }
  if (geom.type==='MultiPolygon')    { const ring=(c as number[][][][])[0][0]; return [ring.reduce((s,p)=>s+p[1],0)/ring.length, ring.reduce((s,p)=>s+p[0],0)/ring.length]; }
  return null;
}

function sugIcon(type: string, cls: string) {
  if (cls==='amenity'||cls==='leisure') return '🏛';
  if (cls==='shop') return '🛍';
  if (type==='city'||type==='town'||type==='village') return '🏙';
  if (cls==='highway') return '🛣';
  if (cls==='railway') return '🚉';
  return '📍';
}

function fmtDist(m: number) { return m>=1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function fmtTime(s: number) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  if (h>0) return `${h}j ${m}m`;
  return m<1 ? '<1 mnt' : `${m} mnt`;
}

// ── OSRM ROUTING ───────────────────────────────────────────────────────────
async function fetchRoute(
  start: RoutePoint, end: RoutePoint, profile: RouteProfile
): Promise<{ result: RouteResult; geojson: GeoJSON.LineString } | null> {
  const prof = profile === 'driving' ? 'car' : profile === 'cycling' ? 'bike' : 'foot';
  const url = `https://router.project-osrm.org/route/v1/${prof}/${start.lng},${start.lat};${end.lng},${end.lat}?steps=true&overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) return null;
  const route = data.routes[0];
  const steps: RouteStep[] = (route.legs ?? []).flatMap((leg: Record<string, unknown>) =>
    ((leg.steps ?? []) as Record<string, unknown>[]).map(s => ({
      maneuver: String((s.maneuver as Record<string, unknown>)?.type ?? 'default'),
      name: String(s.name || ''),
      distance: Number(s.distance ?? 0),
    }))
  );
  return {
    result: {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      steps,
    },
    geojson: route.geometry as GeoJSON.LineString,
  };
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function WebGIS() {
  const mapRef      = useRef<L.Map | null>(null);
  const roadsRef    = useRef<L.LayerGroup | null>(null);
  const buildRef    = useRef<L.LayerGroup | null>(null);
  const amenityRef  = useRef<L.LayerGroup | null>(null);
  const boundRef    = useRef<L.LayerGroup | null>(null);
  const basemapRef  = useRef<Record<Basemap, L.TileLayer | null>>({ dark:null, osm:null, satellite:null, topo:null });
  const hlMarker    = useRef<L.Marker | null>(null);
  const routeLayerRef  = useRef<L.GeoJSON | null>(null);
  const routeGlowRef   = useRef<L.GeoJSON | null>(null);
  const routeFlowRef   = useRef<L.GeoJSON | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef   = useRef<L.Marker | null>(null);

  // general
  const [splash,          setSplash]         = useState(true);
  const [loading,         setLoading]        = useState(true);
  const [allFeatures,     setAllFeatures]    = useState<GeoFeature[]>([]);
  const [listedFeatures,  setListedFeatures] = useState<GeoFeature[]>([]);
  const [activeAmenity,   setActiveAmenity]  = useState('all');
  const [selectedIdx,     setSelectedIdx]    = useState<number | null>(null);
  const [infoProps,       setInfoProps]      = useState<{ props: Props; geomType: string } | null>(null);
  const [layerOn,         setLayerOn]        = useState({ roads:true, buildings:true, amenity:true, boundary:true });
  const [basemap,         setBasemapState]   = useState<Basemap>('dark');
  const [totalFeatures,   setTotalFeatures]  = useState(0);
  const [filterStats,     setFilterStats]    = useState({ building:0, highway:0, amenity:0 });

  // tabs
  const [sideTab, setSideTab] = useState<SideTab>('explore');

  // search (explore mode)
  const [searchTerm, setSearchTerm] = useState('');
  const [gmapsQuery, setGmapsQuery] = useState('');
  const [showSug,    setShowSug]    = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { results:sugResults, loading:sugLoading, search:sugSearch, clear:sugClear } = useNominatim();

  // route planner
  const [routeProfile,    setRouteProfile]   = useState<RouteProfile>('driving');
  const [routeStart,      setRouteStart]     = useState<RoutePoint | null>(null);
  const [routeEnd,        setRouteEnd]       = useState<RoutePoint | null>(null);
  const [routeResult,     setRouteResult]    = useState<RouteResult | null>(null);
  const [routeLoading,    setRouteLoading]   = useState(false);
  const [routeError,      setRouteError]     = useState<string | null>(null);
  const [pickingPoint,    setPickingPoint]   = useState<'start' | 'end' | null>(null);
  const pickingRef = useRef<'start' | 'end' | null>(null);

  // route input text + suggestions
  const [startQuery,    setStartQuery]    = useState('');
  const [endQuery,      setEndQuery]      = useState('');
  const [showStartSug,  setShowStartSug]  = useState(false);
  const [showEndSug,    setShowEndSug]    = useState(false);

  // context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);

  const isMonaco = basemap === 'dark';

  // keep pickingRef in sync
  useEffect(() => { pickingRef.current = pickingPoint; }, [pickingPoint]);

  // close context menu on any outside click / Escape
  useEffect(() => {
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, []);

  // ── MAP INIT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;
    const tilesOpts = { maxZoom:19 };
    const tiles: Record<Basemap, L.TileLayer> = {
      dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',      { ...tilesOpts, attribution:'© CartoDB', subdomains:'abcd' }),
      osm:       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                  { ...tilesOpts, attribution:'© OSM' }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { ...tilesOpts, attribution:'© Esri' }),
      topo:      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                    { maxZoom:17, attribution:'© OpenTopoMap' }),
    };
    basemapRef.current = tiles;

    const map = L.map('map', { center:MONACO_CENTER, zoom:14, zoomControl:false, layers:[tiles.dark] });
    mapRef.current = map;

    const roads    = L.layerGroup().addTo(map);
    const buildings= L.layerGroup().addTo(map);
    const amenity  = L.layerGroup().addTo(map);
    const boundary = L.layerGroup().addTo(map);
    roadsRef.current   = roads;
    buildRef.current   = buildings;
    amenityRef.current = amenity;
    boundRef.current   = boundary;

    // map left-click → set route point (when picking mode active)
    map.on('click', (e: L.LeafletMouseEvent) => {
      setCtxMenu(null);
      const picking = pickingRef.current;
      if (!picking) return;
      const { lat, lng } = e.latlng;
      const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (picking === 'start') {
        setRouteStart({ lat, lng, label });
        setPickingPoint(null);
      } else {
        setRouteEnd({ lat, lng, label });
        setPickingPoint(null);
      }
    });

    // map right-click → show context menu
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      L.DomEvent.preventDefault(e.originalEvent);
      const { lat, lng } = e.latlng;
      const containerPoint = map.latLngToContainerPoint([lat, lng]);
      const mapEl = map.getContainer();
      const rect  = mapEl.getBoundingClientRect();
      setCtxMenu({
        x: rect.left + containerPoint.x,
        y: rect.top  + containerPoint.y,
        lat, lng,
      });
    });

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
      p.osm_id = el.id as number;
      p.osm_type = el.type as string;
      if (el.type==='node' && el.lat!==undefined) {
        return [{ type:'Feature', geometry:{type:'Point',coordinates:[el.lon as number, el.lat as number]}, properties:p }];
      }
      if (el.type==='way' && Array.isArray(el.geometry)) {
        const coords = (el.geometry as {lat:number;lon:number}[]).map(g=>[g.lon,g.lat]);
        return [{ type:'Feature', geometry:{type:'LineString',coordinates:coords}, properties:p }];
      }
      return [];
    });
  }

  const processFeatures = useCallback((features: GeoFeature[]) => {
    setFilterStats({
      building: features.filter(f=>f.properties.building).length,
      highway:  features.filter(f=>f.properties.highway).length,
      amenity:  features.filter(f=>f.properties.amenity).length,
    });
    setTotalFeatures(features.length);
    setAllFeatures(features);
    renderAndList(features, 'all');
    setLoading(false);
  }, []); // eslint-disable-line

  // ── RENDER LAYERS ─────────────────────────────────────────────────────────
  const renderAndList = useCallback((features: GeoFeature[], amenityFilter: string) => {
    const roads=roadsRef.current, buildings=buildRef.current, amenity=amenityRef.current;
    if (!roads||!buildings||!amenity) return;
    roads.clearLayers(); buildings.clearLayers(); amenity.clearLayers();

    features.forEach(f => {
      const p=f.properties, gt=f.geometry.type;
      if (p.highway && !['bus_stop','crossing','give_way','traffic_signals'].includes(String(p.highway))) {
        const line = L.geoJSON(f as GeoJSON.Feature, { style:()=>roadStyle(p) });
        line.on('click', ()=>setInfoProps({ props:p, geomType:gt }));
        roads.addLayer(line);
      }
      if (p.building && (gt==='Polygon'||gt==='MultiPolygon')) {
        const poly = L.geoJSON(f as GeoJSON.Feature, { style:buildingStyle });
        poly.on('click', ()=>setInfoProps({ props:p, geomType:gt }));
        buildings.addLayer(poly);
      }
      if (p.amenity && gt==='Point') {
        if (amenityFilter==='all' || p.amenity===amenityFilter) {
          const c=f.geometry.coordinates as number[];
          const m = L.marker([c[1],c[0]], { icon:amenityIcon(String(p.amenity)) });
          m.on('click', ()=>setInfoProps({ props:p, geomType:gt }));
          if (p.name) m.bindPopup(`<b>${p.name}</b><br><span style="color:#8892a4;font-size:12px;">${p.amenity}</span>`);
          amenity.addLayer(m);
        }
      }
    });

    const named = features.filter(f=>f.properties.name && String(f.properties.name).trim());
    const sorted = [...named].sort((a,b)=>{
      const s=(f: GeoFeature)=>f.geometry.type==='Point'?(f.properties.amenity?0:1):2;
      return s(a)-s(b);
    });
    setListedFeatures(sorted.slice(0,100));
  }, []);

  // ── FILTER ────────────────────────────────────────────────────────────────
  const doFilter = useCallback((term: string, af: string) => {
    let filtered = allFeatures;
    if (term) {
      const t=term.toLowerCase();
      filtered = filtered.filter(f=>{
        const p=f.properties;
        return (p.name&&String(p.name).toLowerCase().includes(t))
            || (p.amenity&&String(p.amenity).toLowerCase().includes(t))
            || (p.highway&&String(p.highway).toLowerCase().includes(t));
      });
    }
    renderAndList(filtered, af);
  }, [allFeatures, renderAndList]);

  useEffect(() => {
    if (allFeatures.length===0) return;
    doFilter(searchTerm, activeAmenity);
  }, [searchTerm, activeAmenity, allFeatures, doFilter]);

  // ── MAP CURSOR when picking ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = pickingPoint ? 'crosshair' : '';
  }, [pickingPoint]);

  // ── ROUTE MARKERS on map ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (startMarkerRef.current) { map.removeLayer(startMarkerRef.current); startMarkerRef.current=null; }
    if (routeStart) {
      startMarkerRef.current = L.marker([routeStart.lat, routeStart.lng], { icon:pinIcon('#22c55e','🟢'), zIndexOffset:500 }).addTo(map);
      startMarkerRef.current.bindTooltip('Titik Mulai', { permanent:false, direction:'top' });
    }
  }, [routeStart]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (endMarkerRef.current) { map.removeLayer(endMarkerRef.current); endMarkerRef.current=null; }
    if (routeEnd) {
      endMarkerRef.current = L.marker([routeEnd.lat, routeEnd.lng], { icon:pinIcon('#e63946','🔴'), zIndexOffset:500 }).addTo(map);
      endMarkerRef.current.bindTooltip('Titik Tujuan', { permanent:false, direction:'top' });
    }
  }, [routeEnd]);

  // ── CALCULATE ROUTE ───────────────────────────────────────────────────────
  const calcRoute = async () => {
    if (!routeStart || !routeEnd || !mapRef.current) return;
    setRouteLoading(true);
    setRouteError(null);
    setRouteResult(null);

    // clear old route layers
    const map = mapRef.current;
    if (routeGlowRef.current)  { map.removeLayer(routeGlowRef.current);  routeGlowRef.current=null; }
    if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current=null; }
    if (routeFlowRef.current)  { map.removeLayer(routeFlowRef.current);  routeFlowRef.current=null; }

    try {
      const data = await fetchRoute(routeStart, routeEnd, routeProfile);
      if (!data) throw new Error('No route found');
      setRouteResult(data.result);

      // layer 1 — wide outer glow
      const routeGlow = L.geoJSON(data.geojson, {
        style: { color:'#00d4ff', weight:14, opacity:0.12, dashArray:'none' },
      }).addTo(map);
      routeGlowRef.current = routeGlow;

      // layer 2 — solid route line
      const routeLine = L.geoJSON(data.geojson, {
        style: { color:'#00d4ff', weight:4, opacity:0.92, dashArray:'none' },
      }).addTo(map);
      routeLayerRef.current = routeLine;

      // layer 3 — animated flowing dashes
      const routeFlow = L.geoJSON(data.geojson, {
        style: { color:'#ffffff', weight:2.5, opacity:0.75, dashArray:'10 8', className:'route-flow' },
      }).addTo(map);
      routeFlowRef.current = routeFlow;

      // fit bounds
      const bounds = routeLine.getBounds().pad(0.15);
      map.flyToBounds(bounds, { duration:1.2 });
    } catch {
      setRouteError('Rute tidak ditemukan. Coba titik lain.');
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setRouteStart(null); setRouteEnd(null);
    setRouteResult(null); setRouteError(null);
    setPickingPoint(null);
    const map = mapRef.current;
    if (!map) return;
    if (routeGlowRef.current)   { map.removeLayer(routeGlowRef.current);   routeGlowRef.current=null; }
    if (routeLayerRef.current)  { map.removeLayer(routeLayerRef.current);  routeLayerRef.current=null; }
    if (routeFlowRef.current)   { map.removeLayer(routeFlowRef.current);   routeFlowRef.current=null; }
    if (startMarkerRef.current) { map.removeLayer(startMarkerRef.current); startMarkerRef.current=null; }
    if (endMarkerRef.current)   { map.removeLayer(endMarkerRef.current);   endMarkerRef.current=null; }
  };

  // ── FLY TO FEATURE ────────────────────────────────────────────────────────
  const flyToFeature = (idx: number) => {
    const f=listedFeatures[idx];
    if (!f||!mapRef.current) return;
    setSelectedIdx(idx);
    const center=getCenter(f.geometry);
    if (!center) return;
    mapRef.current.flyTo(center, f.geometry.type==='Point'?17:16, { duration:1.0 });
    if (hlMarker.current) { mapRef.current.removeLayer(hlMarker.current); hlMarker.current=null; }
    const pulse = L.divIcon({
      className:'',
      html:`<div style="width:28px;height:28px;background:rgba(230,57,70,0.25);border:3px solid #e63946;border-radius:50%;animation:pulse-ring 1.5s ease-out infinite;position:relative;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#e63946;border-radius:50%;"></div></div>`,
      iconSize:[28,28], iconAnchor:[14,14],
    });
    hlMarker.current = L.marker(center, { icon:pulse, zIndexOffset:1000 }).addTo(mapRef.current);
    setTimeout(()=>{ if(hlMarker.current&&mapRef.current){mapRef.current.removeLayer(hlMarker.current);hlMarker.current=null;} }, 4000);
    if (f.properties.name) {
      L.popup({ offset:[0,-8] }).setLatLng(center).setContent(`<b>${f.properties.name}</b>`).openOn(mapRef.current);
    }
    setInfoProps({ props:f.properties, geomType:f.geometry.type });
  };

  // ── LAYER TOGGLE ─────────────────────────────────────────────────────────
  const toggleLayer = (key: keyof typeof layerOn) => {
    const map=mapRef.current;
    const refs: Record<string,L.LayerGroup|null> = { roads:roadsRef.current, buildings:buildRef.current, amenity:amenityRef.current, boundary:boundRef.current };
    const layer=refs[key];
    if (!map||!layer) return;
    const newOn=!layerOn[key];
    setLayerOn(prev=>({...prev,[key]:newOn}));
    if (newOn) map.addLayer(layer); else map.removeLayer(layer);
  };

  // ── BASEMAP SWITCH ────────────────────────────────────────────────────────
  const switchBasemap = (bm: Basemap) => {
    const map=mapRef.current, tiles=basemapRef.current;
    if (!map) return;
    Object.values(tiles).forEach(t=>{ if(t) map.removeLayer(t); });
    const tile=tiles[bm];
    if (tile) { tile.addTo(map); tile.bringToBack(); }
    setBasemapState(bm);
  };

  // ── ROUTE SEARCH HELPERS ──────────────────────────────
  const routeSuggestionsFor = (q: string) => {
    const named = allFeatures.filter(f => f.properties.name && String(f.properties.name).trim());
    if (!q.trim()) return named.slice(0, 7);
    const t = q.toLowerCase();
    return named.filter(f => String(f.properties.name).toLowerCase().includes(t)).slice(0, 7);
  };

  const applyRoutePoint = (which: 'start' | 'end', lat: number, lng: number, label: string) => {
    const pt = { lat, lng, label };
    if (which === 'start') {
      setRouteStart(pt); setStartQuery(label); setShowStartSug(false);
    } else {
      setRouteEnd(pt); setEndQuery(label); setShowEndSug(false);
    }
    setRouteResult(null);
    // fly to
    if (mapRef.current) mapRef.current.flyTo([lat, lng], 16, { duration: 1.0 });
  };

  const selectRouteFeature = (which: 'start' | 'end', f: GeoFeature) => {
    const center = getCenter(f.geometry);
    if (!center) return;
    applyRoutePoint(which, center[0], center[1], String(f.properties.name ?? ''));
    if (f.properties.name && mapRef.current) {
      L.popup({ offset:[0,-8] }).setLatLng(center)
        .setContent(`<b>${f.properties.name}</b>`).openOn(mapRef.current);
    }
  };

  // keep text inputs in sync when points are set via map-click / ctx-menu
  useEffect(() => {
    if (routeStart) setStartQuery(routeStart.label);
  }, [routeStart]);
  useEffect(() => {
    if (routeEnd) setEndQuery(routeEnd.label);
  }, [routeEnd]);

  // ── CONTEXT MENU ACTIONS ─────────────────────────────
  const ctxSetStart = () => {
    if (!ctxMenu) return;
    const { lat, lng } = ctxMenu;
    const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setRouteStart({ lat, lng, label });
    setStartQuery(label);
    setRouteResult(null);
    setSideTab('route');
    setCtxMenu(null);
  };

  const ctxSetEnd = () => {
    if (!ctxMenu) return;
    const { lat, lng } = ctxMenu;
    const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setRouteEnd({ lat, lng, label });
    setEndQuery(label);
    setRouteResult(null);
    setSideTab('route');
    setCtxMenu(null);
  };

  const ctxClearRoute = () => {
    clearRoute();
    setCtxMenu(null);
  };

  // ── LOCAL FEATURE SUGGESTIONS ─────────────────────────────────────────────
  const localSuggestions = (() => {
    const q = gmapsQuery.trim().toLowerCase();
    const named = allFeatures.filter(f => f.properties.name && String(f.properties.name).trim());
    if (!q) return named.slice(0, 8);  // show top 8 when input is empty/focused
    return named
      .filter(f => String(f.properties.name).toLowerCase().includes(q))
      .slice(0, 8);
  })();

  // ── GMAPS SEARCH ─────────────────────────────────────────────────────────
  const handleGmapsInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setGmapsQuery(val); setShowSug(true);
    if (debRef.current) clearTimeout(debRef.current);
    // Nominatim call: debounced, min 2 chars to avoid excessive API calls
    if (val.trim().length >= 2) {
      debRef.current = setTimeout(() => sugSearch(val), 400);
    } else {
      sugClear();
    }
  };

  const selectSuggestion = (r: NominatimResult) => {
    const lat=parseFloat(r.lat), lon=parseFloat(r.lon);
    if (mapRef.current&&!isNaN(lat)) {
      mapRef.current.flyTo([lat,lon],16,{ duration:1.5 });
      L.popup().setLatLng([lat,lon]).setContent(`<b>${r.display_name.split(',')[0]}</b>`).openOn(mapRef.current);
    }
    setGmapsQuery(r.display_name.split(',')[0]);
    setShowSug(false); sugClear();
  };

  const selectLocalFeature = (f: GeoFeature) => {
    const center = getCenter(f.geometry);
    if (center && mapRef.current) {
      mapRef.current.flyTo(center, 17, { duration: 1.2 });
      if (f.properties.name) {
        L.popup({ offset:[0,-8] }).setLatLng(center)
          .setContent(`<b>${f.properties.name}</b>`)
          .openOn(mapRef.current);
      }
    }
    setGmapsQuery(String(f.properties.name ?? ''));
    setShowSug(false); sugClear();
    setInfoProps({ props: f.properties, geomType: f.geometry.type });
  };

  // ── DERIVED ────────────────────────────────────────────────────────────────
  const infoData = infoProps ? (() => {
    const p=infoProps.props;
    const name=String(p.name||p.amenity||p.highway||p.building||'Tanpa Nama');
    const desc=findDescription(name);
    const rows=[
      ['Tipe OSM',p.osm_type],['OSM ID',p.osm_id],['Highway',p.highway],
      ['Amenitas',p.amenity],['Bangunan',p.building],['Permukaan',p.surface],
      ['Satu Arah',p.oneway],['Geometri',infoProps.geomType],
    ].filter(([,v])=>v!=null&&v!=='') as [string,string|number|boolean][];
    return { name, desc, rows };
  })() : null;

  const featureIcon = (f: GeoFeature) => {
    const p=f.properties;
    if (p.amenity) return AMENITY_ICONS[String(p.amenity)]??'📌';
    if (f.geometry.type==='Point') return '📍';
    if (f.geometry.type==='LineString'||f.geometry.type==='MultiLineString') return '〰️';
    return '🏗️';
  };

  const featureSubtype = (f: GeoFeature) =>
    `${f.properties.amenity||f.properties.highway||f.properties.building||f.properties.osm_type||'fitur'} · ${f.geometry.type}`;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* SPLASH */}
      <div className={`splash${splash?'':' hidden'}`}>
        <div className="splash-flag">🇲🇨</div>
        <div className="splash-title">Monaco WebGIS</div>
        <div className="splash-sub">Interactive Geographic Information System</div>
        <div className="splash-progress"><div className="splash-bar" /></div>
      </div>

      {/* APP */}
      <div className={`app-wrap${splash?'':' visible'}`}>

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

          {/* tabs */}
          <div className="sb-tabs">
            <div className={`sb-tab${sideTab==='explore'?' active':''}`} onClick={()=>setSideTab('explore')}>
              🗺 JELAJAHI
            </div>
            <div className={`sb-tab${sideTab==='route'?' active':''}`} onClick={()=>setSideTab('route')}>
              🧭 RUTE
            </div>
          </div>

          {/* ── EXPLORE TAB ── */}
          {sideTab === 'explore' && (
            <>
              {/* search */}
              <div className="search-wrap">
                {isMonaco && (
                  <div className="gmaps-label">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Google Maps Search aktif
                  </div>
                )}
                <div className={`search-row${isMonaco?' gmaps-mode':''}`}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  {isMonaco ? (
                    <input type="text" placeholder="Ketik 1 huruf untuk saran Monaco…"
                      value={gmapsQuery} onChange={handleGmapsInput}
                      onFocus={()=>setShowSug(true)}
                      onBlur={()=>setTimeout(()=>setShowSug(false),200)}
                      autoComplete="off" />
                  ) : (
                    <input type="text" placeholder="Cari jalan, tempat, amenitas…"
                      value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                      autoComplete="off" />
                  )}
                </div>
                {isMonaco && showSug && localSuggestions.length > 0 && (
                  <div className="suggestions">
                    {/* ── Local Monaco features (instant) ── */}
                    <div className="sug-section-label">
                      🇲🇨 Di Peta Monaco
                    </div>
                    {localSuggestions.map((f, i) => (
                      <div key={`local-${i}`} className="sug-item" onMouseDown={() => selectLocalFeature(f)}>
                        <span className="sug-icon">{featureIcon(f)}</span>
                        <div>
                          <div className="sug-main">{String(f.properties.name)}</div>
                          <div className="sug-sub">{featureSubtype(f)}</div>
                        </div>
                      </div>
                    ))}

                    {/* ── Nominatim results ── */}
                    {(sugLoading || sugResults.length > 0) && (
                      <>
                        <div className="sug-section-label" style={{ marginTop: 4 }}>
                          🔍 Nominatim Search
                        </div>
                        {sugLoading && <div className="sug-loading">Mencari…</div>}
                        {!sugLoading && sugResults.map(r => (
                          <div key={r.place_id} className="sug-item" onMouseDown={() => selectSuggestion(r)}>
                            <span className="sug-icon">{sugIcon(r.type, r.class)}</span>
                            <div>
                              <div className="sug-main">{r.display_name.split(',')[0]}</div>
                              <div className="sug-sub">{r.display_name.split(',').slice(1,3).join(',').trim() || r.type}</div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="sug-powered">Powered by <span className="sug-gmaps-badge">Google Maps</span> Geocoding</div>
                  </div>
                )}
              </div>

              {/* stats */}
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-num">{totalFeatures.toLocaleString()}</div><div className="stat-label">Total Fitur</div></div>
                <div className="stat-card"><div className="stat-num">{filterStats.building.toLocaleString()}</div><div className="stat-label">Bangunan</div></div>
                <div className="stat-card"><div className="stat-num">{filterStats.highway.toLocaleString()}</div><div className="stat-label">Jalan</div></div>
                <div className="stat-card"><div className="stat-num">{filterStats.amenity.toLocaleString()}</div><div className="stat-label">Fasilitas</div></div>
              </div>

              {/* amenity chips */}
              <div className="filter-section">
                <div className="section-title">Filter Amenitas</div>
                <div className="filter-chips">
                  {[['all','Semua'],['restaurant','🍽️ Resto'],['cafe','☕ Kafe'],
                    ['bar','🍺 Bar'],['hotel','🏨 Hotel'],['hospital','🏥 RS'],
                    ['place_of_worship','⛪ Ibadah']].map(([val,label])=>(
                    <div key={val} className={`chip${activeAmenity===val?' active':''}`}
                      onClick={()=>setActiveAmenity(val)}>{label}</div>
                  ))}
                </div>
              </div>

              {/* layer toggles */}
              <div className="layer-section">
                <div className="section-title">Layer Peta</div>
                {(['roads','buildings','amenity','boundary'] as (keyof typeof layerOn)[]).map((key,i)=>{
                  const colors=['#e63946','#c9a84c','#4fc3f7','#81c784'];
                  const names=['Jalan & Jalur','Bangunan','Amenitas','Batas Wilayah'];
                  return (
                    <div key={key} className="layer-item" onClick={()=>toggleLayer(key)}>
                      <div className="layer-left">
                        <div className="layer-dot" style={{ background:colors[i] }} />
                        <span className="layer-name">{names[i]}</span>
                      </div>
                      <button className={`toggle${layerOn[key]?' on':''}`} />
                    </div>
                  );
                })}
              </div>

              {/* feature list */}
              <div className="feature-list">
                {loading ? (
                  <div className="no-results">Memuat data Monaco…</div>
                ) : listedFeatures.length===0 ? (
                  <div className="no-results">Tidak ada hasil ditemukan</div>
                ) : listedFeatures.map((f,idx)=>(
                  <div key={idx} className={`feature-item${selectedIdx===idx?' selected':''}`} onClick={()=>flyToFeature(idx)}>
                    <div className="feature-name">{featureIcon(f)} {String(f.properties.name)}</div>
                    <div className="feature-type">{featureSubtype(f)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── ROUTE TAB ── */}
          {sideTab === 'route' && (
            <div className="route-panel">
              {/* inputs */}
              <div className="route-section">
                <div className="section-title" style={{ marginBottom:12 }}>📍 Titik Rute</div>
                <div className="route-input-group">

                  {/* ── START INPUT ── */}
                  <div style={{ position:'relative' }}>
                    <div className={`route-input-row${routeStart?' set':''}`}>
                      <div className="route-dot" style={{ background:'#22c55e' }} />
                      <input
                        type="text"
                        placeholder="Ketik nama tempat awal…"
                        value={startQuery}
                        onChange={e => { setStartQuery(e.target.value); setRouteStart(null); setShowStartSug(true); }}
                        onFocus={() => setShowStartSug(true)}
                        onBlur={() => setTimeout(() => setShowStartSug(false), 200)}
                        autoComplete="off"
                      />
                      {(routeStart || startQuery) ? (
                        <button className="route-clear-btn" onClick={() => {
                          setRouteStart(null); setStartQuery(''); setShowStartSug(false); setRouteResult(null);
                          if (startMarkerRef.current && mapRef.current) { mapRef.current.removeLayer(startMarkerRef.current); startMarkerRef.current=null; }
                        }}>✕</button>
                      ) : (
                        <button className="route-map-pick-btn"
                          onClick={() => setPickingPoint(p => p==='start' ? null : 'start')}
                          title="Klik titik di peta">
                          {pickingPoint==='start' ? '✕' : '🗺'}
                        </button>
                      )}
                    </div>
                    {showStartSug && (
                      <div className="route-sug-dropdown">
                        <div className="sug-section-label">🇲🇨 Tempat di Monaco</div>
                        {routeSuggestionsFor(startQuery).map((f, i) => (
                          <div key={i} className="sug-item" onMouseDown={() => selectRouteFeature('start', f)}>
                            <span className="sug-icon">{featureIcon(f)}</span>
                            <div>
                              <div className="sug-main">{String(f.properties.name)}</div>
                              <div className="sug-sub">{featureSubtype(f)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="route-connector">
                    <div className="route-line-v" />
                    <button
                      className="route-swap-btn"
                      title="Tukar titik mulai & tujuan"
                      onClick={() => {
                        const tmpPt = routeStart; const tmpQ = startQuery;
                        setRouteStart(routeEnd); setStartQuery(endQuery);
                        setRouteEnd(tmpPt);   setEndQuery(tmpQ);
                        setRouteResult(null);
                      }}
                    >⇅</button>
                    <div className="route-line-v" />
                  </div>

                  {/* ── END INPUT ── */}
                  <div style={{ position:'relative' }}>
                    <div className={`route-input-row${routeEnd?' set':''}`}>
                      <div className="route-dot" style={{ background:'#e63946' }} />
                      <input
                        type="text"
                        placeholder="Ketik nama tempat tujuan…"
                        value={endQuery}
                        onChange={e => { setEndQuery(e.target.value); setRouteEnd(null); setShowEndSug(true); }}
                        onFocus={() => setShowEndSug(true)}
                        onBlur={() => setTimeout(() => setShowEndSug(false), 200)}
                        autoComplete="off"
                      />
                      {(routeEnd || endQuery) ? (
                        <button className="route-clear-btn" onClick={() => {
                          setRouteEnd(null); setEndQuery(''); setShowEndSug(false); setRouteResult(null);
                          if (endMarkerRef.current && mapRef.current) { mapRef.current.removeLayer(endMarkerRef.current); endMarkerRef.current=null; }
                        }}>✕</button>
                      ) : (
                        <button className="route-map-pick-btn"
                          onClick={() => setPickingPoint(p => p==='end' ? null : 'end')}
                          title="Klik titik di peta">
                          {pickingPoint==='end' ? '✕' : '🗺'}
                        </button>
                      )}
                    </div>
                    {showEndSug && (
                      <div className="route-sug-dropdown">
                        <div className="sug-section-label">🇲🇨 Tempat di Monaco</div>
                        {routeSuggestionsFor(endQuery).map((f, i) => (
                          <div key={i} className="sug-item" onMouseDown={() => selectRouteFeature('end', f)}>
                            <span className="sug-icon">{featureIcon(f)}</span>
                            <div>
                              <div className="sug-main">{String(f.properties.name)}</div>
                              <div className="sug-sub">{featureSubtype(f)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* mode */}
                <div className="route-mode-row">
                  {([['driving','🚗','Mobil'],['walking','🚶','Jalan'],['cycling','🚴','Sepeda']] as [RouteProfile,string,string][]).map(([m,ico,label])=>(
                    <button key={m} className={`route-mode-btn${routeProfile===m?' active':''}`} onClick={()=>setRouteProfile(m)}>
                      {ico} {label}
                    </button>
                  ))}
                </div>

                <button className="route-calc-btn" disabled={!routeStart||!routeEnd||routeLoading} onClick={calcRoute}>
                  {routeLoading ? 'Menghitung…' : '🧭 Hitung Rute'}
                </button>

                {!routeStart && !routeEnd && (
                  <div className="route-hint">Ketik nama tempat atau klik 🗺 lalu klik peta</div>
                )}

                {routeError && (
                  <div className="route-hint" style={{ color:'#f87171', marginTop:6 }}>{routeError}</div>
                )}
              </div>

              {/* loading */}
              {routeLoading && (
                <div className="route-loading">
                  <div className="route-spinner" />
                  Menghitung rute…
                </div>
              )}

              {/* result */}
              {routeResult && !routeLoading && (
                <>
                  <div className="route-result">
                    <div className="route-result-header">
                      <div className="route-stat">
                        <div className="route-stat-val">{routeResult.distanceKm.toFixed(2)}</div>
                        <div className="route-stat-label">km jarak</div>
                      </div>
                      <div className="route-stat">
                        <div className="route-stat-val">{fmtTime(routeResult.durationMin*60)}</div>
                        <div className="route-stat-label">estimasi waktu</div>
                      </div>
                      <div className="route-stat">
                        <div className="route-stat-val">{routeResult.steps.length}</div>
                        <div className="route-stat-label">langkah</div>
                      </div>
                    </div>
                    <button className="route-clear-all" onClick={clearRoute}>🗑 Hapus Rute</button>
                  </div>

                  <div className="route-steps">
                    {routeResult.steps.filter(s=>s.maneuver!=='arrive'||routeResult.steps.indexOf(s)===routeResult.steps.length-1).map((step,i)=>(
                      <div key={i} className="step-item">
                        <div className="step-num">{MANEUVER_ICONS[step.maneuver]??'→'}</div>
                        <div>
                          <div className="step-text">
                            {step.name ? <><strong style={{color:'#c9a84c'}}>{step.name}</strong></> : (
                              step.maneuver==='depart' ? 'Mulai perjalanan' :
                              step.maneuver==='arrive' ? 'Tiba di tujuan 🏁' :
                              step.maneuver==='roundabout'||step.maneuver==='rotary' ? 'Masuk bundaran' :
                              `Belok ${step.maneuver.replace(/-/g,' ')}`
                            )}
                          </div>
                          {step.distance>0 && <div className="step-dist">{fmtDist(step.distance)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── MAP ── */}
        <div className="map-area">
          <div id="map" />

          {/* right-click context menu */}
          {ctxMenu && (
            <div
              className="ctx-menu"
              style={{
                left: Math.min(ctxMenu.x, window.innerWidth  - 216),
                top:  Math.min(ctxMenu.y, window.innerHeight - 220),
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="ctx-header">
                Aksi Peta
                <div className="ctx-coord">{ctxMenu.lat.toFixed(5)}, {ctxMenu.lng.toFixed(5)}</div>
              </div>

              <div className="ctx-item" onClick={ctxSetStart}>
                <div className="ctx-dot" style={{ background:'#22c55e' }} />
                Jadikan Titik Mulai
                {routeStart && <span className="ctx-badge set">✓ Ganti</span>}
              </div>

              <div className="ctx-item" onClick={ctxSetEnd}>
                <div className="ctx-dot" style={{ background:'#e63946' }} />
                Jadikan Titik Tujuan
                {routeEnd && <span className="ctx-badge set">✓ Ganti</span>}
              </div>

              {(routeStart || routeEnd || routeResult) && (
                <>
                  <div className="ctx-divider" />
                  <div className="ctx-item danger" onClick={ctxClearRoute}>
                    🗑 Hapus Rute
                  </div>
                </>
              )}
            </div>
          )}

          {/* click-to-pick hint */}
          {pickingPoint && (
            <div className="click-hint">
              Klik peta untuk memilih titik {pickingPoint==='start'?'MULAI 🟢':'TUJUAN 🔴'}
            </div>
          )}

          {/* legend */}
          <div className="legend">
            <div className="legend-title">Legenda</div>
            {[['#e63946','Jalan Primer'],['#ff8c42','Jalan Sekunder'],
              ['#ffd166','Jalan Lokal'],['#c9a84c','Bangunan'],
              ['#4fc3f7','Amenitas']].map(([color,label])=>(
              <div key={label} className="legend-item">
                <div className="legend-color" style={{ background:color }} />
                {label}
              </div>
            ))}
          </div>

          {/* map controls */}
          <div className="map-overlay">
            <div className="map-btn" onClick={()=>mapRef.current?.zoomIn()}>+</div>
            <div className="map-btn" onClick={()=>mapRef.current?.zoomOut()}>−</div>
            <div className="map-btn" onClick={()=>mapRef.current?.flyTo(MONACO_CENTER,14,{duration:1.2})}>🎯</div>
            <div className="map-btn" onClick={()=>mapRef.current?.locate({setView:true,maxZoom:16})}>📍</div>
          </div>

          {/* info panel */}
          {infoData && (
            <div className="info-panel">
              <button className="info-close" onClick={()=>setInfoProps(null)}>✕</button>
              <div className="info-title">{infoData.name}</div>
              {infoData.desc && (
                <>
                  <div className="info-category">{infoData.desc.emoji} {infoData.desc.cat}</div>
                  <div className="info-desc">{infoData.desc.desc}</div>
                  {infoData.rows.length>0 && <div className="info-divider" />}
                </>
              )}
              {infoData.rows.map(([k,v])=>(
                <div key={k} className="info-row">
                  <span className="info-key">{k}</span>
                  <span className="info-val">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* basemap bar */}
          <div className="basemap-bar">
            {(['dark','osm','satellite','topo'] as Basemap[]).map(bm=>(
              <div key={bm} className={`bm-btn${basemap===bm?' active':''}`} onClick={()=>switchBasemap(bm)}>
                {bm==='dark'?'Monaco':bm==='osm'?'OSM':bm==='satellite'?'Satelit':'Topo'}
              </div>
            ))}
          </div>

          {/* loader */}
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
