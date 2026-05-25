/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  /** Full URL to the catalog manifest on R2. Set in `.env` as MAIN_VITE_MANIFEST_URL. */
  readonly MAIN_VITE_MANIFEST_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
