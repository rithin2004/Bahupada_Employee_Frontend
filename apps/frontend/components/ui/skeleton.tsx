import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton-shimmer relative min-h-5 overflow-hidden rounded-md bg-slate-300",
        "before:absolute before:inset-0 before:-translate-x-full before:bg-[linear-gradient(105deg,transparent,rgba(255,255,255,0.92),transparent)] before:content-['']",
        "dark:min-h-5 dark:bg-muted/28 dark:before:bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.08),transparent)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
