"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Globe,
  Database,
  Shield,
  CreditCard,
  Mail,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number | null;
  detail?: string;
};

type StatusResponse = {
  status: "operational" | "degraded" | "down";
  services: ServiceStatus[];
  checkedAt: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const serviceIcons: Record<string, React.ElementType> = {
  "Web app": Globe,
  Database: Database,
  Authentication: Shield,
  Payments: CreditCard,
  Email: Mail,
};

const statusConfig = {
  operational: {
    icon: CheckCircle2,
    label: "Operational",
    color: "text-emerald-400",
    bg: "bg-emerald-400",
    badgeBg: "bg-emerald-400/10",
    badgeText: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  degraded: {
    icon: AlertTriangle,
    label: "Degraded",
    color: "text-amber-400",
    bg: "bg-amber-400",
    badgeBg: "bg-amber-400/10",
    badgeText: "text-amber-400",
    dot: "bg-amber-400",
  },
  down: {
    icon: XCircle,
    label: "Down",
    color: "text-red-400",
    bg: "bg-red-400",
    badgeBg: "bg-red-400/10",
    badgeText: "text-red-400",
    dot: "bg-red-400",
  },
};

const overallMessages = {
  operational: "All systems operational",
  degraded: "Some systems experiencing issues",
  down: "System outage detected",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StatusDashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch status");
      const json = (await response.json()) as StatusResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="space-y-3">
        {/* Skeleton overall */}
        <div className="h-16 animate-pulse rounded-xl border border-white/6 bg-white/[0.02]" />
        {/* Skeleton services */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl border border-white/6 bg-white/[0.02]"
          />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-center">
        <XCircle className="mx-auto size-6 text-red-400" />
        <p className="mt-2 text-[0.85rem] font-medium text-red-400">
          Unable to load status
        </p>
        <p className="mt-1 text-[0.75rem] text-[#8d93a6]">{error}</p>
        <button
          type="button"
          onClick={() => fetchStatus(true)}
          className="mt-3 rounded-lg bg-white/5 px-3 py-1.5 text-[0.75rem] font-medium text-white transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const overall = statusConfig[data.status];
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-3">
      {/* Overall status banner */}
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border px-5 py-4",
          data.status === "operational"
            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
            : data.status === "degraded"
              ? "border-amber-500/20 bg-amber-500/[0.04]"
              : "border-red-500/20 bg-red-500/[0.04]",
        )}
      >
        <div className="flex items-center gap-3">
          <OverallIcon className={cn("size-5", overall.color)} />
          <span className={cn("text-[0.95rem] font-semibold", overall.color)}>
            {overallMessages[data.status]}
          </span>
        </div>
        <button
          type="button"
          onClick={() => fetchStatus(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[0.7rem] font-medium text-[#8d93a6] transition-colors hover:text-white disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-3", refreshing && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* Individual services */}
      {data.services.map((service) => {
        const config = statusConfig[service.status];
        const Icon = serviceIcons[service.name] ?? Globe;

        return (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-xl border border-white/6 bg-[#0c0e11] px-5 py-3.5"
          >
            <div className="flex items-center gap-3">
              <Icon className="size-4 text-[#7f8aa6]" />
              <div>
                <div className="text-[0.85rem] font-medium text-white">
                  {service.name}
                </div>
                {service.detail && (
                  <div className="text-[0.7rem] text-[#6b7280]">
                    {service.detail}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {service.latencyMs !== null && (
                <span className="text-[0.7rem] font-mono text-[#6b7280]">
                  {service.latencyMs}ms
                </span>
              )}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                  config.badgeBg,
                )}
              >
                <div className={cn("size-1.5 rounded-full", config.dot)} />
                <span
                  className={cn(
                    "text-[0.65rem] font-semibold uppercase tracking-[0.08em]",
                    config.badgeText,
                  )}
                >
                  {config.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Last checked */}
      <div className="pt-2 text-center text-[0.7rem] text-[#6b7280]">
        Last checked{" "}
        {new Date(data.checkedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
        {" · "}Auto-refreshes every 30s
      </div>
    </div>
  );
}
