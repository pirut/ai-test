"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked));

  React.useEffect(() => {
    if (isControlled) {
      setInternalChecked(Boolean(checked));
    }
  }, [checked, isControlled]);

  const resolvedChecked = isControlled ? Boolean(checked) : internalChecked;

  return (
    <SwitchPrimitive.Root
      ref={ref}
      checked={resolvedChecked}
      data-slot="switch"
      onCheckedChange={(nextChecked) => {
        if (!isControlled) {
          setInternalChecked(nextChecked);
        }
        onCheckedChange?.(nextChecked);
      }}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/8 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        resolvedChecked ? "bg-primary" : "bg-[var(--surface-highest)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-0 transition-transform duration-200 ease-out",
          resolvedChecked ? "translate-x-5" : "translate-x-0",
        )}
        style={{ transform: `translateX(${resolvedChecked ? 20 : 0}px)` }}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
