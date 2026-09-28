"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  DashboardProvider,
  useDashboard,
} from "@/components/dashboard/DashboardProvider";
import { CategoryShareChart } from "@/components/dashboard/CategoryShareChart";
import { DetailPanel } from "@/components/dashboard/DetailPanel";
import { FreshnessIndicator } from "@/components/dashboard/FreshnessIndicator";
import { FreshnessWarning } from "@/components/dashboard/FreshnessWarning";
import { FixtureModeHint } from "@/components/dashboard/FixtureModeHint";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { NetworkTreemap } from "@/components/dashboard/NetworkTreemap";
import { ProtocolBarChart } from "@/components/dashboard/ProtocolBarChart";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { HourOfWeekHeatmap } from "@/components/dashboard/HourOfWeekHeatmap";
import { AssetVolumePanel } from "@/components/dashboard/AssetVolumePanel";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { DashboardSearch } from "@/components/dashboard/DashboardSearch";
import { ComparisonPanel } from "@/components/dashboard/ComparisonPanel";

function DashboardContent() {
  const { selectedNode } = useDashboard();

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-6 overflow-x-hidden px-3 py-6 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Image
              src="/logo.png"
              alt="LumenMap"
              width={44}
              height={44}
              className="shrink-0"
              priority
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                LumenMap
              </h1>
              <p className="text-sm text-zinc-400">
                Stellar network activity across mainnet.
              </p>
            </div>
            <Badge>Mainnet</Badge>
          </div>
          <FreshnessIndicator />
          <p className="text-xs text-zinc-500">
            <a
              href="/methodology"
              className="text-stellar-light hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar rounded-sm"
            >
              Metric methodology
            </a>
            {" · "}definitions on each KPI
          </p>
        </div>
        <div className="min-w-0 shrink-0">
          <PeriodSelector />
        </div>
      </header>

      <FreshnessWarning />

      <FixtureModeHint />

      <DashboardSearch />

      <KpiCards />

      <ComparisonPanel />

      <AssetVolumePanel />

      <CategoryShareChart />

      <div
        className={`grid min-w-0 grid-cols-1 gap-6 transition-all duration-300 ${
          selectedNode
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
            : "xl:grid-cols-1"
        }`}
      >
        <div className="min-w-0">
          <NetworkTreemap />
        </div>
        {selectedNode && (
          <div className="min-w-0 scroll-mt-4" id="detail-panel-container">
            <DetailPanel />
          </div>
        )}
      </div>

      <ProtocolBarChart />
      <ActivityHeatmap />
      <TimeSeriesChart />
      <HourOfWeekHeatmap />
    </div>
  );
}

export function DashboardPage() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}
