"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  enabled: boolean;
}

export function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        if (!item.enabled) {
          return (
            <li key={item.label}>
              <span
                aria-disabled="true"
                title="В разработке"
                className="block cursor-not-allowed rounded-lg px-3 py-1.5 text-sm text-sidebar-fg/35"
              >
                <span className="block truncate">{item.label}</span>
                <span className="block text-[10px] uppercase tracking-wide">В разработке</span>
              </span>
            </li>
          );
        }
        return (
          <li key={item.label}>
            <Link
              href={item.href}
              className={cx(
                "block rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-white/10 font-medium text-white" : "text-sidebar-fg hover:bg-white/5 hover:text-white",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
