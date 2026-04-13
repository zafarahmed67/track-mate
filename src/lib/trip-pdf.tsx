import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer"

Font.register({
  family: "Helvetica",
  fonts: [],
})

const colors = {
  primary: "#2563eb",
  primaryLight: "#eff6ff",
  accent: "#f59e0b",
  accentLight: "#fffbeb",
  text: "#1a1a1a",
  muted: "#6b7280",
  border: "#e5e7eb",
  badge: "#e0e7ff",
  badgeText: "#3730a3",
  white: "#ffffff",
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.text,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 45,
    backgroundColor: colors.white,
  },
  // Header
  header: {
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.primary,
    fontFamily: "Helvetica-Bold",
  },
  // Meta grid
  metaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  metaCard: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    padding: 10,
  },
  metaLabel: {
    fontSize: 8,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
  },
  // Section
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    marginBottom: 10,
    marginTop: 6,
  },
  // Day card
  dayCard: {
    marginBottom: 12,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    backgroundColor: "#fafafa",
    padding: 12,
  },
  dayHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
    marginBottom: 2,
  },
  dayMeta: {
    fontSize: 9,
    color: colors.muted,
    marginBottom: 8,
  },
  // Stop item
  stopItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stopItemLast: {
    paddingVertical: 8,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  stopName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.text,
    flex: 1,
  },
  stopBadge: {
    backgroundColor: colors.badge,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginLeft: 6,
  },
  stopBadgeText: {
    fontSize: 8,
    color: colors.badgeText,
  },
  stopDetail: {
    fontSize: 9,
    color: colors.muted,
    marginBottom: 2,
  },
  stopDescription: {
    fontSize: 9,
    color: colors.text,
    marginTop: 3,
    lineHeight: 1.4,
  },
  tipBox: {
    backgroundColor: colors.accentLight,
    borderRadius: 4,
    padding: 6,
    marginTop: 5,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  tipLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#92400e",
    marginBottom: 2,
  },
  tipText: {
    fontSize: 9,
    color: "#78350f",
    lineHeight: 1.4,
  },
  // Gap / no stop notice
  gapCard: {
    marginBottom: 12,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    padding: 12,
  },
  gapHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.muted,
    marginBottom: 4,
  },
  gapText: {
    fontSize: 9,
    color: colors.muted,
    lineHeight: 1.4,
  },
  // Notes
  notesCard: {
    backgroundColor: colors.accentLight,
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    marginBottom: 16,
  },
  notesText: {
    fontSize: 9,
    color: colors.text,
    lineHeight: 1.5,
  },
  // Preferences row
  prefRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 20,
  },
  prefBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  prefBadgeText: {
    fontSize: 9,
    color: colors.primary,
  },
  // Narrative
  overviewCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  overviewText: {
    fontSize: 10,
    color: colors.text,
    lineHeight: 1.5,
  },
  narrativeText: {
    fontSize: 9,
    color: colors.muted,
    lineHeight: 1.5,
    marginBottom: 6,
    fontStyle: "italic",
  },
  fuelNote: {
    backgroundColor: "#fef9c3",
    borderRadius: 4,
    padding: 5,
    marginTop: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#ca8a04",
  },
  fuelNoteText: {
    fontSize: 8,
    color: "#713f12",
    lineHeight: 1.4,
  },
  tripNotesCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#16a34a",
    marginBottom: 16,
  },
  tripNoteLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#14532d",
    marginBottom: 2,
    marginTop: 6,
  },
  tripNoteText: {
    fontSize: 9,
    color: "#166534",
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 45,
    right: 45,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: colors.muted,
  },
})

export interface PdfStop {
  id: string
  location_name: string
  state?: string
  nearest_town?: string
  stay_type?: string
  why_stop_here?: string
  aao_tip?: string
  road_suitability?: string
  pet_friendly?: string
  cost_band?: string
  water?: string
  distance_to_route_km?: number | null
  day_index?: number
  stop_type?: string
  address?: string
}

export interface PdfNarrativeDay {
  dayNumber: number
  narrative: string
  suggestedStay: { name: string; stopType: string; whyStopHere: string; aaoTip: string } | null
  aaoTips: string[]
  gapNote: string | null
  fuelNote: string | null
}

export interface PdfNarrative {
  overview?: string
  days?: PdfNarrativeDay[]
  tripNotes?: { fuelGuidance: string | null; remoteWarnings: string | null; roadConditions: string | null }
}

export interface PdfTrip {
  title: string
  start_location_text: string
  destination_text: string
  trip_duration_days: number
  travel_pace: string
  rig_type?: string | null
  rig_length_m?: number | null
  pet_friendly_required?: boolean
  avoid_gravel_roads?: boolean
  stay_preference?: string | null
  budget_preference?: string | null
  notes?: string | null
  narrative?: PdfNarrative
  stops: PdfStop[]
  exportedAt: string
}

