# Security Specification

## Data Invariants
1. A Room must have a valid ID and a gameState.
2. An AIMapRecord must have a unique ID and a pointer to an image in Storage.
3. MapCovers and GridSettings are keyed by mapId.

## Dirty Dozen Payloads
- Attempt to delete a room without being in it.
- Attempt to overwrite another user's map draft.
- Attempt to set an extremely large grid size (poisoning).
- Attempt to inject malicious scripts in the map name.
... (etc)

## Rules
(Drafting rules follow...)
