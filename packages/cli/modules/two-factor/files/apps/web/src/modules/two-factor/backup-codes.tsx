'use client';

import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success('Backup codes copied');
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'backup-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <Alert variant="info">
        Save these backup codes somewhere safe. Each code can be used once to sign in if you lose access to your
        authenticator app. <strong>They won&apos;t be shown again.</strong>
      </Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="h-4 w-4" /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4" /> Download
        </Button>
        <Button size="sm" className="ml-auto" onClick={onDone}>
          I&apos;ve saved them
        </Button>
      </div>
    </div>
  );
}
