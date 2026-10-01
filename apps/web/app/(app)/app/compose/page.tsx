import { Suspense } from "react";
import ComposeForm from "./form";

export default function ComposePage() {
  return (
    <Suspense fallback={<p className="text-muted">Opening composer…</p>}>
      <ComposeForm />
    </Suspense>
  );
}
