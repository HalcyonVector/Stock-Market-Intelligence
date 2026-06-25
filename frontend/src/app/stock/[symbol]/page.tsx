import { StockIntelligence } from "@/components/stock/StockIntelligence";

export default function StockPage({ params }: { params: { symbol: string } }) {
  return <StockIntelligence symbol={params.symbol.toUpperCase()} />;
}
