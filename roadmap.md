# General AI
- [x] Improve conversational continuity and follow-up behavior; full-history tests passed.
- [x] Remove General AI voice controls; preserve Classroom.
- [x] Display answers progressively; incremental delivery tests passed.
- [ ] Verify a real signed-in conversation and restored answer through the UI — blocked: no requesting-user account/session available; user must sign in.

# Shop experience
- [ ] Finish owner metrics, link copying, opening hours, and Open/Closed controls.
- [ ] Connect existing customer and owner chat buttons to shop bottom sheets.
- [ ] Track shop visits and shop-specific unread messages.
- [ ] Verify stock, closed-shop access, and in-shop conversation.
# Shops and suppliers directory
- [x] Split Find Suppliers into side-by-side Shops and Suppliers lists with cached profile photos and working storefront/profile links.
- [x] Show Register shop or Manage shop from the signed-in user's actual shop, and add equivalent supplier registration/management.
- [x] Add supplier registration, category-based yearly payment, public supplier profiles, and payment return handling.
- [x] Tested directory actions, supplier registration, both Manage buttons, photo display and supplier profile opening on a phone-sized signed-in account; no real payment was taken.

# Home browser
- [x] Fix Home's missing AuthProvider error during live updates; shared consumers audited, seven tests passed, signed-in main-tab navigation and live auth-module update verified with no page errors.
- [x] Replace the map icon with the uploaded image; cache fixed interface images and avatars with automatic replacement; replacement tests and phone/desktop checks completed with a temporary account.
- [x] Phoenix-style Home matching design, in-app browser, admin Quick Access + news/ads feed.
- [x] Move Community Map from Chat to a globe-and-pin beside Home voice search; phone and desktop navigation verified.
- [ ] Repair Manage shop opening an error screen — both Register and Manage open correctly with a temporary signed-in account; current telemetry contains no captured runtime error; blocked on a screenshot of the user's error screen to identify the failure.

# Shop advert improvements
- [x] Show product thumbnails and automatically use the selected product photo.
- [x] Save and display optional advert price and percentage discount.
- [x] Run advert tests and verify the seller flow with a temporary account; photo and offer saved and seller list restored without making a payment.

# Shop backgrounds
- [x] Add automatically matched shop-type images while retaining custom photos and opacity.
- [x] Save adjustable background blur; eleven tests passed and a temporary signed-in shop verified automatic/custom photos, saved blur, storefront rendering, and resetting to automatic on phone and desktop.
