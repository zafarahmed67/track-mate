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



Stack to use:

* Frontend map library: Leaflet, Next JS, Typescript
* Routing API: Google MAp Directions API
* Polyline decoding library: polyline
* Backend: Next.js API that returns stops along the route


Fix the map rendering issue in the route finder application.

Problem:
The map currently only shows marker A (start) and marker B (end).
The road route polyline and stop markers are not displayed.

Required Implementation:

1. Decode the polyline returned by the routing API into coordinate pairs.
2. Render the route using a blue polyline on the map.
3. Fetch stops from the backend API.
4. Loop through the stops array and create numbered markers for each stop.
5. Attach popups to each stop marker showing stop name and distance from the route.
6. Ensure all markers and the polyline are added to the map layer.
7. Automatically adjust the map view using fitBounds so the route and stops are visible.

Expected Output on Map:

* Marker A for start location.
* Marker B for end location.
* Blue route polyline between A and B.
* Numbered markers for each stop along the route.
* Popups showing stop information.
* Map automatically zoomed to include the full route and stops.

Implementation Steps:

1. Fetch route
   Create a function getRoute(startLat, startLon, endLat, endLon) that calls the OpenRouteService Directions API and returns the encoded polyline geometry.

2. Decode polyline
   Use the polyline library to decode the route geometry into an array of [lat, lon] coordinates.

Example function:
decodeRoutePolyline(encodedPolyline)

3. Draw route
   Use Leaflet L.polyline() to draw the decoded route coordinates on the map.

Function:
drawRouteOnMap(routeCoordinates)

Style:

* color: blue
* weight: 5

4. Fetch stops
   Call the backend API:

5. Add stop markers
   Loop through the stops array and create numbered markers.

Function:
addStopMarkers(stops)

Each marker should:

* display stop number
* show popup with stop name and distance

6. Fit map bounds
   Create function:
   fitMapToRouteAndStops()

Combine route coordinates and stop coordinates and use:
map.fitBounds()

Input: "[Describe your current stack, framework, map library, backend, and the problem you see]"

Generate a complete implementation prompt that includes:
- Short description
- Stack to use
- Problem
- Required implementation steps (route fetching, polyline decoding, drawing, fetching stops, adding markers, fitBounds)
- Expected output on map
- Functions to implement

