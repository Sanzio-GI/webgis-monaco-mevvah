export const CATEGORIES: Record<string, { color: string; label: string }> = {
  amenity:  { color: '#f97316', label: 'Amenity' },
  highway:  { color: '#38bdf8', label: 'Highway' },
  tourism:  { color: '#a78bfa', label: 'Tourism' },
  shop:     { color: '#34d399', label: 'Shop' },
  railway:  { color: '#fb7185', label: 'Railway' },
  building: { color: '#fbbf24', label: 'Building' },
  other:    { color: '#94a3b8', label: 'Other' },
};

export const CATEGORY_EMOJIS: Record<string, string> = {
  amenity: '🏪', highway: '🛣', tourism: '🏛', shop: '🛍',
  railway: '🚉', building: '🏢', other: '📍',
};

export type GeoFeatureProperties = Record<string, string | number | boolean | null>;

export interface GeoFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: GeoFeatureProperties;
  _marker?: L.Marker;
}

export function getCategory(props: GeoFeatureProperties): string {
  if (props.amenity)  return 'amenity';
  if (props.highway)  return 'highway';
  if (props.tourism)  return 'tourism';
  if (props.shop)     return 'shop';
  if (props.railway)  return 'railway';
  if (props.building) return 'building';
  return 'other';
}

export function getColor(cat: string): string {
  return CATEGORIES[cat]?.color ?? '#94a3b8';
}

export function getFeatureName(props: GeoFeatureProperties): string {
  if (props.name) return String(props.name);
  if (props.amenity) return `Amenity: ${props.amenity}`;
  if (props.shop)    return `Shop: ${props.shop}`;
  if (props.tourism) return `Tourism: ${props.tourism}`;
  if (props.highway) return `Highway: ${props.highway}`;
  if (props.railway) return `Railway: ${props.railway}`;
  if (props.building) return `Building: ${props.building}`;
  return `OSM #${props.osm_id ?? '?'}`;
}

export function getFeatureSubtype(props: GeoFeatureProperties): string {
  const cat = getCategory(props);
  const val = props[cat];
  return `${CATEGORIES[cat]?.label ?? 'Other'}${val && val !== true ? ' · ' + val : ''}`;
}
