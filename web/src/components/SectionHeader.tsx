import type { ReactNode } from "react";
import { AIInsightButton, type AiSectionAnalysisPayload } from "./AIInsightButton";
import { InfoHint, roundIconButtonClass } from "./InfoHint";

interface SectionHeaderInfoHint {
  title: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  infoHint?: SectionHeaderInfoHint;
  aiInsight?: {
    token: string | null;
    payload: AiSectionAnalysisPayload;
  };
  rightActions?: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  infoHint,
  aiInsight,
  rightActions,
  collapsed,
  onToggleCollapse,
  className,
}: SectionHeaderProps) {
  const rootClassName = className ?
      `mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`
    : 'mb-4 flex flex-wrap items-start justify-between gap-3';

  return (
    <div className={rootClassName}>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-semibold leading-tight'>{title}</p>
        {subtitle ? <p className='mt-1 text-xs text-muted'>{subtitle}</p> : null}
      </div>
      <div className='flex flex-none flex-wrap items-center justify-end gap-2'>
        {rightActions}
        {infoHint ? (
          <InfoHint
            title={infoHint.title}
            description={infoHint.description}
            linkHref={infoHint.linkHref}
            linkLabel={infoHint.linkLabel}
          />
        ) : null}
        {aiInsight ? <AIInsightButton token={aiInsight.token} payload={aiInsight.payload} /> : null}
        {onToggleCollapse ? (
          <button
            className={roundIconButtonClass}
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Deplier la section" : "Replier la section"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
