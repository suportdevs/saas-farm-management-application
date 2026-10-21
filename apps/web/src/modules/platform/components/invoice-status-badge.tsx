import type { InvoiceStatus } from '@kit/shared';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

const STYLES: Record<InvoiceStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'info' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'success' },
  void: { label: 'Void', variant: 'outline' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, variant } = STYLES[status];
  return <Badge variant={variant}>{label}</Badge>;
}
