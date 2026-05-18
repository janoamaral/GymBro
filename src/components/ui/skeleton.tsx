"use client";
import React from "react";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={
        `animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded-md ` +
        (className || "h-4 w-full")
      }
    />
  );
}
