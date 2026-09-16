export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}
