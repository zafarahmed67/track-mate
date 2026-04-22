"use client"

import { LoadScript, GoogleMap, Marker, InfoWindow, DirectionsRenderer, type Libraries } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Route, Fuel, Locate, Moon, AlertTriangle } from "lucide-react"

const mapContainerStyle = { width: "100%", height: "100%" }
const googleMapsLibraries: Libraries = ["places"]

interface MapStop {
  key: string
  id: string
  location_name: string
  latitude: number
  longitude: number
  sourceType: string
  distance_to_route_km?: number
}

interface FuelStation {
  id?: string
  name: string
  lat: number
  lng: number
  distanceFromStartKm?: number
}

interface TripData {
  start_lat: number | null
  start_lng: number | null
  start_location_text: string
  destination_lat: number | null
  destination_lng: number | null
  destination_text: string
}

interface HoveredPin {
  lat: number
  lng: number
  label: string
  distanceFromRoute?: number
  sourceType?: "verified" | "custom"
}

interface SelectedStop {
  latitude?: string
  longitude?: string
  location_name: string
}

interface TripRouteMapProps {
  showFuelOverlay: boolean
  setShowFuelOverlay: (updater: (prev: boolean) => boolean) => void
  showOvernightOverlay: boolean
  setShowOvernightOverlay: (updater: (prev: boolean) => boolean) => void
  showRemoteOverlay: boolean
  setShowRemoteOverlay: (updater: (prev: boolean) => boolean) => void
  map: google.maps.Map | null
  setMap: (map: google.maps.Map) => void
  mapCenter: { lat: number; lng: number }
  directions: google.maps.DirectionsResult | null
  trip: TripData
  recommendedMapStops: MapStop[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  daySegments: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelectedOption: (segment: any, index: number) => SelectedStop | null | undefined
  fuelStations: FuelStation[]
  selectedSegmentFuelIds: Record<string, string>
  setFocusedFuelStation: (station: { lat: number; lng: number; name: string } | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routeMetaSegments: any[] | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  estimateSegmentDistance: (segment: any, index?: number) => number
  getSegmentDayType: (distanceKm: number) => string
  hoveredPin: HoveredPin | null
  setHoveredPin: (pin: HoveredPin | null) => void
}

export default function TripRouteMap({
  showFuelOverlay,
  setShowFuelOverlay,
  showOvernightOverlay,
  setShowOvernightOverlay,
  showRemoteOverlay,
  setShowRemoteOverlay,
  map,
  setMap,
  mapCenter,
  directions,
  trip,
  recommendedMapStops,
  daySegments,
  getSelectedOption,
  fuelStations,
  selectedSegmentFuelIds,
  setFocusedFuelStation,
  routeMetaSegments,
  estimateSegmentDistance,
  getSegmentDayType,
  hoveredPin,
  setHoveredPin,
}: TripRouteMapProps) {
  return (
    <div className="mb-4">
      <Card className="overflow-hidden border py-0 relative">
        <CardHeader className="py-2 px-4 border-b bg-background/50">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Route Map
          </CardTitle>
        </CardHeader>

        <div className="absolute right-3 top-12 z-20">
          <div className="rounded-xl bg-background/90 backdrop-blur-sm border border-border/60 shadow-md p-1.5 flex flex-col gap-1">
            <Button
              variant={showFuelOverlay ? "default" : "ghost"}
              size="sm"
              className="h-8 justify-start gap-2 px-2.5 text-xs font-medium w-full"
              onClick={() => setShowFuelOverlay((prev) => !prev)}
            >
              <Fuel className="h-3.5 w-3.5 shrink-0" />
              Fuel
            </Button>
            <Button
              variant={showOvernightOverlay ? "default" : "ghost"}
              size="sm"
              className="h-8 justify-start gap-2 px-2.5 text-xs font-medium w-full"
              onClick={() => setShowOvernightOverlay((prev) => !prev)}
            >
              <Moon className="h-3.5 w-3.5 shrink-0" />
              Overnight
            </Button>
            <Button
              variant={showRemoteOverlay ? "default" : "ghost"}
              size="sm"
              className="h-8 justify-start gap-2 px-2.5 text-xs font-medium w-full"
              onClick={() => setShowRemoteOverlay((prev) => !prev)}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Remote
            </Button>
            <div className="h-px bg-border/40 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 justify-start gap-2 px-2.5 text-xs font-medium w-full"
              onClick={() => map?.panTo(mapCenter)}
            >
              <Locate className="h-3.5 w-3.5 shrink-0" />
              Recenter
            </Button>
          </div>
        </div>

        <div className="absolute left-3 bottom-3 z-20">
          <div className="rounded-xl bg-background/90 backdrop-blur-sm border border-border/60 shadow-md px-3 py-2 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#22c55e] border-2 border-white" />
              <span className="text-muted-foreground">Verified stop</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#ef4444] border-2 border-white" />
              <span className="text-muted-foreground">Custom stop</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-[#ea580c] border-2 border-white" />
              <span className="text-muted-foreground">Fuel station</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-7 items-center justify-center rounded bg-gray-700 text-[9px] font-bold text-white">D1</span>
              <span className="text-muted-foreground">Overnight</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">!</span>
              <span className="text-muted-foreground">Remote</span>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="h-130 bg-muted/20">
            <LoadScript
              googleMapsApiKey={process.env.NEXT_PUBLIC_GMAPS_API_KEY!}
              libraries={googleMapsLibraries}
            >
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={mapCenter}
                zoom={5}
                onLoad={(m) => setMap(m)}
                options={{
                  disableDefaultUI: false,
                  zoomControl: true,
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: true,
                }}
              >
                {directions && (
                  <DirectionsRenderer
                    directions={directions}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: "#05b8b6",
                        strokeWeight: 6,
                        strokeOpacity: 0.85,
                      },
                    }}
                  />
                )}

                {trip.start_lat && trip.start_lng && (
                  <Marker
                    position={{ lat: trip.start_lat, lng: trip.start_lng }}
                    label={{ text: "A", color: "white", fontWeight: "bold" }}
                    title={trip.start_location_text}
                    onMouseOver={() => setHoveredPin({ lat: trip.start_lat!, lng: trip.start_lng!, label: trip.start_location_text ?? "Start" })}
                    onMouseOut={() => setHoveredPin(null)}
                  />
                )}

                {trip.destination_lat && trip.destination_lng && (
                  <Marker
                    position={{ lat: trip.destination_lat, lng: trip.destination_lng }}
                    label={{ text: "B", color: "white", fontWeight: "bold" }}
                    title={trip.destination_text}
                    onMouseOver={() => setHoveredPin({ lat: trip.destination_lat!, lng: trip.destination_lng!, label: trip.destination_text ?? "Destination" })}
                    onMouseOut={() => setHoveredPin(null)}
                  />
                )}

                {recommendedMapStops.map((stop, index) => {
                  const isVerified = stop.sourceType === "verified"
                  const markerColor = isVerified ? "#22c55e" : "#ef4444"
                  const svgUrl = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${markerColor}" stroke="#ffffff" strokeWidth="2"/></svg>`)
                  return (
                    <Marker
                      key={`segment-stop-${stop.key}`}
                      position={{ lat: stop.latitude, lng: stop.longitude }}
                      icon={{ url: svgUrl }}
                      label={{ text: String(index + 1), color: "white", fontWeight: "bold", fontSize: "11px" }}
                      title={`${index + 1}. ${stop.location_name} (${isVerified ? "Verified" : "Custom"})`}
                      onMouseOver={() => setHoveredPin({
                        lat: stop.latitude,
                        lng: stop.longitude,
                        label: stop.location_name ?? "",
                        distanceFromRoute: stop.distance_to_route_km,
                        sourceType: isVerified ? "verified" : "custom",
                      })}
                      onMouseOut={() => setHoveredPin(null)}
                    />
                  )
                })}

                {showOvernightOverlay && daySegments.map((segment, index) => {
                  const selected = getSelectedOption(segment, index)
                  if (!selected) return null
                  const lat = parseFloat(selected.latitude ?? "0")
                  const lng = parseFloat(selected.longitude ?? "0")
                  if (isNaN(lat) || isNaN(lng)) return null
                  return (
                    <Marker
                      key={`overnight-${index}`}
                      position={{ lat, lng }}
                      label={{ text: `D${index + 1}`, color: "white", fontWeight: "bold", fontSize: "10px" }}
                      title={`Day ${index + 1}: ${selected.location_name}`}
                      onMouseOver={() => setHoveredPin({ lat, lng, label: `Day ${index + 1}: ${selected.location_name ?? ""}` })}
                      onMouseOut={() => setHoveredPin(null)}
                    />
                  )
                })}

                {showFuelOverlay && fuelStations.map((station, index) => {
                  const distKm = station.distanceFromStartKm ? Math.round(station.distanceFromStartKm) : null
                  const labelText = distKm !== null ? `${distKm}km` : `F${index + 1}`
                  const stationKey = station.id || `${station.name}-${station.lat}-${station.lng}`
                  const isSelected = Object.values(selectedSegmentFuelIds).includes(stationKey)
                  const markerSize = isSelected ? 24 : 20
                  const fillColor = isSelected ? "#05b8b6" : "#ea580c"
                  const strokeColor = isSelected ? "#0ea5a3" : "#c2410c"
                  return (
                    <Marker
                      key={station.id}
                      position={{ lat: station.lat, lng: station.lng }}
                      label={{ text: labelText, color: "white", fontWeight: "bold", fontSize: distKm !== null ? "9px" : "10px" }}
                      icon={{
                        url: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${markerSize}" height="${markerSize}"><circle cx="${markerSize / 2}" cy="${markerSize / 2}" r="${markerSize / 2 - 2}" fill="${fillColor}" stroke="${strokeColor}" strokeWidth="2"/></svg>`),
                      }}
                      title={`${station.name}${distKm !== null ? ` — ${distKm} km from start` : ""}`}
                      onMouseOver={() => setHoveredPin({ lat: station.lat, lng: station.lng, label: `⛽ ${station.name}${distKm !== null ? ` (${distKm} km)` : ""}` })}
                      onMouseOut={() => setHoveredPin(null)}
                      onClick={() => {
                        setFocusedFuelStation({ lat: station.lat, lng: station.lng, name: station.name })
                        if (map) {
                          map.panTo({ lat: station.lat, lng: station.lng })
                          map.setZoom(14)
                        }
                      }}
                    />
                  )
                })}

                {showRemoteOverlay && routeMetaSegments?.map((segment, index) => {
                  const distance = estimateSegmentDistance(segment)
                  if (getSegmentDayType(distance) !== "Remote") return null
                  const allStops = [...segment.verifiedStops, ...segment.otherStops]
                  const midStop = allStops[Math.floor(allStops.length / 2)]
                  if (!midStop) return null
                  const lat = parseFloat(midStop.latitude ?? "0")
                  const lng = parseFloat(midStop.longitude ?? "0")
                  if (isNaN(lat) || isNaN(lng)) return null
                  return (
                    <Marker
                      key={`remote-${index}`}
                      position={{ lat, lng }}
                      label={{ text: "!", color: "white", fontWeight: "bold", fontSize: "14px" }}
                      title={`Remote section: Day ${index + 1} (${Math.round(distance)} km)`}
                    />
                  )
                })}

                {hoveredPin && (
                  <InfoWindow
                    position={{ lat: hoveredPin.lat, lng: hoveredPin.lng }}
                    options={{ disableAutoPan: true, pixelOffset: new google.maps.Size(0, -10) }}
                    onCloseClick={() => setHoveredPin(null)}
                  >
                    <div className="p-2 min-w-40 max-w-55">
                      <div className="font-semibold text-[13px] text-foreground leading-tight mb-1">
                        {hoveredPin.label}
                      </div>
                      {hoveredPin.sourceType && (
                        <div className={`text-[11px] font-semibold mb-1 ${hoveredPin.sourceType === "verified" ? "text-emerald-600" : "text-rose-600"}`}>
                          {hoveredPin.sourceType === "verified" ? "✓ Verified" : "⚠ Custom"}
                        </div>
                      )}
                      {hoveredPin.distanceFromRoute !== undefined && hoveredPin.distanceFromRoute !== null && hoveredPin.distanceFromRoute >= 0 && (
                        <div className={`text-[11px] font-medium ${hoveredPin.distanceFromRoute > 5 ? "text-rose-600" : "text-emerald-600"}`}>
                          {hoveredPin.distanceFromRoute > 0
                            ? `${Math.round(hoveredPin.distanceFromRoute)} km from route`
                            : "On route"
                          }
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </LoadScript>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
