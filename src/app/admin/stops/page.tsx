"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import {
  Upload,
  Search,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Pencil,
  ArrowLeft,
} from "lucide-react"
import { getStoredUser } from "@/lib/auth"

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]

interface StopRow {
  id: string
  location_name: string
  state: string | null
  nearest_town: string | null
  stay_type: string | null
  verification_status: string | null
  cost_band: string | null
  pet_friendly: string | null
  created_at: string
}

interface StopFull extends StopRow {
  region: string | null
  route_type: string | null
  rig_suitability: string | null
  access_type: string | null
  water: string | null
  dump_point: string | null
  best_season: string | null
  why_we_d_stay_again: string | null
  confidence_level: string | null
  tier: string | null
  aao_tip: string | null
  why_stop_here: string | null
  best_travel_window: string | null
  latitude: string | null
  longitude: string | null
  corridor: string | null
  road_suitability: string | null
  max_rig_length: string | null
  // Affiliate / partner fields
  affiliate_partner: string | null
  partner_type: string | null
  affiliate_url: string | null
  direct_booking_url: string | null
  discount_code: string | null
  partner_notes: string | null
}

interface ImportSummary {
  total_rows: number
  processed: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  error_details: string[]
}

type StopFormData = Omit<StopFull, "id" | "created_at">

const EMPTY_FORM: StopFormData = {
  location_name: "",
  state: "",
  region: "",
  nearest_town: "",
  route_type: "",
  rig_suitability: "",
  access_type: "",
  water: "",
  dump_point: "",
  pet_friendly: "",
  best_season: "",
  stay_type: "",
  why_we_d_stay_again: "",
  confidence_level: "",
  tier: "",
  aao_tip: "",
  why_stop_here: "",
  best_travel_window: "",
  latitude: "",
  longitude: "",
  corridor: "",
  road_suitability: "",
  max_rig_length: "",
  cost_band: "",
  verification_status: "AAO Verified",
  affiliate_partner: "",
  partner_type: "",
  affiliate_url: "",
  direct_booking_url: "",
  discount_code: "",
  partner_notes: "",
}

