import Image from "next/image";

import { mealImageSrc } from "@/lib/meals/images";
import { cn } from "@/lib/utils";

/**
 * The picture for a meal, chosen from its name (see `lib/meals/images.ts`).
 * Decorative: the meal's name is always printed next to it, so alt is empty.
 * The size and shape come from `className`; the picture fills and crops to it.
 */
export function MealImage({
  name,
  category,
  className,
  priority,
}: {
  name: string;
  category?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      {/* SVG drawings need no resizing, so they skip the image optimizer. */}
      <Image src={mealImageSrc(name, category)} alt="" fill unoptimized priority={priority} className="object-cover" />
    </div>
  );
}
