"use client";

/**
 * Phase 2.1 PR 2 — useDetailForm hook.
 *
 * Tracks per-field dirty state for a record-detail form. Returns
 * `{ values, dirtyFields, isDirty, setField, save, discard }`. The
 * `<DetailActionBar>` reads `isDirty` / `dirtyFields.size`; inline-
 * edit primitives call `setField`.
 *
 * `save` is async-friendly — pass a callback that returns a promise;
 * the hook clears dirty state when it resolves successfully.
 */

import * as React from "react";

export interface UseDetailFormResult<T> {
  values: T;
  dirtyFields: Set<keyof T>;
  isDirty: boolean;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  save: (commit?: (values: T) => void | Promise<void>) => Promise<void>;
  discard: () => void;
  reset: (next: T) => void;
}

export function useDetailForm<T extends object>(initial: T): UseDetailFormResult<T> {
  const [values, setValues] = React.useState<T>(initial);
  const baseline = React.useRef<T>(initial);
  const [dirtyFields, setDirtyFields] = React.useState<Set<keyof T>>(new Set());

  const setField = React.useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setDirtyFields((prev) => {
        const next = new Set(prev);
        const isSame = Object.is(baseline.current[key], value);
        if (isSame) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const save = React.useCallback(
    async (commit?: (values: T) => void | Promise<void>) => {
      if (commit) await commit(values);
      baseline.current = values;
      setDirtyFields(new Set());
    },
    [values],
  );

  const discard = React.useCallback(() => {
    setValues(baseline.current);
    setDirtyFields(new Set());
  }, []);

  const reset = React.useCallback((next: T) => {
    baseline.current = next;
    setValues(next);
    setDirtyFields(new Set());
  }, []);

  return {
    values,
    dirtyFields,
    isDirty: dirtyFields.size > 0,
    setField,
    save,
    discard,
    reset,
  };
}
