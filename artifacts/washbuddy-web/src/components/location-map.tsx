import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapLocation {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  city: string;
  addressLine1: string;
  provider?: { name: string };
}

interface LocationMapProps {
  locations: MapLocation[];
  onLocationClick?: (id: string) => void;
  className?: string;
}

const defaultIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 32px; height: 32px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  ">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function createPopupContent(loc: MapLocation, onLocationClick?: (id: string) => void): HTMLDivElement {
  const container = L.DomUtil.create("div");
  container.style.cssText = "font-family: system-ui, sans-serif; min-width: 160px;";

  const nameEl = L.DomUtil.create("div", "", container);
  nameEl.style.cssText = "font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #0f172a;";
  nameEl.textContent = loc.name;

  if (loc.provider?.name) {
    const providerEl = L.DomUtil.create("div", "", container);
    providerEl.style.cssText = "font-size: 12px; color: #64748b; margin-bottom: 2px;";
    providerEl.textContent = loc.provider.name;
  }

  const addressEl = L.DomUtil.create("div", "", container);
  addressEl.style.cssText = "font-size: 12px; color: #94a3b8;";
  addressEl.textContent = `${loc.addressLine1}, ${loc.city}`;

  if (onLocationClick) {
    const btn = L.DomUtil.create("button", "", container);
    btn.textContent = "View Details";
    btn.style.cssText = `
      margin-top: 8px; padding: 6px 12px; width: 100%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: white; border: none; border-radius: 8px;
      font-size: 12px; font-weight: 600; cursor: pointer;
    `;
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      onLocationClick(loc.id);
    });
  }

  return container;
}

export default function LocationMap({ locations, onLocationClick, className = "" }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const onClickRef = useRef(onLocationClick);
  onClickRef.current = onLocationClick;

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const validLocations = locations.filter(
      (l) => l.latitude != null && l.longitude != null
    );

    const center: L.LatLngExpression =
      validLocations.length > 0
        ? [validLocations[0].latitude!, validLocations[0].longitude!]
        : [40.7128, -74.006];

    const map = L.map(mapRef.current, {
      center,
      zoom: validLocations.length === 1 ? 13 : 11,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers: L.Marker[] = [];
    validLocations.forEach((loc) => {
      const popupContent = createPopupContent(loc, onClickRef.current ? (id) => onClickRef.current?.(id) : undefined);

      const marker = L.marker([loc.latitude!, loc.longitude!], { icon: defaultIcon })
        .addTo(map)
        .bindPopup(popupContent, { closeButton: false });

      marker.on("click", () => {
        marker.openPopup();
      });
      markers.push(marker);
    });

    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.15), { animate: false });
    }

    mapInstanceRef.current = map;

    return () => {
      try {
        map.stop();
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, [locations]);

  return (
    <div
      ref={mapRef}
      className={`rounded-2xl overflow-hidden border border-slate-200 shadow-sm ${className}`}
      style={{ height: "400px", width: "100%", zIndex: 0 }}
    />
  );
}
