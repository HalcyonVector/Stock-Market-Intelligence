"use client";
import { MarketOverview } from "./MarketOverview";
import { MarketBriefing } from "./MarketBriefing";
import { FearGreedGauge } from "./FearGreedGauge";
import { MoversList } from "./MoversList";
import { OpportunityRadar } from "./OpportunityRadar";
import { SectorHeatmap } from "./SectorHeatmap";
import { SentimentTrends } from "./SentimentTrends";
import { LiveFeed } from "./LiveFeed";
import { NewsCarousel } from "./NewsCarousel";
import { VolumeLeaders } from "./VolumeLeaders";
import { EarningsCalendar } from "./EarningsCalendar";
import { EconomicCalendar } from "./EconomicCalendar";

export function Dashboard() {
  return (
    <div className="space-y-4">
      {/* Market overview stats bar */}
      <MarketOverview />

      {/* Main bento grid */}
      <div className="bento">
        {/* Row 1: Briefing + Fear/Greed + Volume */}
        <MarketBriefing />
        <FearGreedGauge />
        <VolumeLeaders />

        {/* Row 2: Movers + Opportunity + News */}
        <MoversList />
        <OpportunityRadar />
        <NewsCarousel />

        {/* Row 3: Sectors + Sentiment + Live Feed */}
        <SectorHeatmap />
        <SentimentTrends />
        <LiveFeed />

        {/* Row 4: Earnings + Economic Calendar + Volume */}
        <EarningsCalendar />
        <EconomicCalendar />
      </div>
    </div>
  );
}
