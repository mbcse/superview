"use client";

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8">
      <h2 className="text-[20px] font-semibold">Something went wrong</h2>
      <p className="mt-2 text-muted">{error.message}</p>
      <button className="mt-4 min-h-11 font-medium" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
