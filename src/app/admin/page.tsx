"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getStoredUser } from "@/lib/auth"
import {
  Database,
  Users,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ShieldCheck,
  ArrowRight,
  ClipboardList,
  RefreshCw,
} from "lucide-react"

interface Stats {
  totalStops: number
  totalUsers: number
  stopsByStatus: Record<string, number>
  recentAuditLog: Array<{
    id: string
    action: string
    entity_type: string
    entity_id: string | null
    created_at: string
  }>
}

export default function AdminDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

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
    fetchStats()
  }, [router])

  async function fetchStats() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/stats")
      const data = await res.json()
      if (data.success) setStats(data)
    } finally {
      setLoading(false)
    }
  }

  const verified = stats?.stopsByStatus?.verified ?? 0
  const unverified = stats?.stopsByStatus?.unverified ?? 0
  const custom = stats?.stopsByStatus?.custom ?? 0
  const total = stats?.totalStops ?? 0
  const verifiedPct = total > 0 ? Math.round((verified / total) * 100) : 0

  const statCards = [
    {
      label: "Total Stops",
      value: total.toLocaleString(),
      icon: Database,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Verified",
      value: verified.toLocaleString(),
      sub: `${verifiedPct}% of total`,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Unverified",
      value: unverified.toLocaleString(),
      icon: AlertCircle,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "Users",
      value: (stats?.totalUsers ?? 0).toLocaleString(),
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ]

  function formatAction(action: string) {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span>Admin</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse mb-3" />
                  <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mb-1" />
                  <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <Card key={card.label}>
                <CardContent className="p-6">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.bg} mb-3`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{card.label}</div>
                  {card.sub && (
                    <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick actions */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/stops">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-500" />
                    Manage Stops
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Stop breakdown */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Stops by Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Verified", count: verified, color: "bg-green-500" },
                { label: "Unverified", count: unverified, color: "bg-yellow-500" },
                { label: "Custom", count: custom, color: "bg-blue-500" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="text-sm text-gray-600 flex-1">{label}</span>
                  <span className="text-sm font-medium">{count.toLocaleString()}</span>
                  {total > 0 && (
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {Math.round((count / total) * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Audit log */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!stats?.recentAuditLog.length ? (
                <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.recentAuditLog.map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className="text-xs capitalize mr-1">
                          {entry.entity_type}
                        </Badge>
                        <span className="text-gray-600">{formatAction(entry.action)}</span>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                        {timeAgo(entry.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
