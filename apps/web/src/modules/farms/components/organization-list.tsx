'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ROLE_INFO, type OrganizationSummary } from '@kit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

/** The user's organizations, and a button to start a new one. */
export function OrganizationList({ organizations }: { organizations: OrganizationSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ organization: { id: string } }>('/organizations', { name });
      toast.success('Organization created');
      router.push(`/organizations/${res.organization.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New organization
        </Button>
      </div>

      {organizations.length === 0 ? (
        <EmptyState icon={Building2} title="No organizations yet" description="Your first farm creates one, or start one here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {organizations.map((o) => (
            <Link key={o.id} href={`/organizations/${o.id}`}>
              <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.farmCount} {o.farmCount === 1 ? 'farm' : 'farms'} · {o.memberCount} {o.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </span>
                <Badge variant={o.role === 'member' ? 'outline' : 'primary'}>{ORG_ROLE_INFO[o.role].label}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New organization"
        description="An organization groups farms that belong to the same business. You'll be its owner."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={name.trim().length < 2} onClick={create}>
              Create
            </Button>
          </>
        }
      >
        <Field id="org-name" label="Name">
          <Input id="org-name" autoFocus maxLength={100} placeholder="e.g. Green Valley Group" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}
