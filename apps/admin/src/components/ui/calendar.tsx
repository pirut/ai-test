"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between gap-1",
        month_caption: "relative flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-semibold text-foreground",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-8 rounded-lg border-border bg-background/80 p-0 hover:bg-accent dark:bg-input/40",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-8 rounded-lg border-border bg-background/80 p-0 hover:bg-accent dark:bg-input/40",
        ),
        chevron: "size-4",
        weekdays: "grid grid-cols-7 gap-1",
        weekday:
          "flex h-8 items-center justify-center text-[0.68rem] font-medium uppercase tracking-[0.16em] text-muted-foreground",
        weeks: "grid gap-1",
        week: "grid grid-cols-7 gap-1",
        day: "size-9",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-9 rounded-lg p-0 font-normal text-foreground aria-selected:opacity-100",
        ),
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside: "text-muted-foreground/50 opacity-60",
        disabled: "text-muted-foreground opacity-35",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
