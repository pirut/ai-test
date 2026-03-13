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
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        resolvedChecked ? "bg-primary" : "bg-input/70 dark:bg-input/40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-out",
          resolvedChecked ? "translate-x-5" : "translate-x-0",
        )}
        style={{ transform: `translateX(${resolvedChecked ? 20 : 0}px)` }}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
