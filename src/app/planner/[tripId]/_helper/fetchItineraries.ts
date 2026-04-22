export async function fetchItineraries(tripId: string, uid: string) {
  const response = await fetch(`/api/trips/${tripId}/itineraries?user_id=${uid}`)
  return response.json()
}