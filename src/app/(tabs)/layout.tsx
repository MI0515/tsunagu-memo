"use client";

import type { ReactNode } from "react";
import { Page } from "@/components/ui";
import { DemoBanner } from "@/components/DemoBanner";
import { FirstRunGuide } from "@/components/FirstRunGuide";
import { RoomHeader, RoomProvider } from "@/components/rooms";
import { TabBar } from "@/components/TabBar";

// 今日・メモ・ふりかえり・設定の4つのタブで共通の枠
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <RoomProvider>
      <Page withTabs>
        <DemoBanner />
        <RoomHeader />
        {children}
      </Page>
      <TabBar />
      {/* 招待リンクから参加した人には、参加した直後に1回だけ出す */}
      <FirstRunGuide />
    </RoomProvider>
  );
}
