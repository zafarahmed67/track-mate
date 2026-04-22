"use client"

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, X, Loader2, AlertTriangle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface TripAIChatCardProps {
  tripId: string
  userId: string | null
  tripNarrative: { overview: string; days: unknown[] } | null
  routeMeta: { corridor?: string }
  tripTitle?: string | null
  loadRouteOptions: () => void
}

export default function TripAIChatCard({
  tripId,
  userId,
  tripNarrative,
  routeMeta,
  tripTitle,
  loadRouteOptions,
}: TripAIChatCardProps) {
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const [chatMessages, setChatMessages] = useState<Array<{ id?: string; role: string; message_text: string; created_at?: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessagesLoaded, setChatMessagesLoaded] = useState(false)
  const [refilterBanner, setRefilterBanner] = useState<{ preferenceHint: string | null } | null>(null)

  useEffect(() => {
    if (!userId || chatMessagesLoaded) return
    fetch(`/api/trips/${tripId}/messages?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setChatMessages(d.messages)
          setChatMessagesLoaded(true)
        }
      })
      .catch(() => {})
  }, [tripId, userId, chatMessagesLoaded])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !userId || chatLoading) return
    const text = chatInput.trim()
    setChatInput("")
    setChatMessages((prev) => [...prev, { role: "user", message_text: text }])
    setChatLoading(true)
    try {
      const response = await fetch(`/api/trips/${tripId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message_text: text,
          tripContext: tripNarrative
            ? { overview: tripNarrative.overview, corridor: routeMeta.corridor, days: tripNarrative.days.length }
            : { title: tripTitle, corridor: routeMeta.corridor },
        }),
      })
      const result = await response.json()
      if (result.success && result.message) {
        setChatMessages((prev) => [...prev, result.message])
        if (result.action?.type === "refilter") {
          setRefilterBanner({ preferenceHint: result.action.preferenceHint ?? null })
          loadRouteOptions()
        }
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast.error("Failed to send message")
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Ask TrackMate
            {(chatMessages?.length ?? 0) > 0 && (
              <span className="text-xs font-normal text-muted-foreground">{chatMessages.length} messages</span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.isArray(chatMessages) && chatMessages.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
            {chatMessages.map((msg, i) => (
              <div
                key={msg.id ?? i}
                className={`rounded-2xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground ml-4"
                    : "bg-muted/10 border border-muted/20 mr-4"
                }`}
              >
                {msg.message_text}
              </div>
            ))}
            {chatLoading && (
              <div className="bg-muted/10 border border-muted/20 rounded-2xl px-3 py-2 mr-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
        {Array.isArray(chatMessages) && chatMessages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ask anything about your trip — stops, fuel, best time to drive, what to expect.
          </p>
        )}
        {refilterBanner && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800">Stop re-filter needed</p>
                  <p className="text-amber-700 mt-0.5">
                    Your request changes{refilterBanner.preferenceHint ? ` your ${refilterBanner.preferenceHint}` : " stop preferences"}. Use <strong>Edit Trip</strong> to update preferences, then <strong>Rebuild plan</strong> and <strong>Regenerate</strong> narrative.
                  </p>
                </div>
              </div>
              <button onClick={() => setRefilterBanner(null)} className="shrink-0 text-amber-600 hover:text-amber-800">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-amber-500/40 text-amber-800"
                onClick={() => { router.push(`/planner/${tripId}/edit`); setRefilterBanner(null) }}
              >
                Edit Trip
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-amber-700"
                onClick={() => setRefilterBanner(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
            placeholder="Ask about your route..."
            disabled={chatLoading}
            className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={chatLoading || !chatInput.trim()}
          >
            {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
