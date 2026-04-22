export async function fetchTrip(tripId: string, uid: string) {
  const response = await fetch(`/api/trips/${tripId}${uid ? `?user_id=${uid}` : ""}`)
  return response.json()
}