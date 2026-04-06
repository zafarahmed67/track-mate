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
  FlaskConical,
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

interface TestWebhookResult {
  success: boolean
  testOrderId?: string
  webhookStatus?: number
  webhookResult?: { success: boolean; userId?: string; magicLink?: string; duplicate?: boolean; error?: string }
  error?: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [testEmail, setTestEmail] = useState("")
  const [testFirstName, setTestFirstName] = useState("")
  const [testLastName, setTestLastName] = useState("")
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<TestWebhookResult | null>(null)

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

  async function runTestPurchase() {
    if (!testEmail.trim()) return
    setTestRunning(true)
    setTestResult(null)
    try {
      const user = getStoredUser() as { id: string } | null
      const res = await fetch("/api/admin/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUserId: user?.id,
          email: testEmail.trim(),
          firstName: testFirstName.trim() || undefined,
          lastName: testLastName.trim() || undefined,
        }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ success: false, error: String(err) })
    } finally {
      setTestRunning(false)
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
        {/* Test Purchase Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-purple-600" />
              Test Purchase Flow
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Simulate a Fab Funnels purchase webhook without a real payment. Creates a user + sends a magic-link access email.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">First name</label>
                <input
                  type="text"
                  value={testFirstName}
                  onChange={(e) => setTestFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Last name</label>
                <input
                  type="text"
                  value={testLastName}
                  onChange={(e) => setTestLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <Button
              onClick={runTestPurchase}
              disabled={testRunning || !testEmail.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {testRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Run Test Purchase
                </>
              )}
            </Button>

            {testResult && (
              <div className={`rounded-xl border p-4 text-sm space-y-2 ${testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-2 font-medium">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={testResult.success ? "text-green-800" : "text-red-800"}>
                    {testResult.success ? "Test purchase succeeded" : "Test purchase failed"}
                  </span>
                  {testResult.webhookResult?.duplicate && (
                    <Badge variant="outline" className="text-xs">duplicate — already processed</Badge>
                  )}
                </div>
                {testResult.testOrderId && (
                  <p className="text-gray-600">Order ID: <code className="bg-gray-100 px-1 rounded text-xs">{testResult.testOrderId}</code></p>
                )}
                {testResult.webhookResult?.userId && (
                  <p className="text-gray-600">User ID: <code className="bg-gray-100 px-1 rounded text-xs">{testResult.webhookResult.userId}</code></p>
                )}
                {testResult.webhookResult?.magicLink && (
                  <div>
                    <p className="text-gray-600 mb-1">Magic link generated:</p>
                    <a
                      href={testResult.webhookResult.magicLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-700 underline break-all"
                    >
                      {testResult.webhookResult.magicLink}
                    </a>
                  </div>
                )}
                {(testResult.error || testResult.webhookResult?.error) && (
                  <p className="text-red-700">{testResult.error || testResult.webhookResult?.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}
