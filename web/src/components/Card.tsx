import type { PropsWithChildren } from "react";

export function Card({ children }: PropsWithChildren) {
  return (
    <div className="min-w-0 rounded-2xl border border-black/10 bg-panel p-4 shadow-panel sm:p-5">
      {children}
    </div>
  );
}
