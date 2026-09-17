"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, Sun, UtensilsCrossed } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Dziś", icon: Sun },
  { href: "/prep", label: "Prep", icon: ChefHat },
  { href: "/meals", label: "Posiłki", icon: UtensilsCrossed },
] as const;

/**
 * Every tab is server-rendered on demand, so a tap can take a beat before
 * anything changes. Always rendered at a fixed size and only faded in, so it
 * never shifts the layout.
 */
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "h-1 w-7 rounded-full bg-primary transition-opacity duration-150",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
    />
  );
}

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
                <PendingBar />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
