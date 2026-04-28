"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SelectedPlace {
  description: string
  lat: number
  lng: number
  placeId: string
}

interface PlaceAutocompleteProps {
  id?: string
  value: string
  onChange: (text: string) => void
  onPlaceSelect: (place: SelectedPlace) => void
  placeholder?: string
  country?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

interface Prediction {
  place_id: string
  description: string
  structured_formatting?: {
    main_text?: string
    secondary_text?: string
  }
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          AutocompleteService: new () => {
            getPlacePredictions: (
              req: {
                input: string
                componentRestrictions?: { country: string }
                sessionToken?: unknown
              },
              cb: (predictions: Prediction[] | null, status: string) => void
            ) => void
          }
          AutocompleteSessionToken: new () => unknown
          PlacesService: new (attr: HTMLElement) => {
            getDetails: (
              req: { placeId: string; fields: string[]; sessionToken?: unknown },
              cb: (
                result: {
                  geometry?: { location?: { lat: () => number; lng: () => number } }
                  formatted_address?: string
                } | null,
                status: string
              ) => void
            ) => void
          }
          PlacesServiceStatus: { OK: string }
        }
      }
    }
  }
}

export function PlaceAutocomplete({
  id,
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  country = "au",
  disabled,
  required,
  className,
}: PlaceAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  type Services = {
    autocomplete: InstanceType<NonNullable<NonNullable<NonNullable<Window["google"]>["maps"]>["places"]>["AutocompleteService"]>
    details: InstanceType<NonNullable<NonNullable<NonNullable<Window["google"]>["maps"]>["places"]>["PlacesService"]>
    statusOk: string
  }
  const [services, setServices] = useState<Services | null>(null)
  const mapsReady = services !== null
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sessionTokenRef = useRef<unknown>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextFetchRef = useRef(false)

  // Poll for Google Maps places library readiness (LoadScript mounts it on the same page)
  useEffect(() => {
    if (typeof window === "undefined") return
    function init() {
      const places = window.google?.maps?.places
      if (!places) return false
      const attr = document.createElement("div")
      sessionTokenRef.current = new places.AutocompleteSessionToken()
      setServices({
        autocomplete: new places.AutocompleteService(),
        details: new places.PlacesService(attr),
        statusOk: places.PlacesServiceStatus.OK,
      })
      return true
    }
    if (init()) return
    const interval = setInterval(() => {
      if (init()) clearInterval(interval)
    }, 200)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  function scheduleSearch(input: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!services) return
    const trimmed = input.trim()
    if (trimmed.length < 2) {
      setPredictions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      services.autocomplete.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country },
          sessionToken: sessionTokenRef.current,
        },
        (results) => {
          setPredictions(results || [])
          setHighlighted(0)
          setLoading(false)
          setOpen(true)
        }
      )
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function pick(p: Prediction) {
    if (!services) return
    services.details.getDetails(
      {
        placeId: p.place_id,
        fields: ["geometry", "formatted_address"],
        sessionToken: sessionTokenRef.current,
      },
      (result, status) => {
        if (status !== services.statusOk || !result?.geometry?.location) return
        const lat = result.geometry.location.lat()
        const lng = result.geometry.location.lng()
        const description = result.formatted_address || p.description
        skipNextFetchRef.current = true
        onChange(description)
        onPlaceSelect({ description, lat, lng, placeId: p.place_id })
        setOpen(false)
        setPredictions([])
        // Refresh the session token after a successful selection (Google billing best practice)
        const places = window.google?.maps?.places
        if (places) sessionTokenRef.current = new places.AutocompleteSessionToken()
      }
    )
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, predictions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      pick(predictions[highlighted])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          setOpen(true)
          if (skipNextFetchRef.current) {
            skipNextFetchRef.current = false
          } else {
            scheduleSearch(next)
          }
        }}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled || !mapsReady}
        aria-required={required}
        autoComplete="off"
      />
      {!mapsReady && (
        <p className="mt-1 text-xs text-muted-foreground">Loading map services…</p>
      )}
      {open && (loading || predictions.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
          {loading && predictions.length === 0 && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          )}
          {predictions.map((p, i) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm",
                i === highlighted ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-medium">
                  {p.structured_formatting?.main_text || p.description}
                </span>
                {p.structured_formatting?.secondary_text && (
                  <span className="text-xs text-muted-foreground">
                    {p.structured_formatting.secondary_text}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
