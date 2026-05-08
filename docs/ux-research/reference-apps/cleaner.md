# Cleaner reference apps

Role context: housekeeper / cleaner working a phone in the field, often offline between cleanings. Daily tasks: see today's turnovers, complete a property-specific checklist with photos, report damage, log time in/out. The phone is the only device — office computer access is rare or never. Biggest frictions: (1) "what do I do next" must be answerable in one tap from a locked phone, (2) photos must capture and queue offline without losing work, (3) damage/issue reporting can't require typing paragraphs on a phone keyboard.

## Properly (Airbnb-acquired)

### Positioning
Visual-first turnover platform built around the insight that cleaners are faster reading a photo than reading text. Acquired by Airbnb in 2022; pioneered the photo-step checklist where every task shows the host's reference photo of "this is what done looks like."

### Top 3 patterns
- **Photo-per-step visual checklist.** Each task has a reference photo of the finished state (made bed, folded towel arrangement, kitchen counter staging). The cleaner taps through one photo at a time, mimicking the image. For Bali villas where staff turn over and language varies, image-led instruction beats translated text every time.
- **Verification photo required to mark task complete.** Cleaners can't tick off a step without uploading a matching photo from the camera (no camera-roll picks — taken live with timestamp). Hosts get a side-by-side reference vs actual gallery. Copy this exactly for Arconique high-stakes steps (pool chemistry strip, gas valve check, safe reset).
- **"Send to a cleaner" share link, no app install required for occasional helpers.** A one-time turnover can be sent as a web link the cleaner opens on any phone — useful when the regular cleaner is sick and a relative covers. Arconique should mirror this for backup/relief staff so onboarding isn't a blocker.

### Pricing
$ — From ~$12/property/month at the time of Airbnb acquisition; now bundled into Airbnb co-host tooling.

### Why useful for Arconique
Properly proves that visual-first beats text-first for field staff, full stop. The photo-as-instruction and photo-as-verification pair is the single most-copied pattern in this category and should anchor Arconique's housekeeper checklist UI.

## Breezeway

### Positioning
Operations platform for vacation-rental property care, broader than Properly — covers cleaning, maintenance, inspections, and owner messaging. Strongest on the multilingual + offline mobile stack, with apps in 10 languages and explicit offline-sync behaviour for spotty WiFi properties.

### Top 3 patterns
- **Offline-first mobile app with background sync.** Cleaners can complete a full turnover (checklist, photos, time log) with no connectivity; data queues locally and syncs when WiFi returns at the next property. For Bali villas where 4G is patchy and villa WiFi is the only reliable signal, this is non-negotiable — Arconique must build offline from day one, not bolt it on.
- **Task-duration tracking with live progress against expected time.** Each task has a target duration; the app shows a running timer and flags when the cleaner is significantly over (signal of a problem) or under (signal of skipped steps). Useful for Arconique to detect both training gaps and quality risk without a manager on-site.
- **Reference photos embedded in the task itself, not a separate library.** When the cleaner taps a step, the property-specific reference photo is right there in the task card — no swiping to a separate "how to" tab. Arconique should keep instructional content adjacent to the action it instructs, never one screen away.

### Pricing
$$ — Per-property pricing, typically $5-10/property/month plus a base platform fee; enterprise tiers for large managers.

### Why useful for Arconique
Breezeway is the closest commercial analogue to what Arconique is building for the cleaner role: offline mobile, multilingual, photo-verified, multi-property. Treat it as the feature-parity baseline — Arconique needs everything Breezeway has plus tighter integration with the booking calendar.

## Turno (formerly TurnoverBnB)

### Positioning
Marketplace + management platform for short-term-rental cleaners, focused on the two-sided relationship (host and cleaner) rather than just task management. Strong on auto-scheduling from the booking calendar and on lightweight problem reporting that doesn't require typing.

### Top 3 patterns
- **Problem reporting as a 3-tap flow: tap "Report problem" -> snap photo -> pick category.** The cleaner never has to type. Categories (damage, missing, maintenance, low supply) are visual chips, and the host gets a real-time push notification with the photo. Copy this exactly — Bali cleaners typing on a phone in a second language is the worst possible UX, photos + chips solve it.
- **Auto-scheduling from the booking calendar with cleaner availability matching.** When a reservation lands, the system picks the cleaner based on prior assignments and free slots — no manager middle-step. Arconique already has the booking data, so the cleaner role's "today's jobs" list should auto-populate the same way.
- **Time-stamped photo upload that posts to a shared gallery the host can scan in 30 seconds.** Hosts don't read every checklist tick; they swipe through 6-12 photos to confirm the villa is guest-ready. The photo gallery, not the checklist, is the actual handoff artifact. Design Arconique's "turnover complete" handoff around the gallery, with the checklist as backing audit data.

### Pricing
$ — Free for hosts on basic tier; $8-15/property/month for paid tiers; cleaner side is free.

### Why useful for Arconique
Turno's problem-reporting flow is the cleanest no-typing damage report in the category and should be the template for Arconique's incident reporting. Their two-sided model also matches Arconique's reality (in-house staff and outside contractors both need to use the same tool).

## Top 3 cross-app patterns to adopt

1. **Photo-per-step with a tap-to-take-photo affordance directly on the task row.** All three apps put the camera one tap from the checklist item, with the photo becoming both proof-of-completion and the artifact the host actually reviews. Arconique's checklist UI should have the camera affordance always visible, never behind a "more options" menu.
2. **Offline queue with optimistic UI.** Properly and Breezeway both let the cleaner mark complete and snap photos with no signal; the UI says "done" instantly and syncs in background. The cleaner never sees a spinner or a failure. Arconique must adopt this — anything else means cleaners stop using the app at the worst-connectivity villas (which are also the highest-margin ones).
3. **Damage / problem reporting as a chip-picker + photo, never free-text.** Turno and Breezeway both surface a fixed taxonomy of issue types as visual chips so reporting takes 3 taps. Arconique should design the issue taxonomy in advance with villa managers (broken, missing, low supply, guest left mess, maintenance) and never expose a typed-description field as the primary path.

## Anti-patterns to avoid

- **Multi-screen wizards for marking a task complete.** Marking "bedroom done" should be one tap on the row plus one photo, not a four-screen flow with confirmation modals. Cleaners abandon flows that take more than ~3 taps per item.
- **Free-text fields as the only way to report damage.** Typing a paragraph in a second language on a phone keyboard while standing in a villa is the failure mode that makes cleaners stop reporting issues entirely. Photos + chips, always.
- **Login walls and session timeouts mid-clean.** Some platforms log out daily and force re-authentication; cleaners arrive at a villa, can't get in, and call the manager. Auth must persist for weeks and re-auth must be biometric / single-tap.
- **Web-only or web-mostly experiences.** Anything that assumes a desktop browser is wrong for this role — phone is the only device. The web app is for managers; cleaners need a native (or PWA-with-offline) app from the start.
- **Checklist text without reference photos.** "Make bed neatly" means six different things to six cleaners. Every standard-of-finish step needs a photo; text alone is an anti-pattern.
- **Hiding the next-job info behind navigation.** "What am I cleaning next, where is it, when is check-in?" must be the first screen on app open — not after tapping into a calendar, then a date, then a property.
