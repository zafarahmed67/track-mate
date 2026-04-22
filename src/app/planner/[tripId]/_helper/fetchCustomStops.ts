export async function fetchCustomStops(tripId: string) {
  const response = await fetch(`/api/custom-stops?trip_id=${tripId}`)
  return response.json()
}