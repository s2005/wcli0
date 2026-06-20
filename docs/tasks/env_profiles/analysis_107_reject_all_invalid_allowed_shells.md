# Analysis 107 - Avoid broadening invalid allowedShells to every shell

## Decision: Valid — fix applied

Changed `buildProfiles` so that when `allowedShells` is provided as a non-empty
array but none of its entries are valid shell names, the whole profile is dropped
rather than emitting the profile with the `allowedShells` field omitted.

**Why:** The server treats an omitted `allowedShells` as unrestricted (selectable
from every shell). Previously a hand-edited typo such as `allowedShells:
['powershel']` filtered down to an empty list, the field was omitted, and the
profile silently became available to all shells — the opposite of the user's
intent to restrict it. Dropping the profile fails closed: the restriction the user
asked for is honored by making the misconfigured profile unavailable rather than
universally available. A profile with one valid and one invalid entry keeps only
the valid entries (unchanged from before), and a profile with no `allowedShells`
key remains unrestricted as designed. This also keeps the generated config aligned
with the server's `validateProfiles`, which rejects unknown shells in
`allowedShells` outright.

**Commit:** b8a31d5 — fix(vscode): address PR87 round-17 review (P106-P107)
