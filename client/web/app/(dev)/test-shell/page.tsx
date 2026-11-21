"use client";

import dynamic from "next/dynamic";

const TestShellContent = dynamic(() => import("./TestShellContent"), {
  ssr: false,
});

export default function TestShellPage() {
  return <TestShellContent />;
}
