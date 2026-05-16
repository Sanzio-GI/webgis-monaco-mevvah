import * as L from 'leaflet';

declare module 'leaflet' {
  interface MarkerCluster {
    getChildCount(): number;
  }
  interface MarkerClusterGroupOptions {
    maxClusterRadius?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    iconCreateFunction?: (cluster: MarkerCluster) => L.DivIcon;
  }
  interface MarkerClusterGroup extends L.Layer {
    addLayer(layer: L.Layer): this;
    removeLayer(layer: L.Layer): this;
    clearLayers(): this;
  }
  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
