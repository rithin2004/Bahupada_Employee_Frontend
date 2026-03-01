import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LiveBadgeProps = {
  live: boolean;
};

function LiveBadge({ live }: LiveBadgeProps) {
  return <Badge variant={live ? "default" : "secondary"}>{live ? "Live API" : "Fallback Mode"}</Badge>;
}

type MetricCardProps = {
  label: string;
  value: string | number;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export { LiveBadge, MetricCard };
