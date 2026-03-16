TrackMate MVP PRD
1. Project Overview
TrackMate is an AI-assisted road trip planner for Australian travellers, especially caravan and lap-style travellers. The product must be database-first: AI should never invent stops. Instead, the system should filter from a verified stop database and then use AI to turn those verified results into a structured, editable itinerary.
The MVP will be hosted on trackmate.allaroundoz.com.au and sold through the client’s existing sales flow. Customers purchase via the current payment flow, which triggers a post-sale Fab Funnels automation. The new TrackMate app will manage its own application access, saved trips, itinerary generation, map view, refinement chat, and PDF export.



2. Product Goals
Primary goal
Build a working MVP that allows a paying customer to:
Purchase TrackMate
Receive secure access to the new planner
Enter trip details
Generate a structured route plan from verified stops only
Refine that same plan conversationally
Save and revisit trips
Export trip output to PDF
Secondary goals
Make the stop database reusable as an All Around Oz data asset
Keep auth simple for non-technical users
Support future admin maintenance of the stop dataset
Prepare the system for future affiliate and recommendation features

3. Core Product Principles
Database-first
AI must never invent stops, camps, caravan parks, or stay suggestions not present in the verified stop database.
Route-first filtering
Stops must be selected based on proximity to the actual route corridor between origin and destination.
Suitability-aware planning
Filtering must consider travel constraints such as rig suitability, road suitability, pet-friendly preference, cost band, stay type, and seasonal fit.
Graceful fallback
If no suitable verified stop exists for a section, the itinerary should still remain useful and explicitly state that no AAO verified stop is available on that stretch.
Persistent trip context
Refinement chat must continue the same trip, not restart from scratch.
4. User Types
4.1 Customer / Traveller
A paying end-user who wants to plan and refine a road trip.
4.2 Admin / AAO team
An internal user who maintains the stop database and may review or edit stop records via admin tools or CSV import.
5. User Journey
5.1 Purchase and access
User lands on TrackMate sales page on WordPress
User clicks CTA and is redirected to the payment link
Successful purchase triggers Fab Funnels workflow
Fab Funnels calls TrackMate backend webhook
TrackMate backend creates or updates the user in Supabase
TrackMate backend sends secure access email or magic link
User opens TrackMate and lands in dashboard/planner
5.2 Planning flow
User enters trip inputs
System calculates route corridor
System filters verified stop candidates
System sends structured stop candidates to AI
AI generates itinerary in required format
User views map and itinerary
User saves trip or refines it with follow-up messages
5.3 Admin flow
Admin logs in to stop management area
Admin adds, edits, deletes, or imports stops
Updated data becomes available for future trip planning
6. Scope of MVP
Included
Customer access from payment success workflow
New TrackMate web app
Authenticated access
Planner input form
Route corridor logic
Verified stop filtering
AI itinerary generation
Conversational refinement of same trip
Map view with route and stop markers
Saved trips
PDF export
Admin stop manager
CSV import/update for stops
Excluded for MVP unless later requested
Full subscription management inside app
Deep affiliate booking flows
Advanced map interactions beyond overview
Mobile app
Community-generated stop suggestions UI
Complex role management
7. Functional Requirements
7.1 Authentication and access
Users should gain access only after confirmed purchase
Access flow must be triggered by Fab Funnels post-sale workflow
TrackMate should manage its own app access, independent of the current old TrackMate
Login experience should be as simple as possible
Preferred flow: secure magic link or invite/setup-password flow
Returning users should be able to log in and see saved trips
Acceptance criteria
New paying user receives access email after successful purchase
Existing user is not duplicated unnecessarily
Duplicate webhook calls do not create duplicate users or purchases
7.2 Purchase integration
Fab Funnels workflow is the authoritative trigger for post-sale access
Current live workflow must not be changed until new TrackMate is ready
A duplicate workflow should be used for new TrackMate testing and rollout
Ideally, a separate test/fake checkout should exist for testing end-to-end purchase flows
Acceptance criteria
A test purchase can trigger the new account-creation pipeline safely
Live old TrackMate access remains unaffected before launch
7.3 Planner input form
Required fields:
Start location
Destination
Trip duration or travel pace
Rig type / rig size suitability input
Pet friendly toggle
Stay preference (optional)
Potential extensible fields:
Avoid gravel roads
Budget/cost preference
Seasonal preference
Acceptance criteria
User can submit a trip request with required fields
Form validates required fields before submission
7.4 Stop database
The system will use a structured database of verified stops. Current and expected fields include:
Location Name
State
Region
Nearest Town
Route Type
Rig Suitability
Access Type
Water
Dump Point
Pet Friendly
Best Season
Stay Type
Why We’d Stay Again
Tier
AAO Tip
Why Stop Here
Best Travel Window
Latitude
Longitude
Corridor
Road Suitability
Max Rig Length
Cost Band
Verification Status
Affiliate Partner
Partner Type
Affiliate URL
Direct Booking URL
Discount Code
Partner Notes
Acceptance criteria
Stop records can be imported from CSV
Stop records can be stored and queried in Supabase/Postgres
Schema supports future expansion without major redesign
7.5 Route corridor and stop filtering
System must obtain route path between origin and destination
System must identify verified stops along or near that route
System must filter or rank stops using:
corridor match
geographic proximity to route
rig suitability
road suitability
max rig length
pet-friendly setting
cost band
stay type
seasonal suitability
travel pace / distance logic
Acceptance criteria
Given a route and preferences, system returns relevant verified stop candidates
Returned results are visibly route-relevant and preference-aware
7.6 AI itinerary generation
AI receives only filtered, structured verified stop candidates
AI produces a consistent itinerary format
AI must not introduce non-database stops as suggested stays
When a gap exists, AI must explicitly note lack of verified stop coverage
Required itinerary format
Trip Snapshot
Route
Total distance
Trip vibe / pace
Rig suitability summary
Short overview
Day-by-day sections
For each segment/day:
From → To
Distance / drive time
Suggested stay
Stop type
Why stop here
AAO tip
Gap handling
Clearly state: no AAO verified stop available on that stretch
Optionally reference checking local caravan parks/camping apps near town name
Trip Notes
Fuel guidance
Remote stretch warnings
Road-condition notes
Seasonal notes
Acceptance criteria
Generated itinerary uses only filtered verified stops
Output is structured enough for UI rendering and PDF export
Gap sections are clearly marked
7.7 Conversational refinement
User must be able to refine the same itinerary through follow-up prompts
Minor changes should adjust the current itinerary
Major changes should trigger re-filtering and stop replacement
Example minor refinements
Slow this down
Add a rest day
Break one long driving day into two
Example major refinements
Avoid gravel roads
Prefer free camps
Pet-friendly only
Change stay type
Change overall travel preferences
Acceptance criteria
Trip context persists across messages
Refinements do not create unrelated fresh trips
Major changes can update stop selection
7.8 Map view
Show start point
Show destination
Show selected suggested stops
Show simple route overview
No advanced navigation required for MVP
Acceptance criteria
User can visually understand the overall route and stop placement
7.9 Saved trips
Users must be able to save trips
Users must be able to revisit and continue editing saved trips
App should support multiple trips per user
Acceptance criteria
Saved trip reopens with itinerary, route data, and chat/refinement history intact
7.10 PDF export
Users must be able to export a trip itinerary to PDF
Export should be based on structured itinerary output
Acceptance criteria
PDF contains readable itinerary and core trip details
7.11 Admin stop management
Admin should be able to add stop manually
Admin should be able to edit stop
Admin should be able to delete stop
Admin should be able to import or update stops via CSV
Acceptance criteria
Non-developer admin can maintain stop records without direct database access
8. Non-Functional Requirements
8.1 Performance
Form submission and initial plan generation should feel responsive
Route filtering should be efficient enough for MVP dataset size
8.2 Reliability
Webhook handling must be idempotent
App should not create duplicate accounts or duplicate purchase records on retries
8.3 Security
Payment success must be verified by Fab Funnels workflow trigger
Backend webhook endpoint must use shared secret validation
Secrets must not be exposed in frontend
Service role secrets must remain server-side only
8.4 Maintainability
Stop schema should be extendable
Trip logic should be modular
Prompt logic should be documented and maintainable
8.5 User experience
Planner should be simple and non-technical
Access flow should minimize friction
Messaging should be clear when no verified stop exists
9. Suggested Technical Architecture
Frontend
Next.js app
Authenticated dashboard and planner screens
Form UI, itinerary UI, saved trips UI, admin UI
Backend
Next.js server routes or separate Node backend if needed
Webhook endpoint for Fab Funnels
Route filtering logic
OpenAI orchestration
PDF generation logic
Database / platform
Supabase Postgres
Supabase Auth
Optional Supabase Storage if needed later
Integrations
Fab Funnels for payment-success automation trigger
Map provider for route and markers
OpenAI for itinerary generation
10. Proposed Data Model
users / profiles
id
email
full_name
source
fabfunnels_contact_id
access_status
created_at
updated_at
purchases
id
user_id
source_order_id
source
product_name
payment_status
processed_at
created_at
stops
id
all stop data fields listed above
created_at
updated_at
trips
id
user_id
title
start_location
destination
trip_duration
travel_pace
rig_type
pet_friendly
stay_preference
route_data_json
itinerary_json
trip_summary
status
created_at
updated_at
trip_stops
id
trip_id
stop_id
day_number
sequence_order
drive_distance_km
drive_time_minutes
notes
trip_messages
id
trip_id
role
message
metadata_json
created_at
imports (optional)
id
source
imported_by
row_count
created_at
11. API / Integration Requirements
11.1 Fab Funnels webhook endpoint
Endpoint example:
POST /api/webhooks/fabfunnels-access
Expected payload minimum:
email
full name or first/last name
order id / transaction id
payment status
contact id if available
source identifier
Expected server behavior:
verify shared secret header
validate payload
check for duplicate order processing
create or update auth user
create or update profile
create purchase record
trigger magic link / invite email
return success response
12. Fab Funnels Workflow Design
Current situation
There is an existing live workflow used for old TrackMate access. It should not be edited directly before launch.
Required setup
Duplicate current live access workflow
Use duplicate for new TrackMate integration and testing
If possible, connect duplicate to a test/fake checkout for safe end-to-end validation
Recommended workflow order
Trigger: Order Form Submission with Submission Type = Sale
Add Tag
Webhook/API request to new TrackMate backend
Optional wait 10–30 seconds
Confirmation email or remove if backend sends actual access email
Email recommendation
Best option for MVP:
Backend sends real TrackMate magic-link/access email
Fab Funnels email becomes optional confirmation email only
13. Pages / Screens
Customer-facing
Landing / entry page if needed
Dashboard
New Trip Planner
Trip Detail / Saved Trip View
Login / Invite / Magic Link completion flow
Admin-facing
Stop list
Add stop
Edit stop
CSV import/update
14. Milestones
Milestone 1: Core Setup
Deliverables:
Repo and environment setup
Supabase project connection
Database schema
Stop import pipeline
Planner form shell
Basic route input flow
Initial stop query from DB
Milestone 2: Route Logic + Map
Deliverables:
Route retrieval
Corridor filtering
Suitability filtering
Map overview with start/destination/stops
Milestone 3: AI Itinerary + Refinement
Deliverables:
OpenAI integration
Structured itinerary generation
Saved trip persistence
Conversational refinement
Milestone 4: Access Delivery + Export + Admin
Deliverables:
Fab Funnels webhook integration
Supabase auth access creation
Email delivery flow
PDF export
Admin stop CRUD and CSV import
Final deployment and polish
15. Risks and Dependencies
Risks
Dirty or inconsistent source spreadsheet data
Unclear payment payload fields from Fab Funnels
Duplicate orders or retried webhooks
AI response drift if prompt format is not strict
Map/provider choice changes mid-build
Dependencies
Supabase dashboard access
Stable source data from spreadsheet
Fab Funnels workflow access
Test purchase path or safe duplicate workflow
OpenAI billing/model availability
16. Open Questions
Which map provider is final for MVP?
Will backend or Fab Funnels send final access email?
Should users be able to manage multiple trips in MVP?
Are affiliate-related fields schema-only for now, or displayed in itinerary/admin?
Is CSV import overwrite/upsert behavior required initially?
17. Definition of Done
TrackMate MVP is considered done when:
A successful TrackMate purchase can trigger account creation for the new app
User receives secure access and enters the planner
User can submit trip details and get a verified-stop itinerary
AI output is structured and does not invent stops
User can refine the same itinerary via follow-up messages
User can view route overview on map
User can save and reopen trips
User can export PDF
Admin can maintain stops without developer help
Live old TrackMate remains unaffected until switchover
18. Immediate Next Steps
Confirm duplicate Fab Funnels workflow will be created for new TrackMate
Confirm or obtain test checkout path if possible
Finalize backend endpoint contract for Fab Funnels webhook
Audit Google Sheet columns and normalize source data
Create DB schema in Supabase
Build stop import process
Build M1 planner scaffold and DB filtering
Then proceed to route logic, AI, auth, and export
