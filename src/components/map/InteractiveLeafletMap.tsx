import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../constants/colors';
import { AppText } from '../ui/AppText';
import { MapPin } from '../../types';

interface UIMapPin extends MapPin {
  creator_name?: string;
  moments?: any[];
  deletion_request?: any;
}

interface InteractiveLeafletMapProps {
  places: UIMapPin[];
  routes?: any[];
  selectedPin?: UIMapPin | null;
  onSelectPin?: (pin: UIMapPin) => void;
  onMapClicked?: () => void;
  onMapLongPress?: (coords: { lat: number; lng: number }) => void;
  clearTempPinTrigger?: number;
  activeFilter?: string;
  style?: any;
  showLegend?: boolean;
  focusLocation?: { lat: number; lng: number; zoom?: number } | null;
  userLocation?: { lat: number; lng: number } | null;
  resetCompassTrigger?: number;
}

const PIN_COLORS: Record<string, string> = {
  home: '#8B7355',
  together: '#C05640',
  upcoming: '#6E8B74',
  bucket: '#A89E8D',
};

export const InteractiveLeafletMap: React.FC<InteractiveLeafletMapProps> = ({
  places,
  routes = [],
  selectedPin,
  onSelectPin,
  onMapClicked,
  onMapLongPress,
  clearTempPinTrigger,
  activeFilter = 'all',
  style,
  showLegend = false,
  focusLocation,
  userLocation,
  resetCompassTrigger,
}) => {
  const webViewRef = useRef<WebView>(null);
  const isMapReadyRef = useRef<boolean>(false);
  const maptilerApiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY || '';

  // Stable HTML bundle: memoized ONLY by API key so WebView NEVER unmounts/reloads on data updates
  const mapHtml = useMemo(() => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body, #map { width: 100%; height: 100%; background: #F7F3EC; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Luxury Pin Styling */
    .pin-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .pin-core {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #FFFFFF;
      border: 3.5px solid #C05640;
      box-shadow: 0 4px 10px rgba(0,0,0,0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: #1C1C1E;
    }
    .pin-pulse {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(192, 86, 64, 0.25);
      animation: pulse 2s infinite ease-out;
      pointer-events: none;
    }
    @keyframes pulse {
      0% { transform: scale(0.6); opacity: 0.8; }
      100% { transform: scale(1.4); opacity: 0; }
    }
    .pin-selected .pin-core {
      transform: scale(1.35);
      border-width: 4px;
      box-shadow: 0 8px 18px rgba(192, 86, 64, 0.5);
    }

    /* Trajectory curve styling */
    .flight-arc {
      stroke: #C05640;
      stroke-width: 2.5;
      stroke-dasharray: 6, 6;
      stroke-linecap: round;
      fill: none;
      opacity: 0.85;
      animation: dash 30s linear infinite;
    }
    @keyframes dash {
      to { stroke-dashoffset: -1000; }
    }

    /* Live Location Radar Marker */
    .live-location-wrap {
      position: relative;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .live-location-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #2A6BF2;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(42, 107, 242, 0.45);
    }
    .live-location-pulse {
      position: absolute;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(42, 107, 242, 0.3);
      animation: livePulse 2s infinite ease-out;
      pointer-events: none;
    }
    @keyframes livePulse {
      0% { transform: scale(0.5); opacity: 0.9; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* Minimalist Map Controls */
    .leaflet-bottom.leaflet-left {
      bottom: 96px !important;
      left: 16px !important;
    }
    .leaflet-bottom.leaflet-right {
      bottom: 6px !important;
      right: 6px !important;
    }
    .leaflet-control-zoom {
      border: 1px solid #E6E0D4 !important;
      border-radius: 12px !important;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
    }
    .leaflet-control-zoom a {
      background: rgba(247, 243, 236, 0.95) !important;
      color: #2C221E !important;
      border-bottom: 1px solid #E6E0D4 !important;
      width: 34px !important;
      height: 34px !important;
      line-height: 34px !important;
      font-size: 16px !important;
    }
    .leaflet-control-attribution {
      font-size: 8px !important;
      background: rgba(247, 243, 236, 0.8) !important;
      color: #8C7F75 !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    let placesData = [];
    let routesData = [];
    let selectedId = null;
    let currentFilter = "all";
    const pinColors = ${JSON.stringify(PIN_COLORS)};
    const apiKey = "${maptilerApiKey}";

    // 1. Initialize Map
    const map = L.map('map', {
      center: [25.0, 15.0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    setTimeout(function() {
      map.invalidateSize();
    }, 200);

    // 2. MapTiler Pastel Luxury Tile Layer (With Guaranteed Non-Looping Fallback)
    const maptilerUrl = 'https://api.maptiler.com/maps/pastel/256/{z}/{x}/{y}.png?key=' + apiKey;
    const fallbackUrl = 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png';

    const tileLayer = L.tileLayer(apiKey ? maptilerUrl : fallbackUrl, {
      maxZoom: 18,
      attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> &copy; OpenStreetMap'
    }).addTo(map);

    let hasSwitchedToFallback = false;
    tileLayer.on('tileerror', function() {
      if (!hasSwitchedToFallback && tileLayer._url !== fallbackUrl) {
        hasSwitchedToFallback = true;
        tileLayer.setUrl(fallbackUrl);
      }
    });

    const markerMap = {};
    const arcLayerGroup = L.layerGroup().addTo(map);
    const markerLayerGroup = L.layerGroup().addTo(map);

    function createMarkerIcon(place, isSelected) {
      const color = pinColors[place.type] || '#C05640';
      const initial = (place.city || '?').charAt(0).toUpperCase();
      const pulseHtml = (place.type === 'together' || isSelected) ? '<div class="pin-pulse" style="background: ' + color + '33;"></div>' : '';

      return L.divIcon({
        className: 'custom-pin-wrap',
        html: '<div class="pin-marker ' + (isSelected ? 'pin-selected' : '') + '">' +
                pulseHtml +
                '<div class="pin-core" style="border-color: ' + color + '; color: ' + color + ';">' + initial + '</div>' +
              '</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
    }

    function getCurvedPoints(start, end) {
      const lat1 = start[0], lng1 = start[1];
      const lat2 = end[0], lng2 = end[1];

      const dLat = lat2 - lat1;
      let dLng = lng2 - lng1;

      if (dLng > 180) dLng -= 360;
      if (dLng < -180) dLng += 360;

      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < 0.001) return [[lat1, lng1], [lat2, lng2]];

      const midLat = (lat1 + lat2) / 2;
      const midLng = (lng1 + lng2) / 2;

      let perpLng = -dLat / dist;
      let perpLat = dLng / dist;

      if (midLat >= 0) {
        if (perpLat < 0) {
          perpLat = -perpLat;
          perpLng = -perpLng;
        }
      } else {
        if (perpLat > 0) {
          perpLat = -perpLat;
          perpLng = -perpLng;
        }
      }

      if (Math.abs(perpLat) < 0.15) {
        perpLng = 0.7;
      }

      const curvature = Math.min(dist * 0.15, 8);
      const controlLat = midLat + perpLat * curvature;
      const controlLng = midLng + perpLng * curvature;

      const points = [];
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const oneMinusT = 1 - t;
        const lat = oneMinusT * oneMinusT * lat1 + 2 * oneMinusT * t * controlLat + t * t * lat2;
        const lng = oneMinusT * oneMinusT * lng1 + 2 * oneMinusT * t * controlLng + t * t * lng2;
        points.push([lat, lng]);
      }
      return points;
    }

    function renderPinsAndArcs() {
      markerLayerGroup.clearLayers();
      arcLayerGroup.clearLayers();

      const homePin = placesData.find(p => p.type === 'home') || placesData[0];

      placesData.forEach(place => {
        if (place.lat == null || place.lng == null || (place.lat === 0 && place.lng === 0)) return;
        if (currentFilter !== 'all' && place.type !== currentFilter) return;

        const isSelected = selectedId === place.id;
        const marker = L.marker([place.lat, place.lng], {
          icon: createMarkerIcon(place, isSelected),
          zIndexOffset: isSelected ? 1000 : 0
        });

        marker.on('click', function(e) {
          if (e && e.originalEvent) {
            L.DomEvent.stopPropagation(e);
          }
          selectedId = place.id;
          renderPinsAndArcs();
          window.centerOnPinWithOffset(place.lat, place.lng);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PIN_SELECTED',
              placeId: place.id
            }));
          }
        });

        markerLayerGroup.addLayer(marker);
        markerMap[place.id] = marker;
      });

      // 1. Draw Journey Routes
      let hasRouteArcs = false;
      if (routesData && routesData.length > 0) {
        routesData.forEach(route => {
          if (route.points && route.points.length > 1) {
            for (let i = 0; i < route.points.length - 1; i++) {
              const p1 = route.points[i];
              const p2 = route.points[i + 1];
              if (p1.lat != null && p1.lng != null && p2.lat != null && p2.lng != null) {
                const arcPoints = getCurvedPoints([p1.lat, p1.lng], [p2.lat, p2.lng]);
                const arcPolyline = L.polyline(arcPoints, {
                  className: 'flight-arc',
                  color: '#C05640'
                });
                arcLayerGroup.addLayer(arcPolyline);
                hasRouteArcs = true;
              }
            }
          }
        });
      }

      // 2. Draw arcs from homePin to destinations if no custom routes
      if (!hasRouteArcs && homePin) {
        placesData.forEach(place => {
          if (place.lat == null || place.lng == null || (place.lat === 0 && place.lng === 0)) return;
          if (currentFilter !== 'all' && place.type !== currentFilter) return;
          if (homePin.id !== place.id && (place.type === 'together' || place.type === 'upcoming')) {
            const arcPoints = getCurvedPoints([homePin.lat, homePin.lng], [place.lat, place.lng]);
            const arcPolyline = L.polyline(arcPoints, {
              className: 'flight-arc',
              color: pinColors[place.type] || '#C05640'
            });
            arcLayerGroup.addLayer(arcPolyline);
          }
        });
      }
    }

    // Dynamic Pin Center with Vertical Offset (positions pin above bottom peek card)
    window.centerOnPinWithOffset = function(lat, lng, targetZoom) {
      if (lat == null || lng == null || (lat === 0 && lng === 0)) return;
      const zoom = targetZoom || Math.max(map.getZoom(), 7);
      // Project to pixel space and offset camera southwards by 105px so the marker sits in the upper visible area
      const targetPoint = map.project([lat, lng], zoom).add([0, 105]);
      const targetLatLng = map.unproject(targetPoint, zoom);
      map.flyTo(targetLatLng, zoom, { duration: 0.9, easeLinearity: 0.25 });
    };

    // Auto-Fit All Pins At Once on screen with comfortable padding
    window.fitAllPins = function() {
      const validPins = placesData.filter(function(p) {
        if (p.lat == null || p.lng == null || (p.lat === 0 && p.lng === 0)) return false;
        if (currentFilter !== 'all' && p.type !== currentFilter) return false;
        return true;
      });

      if (validPins.length > 1) {
        const bounds = L.latLngBounds(validPins.map(function(p) { return [p.lat, p.lng]; }));
        map.fitBounds(bounds, {
          paddingTopLeft: [50, 120],
          paddingBottomRight: [50, 100],
          maxZoom: 13,
          animate: true,
          duration: 0.9
        });
      } else if (validPins.length === 1) {
        window.centerOnPinWithOffset(validPins[0].lat, validPins[0].lng, 8);
      } else {
        map.flyTo([25.0, 15.0], 2, { duration: 0.8 });
      }
    };

    // Incremental Data Updater: NEVER reloads the WebView!
    window.updatePlacesData = function(newPlaces, newRoutes, newSelId, newFilter, autoFit) {
      placesData = newPlaces || [];
      routesData = newRoutes || [];
      if (newSelId !== undefined) selectedId = newSelId;
      if (newFilter !== undefined) currentFilter = newFilter;
      renderPinsAndArcs();
      if (autoFit) {
        window.fitAllPins();
      }
    };

    window.updateSelectedPin = function(pinId, lat, lng) {
      selectedId = pinId;
      renderPinsAndArcs();
      window.centerOnPinWithOffset(lat, lng);
    };

    window.clearSelectedPin = function() {
      selectedId = null;
      renderPinsAndArcs();
    };

    window.flyToLocation = function(lat, lng, zoom) {
      if (window.searchMarker) {
        map.removeLayer(window.searchMarker);
      }
      window.centerOnPinWithOffset(lat, lng, zoom || 10);
      const pulseIcon = L.divIcon({
        className: 'search-target-pin',
        html: '<div class="pin-marker pin-selected"><div class="pin-pulse" style="background: rgba(192, 86, 64, 0.45);"></div><div class="pin-core" style="border-color: #C05640; color: #C05640; font-size: 13px;">📍</div></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      window.searchMarker = L.marker([lat, lng], { icon: pulseIcon }).addTo(map);
    };

    window.showUserLiveLocation = function(lat, lng) {
      if (window.userLocationMarker) {
        map.removeLayer(window.userLocationMarker);
      }
      window.centerOnPinWithOffset(lat, lng, 14);
      const liveIcon = L.divIcon({
        className: 'user-live-location-pin',
        html: '<div class="live-location-wrap"><div class="live-location-pulse"></div><div class="live-location-dot"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      window.userLocationMarker = L.marker([lat, lng], { icon: liveIcon, zIndexOffset: 2000 }).addTo(map);
    };

    window.updateFilter = function(filter) {
      currentFilter = filter;
      renderPinsAndArcs();
      window.fitAllPins();
    };

    let longPressTimer = null;
    let touchStartPoint = null;
    let didTriggerLongPress = false;

    function clearLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    function triggerLongPress(lat, lng) {
      clearLongPress();
      didTriggerLongPress = true;

      if (window.tempDropPin) {
        map.removeLayer(window.tempDropPin);
      }
      const dropIcon = L.divIcon({
        className: 'temp-drop-pin-wrap',
        html: '<div class="pin-marker pin-selected"><div class="pin-pulse" style="background: rgba(192, 86, 64, 0.45);"></div><div class="pin-core" style="border-color: #C05640; color: #C05640; font-size: 13px;">📍</div></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      window.tempDropPin = L.marker([lat, lng], { icon: dropIcon, zIndexOffset: 3000 }).addTo(map);

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MAP_LONG_PRESS',
          lat: lat,
          lng: lng
        }));
      }
    }

    window.clearTempDropPin = function() {
      if (window.tempDropPin) {
        map.removeLayer(window.tempDropPin);
        window.tempDropPin = null;
      }
    };

    map.on('mousedown touchstart', function(e) {
      didTriggerLongPress = false;
      clearLongPress();
      if (!e.latlng) return;
      const originalEvent = e.originalEvent;
      const touch = (originalEvent.touches && originalEvent.touches[0]) || originalEvent;
      touchStartPoint = { x: touch.clientX, y: touch.clientY, lat: e.latlng.lat, lng: e.latlng.lng };

      longPressTimer = setTimeout(function() {
        triggerLongPress(touchStartPoint.lat, touchStartPoint.lng);
      }, 500);
    });

    map.on('mousemove touchmove', function(e) {
      if (touchStartPoint && longPressTimer) {
        const originalEvent = e.originalEvent;
        const touch = (originalEvent.touches && originalEvent.touches[0]) || originalEvent;
        const dx = touch.clientX - touchStartPoint.x;
        const dy = touch.clientY - touchStartPoint.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          clearLongPress();
        }
      }
    });

    map.on('mouseup touchend touchcancel dragstart movestart zoomstart', function() {
      clearLongPress();
    });

    map.on('contextmenu', function(e) {
      if (e.latlng && !didTriggerLongPress) {
        triggerLongPress(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('click', function(e) {
      if (didTriggerLongPress) {
        didTriggerLongPress = false;
        return;
      }
      if (selectedId) {
        selectedId = null;
        renderPinsAndArcs();
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MAP_CLICKED',
          lat: e.latlng.lat,
          lng: e.latlng.lng
        }));
      }
    });

    // Notify React Native that Map Engine is fully initialized
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
    }
  </script>
</body>
</html>
    `;
  }, [maptilerApiKey]);

  const syncPlacesToMap = useCallback((autoFit: boolean = false) => {
    if (!isMapReadyRef.current) return;
    const validPlaces = places.filter(p => p.lat != null && p.lng != null && (p.lat !== 0 || p.lng !== 0));
    const code = `if (window.updatePlacesData) {
      window.updatePlacesData(
        ${JSON.stringify(validPlaces)},
        ${JSON.stringify(routes)},
        ${JSON.stringify(selectedPin?.id || null)},
        ${JSON.stringify(activeFilter)},
        ${autoFit ? 'true' : 'false'}
      );
    }`;
    webViewRef.current?.injectJavaScript(code);
  }, [places, routes, selectedPin?.id, activeFilter]);

  // Push place updates to map dynamically without tearing down WebView
  useEffect(() => {
    if (isMapReadyRef.current) {
      syncPlacesToMap(false);
    }
  }, [places, routes, syncPlacesToMap]);

  // Handle Filter switch with auto-fit bounds
  useEffect(() => {
    if (isMapReadyRef.current) {
      const code = `if (window.updateFilter) { window.updateFilter(${JSON.stringify(activeFilter)}); }`;
      webViewRef.current?.injectJavaScript(code);
    }
  }, [activeFilter]);

  // Handle selected pin updates (smooth offset glide)
  useEffect(() => {
    if (isMapReadyRef.current) {
      if (selectedPin && selectedPin.lat != null && selectedPin.lng != null) {
        const code = `if (window.updateSelectedPin) { window.updateSelectedPin(${JSON.stringify(selectedPin.id)}, ${selectedPin.lat}, ${selectedPin.lng}); }`;
        webViewRef.current?.injectJavaScript(code);
      } else if (!selectedPin) {
        webViewRef.current?.injectJavaScript(`if (window.clearSelectedPin) { window.clearSelectedPin(); }`);
      }
    }
  }, [selectedPin]);

  // Handle focused geocoded search location
  useEffect(() => {
    if (focusLocation && focusLocation.lat != null && focusLocation.lng != null && isMapReadyRef.current) {
      const zoom = focusLocation.zoom || 10;
      const code = `if (window.flyToLocation) { window.flyToLocation(${focusLocation.lat}, ${focusLocation.lng}, ${zoom}); }`;
      webViewRef.current?.injectJavaScript(code);
    }
  }, [focusLocation]);

  // Handle user live GPS location
  useEffect(() => {
    if (userLocation && userLocation.lat != null && userLocation.lng != null && isMapReadyRef.current) {
      const code = `if (window.showUserLiveLocation) { window.showUserLiveLocation(${userLocation.lat}, ${userLocation.lng}); }`;
      webViewRef.current?.injectJavaScript(code);
    }
  }, [userLocation]);

  // Handle Compass / Fit All Pins trigger
  useEffect(() => {
    if (resetCompassTrigger && isMapReadyRef.current) {
      const code = `if (window.fitAllPins) { window.fitAllPins(); }`;
      webViewRef.current?.injectJavaScript(code);
    }
  }, [resetCompassTrigger]);

  // Handle Temp Pin clearance
  useEffect(() => {
    if (clearTempPinTrigger && isMapReadyRef.current) {
      webViewRef.current?.injectJavaScript(`if (window.clearTempDropPin) { window.clearTempDropPin(); }`);
    }
  }, [clearTempPinTrigger]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        isMapReadyRef.current = true;
        syncPlacesToMap(true);
      } else if (data.type === 'PIN_SELECTED' && onSelectPin) {
        const found = places.find(p => p.id === data.placeId);
        if (found) {
          onSelectPin(found);
        }
      } else if (data.type === 'MAP_CLICKED') {
        onMapClicked?.();
      } else if (data.type === 'MAP_LONG_PRESS' && onMapLongPress) {
        onMapLongPress({ lat: data.lat, lng: data.lng });
      }
    } catch (e) {
      console.error('Leaflet WebView message error:', e);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={Platform.OS === 'android'}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        onMessage={handleMessage}
        onLoadEnd={() => {
          setTimeout(() => {
            if (!isMapReadyRef.current) {
              isMapReadyRef.current = true;
              syncPlacesToMap(true);
            }
          }, 150);
        }}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        )}
      />

      {/* Optional Map Legend */}
      {showLegend && (
        <View style={styles.legendBar}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.home }]} />
            <AppText variant="mono" style={styles.legendText}>HOME</AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.together }]} />
            <AppText variant="mono" style={styles.legendText}>TOGETHER</AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.upcoming }]} />
            <AppText variant="mono" style={styles.legendText}>UPCOMING</AppText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.bucket }]} />
            <AppText variant="mono" style={styles.legendText}>BUCKET</AppText>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F7F3EC',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F3EC',
  },
  legendBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E1D5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 9,
    color: '#6B5E55',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
