import Link from 'next/link';
import type { ReactNode } from 'react';
import { citationLabel, safeCitationHref } from '../lib/citations';

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-2">
      {eyebrow ? <p className="text-xs font-medium uppercase text-neutral-500">{eyebrow}</p> : null}
      <h1 className="text-2xl font-semibold text-neutral-950 dark:text-neutral-50">{title}</h1>
      {children ? (
        <div className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">{children}</div>
      ) : null}
    </header>
  );
}

export function Panel({
  title,
  children,
  aside,
}: {
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      {title || aside ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {aside ? <div className="text-xs text-neutral-500">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
      <p className="font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-medium">{title}</p>
      <p className="mt-1 break-words">{message}</p>
    </div>
  );
}

export function EvidenceLink({
  sourceDocumentId,
  url,
  publishedAt,
  showSourceRecord = true,
}: {
  sourceDocumentId: string;
  url?: string;
  publishedAt?: string;
  showSourceRecord?: boolean;
}) {
  const label = citationLabel(url, sourceDocumentId);
  const href = safeCitationHref(url);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
      {href ? (
        <Link href={href} className="underline" target="_blank" rel="noreferrer">
          {label}
        </Link>
      ) : (
        <span>{label}</span>
      )}
      <span className="text-neutral-400">
        {publishedAt ? publishedAt.slice(0, 10) : 'date unknown'}
      </span>
      {showSourceRecord ? (
        <Link href={`/source/${encodeURIComponent(sourceDocumentId)}`} className="underline">
          source record
        </Link>
      ) : null}
    </span>
  );
}

export function SourcePolicyNote({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
      {children ?? (
        <p>
          Public evidence displays citation metadata and policy-allowed derived snippets only. Raw
          source bodies stay outside the dashboard.
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="min-h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      >
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ children = 'Run query' }: { children?: ReactNode }) {
  return (
    <button
      type="submit"
      className="min-h-10 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-950"
    >
      {children}
    </button>
  );
}
