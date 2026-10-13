import type { ReactNode } from 'react';

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* Inside layouts that already provide a surface (.auth-flat) the box drops its own chrome. */}
      <div className="rounded-xl border bg-card p-6 shadow-sm [.auth-flat_&]:border-0 [.auth-flat_&]:bg-transparent [.auth-flat_&]:p-0 [.auth-flat_&]:shadow-none">
        {children}
      </div>
      {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
    </div>
  );
}
