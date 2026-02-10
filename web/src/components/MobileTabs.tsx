interface MobileTabItem<T extends string> {
  key: T;
  label: string;
}

interface MobileTabsProps<T extends string> {
  tabs: Array<MobileTabItem<T>>;
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export function MobileTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
  className = '',
}: MobileTabsProps<T>) {
  return (
    <div
      className={`mb-4 flex gap-1 overflow-x-auto rounded-xl border border-black/15 bg-black/[0.03] p-1 lg:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            className={`inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-3 text-xs font-medium transition ${
              active ? 'bg-ink text-white' : 'text-ink hover:bg-black/5'
            }`}
            onClick={() => onChange(tab.key)}
            type='button'
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

