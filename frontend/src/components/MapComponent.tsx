/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface MapComponentProps {
  cartItems: { quantity_tons: number; factor_flete: number }[];
  totalWeight: number;
  onLocationSelected: (coords: { lat: number; lng: number }) => void;
  onFleteCalculated: (details: {
    shippingCost: number;
    distance: number;
    source: 'google' | 'haversine';
  }) => void;
  onCalculationStateChange: (loading: boolean) => void;
}

const ORIGIN_LAT = -16.6133;
const ORIGIN_LNG = -62.4994;

export default function MapComponent({
  cartItems,
  totalWeight,
  onLocationSelected,
  onFleteCalculated,
  onCalculationStateChange,
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  
  // Coordenadas actuales del marcador
  const [markerCoords, setMarkerCoords] = useState<{ lat: number; lng: number }>({
    lat: -17.7833, // Santa Cruz de la Sierra
    lng: -63.1821,
  });

  // Modo contingencia offline manual
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineDistance, setOfflineDistance] = useState<number>(150); // Valor de inicio km
  
  const googleMapInstance = useRef<google.maps.Map | null>(null);
  const googleMarkerInstance = useRef<google.maps.Marker | null>(null);

  // Carga dinámica de Google Maps API
  useEffect(() => {
    // Si ya está cargado globalmente
    if (window.google && window.google.maps) {
      setMapLoaded(true);
      return;
    }

    // Buscar si ya existe la etiqueta script para no duplicarla
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => setMapLoaded(true));
      existingScript.addEventListener('error', () => setLoadError(true));
      return;
    }

    // Si no existe, crearla
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    // Nota: El cliente cargará la key desde una variable de entorno inyectada en HTML o dejamos vacía para fallback
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    
    script.addEventListener('load', () => setMapLoaded(true));
    script.addEventListener('error', () => {
      console.warn('No se pudo cargar la API de Google Maps (offline/sin conexión). Activando panel de contingencia.');
      setLoadError(true);
      setIsOfflineMode(true);
    });

    document.head.appendChild(script);
  }, []);

  // Inicializar Mapa
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || isOfflineMode) return;

    try {
      const initialCenter = { lat: -17.35, lng: -63.0 }; // Centrado en región clave de Santa Cruz
      const map = new window.google.maps.Map(mapRef.current, {
        center: initialCenter,
        zoom: 8,
        mapTypeId: 'roadmap',
        styles: [
          {
            "featureType": "poi.business",
            "elementType": "labels",
            "stylers": [{ "visibility": "off" }]
          }
        ]
      });

      googleMapInstance.current = map;

      // Marcador de la planta origen (San Ramón) - Estático
      new window.google.maps.Marker({
        position: { lat: ORIGIN_LAT, lng: ORIGIN_LNG },
        map: map,
        title: "Silos San Ramón (Origen)",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
        }
      });

      // Marcador del cliente - Arrastrable
      const marker = new window.google.maps.Marker({
        position: markerCoords,
        map: map,
        draggable: true,
        title: "Arrastre hasta su propiedad/finca",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
        }
      });

      googleMarkerInstance.current = marker;

      // Evento de fin de arrastre del pin
      marker.addListener('dragend', () => {
        const position = marker.getPosition();
        if (position) {
          const lat = position.lat();
          const lng = position.lng();
          const newCoords = { lat, lng };
          setMarkerCoords(newCoords);
          onLocationSelected(newCoords);
          calculateFlete(lat, lng);
        }
      });

      // Registrar ubicación inicial
      onLocationSelected(markerCoords);
      calculateFlete(markerCoords.lat, markerCoords.lng);

    } catch (e) {
      console.error("Error inicializando mapa", e);
      setIsOfflineMode(true);
    }
  }, [mapLoaded, isOfflineMode]);

  // Ejecutar cálculo con el backend
  const calculateFlete = async (lat: number, lng: number) => {
    onCalculationStateChange(true);
    try {
      // Determinamos URL del backend dinámicamente
      const host = window.location.hostname;
      const apiEndpoint = `http://${host}:3001/api/calculate-flete`;

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lat,
          lng,
          total_weight_tons: totalWeight,
          items: cartItems.map(i => ({
            quantity_tons: i.quantity_tons,
            factor_flete: i.factor_flete
          }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        onFleteCalculated({
          shippingCost: data.shipping_cost,
          distance: data.distance_km,
          source: data.calculation_source
        });
      } else {
        console.warn('Backend API falló. Usando cálculo local de contingencia.');
        calculateFleteLocalFallback(lat, lng);
      }
    } catch (err) {
      console.error('Error de red al calcular flete. Usando cálculo local de contingencia:', err);
      calculateFleteLocalFallback(lat, lng);
    } finally {
      onCalculationStateChange(false);
    }
  };

  // Cálculo local en caso de estar offline o sin backend
  const calculateFleteLocalFallback = (lat: number, lng: number) => {
    // Fórmula de Haversine local
    const R = 6371; // km
    const dLat = (lat - ORIGIN_LAT) * Math.PI / 180;
    const dLon = (lng - ORIGIN_LNG) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(ORIGIN_LAT * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const rawHaversine = R * c;
    const distanceKm = parseFloat((rawHaversine * 1.25).toFixed(2)); // Ruteo estimado

    // Lógica matemática
    const TARIFA_BASE = 350;
    const PRECIO_KM = 12;
    let productFactorCost = 0;
    cartItems.forEach(item => {
      productFactorCost += (item.quantity_tons || 0) * (item.factor_flete || 1.0);
    });

    const shippingCost = parseFloat((TARIFA_BASE + (distanceKm * PRECIO_KM) + productFactorCost).toFixed(2));

    onFleteCalculated({
      shippingCost,
      distance: distanceKm,
      source: 'haversine'
    });
  };

  // Manejador del slider manual offline
  const handleOfflineDistanceChange = (km: number) => {
    setOfflineDistance(km);
    
    // Coordenadas mock para simular que seleccionó una ubicación
    const simulatedCoords = {
      lat: ORIGIN_LAT - (km / 111), // 1 grado lat = ~111km
      lng: ORIGIN_LNG - (km / 111),
    };
    onLocationSelected(simulatedCoords);

    const TARIFA_BASE = 350;
    const PRECIO_KM = 12;
    let productFactorCost = 0;
    cartItems.forEach(item => {
      productFactorCost += (item.quantity_tons || 0) * (item.factor_flete || 1.0);
    });

    const shippingCost = parseFloat((TARIFA_BASE + (km * PRECIO_KM) + productFactorCost).toFixed(2));
    onFleteCalculated({
      shippingCost,
      distance: km,
      source: 'haversine'
    });
  };

  return (
    <div className="relative w-full">
      {/* Botón para alternar modo contingencia / mapa */}
      <div className="absolute top-2 right-2 z-10 flex space-x-2">
        <button
          type="button"
          onClick={() => {
            const nextMode = !isOfflineMode;
            setIsOfflineMode(nextMode);
            if (nextMode) {
              handleOfflineDistanceChange(offlineDistance);
            } else {
              onLocationSelected(markerCoords);
              calculateFlete(markerCoords.lat, markerCoords.lng);
            }
          }}
          className="bg-agro-600 hover:bg-agro-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-colors"
        >
          {isOfflineMode ? "Ver Mapa Satelital" : "Usar Cotizador Offline"}
        </button>
      </div>

      {isOfflineMode ? (
        /* Panel Offline de Contingencia Rural */
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col space-y-4">
          <div className="flex items-center space-x-2 text-agro-600 bg-agro-50 p-3 rounded-lg border border-agro-100">
            <AlertCircle className="h-5 w-5 text-agro-accent shrink-0" />
            <p className="text-xs font-medium">
              <strong>Modo de Contingencia Offline activo.</strong> No se requiere conexión a internet para esta cotización. Indique la distancia aproximada de su finca a San Ramón.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold text-gray-700">
              <span>Distancia aproximada por carretera:</span>
              <span className="text-agro-500 font-extrabold text-lg">{offlineDistance} km</span>
            </div>
            <input
              type="range"
              min="5"
              max="400"
              step="5"
              value={offlineDistance}
              onChange={(e) => handleOfflineDistanceChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-agro-500"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Cerca (5 km)</span>
              <span>Distante (400 km)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-150">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="block text-[10px] text-gray-400 uppercase font-bold">Origen</span>
              <span className="font-bold text-xs text-gray-700">Planta San Ramón</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <span className="block text-[10px] text-gray-400 uppercase font-bold">Destino Mapeado</span>
              <span className="font-bold text-xs text-gray-700">Finca del Cliente</span>
            </div>
          </div>
        </div>
      ) : (
        /* Contenedor de Google Maps */
        <div className="relative">
          <div
            ref={mapRef}
            className="w-full h-[380px] bg-gray-100"
          />
          {loadError && (
            <div className="absolute inset-0 bg-gray-200/90 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-agro-accent animate-bounce" />
              <div>
                <h4 className="font-bold text-gray-800 text-lg">Google Maps Bloqueado / Sin Conexión</h4>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  Parece que no hay conexión de datos en el campo. Hemos activado la herramienta de cálculo de contingencia.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOfflineMode(true)}
                className="bg-agro-500 hover:bg-agro-600 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors shadow-md"
              >
                Ingresar Distancia Manualmente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
