"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, Sun, UtensilsCrossed } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Dziś", icon: Sun },
  { href: "/prep", label: "Prep", icon: ChefHat },
  { href: "/meals", label: "Posiłki", icon: UtensilsCrossed },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Główna nawigacja"
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-18 w-full max-w-md items-stretch">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
