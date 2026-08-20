/// <reference types="vite/client" />

declare const __TEST_MODE_BUILD_ALLOWED__: boolean

interface ImportMetaEnv {
  readonly VITE_TEST_MODE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
