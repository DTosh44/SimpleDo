# Supabase browser client

`supabase.js` is the unmodified UMD distribution of `@supabase/supabase-js` **2.99.1**, downloaded from:
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.99.1/dist/umd/supabase.js

The MIT license is included in `SUPABASE-LICENSE`. Served locally so local tasks never depend on a CDN. Only configured, signed-in sync contacts Supabase; requesting a sign-in link also contacts Supabase Auth.

When updating, pin a reviewed version, replace the distribution and license, bump the shell cache version in `sw.js`, and rerun tests. No production build step is required.
