"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "@/components/social/composer";
import { signupHref } from "@/lib/auth-paths";

export function LandingComposer() {
  const [value, setValue] = useState("");
  const router = useRouter();
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={() => {
        sessionStorage.setItem("superview-draft", value);
        router.push(signupHref("/app/compose"));
      }}
    />
  );
}
