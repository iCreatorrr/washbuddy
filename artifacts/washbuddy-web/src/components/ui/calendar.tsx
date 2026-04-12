"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

function Calendar({
  className,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-white p-3", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col",
        month: "flex flex-col gap-2",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50",
        button_next: "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        table: "w-full border-collapse",
        weekdays: "grid grid-cols-7",
        weekday: "text-slate-500 text-xs font-medium text-center py-1.5 w-9",
        week: "grid grid-cols-7",
        day: "relative h-9 w-9 text-center p-0",
        today: "bg-blue-50 rounded-md",
        outside: "text-slate-300",
        disabled: "text-slate-300 opacity-50",
        hidden: "invisible",
        selected: "bg-blue-600 text-white rounded-md",
        range_start: "bg-blue-600 text-white rounded-l-md",
        range_middle: "bg-blue-100",
        range_end: "bg-blue-600 text-white rounded-r-md",
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className="h-4 w-4" />
          }
          return <ChevronRightIcon className="h-4 w-4" />
        },
        DayButton: ({ day, modifiers, className, ...props }) => (
          <button
            className={cn(
              "inline-flex items-center justify-center h-9 w-9 rounded-md text-sm transition-colors hover:bg-slate-100",
              modifiers.selected && "bg-blue-600 text-white hover:bg-blue-700",
              modifiers.today && !modifiers.selected && "bg-blue-50 font-semibold",
              modifiers.outside && "text-slate-300",
              className
            )}
            {...props}
          />
        ),
      }}
      {...props}
    />
  )
}

export { Calendar }
