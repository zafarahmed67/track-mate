export async function fetchDBStops(tripId: string) {
  const response = await fetch(`/api/trips/${tripId}/stops`)
  return response.json()
}