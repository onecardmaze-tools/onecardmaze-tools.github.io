# Usage statistics

## Purpose and collection

Estimate how often people actually use the helper, excluding the owner's browsers
and automated QA. Counts are estimates, not verified people or verified solutions.
The first-party `analytics.js` calls Umami Cloud's public collection API directly;
there is no third-party runtime script, build step, secret or account credential in
the product. The public website ID is a routing identifier, not authentication.

Only HTTPS on `onecardmaze-tools.github.io` sends data. Local development, preview
hosts, WebDriver, Do Not Track and Global Privacy Control are excluded. Umami's
server-side bot filtering supplements these checks. Browser automation can still
simulate walking; missing interaction is not proof of a bot. Ad blockers, offline
play, exclusions and request failures cause undercounting. Never bypass blockers.

The request allowlist is: website ID, fixed production hostname, fixed `/` URL,
empty referrer, fixed title, browser language, event name, app version and (only for
play milestones) `card_source` (`practice` or `imported`). Queries, fragments,
referrer URLs, card names, images, route coordinates, files, hardware diagnostics,
screen dimensions and persistent player IDs are never included. Standard HTTPS
requests expose the IP and User-Agent to the provider, which derives approximate
location and browser/OS/device information. Country is enough for primary reports;
do not use city-level reports to identify players. No device geolocation API is used.

Umami groups visitors using IP, User-Agent and a rotating salt. Raw IP is not stored
in its analytics session records; provider operational and security logs may still
contain IP addresses. Hashing is not a guarantee of anonymization.
Server session cache is retained only in page memory, and is cleared on exclusion
or local visit reset. No analytics identifier is written to device storage.

## Event definitions (version 1)

A **local visit** begins on page load or after 30 minutes without measured activity.
A reload/new tab starts a new local visit. This is a per-page counting rule; it is
not necessarily identical to Umami's server-defined visits/sessions. Each event
below is sent at most once per local visit, across all cards. Event counts measure
visits with an action, not numbers of cards, imports or solutions. Visibility alone
does not create repeated pageviews within a visit. No background heartbeat runs.

| Event | Trigger |
| --- | --- |
| Pageview (unnamed event) | Visible production page at load, or new local visit after inactivity |
| `play_started` | Actual nonzero walking after a destination input; initial placement, progress restoration and replay do not qualify |
| `play_engaged` | At least 60 accumulated seconds of actual foreground walking, with at least five destination inputs |
| `card_imported` | At least one card successfully saved in IndexedDB, including batch imports; failures, cancellation and duplicate skips do not qualify |
| `recording_imported` | A recording validates, its images decode and its state restores successfully |
| `recording_exported` | A valid export is generated and its download triggered; final disk save is not observable |
| `completion_marked` | A transition to manually marked completed persists successfully; unmarking is not an event |

Walking time is capped at 100 ms per frame, stops counting 30 seconds after the
latest destination input, and requires a fresh input after tab visibility changes.
This deliberately conservative milestone does not claim to measure all attentive
reading, planning or rotating time. A long unattended destination cannot earn it.
A completion mark is a player's annotation, never validation of a solved maze.
`imported` includes restored recordings, whose original card type is unknown.

## Exclude yourself and opt out

For a new browser, open https://onecardmaze-tools.github.io/?analytics=off to
persist exclusion before the first pageview is sent.

On each device/browser, open **About → Privacy and usage statistics** and turn off
**Allow usage statistics**. Do this before testing or playing on production.
Alternatively, on the production origin run:

```js
localStorage.setItem('umami.disabled', '1');
location.reload();
```

The same-origin preference is shared across tabs. Exclusion cancels queued requests
and stops future sends; already transmitted events cannot be recalled by this
switch. Turning it back on never backfills excluded activity. Clearing site data
resets the preference. Private browsing and other browser profiles need separate
exclusion. Storage failure disables statistics. GPC/DNT keeps the switch off.
Do not rely on IP exclusion: shared networks and changing IPs make it unreliable.

## Dashboard

Account data region: **United States**, selected by the owner during setup.
The free **Hobby** plan is used. Website: **One Card Maze Helper**
(`onecardmaze-tools.github.io`), public ID
`fe70e40d-566a-430c-9041-034e890521da`. Region controls analytics storage; it does not
restrict collection to visitors from that region. Provider CDN routing, security
and operational processing may take place elsewhere.

Sign in at https://cloud.umami.is with the owner's configured Google account.
Keep the dashboard private; do not enable public sharing or publish raw exports.
Select this website and compare rolling 7-day and 30-day periods:

1. Visitors: estimated reach, not an exact count of people.
2. Events → `play_started`: visits with actual play; use event-filtered visitor
   counts for estimated players if the current dashboard supports that view.
3. Events → `play_engaged`: visits with sustained walking.
4. `card_imported`, `recording_imported`, `recording_exported`,
   `completion_marked`: visits that reached those milestones.
5. Country, device and date: broad audience and usage trends.
6. Event data → `card_source` and `app_version`: practice/imported usage and
   behavior before/after releases. Imported recordings have unknown provenance.

Choose one dashboard timezone (UTC recommended) and keep it consistent. Do not sum
daily unique visitors to produce monthly unique visitors. Do not divide local
visit milestones by Umami sessions and label the result a precise conversion rate.
Practice, card import and recording restore are different entry points; a single
linear funnel is inappropriate. Initial collection should be checked in Realtime
with one explicitly permitted smoke visit, then the owner should opt out again.

## Retention and export

The selected free Hobby plan currently provides one website, 100,000 monthly usage
units and six months of cloud retention. Pageviews, events and saved event
properties consume quota; `app_version` and `card_source` are intentionally small.
Confirm actual limits in the account because provider plans may change.

Each month, use the website's Cloud export controls to download compressed CSVs
before retention expires. Store them privately outside the public Git repository.
Export is manual; no scheduled job, API subscription or reminder is configured.
Keep raw exports for no more than six months, then delete them after deriving daily
aggregate reports. Keep overall daily counts longer if useful; avoid sparse
country/hour/version combinations that could single out a player. Include the
metric definition version and timezone with reports. Raw export backups do not
extend the stated raw-data retention policy.

## Privacy and changes

About contains the notice and opt-out; there is no consent popup. Cookieless
collection alone does not settle consent, transparency or international-transfer
requirements. Use only limited first-party audience measurement; do not add ad
tracking, persistent identity, session replay, cross-site linkage or reuse of card
contents without reassessing those requirements. Provider privacy information:
https://umami.is/privacy. Verify the selected service's processing terms and
applicable local requirements before activation; no universal legal exemption is
claimed by this implementation.

Technical references:
- https://docs.umami.is/docs/api/sending-stats
- https://docs.umami.is/docs/metric-definitions
- https://docs.umami.is/docs/exclude-my-own-visits
- https://docs.umami.is/docs/cloud/export-data
- https://umami.is/pricing
- https://umami.is/dpa
