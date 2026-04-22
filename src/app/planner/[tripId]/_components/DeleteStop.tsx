"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface DeleteStopProps {
  stop: { id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function DeleteStop({ stop, open, onOpenChange, onConfirm }: DeleteStopProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Stop</AlertDialogTitle>
        </AlertDialogHeader>
        <p className="text-muted-foreground">
          Are you sure you want to delete <strong>{stop?.name}</strong>? This action cannot be undone.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}