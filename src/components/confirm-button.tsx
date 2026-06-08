"use client";

import { buttonClass } from "@/components/ui";

// Submit button that asks for confirmation first. Use inside a <form action=…>.
export function ConfirmButton({
  label = "Delete",
  confirmText = "Are you sure?",
  variant = "danger",
}: {
  label?: string;
  confirmText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      type="submit"
      className={buttonClass(variant)}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
