# Backlog

Scenarios discussed and deliberately left for later, with the design that was agreed or proposed and the decisions still open. Last updated 6 October 2026.

## 1. Weekly set-aside inside a longer budget

**Scenario.** The budget is monthly, but something happens every weekend: a trip to the home town and back, groceries, or just saving. A month has four or five weekends, and some weekends the trip doesn't happen.

**Today.** A set-aside item repeats once per budget period. That fits a weekly budget. With a monthly budget the item is held once for the month, and the first payment releases all of it.

**Proposed.**

- Each set-aside item gets its own repeat: "every budget period" (as now) or "every week on a chosen day".
- The app counts the occurrences in the period from the calendar (4 Saturdays hold 4 × the amount, 5 hold 5 ×).
- Each occurrence is paid, skipped ("not going this weekend") or still held. Skipping releases only that one.
- A round trip is one item for the total, or two items (going and returning).

**Open decision.** When an occurrence's day passes with nothing paid and nothing skipped: release the money back to the budget automatically (suggested), or keep it held until the user says.

## 2. Trips and other spending with no budget

**Scenario.** Going on a trip with no budget decided; the user only wants to track what was spent.

**Today.** Expenses can be logged without a budget and appear in History and Reports, but the main card shows everything as over the limit, and trip spending mixes into the normal period. Workaround: a "Trip" category, whose total shows in Reports.

**Proposed.** Handle it with groups (item 3): a group is a named pot of expenses with its own total and no budget required. A group with only the user in it is a plain tracker for the trip.

**Open decision.** Whether the user's share of a group expense counts against their personal budget. Suggested: a per-group switch, "count my share in my budget", on by default for everyday groups (lunches) and off for trips.

## 3. Groups, like Splitwise

Agreed scope for the first version:

- Create a group, invite people by email link or in-app request.
- Add shared expenses, split equally or by exact amounts. Percentages and shares can come later.
- Balances (who owes whom) and settling up.
- One currency per group, chosen when it is created. No conversion between currencies.
- The user's share counts as spending in their personal budget; settling up does not (see the switch in item 2).
- Group actions need a connection at first, because several people change the same data. Personal entries stay offline-first.

Technical note: personal data syncs per user (`{ _id, userId }`). Groups need records several users can read and write, with membership checks on the server. Linked people (already built) avoid this by giving each side its own copy; that approach does not extend to groups of three or more.

## 4. Family or household budget

A group with a shared budget. The person who creates it is the admin and sets the budget; members add expenses against it. Covers pocket money for children and money family members take from or give to each other. Builds on item 3.

## 5. Smaller items

- **Add the budget automatically.** Today each new period asks "Got this week's budget?" and the user confirms with one tap, because the amount can differ. Offered: a setting to log the usual amount automatically when a period starts.
- **Linked people who both recorded the same loan.** When someone accepts a link and had already written down the same loan in their own account, the two records are not merged, so they see it twice. A way to match and merge them is not built.
- **Background sync on iPhone.** Not available to web apps. Entries sync when the app is opened, and when a push notification arrives. A full fix needs a native app.

## Not yet verified

- Offline mode, updates and background sync on a real phone (tested in headless Chrome on a PC, against production builds).
- Push notifications end to end.
- Accepting a link invitation after signing in with Google.
- The cause of the error on the first Google sign-in of a brand-new account. The login page now shows the error code, so the next occurrence can be diagnosed.
