"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const value = React.useMemo(
    () => ({
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar: () => setOpenMobile((current) => !current),
    }),
    [isMobile, openMobile],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className={cn("flex min-h-screen w-full bg-background", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  children,
  className,
  ...props
}: React.ComponentProps<"aside">) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetContent
          className="w-[18rem] border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-none"
          data-slot="sidebar-mobile"
          side="left"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Primary application navigation.</SheetDescription>
          </SheetHeader>
          <div className={cn("flex h-full flex-col", className)}>{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "hidden h-screen w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col",
        className,
      )}
      data-slot="sidebar"
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      className={className}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 flex-col", className)} data-slot="sidebar-inset" {...props} />;
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-sidebar-border p-4", className)} data-slot="sidebar-header" {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4", className)}
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-t border-sidebar-border p-3", className)} data-slot="sidebar-footer" {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col gap-1", className)} data-slot="sidebar-menu" {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("list-none", className)} data-slot="sidebar-menu-item" {...props} />;
}

function SidebarMenuButton({
  className,
  isActive = false,
  render,
  ...props
}: React.ComponentProps<"button"> & {
  isActive?: boolean;
  render?: React.ReactElement<{ className?: string }>;
}) {
  const classes = cn(
    "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:shrink-0 [&_svg]:size-4",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/72 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground",
    className,
  );

  if (render) {
    return React.cloneElement(render, {
      className: cn(classes, render.props.className),
      ...((props as unknown as Record<string, unknown>) ?? {}),
    });
  }

  return <button className={classes} data-slot="sidebar-menu-button" type="button" {...props} />;
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
