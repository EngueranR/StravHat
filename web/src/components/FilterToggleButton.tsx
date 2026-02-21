import { roundIconButtonClass } from './InfoHint';

interface FilterToggleButtonProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function FilterToggleButton({
  collapsed,
  onToggle,
}: FilterToggleButtonProps) {
  return (
    <button
      className={`${roundIconButtonClass} h-6 w-6 border-black/15 bg-black/[0.02] text-black/60 hover:bg-black/[0.05]`}
      type='button'
      onClick={onToggle}
      title={collapsed ? 'Afficher les filtres' : 'Masquer les filtres'}
      aria-label={collapsed ? 'Afficher les filtres' : 'Masquer les filtres'}
    >
      <svg
        width='10'
        height='10'
        viewBox='0 0 24 24'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
      >
        <path
          d='M4 6H20L14 13V19L10 21V13L4 6Z'
          stroke='currentColor'
          strokeWidth='1.8'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </button>
  );
}
