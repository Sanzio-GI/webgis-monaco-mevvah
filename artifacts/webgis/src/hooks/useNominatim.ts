import { useState, useCallback, useRef } from 'react';

export interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  address?: Record<string, string>;
}

// Monaco bounding box: west, south, east, north
// Nominatim viewbox format: left,top,right,bottom (min_lon, max_lat, max_lon, min_lat)
const MONACO_VIEWBOX = '7.38,43.76,7.47,43.72';

export function useNominatim() {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '8');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('viewbox', MONACO_VIEWBOX);
      url.searchParams.set('bounded', '1');

      const res = await fetch(url.toString(), {
        signal: abortRef.current.signal,
        headers: { 'Accept-Language': 'en' },
      });
      const data: NominatimResult[] = await res.json();
      setResults(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResults([]);
    setLoading(false);
  }, []);

  return { results, loading, search, clear };
}
