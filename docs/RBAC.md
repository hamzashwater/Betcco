# BETCCO RBAC matrix

| Capability | Guest | Student | Teacher | Admin |
|---|---:|---:|---:|---:|
| Public catalog, tracks, published courses, blog | Yes | Yes | Yes | Yes |
| Student self-registration | Yes | — | — | — |
| Invite/create teacher | — | — | — | Yes |
| Own profile and sessions | — | Own | Own | Own |
| Cart, checkout, own invoices | — | Own | — | View/manage |
| Course Player, private resources, progress | Preview only | Enrolled only | Own courses | All |
| Create/edit course draft | — | — | Own | All |
| Submit/review/publish course | — | — | Submit own | Review/publish |
| Create evaluation request/files | — | Own | — | All |
| Evaluate an assignment | — | — | Assigned only | All/assign |
| Wallet, refunds, payouts, pricing | — | Own invoices | Own wallet | All |
| CMS, taxonomy, reports, audit logs | — | — | — | Yes |

Every row is enforced with ASP.NET Core policies and resource ownership checks. A client-side route guard only improves navigation and never grants access.
