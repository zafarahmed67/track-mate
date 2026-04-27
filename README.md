This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:


```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.



│ Conversational     │         │ Database ready            │ Need chat UI on trip detail │
  │ refinement chat    │ 7.7     │ (trip_messages table), no │  page                       │
  │                    │         │  UI                       │                             │

  
  ├────────────────────┼─────────┼───────────────────────────┼─────────────────────────────┤
  │                    │         │ Stop filtering is         │ No LLM call generating      │
  │ AI itinerary       │ 7.6     │ deterministic algorithm — │ narrative itinerary text,   │
  │ generation         │         │  no OpenAI integration    │ AAO tips, gap notes         │
  │                    │         │ found                     │                             │
  ├────────────────────┼─────────┼───────────────────────────┼─────────

  AI Itinerary Generation	In Progress	~70%
Conversational Refinement	Not Started	0%




Now like that behaviour

i am radius based first 250 i take and then get 5 stops and then go to next 250 to 500 not get and now i want day 2 empty and reduce first day 1 - 200 and day 2 is 200 to 500 again check (all day rebalance)

[1/4] 📝 Creating trip record... {
  title: 'Hervey Bay to Cape York After code change (7)',
  startLocation: 'Hervey Bay',
  destination: 'Cape York',
  userId: '9b0c0fc4-98f6-446e-b822-1b78d24d6320'
}
[1/4] ✅ Trip created successfully {
  tripId: '898896d2-d808-4e17-8295-f845e8e3ef93',
  title: 'Hervey Bay to Cape York After code change (7)'
}
[2/4] 🔍 Generating stops from DB... {
  startCoords: [ -25.2881539, 152.7676633 ],
  destCoords: [ -10.717776, 142.443984 ]
}
[2/4] generateStop diagnostics {
  totalCandidates: 46,
  rejectedByProximity: 20,
  afterProximity: 26,
  rejectedByCorridor: 0,
  afterCorridor: 26,
  plannedStops: 8,
  targetPlannedStops: 8,
  minSpacingKm: 108
}
[2/4] rejected by proximity (>100km) {
  count: 20,
  sample: [
    {
      id: 'd853f8d7-ad01-49d6-9a30-7b06f226e443',
      name: 'Moura Rotary Park Free Camp',
      distance_to_route_km: 195.2
    },
    {
      id: '5999d9b8-cb79-4b0c-8e88-0723de661502',
      name: 'Alkoomie Station',
      distance_to_route_km: 170.1
    },
    {
      id: '942edf35-4d9e-4654-a682-7eaa4071905d',
      name: 'Bluff Hotel Camp Area',
      distance_to_route_km: 252.9
    }
  ]
}
[2/4] 📍 Found 8 filtered stops from DB
[2/4] ✅ Saved 8 stops to trip_candidate_stops table
[3/4] 🌐 Generating custom stops from Google Places... {
  searchTypes: [
    'rv_park',
    'campground',
    'holiday park',
    'tourist park',
    'free camp',
    'showground',
    'station stay',
    'national park',
    'roadhouse',
    '...'
  ]
}
[3/4] target stop quota {
  tripDurationDays: 14,
  dayBasedStopTarget: 42,
  directDistanceKm: 1951,
  estimatedDriveDistanceKm: 2551,
  distanceBasedStopCap: 29,
  targetTotalStops: 29,
  dbStops: 8,
  googleStopsNeeded: 21
}
[3/4] custom stop dedupe {
  generated: 12,
  uniqueGenerated: 12,
  existingInDb: 0,
  insertedNew: 12,
  targetCustomStops: 21,
  tripDurationDays: 14
}
[3/4] generateCustomStop diagnostics {
  totalFetched: 1480,
  afterDedup: 12,
  planned: 12,
  inserted: 12,
  targetCustomStops: 21,
  directDistanceKm: 1951
}
[3/4] ✅ Generated and saved 12 custom stops to custom_stops table { totalFetched: 1480, afterDedup: 12 }
[4/4] 📤 Returning response to client... {
  tripId: '898896d2-d808-4e17-8295-f845e8e3ef93',
  totalStopsGenerated: 20
}

Verified Stop
{
    "count": 8,
    "ids": [
        "d2bd9b04-bd04-4101-a4ca-66bc1e00a77c",
        "e961cfa5-d706-4195-b91d-c02d39a7782d",
        "7c8b7bd4-0903-4f66-b8a7-40238d67ec30",
        "a49d887c-e86d-4793-bbc8-3bf67f6ec622",
        "d2f4c431-f6cc-470c-9a2c-e84215d4042e",
        "291d0e05-e99f-46f9-bc4e-d325709c51e1",
        "060af536-b62a-436d-9dc7-6ff11efb7a34",
        "4925b5d6-33e4-4d8a-984a-5ee0f6e59dcd"
    ],
    "names": [
        "Iron Ridge Campground (Childers)",
        "Green Acres Motel & Van Park",
        "Yeppoon Kinka Beach",
        "Notch Point Free Camp",
        "Tasman Holiday Parks Airlie Beach",
        "Coral Coast Tourist Park",
        "Dunk Island View Caravan Park (Wongaling Beach)",
        "Mareeba Bush Stays"
    ]
}

Custom Stop
{
    "count": 12,
    "ids": [
        "2a47db35-332e-4c6b-bd20-86de1af43d1a",
        "00fd0936-e2da-40c3-a43a-0a9ac32e3b4e",
        "40c57a7c-11d8-4be3-abf3-a6f348769f6f",
        "23ae8efd-1143-4536-be21-2712e3d22170",
        "519d675a-4ccf-438b-8389-af8ff783c69d",
        "4f5e8a45-954d-497e-a70d-042d5b27ce9a",
        "09ec1e7d-c44e-4e75-9734-bd7a7390ca14",
        "64f26cd2-224a-4a45-97a5-9d576f6f4f73",
        "cc1c0684-bf3c-42c8-8230-d0c202f05997",
        "4a9ec7e4-a731-4ed7-b131-6bc353ebf44b",
        "6bbe370e-fba3-4817-9b57-0c4ccec5b3a3",
        "2515ff7a-cb69-4820-b3c9-59c3863ab13c"
    ],
    "names": [
        "Wyper Park Scout Camp",
        "Bundaberg Park Village",
        "Platypus Park Riverside Retreat",
        "Baffle Creek Hideaway",
        "Injinoo Fuel Station",
        "Alau Beach Campground",
        "BP Bamaga Roadhouse",
        "Seisia Service Station",
        "Seisia Holiday Park",
        "Loyalty Beach Campground & Fishing Lodge",
        "Cape York Camping Punsand Bay",
        "Somerset Beach camp"
    ],
    "dayIndexes": [
        0,
        0,
        0,
        0,
        13,
        13,
        13,
        13,
        13,
        13,
        13,
        13
    ]
}

Custom and Verified Stops
{
    "unifiedCount": 20,
    "persistedFallbackCount": 20,
    "effectiveCount": 20,
    "effectiveNames": [
        "Iron Ridge Campground (Childers)",
        "Wyper Park Scout Camp",
        "Bundaberg Park Village",
        "Platypus Park Riverside Retreat",
        "Baffle Creek Hideaway",
        "Green Acres Motel & Van Park",
        "Yeppoon Kinka Beach",
        "Notch Point Free Camp",
        "Tasman Holiday Parks Airlie Beach",
        "Coral Coast Tourist Park",
        "Dunk Island View Caravan Park (Wongaling Beach)",
        "Mareeba Bush Stays",
        "Injinoo Fuel Station",
        "Alau Beach Campground",
        "BP Bamaga Roadhouse",
        "Seisia Service Station",
        "Seisia Holiday Park",
        "Loyalty Beach Campground & Fishing Lodge",
        "Cape York Camping Punsand Bay",
        "Somerset Beach camp"
    ],
    "perDay": [
        {
            "day": 1,
            "routeCount": 1,
            "customCount": 4,
            "routeNames": [
                "Iron Ridge Campground (Childers)"
            ],
            "customNames": [
                "Wyper Park Scout Camp",
                "Bundaberg Park Village",
                "Platypus Park Riverside Retreat",
                "Baffle Creek Hideaway"
            ]
        },
        {
            "day": 2,
            "routeCount": 0,
            "customCount": 0,
            "routeNames": [],
            "customNames": []
        },
        {
            "day": 3,
            "routeCount": 0,
            "customCount": 0,
            "routeNames": [],
            "customNames": []
        },
        {
            "day": 4,
            "routeCount": 2,
            "customCount": 0,
            "routeNames": [
                "Green Acres Motel & Van Park",
                "Yeppoon Kinka Beach"
            ],
            "customNames": []
        },
        {
            "day": 5,
            "routeCount": 1,
            "customCount": 0,
            "routeNames": [
                "Notch Point Free Camp"
            ],
            "customNames": []
        },
        {
            "day": 6,
            "routeCount": 2,
            "customCount": 0,
            "routeNames": [
                "Tasman Holiday Parks Airlie Beach",
                "Coral Coast Tourist Park"
            ],
            "customNames": []
        },
        {
            "day": 7,
            "routeCount": 2,
            "customCount": 0,
            "routeNames": [
                "Dunk Island View Caravan Park (Wongaling Beach)",
                "Mareeba Bush Stays"
            ],
            "customNames": []
        },
        {
            "day": 8,
            "routeCount": 0,
            "customCount": 1,
            "routeNames": [],
            "customNames": [
                "Injinoo Fuel Station"
            ]
        },
        {
            "day": 9,
            "routeCount": 0,
            "customCount": 2,
            "routeNames": [],
            "customNames": [
                "Alau Beach Campground",
                "BP Bamaga Roadhouse"
            ]
        },
        {
            "day": 10,
            "routeCount": 0,
            "customCount": 1,
            "routeNames": [],
            "customNames": [
                "Seisia Service Station"
            ]
        },
        {
            "day": 11,
            "routeCount": 0,
            "customCount": 2,
            "routeNames": [],
            "customNames": [
                "Seisia Holiday Park",
                "Loyalty Beach Campground & Fishing Lodge"
            ]
        },
        {
            "day": 12,
            "routeCount": 0,
            "customCount": 2,
            "routeNames": [],
            "customNames": [
                "Cape York Camping Punsand Bay",
                "Somerset Beach camp"
            ]
        }
    ],
    "planningAlerts": [
        "A fuel-critical segment has limited fuel coverage. Consider shorter legs or manual fuel additions."
    ]
}

same example i get 20 stops 
now first day radius is 250 and which stops lay in it add and next 250 and no stops get then next 3 250 and here 3 stops get (now day 2 also update get from which day have more stop and that day raius reduce)

let suppose i have 20 stops 
Start: Hervey Bay 
End: Cape York 

        "Iron Ridge Campground (Childers)",
        "Wyper Park Scout Camp",
        "Bundaberg Park Village",
        "Platypus Park Riverside Retreat",
        "Baffle Creek Hideaway",
        "Green Acres Motel & Van Park",
        "Yeppoon Kinka Beach",
        "Notch Point Free Camp",
        "Tasman Holiday Parks Airlie Beach",
        "Coral Coast Tourist Park",
        "Dunk Island View Caravan Park (Wongaling Beach)",
        "Mareeba Bush Stays",
        "Injinoo Fuel Station",
        "Alau Beach Campground",
        "BP Bamaga Roadhouse",
        "Seisia Service Station",
        "Seisia Holiday Park",
        "Loyalty Beach Campground & Fishing Lodge",
        "Cape York Camping Punsand Bay",
        "Somerset Beach camp"

i split into 14 days

{
            "day": 1,
            "routeCount": 1,
            "startPoint": "Hervey Bay",
            "endPoint": "Wyper Park Scout Camp",
            "stops": [
                "Iron Ridge Campground (Childers)"
            ]
        },

day 1: start point + 1 stops + 2nd stop (ending)
day 2: 2 stops (start) + 3 stop (ending)
day 3: 3 stops (start) + 5 stop (ending)
day 4: 5 stops (start) + 6 stop (ending)
day 5: 6 stops (start) + 7 stop (ending)
day 6: 7 stops (start) + 8 stop (ending)
day 7: 8 stops (start) + 9 stop (ending)
day 8: 9 stops (start) + 10 stop (ending)
day 9: 10 stops (start) + 11 stop (ending)
day 10: 11 stops (start) + 12 stop (ending)
day 11: 12 stops (start) + 13 stop (ending)
day 12: 13 stops (start) + 14 stop (ending)
day 13: 14 stops (start) + 15 stop (ending)
day 14: 15 stops (start) + end point

each day have one start and one stop and one end if these are no full in require days then redecue see the example above

day 1: start point + 1 stops + 2nd stop (ending)
day 2: 3 stops (start) + 4 stop + 5 stop (ending)
day 3: 6 stops (start) + 7 stop + 8 stop (ending)
day 4: 9 stops (start) + 10 stop + 11 stop (ending)
day 5: 12 stops (start) + 13 stop + 14 stop (ending)
day 6: 15 stops (start) + 16 stop + 17 stop (ending)
day 7: 18 stops (start) + 19 stop + 20 stop (ending)
day 8: 21 stops (start) + 22 stop + end point

i have not 21 and 22 not have and now require day 8 final 7 days make 

day 7: 18 stops (start) + (19 stop + 20 stop) + end point



async function processTripGenerationJob(job: TripGenerationJob): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }

  let generatedStopsCount = 0
  let customStopsCount = 0

  await supabaseAdmin
    .from("trips")
    .update({ status: "in_progress" })
    .eq("id", job.tripId)

  console.log("[queue] ▶️ Starting trip generation job", {
    tripId: job.tripId,
    title: job.title,
  })

  // ============================================================
  // [2/4] GENERATE STOPS FROM DATABASE
  // ============================================================
  console.log("[2/4] 🔍 Generating stops from DB...", {
    startCoords: [job.startLat, job.startLng],
    destCoords: [job.destLat, job.destLng],
    tripId: job.tripId,
  })

  const { success: generateSuccess, stops = [], error: generateError } = await generateStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  )

  if (generateError) {
    console.warn("[2/4] ⚠️ Stop generation warning:", generateError)
  }

  // ============================================================
  // [3/4] GENERATE CUSTOM STOPS FROM GOOGLE PLACES
  // ============================================================
  console.log("[3/4] 🌐 Generating custom stops from Google Places...", {
    searchTypes: ["rv_park", "campground", "caravan park keyword"],
  })

  const dbStopDistancesKm = stops
    .map((stop) => (stop as { distance_from_start_km?: number }).distance_from_start_km ?? 0)
    .filter((distance) => distance > 0)

  const safeTripDays = Math.max(1, Math.round(Number(job.tripDurationDays) || 1))
  const dayBasedStopTarget = safeTripDays * 3
  const directDistanceKm = calculateDistance(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng
  )
  const estimatedDriveDistanceKm = Math.max(
    directDistanceKm,
    Math.min(directDistanceKm * 1.45, directDistanceKm + 600)
  )
  const distanceBasedStopCap = Math.max(1, Math.ceil(estimatedDriveDistanceKm / 90))
  const targetTotalStops = Math.min(dayBasedStopTarget, distanceBasedStopCap)
  const customStopsNeeded = Math.max(0, targetTotalStops - generatedStopsCount)

  console.log("[3/4] target stop quota", {
    tripDurationDays: safeTripDays,
    dayBasedStopTarget,
    directDistanceKm: Math.round(directDistanceKm),
    estimatedDriveDistanceKm: Math.round(estimatedDriveDistanceKm),
    distanceBasedStopCap,
    targetTotalStops,
    dbStops: generatedStopsCount,
    googleStopsNeeded: customStopsNeeded,
  })

  const {
    success: customSuccess,
    stopsGenerated = 0,
    totalFetched = 0,
    afterDedup = 0,
    error: customError,
  } = await generateCustomStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    job.tripId,
    Number(job.tripDurationDays) || 1,
    dbStopDistancesKm,
    customStopsNeeded
  )

  if (customError) {
    console.warn("[3/4] ⚠️ Custom stop generation warning:", customError)
  }

  if (customSuccess) {
    customStopsCount = stopsGenerated
    console.log(
      `[3/4] ✅ Generated and saved ${customStopsCount} custom stops to custom_stops table`,
      {
        totalFetched,
        afterDedup,
      }
    )
  } else {
    console.log("[3/4] ⓘ Custom stop generation skipped or failed", {
      totalFetched,
      afterDedup,
    })
  }

  // ============================================================
  // [4/4] COMPLETE JOB
  // ============================================================
  await supabaseAdmin
    .from("trips")
    .update({ status: "completed" })
    .eq("id", job.tripId)

  console.log("[4/4] ✅ Trip generation completed", {
    tripId: job.tripId,
    totalStopsGenerated: generatedStopsCount + customStopsCount,
  })
}

same as it is
if (!supabaseAdmin) {
    throw new Error("Database not configured")
  }
if travelPace
 • leisure: ~150–200 km per day
• moderate: ~200–300 km
• fast: ~300–400 km 

in start store const travelPace(default is leisure), tripDurationDays, totalKm from lat lng.
 
if totalKm is 1200km and   leisure then 1200/175 = sugestion days come 


  await supabaseAdmin
    .from("trips")
    .update({ status: "in_progress" })
    .eq("id", job.tripId)

  console.log("[queue] ▶️ Starting trip generation job", {
    tripId: job.tripId,
    title: job.title,
  })

same as it is 

generate stop from db same as it is 

generate stop from google place same as it is 

const {
    success: customSuccess,
    stopsGenerated = 0,
    totalFetched = 0,
    afterDedup = 0,
    error: customError,
  } = await generateCustomStop(
    job.startLat,
    job.startLng,
    job.destLat,
    job.destLng,
    job.tripId,
    Number(job.tripDurationDays) || 1,(tripDurationDays)
    dbStopDistancesKm, (totalKm),
(tripDurationSuggestionDays)
    customStopsNeeded (remove it)
  )
now both stops generated and i have travelPace and suggestionDays and startCoords and destCoords 

- always prioirty the verified stop first 
- now order in days (suppose i have suggest 7 days) 
- each day have 3 option one is default set as endPoint and 2 other show whihc user select then considered that as endPoint 

now day 1 startCoords and endPoint  (below 3 option one is default and 2 other which near of endPoint)

now day 2 endPoint of day and endPoint  (below 3 option one is default and 2 other which near of endPoint)

full the days and make array and add this is custom and this is verified.

and now save both data in specific table and then 

  // ============================================================
  // [4/4] COMPLETE JOB
  // ============================================================
  await supabaseAdmin
    .from("trips")
    .update({ status: "completed" })
    .eq("id", job.tripId)
  console.log("[4/4] ✅ Trip generation completed", {
    tripId: job.tripId,
    totalStopsGenerated: generatedStopsCount + customStopsCount,
  })

