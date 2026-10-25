'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

/** Creates an account for a client; they get an email to set their password. */
export function NewClientAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ user: { id: string } }>('/admin/users', { name, email });
      toast.success(`Account created — ${email} will get a link to set a password`);
      setOpen(false);
      router.push(`/admin/users/${res.user.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> New client account
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New client account"
        description="For clients you onboard yourself. They get an email to choose a password (the link lasts 7 days). Then create a tenant with this email as owner."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={!name.trim() || !email.includes('@')} onClick={save}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="client-name" label="Name">
            <Input id="client-name" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="client-email" label="Email">
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
