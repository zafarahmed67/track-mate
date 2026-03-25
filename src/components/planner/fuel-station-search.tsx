"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Fuel, Plus, X, MapPin } from "lucide-react"

interface FuelStation {
  name: string
  address: string
  lat: number
  lng: number
  isOpenNow: boolean
  rating: number
  placeId?: string
}

interface FuelStationSearchProps {
  onAddStation: (station: FuelStation) => void
  addedStationIds: string[]
}

export function FuelStationSearch({ onAddStation, addedStationIds }: FuelStationSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FuelStation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const searchFuelStations = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    setError("")

    try {
      const response = await fetch(
        `/api/places/search?query=${encodeURIComponent(searchQuery)}`
      )
      const data = await response.json()

      if (data.success) {
        setResults(data.results || [])
      } else {
        setError(data.error || "Failed to search")
        setResults([])
      }
    } catch (err) {
      setError("Failed to search fuel stations")
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (query.length >= 3) {
        searchFuelStations(query)
      }
    }, 500)

    return () => clearTimeout(debounce)
  }, [query])

  const handleAddStation = (station: FuelStation) => {
    onAddStation(station)
    setQuery("")
    setResults([])
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fuel className="h-4 w-4" />
          Add Fuel Stations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fuel stations, roadhouses..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Searching...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {results.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {results.map((station) => {
              const isAdded = addedStationIds.includes(station.placeId || station.lat + "," + station.lng)
              
              return (
                <div
                  key={station.placeId || station.lat + "," + station.lng}
                  className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{station.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{station.address}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {station.rating > 0 && (
                        <Badge variant="outline" className="text-xs">
                          ⭐ {station.rating}
                        </Badge>
                      )}
                      {station.isOpenNow && (
                        <Badge className="text-xs bg-green-500">Open</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? "secondary" : "default"}
                    onClick={() => handleAddStation(station)}
                    disabled={isAdded}
                    className="ml-2"
                  >
                    {isAdded ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
