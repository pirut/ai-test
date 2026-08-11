"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonitorUp, Plus } from "lucide-react";

import { ClaimDeviceForm } from "@/components/claim-device-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AddScreenDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>
        <Plus className="size-4" />
        Add screen
      </SheetTrigger>
      <SheetContent className="dashboard-theme w-full border-l border-border bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border bg-card px-6 py-6">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MonitorUp className="size-5" />
          </div>
          <SheetTitle className="font-heading text-2xl font-bold tracking-[-0.03em]">Add a screen</SheetTitle>
          <SheetDescription className="mt-2 leading-6">
            Enter the six-digit claim code shown by the Pi. The screen will join this fleet and begin receiving content.
          </SheetDescription>
        </SheetHeader>
        <div className="p-6">
          <ClaimDeviceForm
            embedded
            onClaimed={() => {
              router.refresh();
              setOpen(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
