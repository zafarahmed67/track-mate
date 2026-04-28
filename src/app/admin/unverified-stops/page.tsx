"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react"
import { getStoredUser } from "@/lib/auth"

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]
const STATUSES = ["pending", "promoted", "rejected"] as const

interface UnverifiedRow {
  id: string
  place_id: string
  location_name: string
  state: string | null
  region: string | null
  address: string | null
  place_type: string | null
  rating: number | null
  user_ratings_total: number | null
  review_status: "pending" | "promoted" | "rejected"
  hit_count: number
  created_at: string
}

interface FullRow extends UnverifiedRow {
  latitude: number
  longitude: number
}

const PAGE_SIZE = 50

export default function UnverifiedStopsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<UnverifiedRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [stateFilter, setStateFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<FullRow | null>(null)
  const [editingForm, setEditingForm] = useState<Partial<FullRow>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user || user.role !== "admin") {
      router.replace("/")
    }
  }, [router])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (search) params.set("search", search)
      if (stateFilter) params.set("state", stateFilter)
      if (statusFilter) params.set("status", statusFilter)
      const res = await fetch(`/api/admin/unverified-stops?${params}`)
      const data = await res.json()
      if (data.success) {
        setRows(data.stops)
        setTotal(data.total)
      } else {
        toast.error(data.error || "Failed to load")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [page, search, stateFilter, statusFilter])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map((r) => r.id)))
    }
  }

  const openEdit = async (id: string) => {
    const res = await fetch(`/api/admin/unverified-stops?id=${id}`)
    const data = await res.json()
    if (data.success) {
      setEditing(data.stop)
      setEditingForm(data.stop)
    } else {
      toast.error(data.error || "Failed to load")
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/unverified-stops`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...editingForm }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Saved")
        setEditing(null)
        fetchRows()
      } else {
        toast.error(data.error || "Failed to save")
      }
    } finally {
      setSaving(false)
    }
  }

  const promote = async (id: string) => {
    const res = await fetch(`/api/admin/unverified-stops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success("Promoted to verified stops")
      setEditing(null)
      fetchRows()
    } else {
      toast.error(data.error || "Failed to promote")
    }
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} stop(s)? This cannot be undone.`)) return
    const ids = Array.from(selected).join(",")
    const res = await fetch(`/api/admin/unverified-stops?ids=${ids}`, {
      method: "DELETE",
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Deleted ${data.deleted}`)
      setSelected(new Set())
      fetchRows()
    } else {
      toast.error(data.error || "Failed to delete")
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Unverified Stops</h1>
        </div>
        <Badge variant="secondary">{total} total</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1)
                  setSearch(e.target.value)
                }}
                placeholder="Location name..."
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>State</Label>
            <Select
              value={stateFilter || "all"}
              onValueChange={(v) => {
                setPage(1)
                setStateFilter(v === "all" ? "" : v)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {AU_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => {
                setPage(1)
                setStatusFilter(v === "all" ? "" : v)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.size === 0}
              onClick={bulkDelete}
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === rows.length && rows.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No unverified stops match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{row.location_name}</TableCell>
                    <TableCell>{row.state ?? "—"}</TableCell>
                    <TableCell>{row.place_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.review_status === "promoted"
                            ? "default"
                            : row.review_status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {row.review_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.hit_count}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(row.id)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={row.review_status === "promoted"}
                        onClick={() => promote(row.id)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Promote
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          Page {page} of {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit unverified stop</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <Label>Location name</Label>
                <Input
                  value={editingForm.location_name ?? ""}
                  onChange={(e) =>
                    setEditingForm((f) => ({ ...f, location_name: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input
                    value={editingForm.state ?? ""}
                    onChange={(e) => setEditingForm((f) => ({ ...f, state: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Input
                    value={editingForm.region ?? ""}
                    onChange={(e) => setEditingForm((f) => ({ ...f, region: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <Input
                  value={editingForm.address ?? ""}
                  onChange={(e) => setEditingForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={editingForm.latitude ?? ""}
                    onChange={(e) =>
                      setEditingForm((f) => ({ ...f, latitude: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={editingForm.longitude ?? ""}
                    onChange={(e) =>
                      setEditingForm((f) => ({ ...f, longitude: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Place type</Label>
                <Input
                  value={editingForm.place_type ?? ""}
                  onChange={(e) =>
                    setEditingForm((f) => ({ ...f, place_type: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Review status</Label>
                <Select
                  value={editingForm.review_status ?? editing.review_status}
                  onValueChange={(v) =>
                    setEditingForm((f) => ({
                      ...f,
                      review_status: v as UnverifiedRow["review_status"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <SheetFooter className="flex-row justify-between gap-2">
            <Button
              variant="default"
              disabled={!editing || saving}
              onClick={() => editing && promote(editing.id)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Promote to verified
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={saving}>
                Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
