"use client";

import { useRef, type ComponentProps } from "react";
import { Select, Input } from "@/components/ui";

// Auto-applying filter controls: drop these inside a plain <form method="get">
// (with any hidden fields to preserve, e.g. tab/month) and they submit the form
// on change — no "Filter" button needed. The server reads the URL params.

export function FilterSelect(props: ComponentProps<"select">) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function FilterSearch(props: ComponentProps<"input">) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <Input
      {...props}
      onChange={(e) => {
        const form = e.currentTarget.form;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => form?.requestSubmit(), 400);
      }}
    />
  );
}
