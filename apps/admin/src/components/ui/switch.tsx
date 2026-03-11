"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch(props: SwitchPrimitive.Root.Props) {
  const { className, ...rest } = props;
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-muted/60 p-0.5 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[checked]:border-primary/60 data-[checked]:bg-primary/20",
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="size-4 rounded-full bg-foreground transition-transform data-[checked]:translate-x-5 data-[unchecked]:translate-x-0 data-[checked]:bg-primary"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