export default function AdminStopsPage() {
  const router = useRouter()

  // Auth guard
  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.replace("/login")
      return
    }
    // Check if user has admin role
    const userWithRole = user as { id: string; email: string; role?: string }
    if (userWithRole.role !== "admin") {
      router.replace("/planner")
      return
    }
  }, [router])

  // Stop list state
  const [stops, setStops] = useState<StopRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [stateFilter, setStateFilter] = useState("")
  const [loadingStops, setLoadingStops] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Add / Edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<StopFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // CSV import state
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<"upsert" | "insert">("upsert")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const LIMIT = 50
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const fetchStops = useCallback(async (p: number, q: string, s: string) => {
    setLoadingStops(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (q) params.set("search", q)
      if (s) params.set("state", s)
      const res = await fetch(`/api/admin/stops?${params}`)
      const data = await res.json()
      if (data.success) {
        setStops(data.stops)
        setTotal(data.total)
      }
    } catch {
      toast.error("Failed to load stops")
    } finally {
      setLoadingStops(false)
    }
  }, [])

  useEffect(() => {
    fetchStops(page, search, stateFilter)
  }, [page, stateFilter, fetchStops]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (val: string) => {
    setSearch(val)
    setPage(1)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchStops(1, val, stateFilter), 400)
  }

  const handleStateChange = (val: string) => {
    setStateFilter(val === "all" ? "" : val)
    setPage(1)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/stops?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    if (data.success) {
      toast.success("Stop deleted")
      fetchStops(page, search, stateFilter)
    } else {
      toast.error(data.error || "Failed to delete stop")
    }
  }

  // ── Add / Edit sheet ──────────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSheetOpen(true)
  }

  async function openEdit(stop: StopRow) {
    // Fetch full stop details
    try {
      const res = await fetch(`/api/admin/stops?id=${stop.id}&full=1`)
      const data = await res.json()
      const s: StopFull = data.success ? data.stop : stop
      setEditingId(s.id)
      setForm({
        location_name: s.location_name ?? "",
        state: s.state ?? "",
        region: s.region ?? "",
        nearest_town: s.nearest_town ?? "",
        route_type: s.route_type ?? "",
        rig_suitability: s.rig_suitability ?? "",
        access_type: s.access_type ?? "",
        water: s.water ?? "",
        dump_point: s.dump_point ?? "",
        pet_friendly: s.pet_friendly ?? "",
        best_season: s.best_season ?? "",
        stay_type: s.stay_type ?? "",
        why_we_d_stay_again: s.why_we_d_stay_again ?? "",
        confidence_level: s.confidence_level ?? "",
        tier: s.tier ?? "",
        aao_tip: s.aao_tip ?? "",
        why_stop_here: s.why_stop_here ?? "",
        best_travel_window: s.best_travel_window ?? "",
        latitude: s.latitude ?? "",
        longitude: s.longitude ?? "",
        corridor: s.corridor ?? "",
        road_suitability: s.road_suitability ?? "",
        max_rig_length: s.max_rig_length ?? "",
        cost_band: s.cost_band ?? "",
        verification_status: s.verification_status ?? "unverified",
        affiliate_partner: s.affiliate_partner ?? "",
        partner_type: s.partner_type ?? "",
        affiliate_url: s.affiliate_url ?? "",
        direct_booking_url: s.direct_booking_url ?? "",
        discount_code: s.discount_code ?? "",
        partner_notes: s.partner_notes ?? "",
      })
      setSheetOpen(true)
    } catch {
      toast.error("Failed to load stop details")
    }
  }

  async function handleSave() {
    if (!form.location_name || !form.latitude || !form.longitude) {
      toast.error("Location name, latitude, and longitude are required")
      return
    }
    setSaving(true)
    try {
      const method = editingId ? "PATCH" : "POST"
      const body = editingId ? { id: editingId, ...form } : form
      const res = await fetch("/api/admin/stops", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(editingId ? "Stop updated" : "Stop created")
        setSheetOpen(false)
        fetchStops(page, search, stateFilter)
      } else {
        toast.error(data.error || "Save failed")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setSaving(false)
    }
  }

  function setField(key: keyof StopFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── CSV drag-and-drop ─────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith(".csv")) {
      setFile(dropped)
      setImportResult(null)
      setImportError(null)
    } else {
      toast.error("Please drop a CSV file")
    }
  }, [])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setImportResult(null)
      setImportError(null)
    }
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("mode", importMode)

      const res = await fetch("/api/admin/stops/import", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (data.success) {
        setImportResult(data.summary)
        toast.success(`Import complete — ${data.summary.inserted} inserted, ${data.summary.updated} updated`)
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
        fetchStops(1, search, stateFilter)
        setPage(1)
      } else {
        setImportError(data.error || "Import failed")
        toast.error(data.error || "Import failed")
      }
    } catch {
      setImportError("Network error during import")
      toast.error("Network error during import")
    } finally {
      setImporting(false)
    }
  }

  const verificationColor: Record<string, string> = {
    "AAO Verified": "bg-emerald-100 text-emerald-800",
    unverified: "bg-yellow-100 text-yellow-800",
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin" className="flex items-center gap-1 hover:text-gray-700">
                <ArrowLeft className="h-3 w-3" />
                Admin
              </Link>
              <span>/</span>
              <span>Stops</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Stop Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage the verified stop database used by the trip planner
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Database className="h-4 w-4" />
              <span>{total.toLocaleString()} stops total</span>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Stop
            </Button>
          </div>
        </div>

        {/* ── CSV Import card ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              CSV Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileSelect}
                className="hidden"
              />
              <FileText className="h-8 w-8 mx-auto mb-3 text-gray-400" />
              {file ? (
                <div className="space-y-1">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB — ready to import
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-gray-700">
                    Drop a CSV file here, or click to browse
                  </p>
                  <p className="text-sm text-gray-400">
                    Expected columns: Location Name, State, Latitude, Longitude, Stay Type, …
                  </p>
                </div>
              )}
              {file && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    setImportResult(null)
                    setImportError(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Import options */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Import mode</Label>
                <Select
                  value={importMode}
                  onValueChange={(v) => setImportMode(v as "upsert" | "insert")}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">
                      Upsert (add new, update existing)
                    </SelectItem>
                    <SelectItem value="insert">
                      Insert only (skip duplicates)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleImport}
                disabled={!file || importing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </>
                )}
              </Button>
            </div>

            {importing && (
              <Progress value={undefined} className="h-1.5" />
            )}

            {/* Import result */}
            {importResult && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium text-green-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Import complete
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-white rounded p-2 text-center border border-green-100">
                    <div className="text-lg font-bold text-gray-900">{importResult.total_rows}</div>
                    <div className="text-gray-500">Total rows</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center border border-green-100">
                    <div className="text-lg font-bold text-green-700">{importResult.inserted}</div>
                    <div className="text-gray-500">Inserted</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center border border-green-100">
                    <div className="text-lg font-bold text-blue-700">{importResult.updated}</div>
                    <div className="text-gray-500">Updated</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center border border-green-100">
                    <div className="text-lg font-bold text-yellow-700">{importResult.skipped}</div>
                    <div className="text-gray-500">Skipped</div>
                  </div>
                </div>
                {importResult.error_details.length > 0 && (
                  <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                    <div className="font-medium">{importResult.errors} row error(s):</div>
                    {importResult.error_details.map((e, i) => (
                      <div key={i} className="text-xs font-mono">{e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {importError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {importError}
              </div>
            )}

            {/* CSV format reference */}
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
                Expected CSV column headers
              </summary>
              <div className="mt-2 rounded bg-gray-100 p-3 font-mono text-xs text-gray-700 whitespace-pre-wrap">
                {[
                  "Location Name", "State", "Region", "Nearest Town", "Route Type",
                  "Rig Suitability", "Access Type", "Water", "Dump Point", "Pet Friendly",
                  "Best Season", "Stay Type", "Why We'd Stay Again", "Confidence Level",
                  "Tier", "AAO Tip", "Why Stop Here", "Best Travel Window",
                  "Latitude", "Longitude", "Corridor", "Road Suitability",
                  "Max Rig Length", "Cost Band", "Verification Status",
                ].join(", ")}
              </div>
            </details>
          </CardContent>
        </Card>

        <Separator />

        {/* ── Stop list ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">All Stops</h2>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name…"
                  className="pl-8 w-52"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
              </div>
              <Select
                value={stateFilter || "all"}
                onValueChange={handleStateChange}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  {AU_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => fetchStops(page, search, stateFilter)}
                disabled={loadingStops}
              >
                <RefreshCw className={`h-4 w-4 ${loadingStops ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-[220px]">Name</TableHead>
                  <TableHead className="w-20">State</TableHead>
                  <TableHead>Nearest Town</TableHead>
                  <TableHead>Stay Type</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Pet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStops ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-gray-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : stops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-gray-400">
                      No stops found
                    </TableCell>
                  </TableRow>
                ) : (
                  stops.map((stop) => (
                    <TableRow key={stop.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-sm truncate max-w-[220px]">
                        {stop.location_name}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{stop.state ?? "—"}</TableCell>
                      <TableCell className="text-sm text-gray-500">{stop.nearest_town ?? "—"}</TableCell>
                      <TableCell className="text-sm text-gray-500 capitalize">{stop.stay_type ?? "—"}</TableCell>
                      <TableCell className="text-sm text-gray-500 capitalize">{stop.cost_band ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {stop.pet_friendly === "Yes" ? (
                          <span className="text-green-600">Yes</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          verificationColor[stop.verification_status ?? ""] ?? "bg-gray-100 text-gray-700"
                        }`}>
                          {stop.verification_status ?? "unknown"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(stop)}
                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(stop.id, stop.location_name)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()} stops
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Sheet ──────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 sm:p-8">
          <SheetHeader className="pr-10 pt-2">
            <SheetTitle>{editingId ? "Edit Stop" : "Add Stop"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 py-4">
            {/* Core */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Core details</h3>
              <div className="space-y-2">
                <Label>Location Name <span className="text-red-500">*</span></Label>
                <Input value={form.location_name} onChange={(e) => setField("location_name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select value={form.state ?? ""} onValueChange={(v) => setField("state", v)}>
                    <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent>
                      {AU_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input value={form.region ?? ""} onChange={(e) => setField("region", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nearest Town</Label>
                  <Input value={form.nearest_town ?? ""} onChange={(e) => setField("nearest_town", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Corridor</Label>
                  <Input value={form.corridor ?? ""} onChange={(e) => setField("corridor", e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Location */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Coordinates</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Latitude <span className="text-red-500">*</span></Label>
                  <Input value={form.latitude ?? ""} onChange={(e) => setField("latitude", e.target.value)} placeholder="-27.123" />
                </div>
                <div className="space-y-2">
                  <Label>Longitude <span className="text-red-500">*</span></Label>
                  <Input value={form.longitude ?? ""} onChange={(e) => setField("longitude", e.target.value)} placeholder="153.456" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Access & suitability */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Access & Suitability</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Stay Type</Label>
                  <Input value={form.stay_type ?? ""} onChange={(e) => setField("stay_type", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Route Type</Label>
                  <Input value={form.route_type ?? ""} onChange={(e) => setField("route_type", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Rig Suitability</Label>
                  <Input value={form.rig_suitability ?? ""} onChange={(e) => setField("rig_suitability", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Road Suitability</Label>
                  <Input value={form.road_suitability ?? ""} onChange={(e) => setField("road_suitability", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Access Type</Label>
                  <Input value={form.access_type ?? ""} onChange={(e) => setField("access_type", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Rig Length</Label>
                  <Input value={form.max_rig_length ?? ""} onChange={(e) => setField("max_rig_length", e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Amenities */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Amenities & Cost</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Water</Label>
                  <Input value={form.water ?? ""} onChange={(e) => setField("water", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Dump Point</Label>
                  <Select value={form.dump_point ?? ""} onValueChange={(v) => setField("dump_point", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pet Friendly</Label>
                  <Select value={form.pet_friendly ?? ""} onValueChange={(v) => setField("pet_friendly", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cost Band</Label>
                  <Input value={form.cost_band ?? ""} onChange={(e) => setField("cost_band", e.target.value)} placeholder="free / low / mid / high" />
                </div>
                <div className="space-y-2">
                  <Label>Best Season</Label>
                  <Input value={form.best_season ?? ""} onChange={(e) => setField("best_season", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Best Travel Window</Label>
                  <Input value={form.best_travel_window ?? ""} onChange={(e) => setField("best_travel_window", e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Quality */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Quality & Verification</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Tier</Label>
                  <Input value={form.tier ?? ""} onChange={(e) => setField("tier", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Confidence Level</Label>
                  <Input value={form.confidence_level ?? ""} onChange={(e) => setField("confidence_level", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Verification Status</Label>
                  <Select value={form.verification_status ?? "AAO Verified"} onValueChange={(v) => setField("verification_status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AAO Verified">AAO Verified</SelectItem>
                      <SelectItem value="unverified">Unverified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Notes</h3>
              <div className="space-y-2">
                <Label>Why Stop Here</Label>
                <Textarea rows={2} value={form.why_stop_here ?? ""} onChange={(e) => setField("why_stop_here", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Why We&apos;d Stay Again</Label>
                <Textarea rows={2} value={form.why_we_d_stay_again ?? ""} onChange={(e) => setField("why_we_d_stay_again", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>AAO Tip</Label>
                <Textarea rows={2} value={form.aao_tip ?? ""} onChange={(e) => setField("aao_tip", e.target.value)} />
              </div>
            </div>

            <Separator />

            {/* Affiliate / Partner */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wide">Affiliate & Partner</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Affiliate Partner</Label>
                  <Input value={form.affiliate_partner ?? ""} onChange={(e) => setField("affiliate_partner", e.target.value)} placeholder="e.g. Hipcamp" />
                </div>
                <div className="space-y-2">
                  <Label>Partner Type</Label>
                  <Select value={form.partner_type ?? ""} onValueChange={(v) => setField("partner_type", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="sponsored">Sponsored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Affiliate URL</Label>
                <Input value={form.affiliate_url ?? ""} onChange={(e) => setField("affiliate_url", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Direct Booking URL</Label>
                <Input value={form.direct_booking_url ?? ""} onChange={(e) => setField("direct_booking_url", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Discount Code</Label>
                <Input value={form.discount_code ?? ""} onChange={(e) => setField("discount_code", e.target.value)} placeholder="e.g. TRACKMATE10" />
              </div>
              <div className="space-y-2">
                <Label>Partner Notes</Label>
                <Textarea rows={2} value={form.partner_notes ?? ""} onChange={(e) => setField("partner_notes", e.target.value)} />
              </div>
            </div>
          </div>

          <SheetFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                editingId ? "Update Stop" : "Create Stop"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
