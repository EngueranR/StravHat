const controlBaseClass =
  "h-10 w-full rounded-xl border border-black/20 bg-transparent px-3 text-sm text-ink transition placeholder:text-muted focus:border-black/40 focus:outline-none focus:ring-2 focus:ring-black/10";

export const inputClass = controlBaseClass;

export const selectClass = `${controlBaseClass} cursor-pointer pr-10`;

export const textareaClass =
  "min-h-[104px] w-full rounded-xl border border-black/20 bg-transparent px-3 py-2 text-sm text-ink transition placeholder:text-muted focus:border-black/40 focus:outline-none focus:ring-2 focus:ring-black/10";

export const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl border border-black/20 px-3 text-sm transition hover:bg-black/5 disabled:opacity-40";

export const secondaryButtonCompactClass =
  "inline-flex h-8 items-center justify-center rounded-xl border border-black/20 px-3 text-xs transition hover:bg-black/5 disabled:opacity-40";

export const checkboxPillClass =
  "flex items-start gap-2 rounded-xl border border-black/20 px-3 py-2.5 text-xs";

export const subtlePanelClass = "rounded-xl border border-black/10 bg-black/5 p-3.5";

export const dangerButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl border border-red-600 px-4 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-40";
