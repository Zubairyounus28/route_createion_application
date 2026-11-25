# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: All paths outside `/users/{userId}` and `/users/{userId}/tours/{tourId}` are denied.
2. **Strict Ownership & PII Isolation**: A user's profile (including email) and saved tours may only be read (`get`/`list`), created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId`.
3. **Identity Integrity**: `UserProfile.uid` and `SchoolTour.ownerId` must equal `request.auth.uid` on create and remain immutable on update.
4. **Master Gate on Subcollections**: Writes and reads under `/users/{userId}/tours/{tourId}` validate both `userId == request.auth.uid` and `isValidId(tourId)`, plus verify parent `/users/{userId}` exists on create or update (with atomic creation supported via `existsAfter` when bootstrapping profile + first tour together).
5. **Temporal Integrity**: `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on every create and update.
6. **Bounded Payloads**: All strings have explicit `.size()` bounds; `stops` array is strictly bounded (`size() <= 12`) and validates first element shape when non-empty; `hasOnly` and `affectedKeys().hasOnly(...)` block shadow fields.

## 2. Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read of `/users/alice` or `/users/alice/tours/tour1`.
2. Authenticated user Bob reading Alice's profile (`/users/alice`) or listing Alice's tours (`/users/alice/tours`).
3. Unverified email user (`email_verified: false`) attempting to create `/users/bob`.
4. Spoofed `ownerId` on tour creation (`/users/bob/tours/t1` with `ownerId: "alice"`).
5. Shadow field injection on create (`/users/bob` with extra key `isAdmin: true`).
6. Shadow field injection on update (`/users/bob/tours/t1` adding `role: "admin"`).
7. Oversized `tourId` path variable (200 characters) or invalid characters (`tour$1`).
8. Unbounded `stops` array (15 items, exceeding max 12).
9. Oversized `title` string (> 120 characters) or empty `title`.
10. Client-forged `createdAt` or `updatedAt` timestamp not equal to `request.time`.
11. Mutating immutable `ownerId` or `createdAt` during tour update.
12. Invalid enum value for `travelMode` (e.g., `"TELEPORT"`) or `routeObjective` (e.g., `"UNKNOWN"`).
