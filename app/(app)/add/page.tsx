"use client";

import { Suspense } from "react";
import { AddScreen } from "@/components/add-screen";

export default function AddPage() {
  return (
    <Suspense>
      <AddScreen />
    </Suspense>
  );
}
