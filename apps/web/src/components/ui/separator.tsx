export function Separator({ label }: { label?: string }) {
  if (!label) return <div className="h-px w-full bg-border" />;
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      {label}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
