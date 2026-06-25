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
import { TopAnalystsPicks } from "./TopAnalystsPicks";
import { EconomicCalendar } from "./EconomicCalendar";
import { InsiderActivity } from "./InsiderActivity";

export function Dashboard() {
  return (
    <div className="space-y-4">
      <MarketOverview />
      <div className="bento">
        <MarketBriefing />
        <FearGreedGauge />
        <VolumeLeaders />

        <MoversList />
        <OpportunityRadar />
        <NewsCarousel />

        <SectorHeatmap />
        <SentimentTrends />
        <LiveFeed />

        <TopAnalystsPicks />
        <EconomicCalendar />
        <InsiderActivity />
      </div>
    </div>
  );
}
