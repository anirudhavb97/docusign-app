import { Suspense } from "react";

// Send-envelope is a full-screen overlay — no TopNav, no sidebar
export default function SendEnvelopeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
