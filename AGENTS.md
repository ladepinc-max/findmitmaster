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
- General AI uses an authenticated raw streaming route with the existing Gemini model, full UIMessage text-part history, and AI Elements; only completed answers are saved to the existing user-scoped tutor history so classroom logic remains independent.
- Shop chat reuses participant-protected one-to-one conversations, linked through owner/customer-readable shop_conversations; both storefront and management use shared bottom sheets so messages stay accessible without leaving the shop and personal threads do not enter shop metrics.
- The Home browser screen (`/home`, src/routes/home.tsx) is the default landing: first launch, sign-in, onboarding, logo tap, and 404 all route there; bottom nav is Chat, Jobs, Profile, Home. Stories stays at `/` behind the stories_tab admin gate and is reached only via the 3D Live TV badge on the Home header.
