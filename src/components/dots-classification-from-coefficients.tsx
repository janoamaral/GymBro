"use client";
import { useEffect, useState } from "react";
import { DotsClassificationWidget } from "@/components/dots-classification-widget";
import { calculateMeetCoefficients, type MeetSex } from "@/lib/training/meet-coefficients";
import type { WeightUnit } from "@/lib/units/conversion";

// Obtiene el DOTS del endpoint de contexto de coeficientes
export function DotsClassificationFromCoefficients() {
  const [dots, setDots] = useState<number | null>(null);

  useEffect(() => {
    const fetchDots = async () => {
      try {
        const response = await fetch("/api/meet/coefficients-context");
        const data = await response.json();
        if (!response.ok) return;
        if (data && typeof data === "object") {
          if (typeof data.dots === "number") {
            setDots(data.dots);
          } else if (
            data.squat && data.bench && data.deadlift && data.bodyweight && data.sex && data.unit
          ) {
            try {
              const result = calculateMeetCoefficients({
                squat: Number(data.squat),
                bench: Number(data.bench),
                deadlift: Number(data.deadlift),
                bodyweight: Number(data.bodyweight),
                sex: data.sex === "female" ? "female" : "male",
                unit: data.unit === "lb" ? "lb" : "kg",
              });
              setDots(result.dots);
            } catch {
              setDots(null);
            }
          } else {
            setDots(null);
          }
        }
      } catch {
        setDots(null);
      }
    };
    fetchDots();
  }, []);

  if (dots == null) return null;
  return <DotsClassificationWidget dots={dots} />;
}