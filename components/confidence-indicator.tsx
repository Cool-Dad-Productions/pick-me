"use client"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ConfidenceIndicatorProps {
  confidence: number // 0-1 scale
  className?: string
}

// Confidence level thresholds and styling
const CONFIDENCE_LEVELS = {
  high: { min: 0.7, label: "High", colorClass: "text-success" },
  medium: { min: 0.3, label: "Medium", colorClass: "text-warning" },
  low: { min: 0, label: "Low", colorClass: "text-muted-foreground" },
} as const

function getConfidenceLevel(confidence: number) {
  if (confidence >= CONFIDENCE_LEVELS.high.min) {
    return CONFIDENCE_LEVELS.high
  }
  if (confidence >= CONFIDENCE_LEVELS.medium.min) {
    return CONFIDENCE_LEVELS.medium
  }
  return CONFIDENCE_LEVELS.low
}

export function ConfidenceIndicator({
  confidence,
  className,
}: ConfidenceIndicatorProps) {
  const level = getConfidenceLevel(confidence)
  const percent = Math.round(confidence * 100)

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Confidence</span>
        <span
          className={cn("text-sm font-semibold tabular-nums", level.colorClass)}
          aria-label={`Confidence: ${level.label}, ${percent} percent`}
        >
          {level.label} ({percent}%)
        </span>
      </div>
      <Progress
        value={percent}
        className={cn(
          "h-2.5",
          level === CONFIDENCE_LEVELS.high && "[&>div]:bg-success",
          level === CONFIDENCE_LEVELS.medium && "[&>div]:bg-warning",
          level === CONFIDENCE_LEVELS.low && "[&>div]:bg-muted-foreground"
        )}
        aria-label={`Confidence level: ${percent}%`}
      />
    </div>
  )
}
