"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface DeleteTripProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  deleting: boolean
}

export default function DeleteTrip({ open, onOpenChange, onConfirm, deleting }: DeleteTripProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Delete Trip</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Are you sure you want to delete this trip? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Trip"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}