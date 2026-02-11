import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  rating: number
  maxStars?: number
  size?: "sm" | "md" | "lg"
  showValue?: boolean
  className?: string
}

const sizes = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
}

export function StarRating({
  rating,
  maxStars = 5,
  size = "md",
  showValue = false,
  className,
}: StarRatingProps) {
  const fullStars = Math.floor(rating)
  const partialFill = rating - fullStars
  const iconSize = sizes[size]

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxStars }).map((_, i) => {
          if (i < fullStars) {
            return (
              <Star
                key={i}
                className={cn(iconSize, "fill-primary text-primary")}
              />
            )
          }
          if (i === fullStars && partialFill > 0) {
            return (
              <div key={i} className="relative">
                <Star className={cn(iconSize, "text-muted-foreground/30")} />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${partialFill * 100}%` }}
                >
                  <Star
                    className={cn(iconSize, "fill-primary text-primary")}
                  />
                </div>
              </div>
            )
          }
          return (
            <Star
              key={i}
              className={cn(iconSize, "text-muted-foreground/30")}
            />
          )
        })}
      </div>
      {showValue && (
        <span
          className={cn(
            "font-semibold tabular-nums text-foreground",
            size === "lg" ? "text-2xl" : size === "md" ? "text-base" : "text-sm"
          )}
        >
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  )
}
