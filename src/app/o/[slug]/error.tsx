"use client";

import { Button, Card } from "@/components/ui";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h2 className="font-semibold">That did not work</h2>
      <p className="mt-2 text-sm text-muted">
        {error.digest ? `Reference: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
