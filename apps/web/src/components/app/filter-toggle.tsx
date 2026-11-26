'use client';

import { useState, type ReactNode } from 'react';
import { ListFilter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/provider';

/**
 * "Filters" button that shows or hides the filter fields next to it.
 * Starts collapsed. Hidden fields stay in the form, so applied filters are
 * kept when the user searches again. `active` = how many filters are applied.
 */
export function FilterToggle({ active = 0, children }: { active?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <Button type="button" size="sm" variant={open ? 'secondary' : 'outline'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ListFilter className="h-4 w-4" /> {t('Filters')}
        {active > 0 && <Badge variant="primary">{active}</Badge>}
      </Button>
      <div className={open ? 'contents' : 'hidden'}>{children}</div>
    </>
  );
}
