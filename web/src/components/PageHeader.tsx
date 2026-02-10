interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:mb-6">
      <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  );
}
