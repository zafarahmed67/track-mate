import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation';
import React from 'react'

export default function TripNotFound() {
    const router = useRouter();
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="w-full max-w-md text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                        <MapPin className="h-8 w-8 text-destructive/60" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Trip Not Found</h2>
                    <p className="text-muted-foreground mb-6">
                        The requested trip could not be found or may have been deleted.
                    </p>
                    <Button onClick={() => router.push("/planner/new")} className="group">
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Trip
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