function formatPace(pace: string) {
  return pace.charAt(0).toUpperCase() + pace.slice(1)
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""
}

function buildDays(trip: PdfTrip): Array<{ day: number; stops: PdfStop[] }> {
  const days: Array<{ day: number; stops: PdfStop[] }> = []
  const total = trip.trip_duration_days || 1

  for (let d = 1; d <= total; d++) {
    days.push({ day: d, stops: [] })
  }

  // Assign stops by day_index if present, otherwise spread evenly
  const hasIndex = trip.stops.some((s) => s.day_index !== undefined)

  if (hasIndex) {
    for (const stop of trip.stops) {
      const d = (stop.day_index ?? 1)
      const idx = Math.min(Math.max(d - 1, 0), total - 1)
      days[idx].stops.push(stop)
    }
  } else {
    const perDay = Math.ceil(trip.stops.length / total)
    trip.stops.forEach((stop, i) => {
      const idx = Math.min(Math.floor(i / perDay), total - 1)
      days[idx].stops.push(stop)
    })
  }

  return days
}

function StopEntry({ stop, isLast }: { stop: PdfStop; isLast: boolean }) {
  const label = stop.stay_type || stop.stop_type || ""
  const location = [stop.nearest_town, stop.state].filter(Boolean).join(", ")
  const details = [
    stop.road_suitability ? `Road: ${capitalize(stop.road_suitability)}` : null,
    stop.cost_band ? `Cost: ${capitalize(stop.cost_band)}` : null,
    stop.pet_friendly === "Yes" ? "Pet friendly" : null,
    stop.water === "Yes" ? "Water available" : null,
  ]
    .filter(Boolean)
    .join("  ·  ")

  return (
    <View style={isLast ? styles.stopItemLast : styles.stopItem}>
      <View style={styles.stopRow}>
        <Text style={styles.stopName}>{stop.location_name}</Text>
        {label ? (
          <View style={styles.stopBadge}>
            <Text style={styles.stopBadgeText}>{capitalize(label)}</Text>
          </View>
        ) : null}
      </View>
      {location ? <Text style={styles.stopDetail}>{location}</Text> : null}
      {details ? <Text style={styles.stopDetail}>{details}</Text> : null}
      {stop.why_stop_here ? (
        <Text style={styles.stopDescription}>{stop.why_stop_here}</Text>
      ) : null}
      {stop.aao_tip ? (
        <View style={styles.tipBox}>
          <Text style={styles.tipLabel}>AAO Tip</Text>
          <Text style={styles.tipText}>{stop.aao_tip}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function TripPdfDocument({ trip }: { trip: PdfTrip }) {
  const rawDays = buildDays(trip)
  const exportDate = new Date(trip.exportedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const narrativeDays = trip.narrative?.days
  const useNarrative = Array.isArray(narrativeDays) && narrativeDays.length > 0

  const prefs = [
    trip.travel_pace ? `Pace: ${formatPace(trip.travel_pace)}` : null,
    trip.rig_type ? `Rig: ${capitalize(trip.rig_type)}` : null,
    trip.rig_length_m ? `Max length: ${trip.rig_length_m}m` : null,
    trip.pet_friendly_required ? "Pet friendly required" : null,
    trip.avoid_gravel_roads ? "Avoid gravel roads" : null,
    trip.stay_preference ? `Stay: ${capitalize(trip.stay_preference)}` : null,
    trip.budget_preference ? `Budget: ${capitalize(trip.budget_preference)}` : null,
  ].filter(Boolean) as string[]

  const tripNotes = trip.narrative?.tripNotes
  const hasTripNotes = tripNotes && (tripNotes.fuelGuidance || tripNotes.remoteWarnings || tripNotes.roadConditions)

  return (
    <Document title={trip.title || "Trip Itinerary"} author="TrackMate">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{trip.title || "Trip Itinerary"}</Text>
          <Text style={styles.headerSubtitle}>
            {trip.start_location_text} → {trip.destination_text}
          </Text>
        </View>

        {/* Meta cards */}
        <View style={styles.metaRow}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Duration</Text>
            <Text style={styles.metaValue}>{trip.trip_duration_days} days</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Pace</Text>
            <Text style={styles.metaValue}>{formatPace(trip.travel_pace)}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Total stops</Text>
            <Text style={styles.metaValue}>{trip.stops.length}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Exported</Text>
            <Text style={styles.metaValue}>{exportDate}</Text>
          </View>
        </View>

        {/* Trip preferences */}
        {prefs.length > 0 && (
          <View style={styles.prefRow}>
            {prefs.map((p, i) => (
              <View key={i} style={styles.prefBadge}>
                <Text style={styles.prefBadgeText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Trip overview from TrackMate Overview */}
        {trip.narrative?.overview && (
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>{trip.narrative.overview}</Text>
          </View>
        )}

        {/* Day-by-day itinerary */}
        <Text style={styles.sectionTitle}>Day-by-Day Itinerary</Text>

        {useNarrative
          ? narrativeDays!.map((day) => {
              const isFirst = day.dayNumber === 1
              const isLast = day.dayNumber === trip.trip_duration_days
              const dayLabel = isFirst
                ? `Day ${day.dayNumber}: Depart ${trip.start_location_text}`
                : isLast
                ? `Day ${day.dayNumber}: Arrive ${trip.destination_text}`
                : `Day ${day.dayNumber}`

              if (day.gapNote && !day.suggestedStay) {
                return (
                  <View key={day.dayNumber} style={styles.gapCard} wrap={false}>
                    <Text style={styles.gapHeader}>{dayLabel}</Text>
                    {day.narrative ? <Text style={styles.narrativeText}>{day.narrative}</Text> : null}
                    <Text style={styles.gapText}>{day.gapNote}</Text>
                  </View>
                )
              }

              return (
                <View key={day.dayNumber} style={styles.dayCard} wrap={false}>
                  <Text style={styles.dayHeader}>{dayLabel}</Text>
                  {day.narrative ? <Text style={styles.narrativeText}>{day.narrative}</Text> : null}
                  {day.suggestedStay && (
                    <StopEntry
                      stop={{
                        id: `day-${day.dayNumber}`,
                        location_name: day.suggestedStay.name,
                        stay_type: day.suggestedStay.stopType,
                        why_stop_here: day.suggestedStay.whyStopHere,
                        aao_tip: day.suggestedStay.aaoTip || undefined,
                      }}
                      isLast
                    />
                  )}
                  {day.fuelNote && (
                    <View style={styles.fuelNote}>
                      <Text style={styles.fuelNoteText}>⛽ {day.fuelNote}</Text>
                    </View>
                  )}
                </View>
              )
            })
          : rawDays.map(({ day, stops }) => {
              const isFirst = day === 1
              const isLast = day === trip.trip_duration_days
              const dayLabel = isFirst
                ? `Day ${day}: Depart ${trip.start_location_text}`
                : isLast
                ? `Day ${day}: Arrive ${trip.destination_text}`
                : `Day ${day}`

              if (stops.length === 0) {
                return (
                  <View key={day} style={styles.gapCard}>
                    <Text style={styles.gapHeader}>{dayLabel}</Text>
                    <Text style={styles.gapText}>
                      No AAO verified stop available on this stretch. Check local
                      caravan parks or camping apps near your route.
                    </Text>
                  </View>
                )
              }

              return (
                <View key={day} style={styles.dayCard} wrap={false}>
                  <Text style={styles.dayHeader}>{dayLabel}</Text>
                  <Text style={styles.dayMeta}>{stops.length} stop{stops.length !== 1 ? "s" : ""}</Text>
                  {stops.map((stop, i) => (
                    <StopEntry key={stop.id} stop={stop} isLast={i === stops.length - 1} />
                  ))}
                </View>
              )
            })}

        {/* Trip notes from TrackMate Overview */}
        {hasTripNotes && (
          <>
            <Text style={styles.sectionTitle}>Trip Notes</Text>
            <View style={styles.tripNotesCard}>
              {tripNotes!.fuelGuidance && (
                <>
                  <Text style={styles.tripNoteLabel}>Fuel Guidance</Text>
                  <Text style={styles.tripNoteText}>{tripNotes!.fuelGuidance}</Text>
                </>
              )}
              {tripNotes!.remoteWarnings && (
                <>
                  <Text style={styles.tripNoteLabel}>Remote Stretch Warnings</Text>
                  <Text style={styles.tripNoteText}>{tripNotes!.remoteWarnings}</Text>
                </>
              )}
              {tripNotes!.roadConditions && (
                <>
                  <Text style={styles.tripNoteLabel}>Road Conditions</Text>
                  <Text style={styles.tripNoteText}>{tripNotes!.roadConditions}</Text>
                </>
              )}
            </View>
          </>
        )}

        {/* User notes */}
        {trip.notes && (
          <>
            <Text style={styles.sectionTitle}>Your Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          </>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>TrackMate — allaroundoz.com.au</Text>
          <Text style={styles.footerText}>
            {trip.start_location_text} → {trip.destination_text}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
