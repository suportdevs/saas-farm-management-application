import Link from 'next/link';
import type { Pagination as PaginationInfo } from '@kit/shared';
import { buttonClasses } from '@/components/ui/button';

/** Previous/next links that keep the current query string. */
export function Pagination({
  pagination,
  basePath,
  params,
}: {
  pagination: PaginationInfo;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  if (pages <= 1) return null;
  const link = (page: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set('page', String(page));
    return `${basePath}?${qs}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {pagination.page} of {pages}
      </span>
      <div className="flex gap-2">
        {pagination.page > 1 && (
          <Link href={link(pagination.page - 1)} className={buttonClasses('outline', 'sm')}>
            Previous
          </Link>
        )}
        {pagination.page < pages && (
          <Link href={link(pagination.page + 1)} className={buttonClasses('outline', 'sm')}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
