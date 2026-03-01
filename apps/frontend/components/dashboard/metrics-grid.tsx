import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { metricCards } from "@/components/dashboard/data";

export function MetricsGrid() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metricCards.map((card) => (
        <Card key={card.title}>
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl">{card.value}</CardTitle>
            <CardAction>
              <card.icon className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{card.delta}</span>
            <span className="ml-1">{card.hint}</span>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}
