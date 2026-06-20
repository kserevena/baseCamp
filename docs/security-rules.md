# Firestore security rules

The live rules are in `firestore.rules`. Deploy them after any change:

```bash
firebase deploy --only firestore:rules
```

## Access summary

| Collection | Who can read | Who can write |
|---|---|---|
| `users/{uid}` | Owner only | Owner only |
| `inviteCodes/{code}` | Any signed-in user (single `get` only — no listing/enumeration) | Existing family member |
| `families/{familyId}` | Family members | Anyone signed-in who stamps `createdBy` as themselves (create); parents (update) |
| `families/{familyId}/members/{uid}` | Family members | Parents (any member); the family `createdBy` user seating themselves as parent; a user seating themselves as `child` with a valid invite code; self-updates that don't change `role` |
| `shoppingLists/{listId}` | Family members | Parents (create/update/delete) |
| `shoppingLists/{listId}/items/{itemId}` | Family members | Parents only (create/update/delete); `name` capped at 80 chars (enforced in rules — keep in sync with `ITEM_NAME_MAX_LENGTH` in `src/constants/shopping.js`) |
| `meals/{mealId}` | Family members | Family members (create/update); parents (delete) |
| `families/{familyId}/pocketMoney/{uid}` | Parents (any child); child (own only) | Parents only |
| `families/{familyId}/pocketMoney/{uid}/transactions/{txnId}` | Parents (any child); child (own only) | Parents only |
| `families/{familyId}/householdJobs/{jobId}` | Family members | Family members (create — must stamp own uid as suggestedBy, status=suggested, children cannot set priority/assignedTo); parents (update/delete); child who suggested it may update title/description only while status=suggested |
| `families/{familyId}/householdJobs/{jobId}/subtasks/{subtaskId}` | Family members (also via collection-group wildcard rule) | Parents (create/delete/full update); any family member (update done+updatedAt only) |

Two helper functions drive most rules:
- `isFamilyMember(familyId)` — checks `families/{familyId}/members/{uid}` exists
- `isParent(familyId)` — checks the member's `role` field equals `"parent"`

## Member self-write security model

**Member self-writes are tightly constrained — this is the core of the access model.** A user who is not yet a member can only seat *themselves* (`uid == request.auth.uid`), and only via one of two paths: as `parent` if they are the family's `createdBy` (first-run setup), or as `child` if they present an `inviteCode` that maps to this family. They cannot self-promote to parent and cannot change their own `role` on update. Without these constraints, any signed-in Google user could insert themselves into any family as a parent — invite codes are therefore also `get`-only (never listable) so the codes and their familyIds cannot be enumerated.
