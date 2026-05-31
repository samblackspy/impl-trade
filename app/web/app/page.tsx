"use client";

import { Chart } from "@/components/Chart";
import { MarketStats } from "@/components/MarketStats";
import { Orderbook } from "@/components/Orderbook";
import { OrderTicket } from "@/components/OrderTicket";
import { Positions } from "@/components/Positions";
import { RecentTrades } from "@/components/RecentTrades";
import { TopBar } from "@/components/TopBar";
import { useState } from "react";

export default function TradePage() {
  const [market, setMarket] = useState(0);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col">
      <TopBar market={market} onMarket={setMarket} />
      <MarketStats market={market} />

      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[280px_1fr_340px]">
        <Orderbook market={market} />
        <div className="flex flex-col gap-3">
          <Chart market={market} />
          <RecentTrades market={market} />
        </div>
        <OrderTicket market={market} />
      </div>

      <div className="p-3 pt-0">
        <Positions />
      </div>
    </main>
  );
}
