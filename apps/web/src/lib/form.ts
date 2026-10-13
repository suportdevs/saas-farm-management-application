import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

/** Maps API validation errors onto form fields, falling back to a toast. */
export function handleFormError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>) {
  if (err instanceof ApiError && err.details) {
    for (const [field, messages] of Object.entries(err.details)) {
      setError(field as Path<T>, { message: messages[0] });
    }
    return;
  }
  setError('root' as Path<T>, { message: errorMessage(err) });
  if (!(err instanceof ApiError)) toast.error(errorMessage(err));
}
