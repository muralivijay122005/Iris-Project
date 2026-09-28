"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Splash from "../components/Splash";

// Client-only: the app reads localStorage and media queries on first render
const ChatApp = dynamic(() => import("../components/ChatApp"), {
  ssr: false,
  loading: () => <Splash />,
});

export default function Home() {
  return (
    <Suspense fallback={<Splash />}>
      <ChatApp />
    </Suspense>
  );
}
