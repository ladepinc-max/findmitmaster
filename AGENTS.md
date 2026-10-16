<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Profile photo selection uses a shared client-side crop editor before the existing upload flow, so onboarding and profile edits save the same positioned square image without changing storage or profile semantics.
- Screens restore their last-shown lists via useCachedState (src/lib/page-cache.ts) and refresh in the background; cache is cleared on sign-out — keeps reopen instant without leaking data between accounts.
- Tutor answers embed [DIAGRAM]<svg>[/DIAGRAM] and [PICTURE: ...] blocks parsed by src/lib/diagrams.ts; SVG is sanitized client-side, pictures are generated once and cached in the private tutor-diagrams bucket by description hash, and blocks are stripped before speech/history — keeps visuals free/instant where possible and never read aloud.
- Shops (`shops`, `shop_products`) are public only while `subscription_status='active'` and unexpired; a trigger blocks owners from changing subscription fields, which only server functions in src/lib/shop.functions.ts (after Paystack verification or admin waiver of `app_pricing.shop_registration`) may set — keeps the paywall unbypassable from the browser.
- Public storefronts live at `/@handle` via src/routes/$handle.tsx (non-@ paths 404) — matches the shareable shop-link format.
- Police stations (category "police" or handle ending ".police") use a separate storefront layout with no product catalog — isPoliceShop() in src/lib/shops.ts is the single switch.
