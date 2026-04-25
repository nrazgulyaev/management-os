/**
 * Common shape used by admin list rows. Services normalise both DB rows and
 * mock data into this canonical contract so UI code stays identical whether
 * the backend is wired or not.
 */
export interface DataSourceMeta {
  /** Where the row came from. */
  source: "db" | "mock";
}

export type WithSource<T> = T & DataSourceMeta;
