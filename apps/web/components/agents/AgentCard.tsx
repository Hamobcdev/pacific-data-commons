import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentCatalogueEntry } from "@/lib/agents/types";

export function AgentCard({ agent }: { agent: AgentCatalogueEntry }) {
  const t = useTranslations("AgentMarketplace");

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            {agent.icon}
          </span>
          <CardTitle>{agent.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <p>{agent.description}</p>
        {agent.note && <p className="mt-2 text-xs italic text-ocean">{agent.note}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.categories.map((category) => (
            <Badge key={category} variant="neutral">
              {category}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-sm font-medium text-navy">
            {agent.priceRange} <span className="font-normal text-gray-500">{t("price_range")}</span>
          </span>
          <Link href={`/agents/${agent.id}`}>
            <Button variant="primary">{t("run_agent")} →</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
