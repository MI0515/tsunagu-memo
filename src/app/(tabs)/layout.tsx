"use client";

import type { ReactNode } from "react";
import { Page } from "@/components/ui";
import { RoomHeader, RoomProvider } from "@/components/rooms";
import { TabBar } from "@/components/TabBar";

// 今日・メモ・ふりかえり・設定の4つのタブで共通の枠
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <RoomProvider>
      <Page withTabs>
        <RoomHeader />
        {children}
      </Page>
      <TabBar />
    </RoomProvider>
  );
}
