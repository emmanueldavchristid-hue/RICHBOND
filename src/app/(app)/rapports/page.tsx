import { ComingSoon } from "@/components/coming-soon";

export default function Page() {
  return <ComingSoon title="Rapports" anyOf={["report.purchasing", "report.stock", "report.all"]} />;
}
