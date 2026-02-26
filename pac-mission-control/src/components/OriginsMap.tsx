'use client';

import * as React from 'react';
import Map, { Source, Layer, NavigationControl, ScaleControl, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMemo, useState } from 'react';

interface OriginsMapProps {
  data: Array<{
    origem: string;
    lat: number;
    lon: number;
    volume: number; // For size
    avg: number;    // For color
  }>;
  onSelectOrigin?: (origin: string) => void;
  selectedOrigin?: string | null;
}

export function OriginsMap({ data, onSelectOrigin, selectedOrigin }: OriginsMapProps) {
  const mapRef = React.useRef<MapRef>(null);
  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, object: any} | null>(null);

  // GeoJSON Data Source
  const geoJsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: data.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
        properties: {
          origem: d.origem,
          volume: d.volume,
          avg: d.avg,
        }
      }))
    };
  }, [data]);

  const maxVol = Math.max(...data.map(d => d.volume), 10);

  // Layers
  
  // 1. Circle Layer
  const layerStyle: any = {
    id: 'origin-circles',
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'volume'],
        0, 3,
        maxVol, 20
      ],
      'circle-color': [
        'step', ['get', 'avg'],
        '#22c55e', // < 48h (Green)
        48, '#eab308', // 48-72h (Yellow)
        72, '#ef4444' // > 72h (Red)
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          2,
          1
      ],
      'circle-stroke-color': '#ffffff'
    }
  };

  const selectedLayerStyle: any = {
    id: 'origin-highlight',
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'volume'],
        0, 5,
        maxVol, 24
      ],
      'circle-color': 'transparent',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff'
    }
  };

  // 2. Symbol Layer (Labels) - visible on zoom
  const labelLayerStyle: any = {
    id: 'origin-labels',
    type: 'symbol',
    layout: {
      'text-field': ['get', 'origem'],
      'text-font': ['Open Sans Bold'],
      'text-size': 10,
      'text-offset': [0, 1.5],
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1
    },
    minzoom: 6
  };
  
  const onHover = React.useCallback((event: any) => {
    const {
      features,
      point: {x, y}
    } = event;
    const hoveredFeature = features && features[0];

    // If we want detailed tooltip
    setHoverInfo(hoveredFeature && {feature: hoveredFeature, x, y, object: hoveredFeature.properties});
  }, []);

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden bg-gray-900">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -55.9, // Center of MT roughly
          latitude: -13.0,
          zoom: 5
        }}
        maxZoom={10}
        minZoom={4}
        // Carto Voyager (Colored/Street style, No Token Required)
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        interactiveLayerIds={['origin-circles']}
        onClick={(e) => {
            if (e.features && e.features.length > 0 && onSelectOrigin) {
                onSelectOrigin(e.features[0].properties.origem);
            }
        }}
        onMouseMove={onHover}
        cursor={hoverInfo ? 'pointer' : 'default'}
      >
        <NavigationControl position="top-right" />
        <ScaleControl />

        <Source id="origins-data" type="geojson" data={geoJsonData as any}>
          <Layer {...layerStyle} />
          <Layer {...labelLayerStyle} />
        </Source>

        {hoverInfo && (
           <div className="absolute z-10 pointer-events-none bg-gray-950/90 border border-gray-700 p-2 rounded text-white text-xs shadow-xl" style={{left: hoverInfo.x, top: hoverInfo.y + 10}}>
              <div className="font-bold">{hoverInfo.object.origem}</div>
              <div>Vol: {hoverInfo.object.volume}</div>
              <div>Ciclo: {hoverInfo.object.avg.toFixed(1)}h</div>
           </div>
        )}
      </Map>
    </div>
  );
}
