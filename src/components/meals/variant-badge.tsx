import { cn } from "@/lib/utils";
import { variantLabel, type Variant } from "@/lib/meals/types";

const styles: Record<string, string> = {
  DT: "bg-primary/15 text-primary",
  DNT: "bg-accent/15 text-accent",
  base: "bg-muted text-muted-foreground",
};

export function VariantBadge({ variant, className }: { variant: Variant; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", styles[variant ?? "base"], className)}>
      {variantLabel(variant)}
    </span>
  );
}
