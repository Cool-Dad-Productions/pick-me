"use client"

import { useState, useCallback, useRef, KeyboardEvent } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface RatingInputProps {
  value: number | null
  onChange: (rating: number) => void
  disabled?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizes = {
  sm: { icon: "h-5 w-5", touch: "h-8 w-8" },
  md: { icon: "h-6 w-6", touch: "h-10 w-10" },
  lg: { icon: "h-8 w-8", touch: "h-12 w-12" },
}

export function RatingInput({
  value,
  onChange,
  disabled = false,
  size = "md",
  className,
}: RatingInputProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayValue = hoverValue ?? value ?? 0
  const { icon: iconSize, touch: touchSize } = sizes[size]

  const handleStarClick = useCallback(
    (starIndex: number, isLeftHalf: boolean) => {
      if (disabled) return
      // starIndex is 0-based, so star 0 left half = 0.5, right half = 1.0
      const rating = isLeftHalf ? starIndex + 0.5 : starIndex + 1
      onChange(rating)
    },
    [disabled, onChange]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, starIndex: number) => {
      if (disabled) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const isLeftHalf = x < rect.width / 2
      const rating = isLeftHalf ? starIndex + 0.5 : starIndex + 1
      setHoverValue(rating)
    },
    [disabled]
  )

  const handleMouseLeave = useCallback(() => {
    setHoverValue(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return

      const currentValue = value ?? 0
      let newValue: number | null = null

      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          e.preventDefault()
          newValue = Math.min(5, currentValue + 0.5)
          break
        case "ArrowLeft":
        case "ArrowDown":
          e.preventDefault()
          newValue = Math.max(0.5, currentValue - 0.5)
          break
        case "Home":
          e.preventDefault()
          newValue = 1
          break
        case "End":
          e.preventDefault()
          newValue = 5
          break
      }

      if (newValue !== null && newValue !== currentValue) {
        onChange(newValue)
      }
    },
    [disabled, value, onChange]
  )

  const getStarFill = (starIndex: number): "full" | "half" | "empty" => {
    const starNumber = starIndex + 1
    if (displayValue >= starNumber) return "full"
    if (displayValue >= starNumber - 0.5) return "half"
    return "empty"
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Rating"
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value ? `${value} out of 5 stars` : "No rating"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = getStarFill(i)

        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const isLeftHalf = x < rect.width / 2
              handleStarClick(i, isLeftHalf)
            }}
            onMouseMove={(e) => handleMouseMove(e, i)}
            className={cn(
              "relative flex items-center justify-center transition-transform",
              touchSize,
              !disabled && "hover:scale-110 cursor-pointer",
              disabled && "cursor-not-allowed"
            )}
            aria-hidden="true"
            tabIndex={-1}
          >
            {fill === "full" && (
              <Star
                className={cn(
                  iconSize,
                  "fill-primary text-primary transition-colors"
                )}
              />
            )}
            {fill === "half" && (
              <div className="relative">
                <Star className={cn(iconSize, "text-muted-foreground/30")} />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: "50%" }}
                >
                  <Star
                    className={cn(
                      iconSize,
                      "fill-primary text-primary transition-colors"
                    )}
                  />
                </div>
              </div>
            )}
            {fill === "empty" && (
              <Star
                className={cn(
                  iconSize,
                  "text-muted-foreground/30 transition-colors",
                  !disabled && "hover:text-muted-foreground/50"
                )}
              />
            )}
          </button>
        )
      })}
      <span className="sr-only">
        {value ? `Current rating: ${value} out of 5 stars` : "No rating selected"}
      </span>
    </div>
  )
}
