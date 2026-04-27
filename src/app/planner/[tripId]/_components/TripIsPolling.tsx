export default function TripIsPolling() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <h2 className="text-xl font-semibold">Preparing your trip...</h2>
      <p className="text-muted-foreground text-sm">
        This usually takes less than a minute.
      </p>
    </div>
  )
}