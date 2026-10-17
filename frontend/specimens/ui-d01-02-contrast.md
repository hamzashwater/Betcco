# UI-D01-02 — Implemented token contrast

Base main: `9abd13336f6c606f6dceaa52c566e43ca506e487`. Approved contract: DC02/DC05/DC07/DC16, 17 October 2026.

Opaque computed token pairs; image/alpha composites are measured separately in `visual-evidence.json`. Primary compatibility pairs protect existing consumers; primary opt-in pairs establish the approved target without globally migrating them. Section/row bases are transparent and inherit their parent. Required control boundary uses `border.control`/`border.interactive`; legacy `border.default` is preserved and must not be the sole required boundary in new controls. These checks do not establish whole-site WCAG conformance.

| Theme | Role pair                                | Foreground | Background |  Ratio | Minimum | Result |
| ----- | ---------------------------------------- | ---------- | ---------- | -----: | ------: | ------ |
| light | text.primary / surface.canvas            | #0d1b2a    | #f5f6f8    | 16.085 |     4.5 | PASS   |
| light | text.secondary / surface.canvas          | #334f63    | #f5f6f8    |  7.961 |     4.5 | PASS   |
| light | text.muted / surface.canvas              | #496679    | #f5f6f8    |  5.613 |     4.5 | PASS   |
| light | text.link / surface.canvas               | #086459    | #f5f6f8    |  6.522 |     4.5 | PASS   |
| light | text.primary / surface.panel             | #0d1b2a    | #ffffff    | 17.394 |     4.5 | PASS   |
| light | text.secondary / surface.panel           | #334f63    | #ffffff    |  8.609 |     4.5 | PASS   |
| light | text.muted / surface.panel               | #496679    | #ffffff    |  6.069 |     4.5 | PASS   |
| light | text.link / surface.panel                | #086459    | #ffffff    |  7.053 |     4.5 | PASS   |
| light | text.primary / surface.inset             | #0d1b2a    | #eaf0f3    | 15.122 |     4.5 | PASS   |
| light | text.secondary / surface.inset           | #334f63    | #eaf0f3    |  7.484 |     4.5 | PASS   |
| light | text.muted / surface.inset               | #496679    | #eaf0f3    |  5.277 |     4.5 | PASS   |
| light | text.link / surface.inset                | #086459    | #eaf0f3    |  6.132 |     4.5 | PASS   |
| light | text.primary / surface.raised            | #0d1b2a    | #ffffff    | 17.394 |     4.5 | PASS   |
| light | text.secondary / surface.raised          | #334f63    | #ffffff    |  8.609 |     4.5 | PASS   |
| light | text.muted / surface.raised              | #496679    | #ffffff    |  6.069 |     4.5 | PASS   |
| light | text.link / surface.raised               | #086459    | #ffffff    |  7.053 |     4.5 | PASS   |
| light | text.primary / surface.overlay           | #0d1b2a    | #ffffff    | 17.394 |     4.5 | PASS   |
| light | text.secondary / surface.overlay         | #334f63    | #ffffff    |  8.609 |     4.5 | PASS   |
| light | text.muted / surface.overlay             | #496679    | #ffffff    |  6.069 |     4.5 | PASS   |
| light | text.link / surface.overlay              | #086459    | #ffffff    |  7.053 |     4.5 | PASS   |
| light | text.primary / surface.row-hover         | #0d1b2a    | #eaf0f3    | 15.122 |     4.5 | PASS   |
| light | text.secondary / surface.row-hover       | #334f63    | #eaf0f3    |  7.484 |     4.5 | PASS   |
| light | text.muted / surface.row-hover           | #496679    | #eaf0f3    |  5.277 |     4.5 | PASS   |
| light | text.link / surface.row-hover            | #086459    | #eaf0f3    |  6.132 |     4.5 | PASS   |
| light | text.primary / surface.row-pressed       | #0d1b2a    | #dde3e8    | 13.441 |     4.5 | PASS   |
| light | text.secondary / surface.row-pressed     | #334f63    | #dde3e8    |  6.652 |     4.5 | PASS   |
| light | text.muted / surface.row-pressed         | #496679    | #dde3e8    |  4.690 |     4.5 | PASS   |
| light | text.link / surface.row-pressed          | #086459    | #dde3e8    |  5.450 |     4.5 | PASS   |
| light | text.primary / surface.interactive       | #0d1b2a    | #e6f7f5    | 15.727 |     4.5 | PASS   |
| light | text.secondary / surface.interactive     | #334f63    | #e6f7f5    |  7.784 |     4.5 | PASS   |
| light | text.muted / surface.interactive         | #496679    | #e6f7f5    |  5.488 |     4.5 | PASS   |
| light | text.link / surface.interactive          | #086459    | #e6f7f5    |  6.377 |     4.5 | PASS   |
| light | focus / canvas                           | #075985    | #f5f6f8    |  6.994 |       3 | PASS   |
| light | control boundary / canvas                | #6c8393    | #f5f6f8    |  3.660 |       3 | PASS   |
| light | focus / panel                            | #075985    | #ffffff    |  7.563 |       3 | PASS   |
| light | control boundary / panel                 | #6c8393    | #ffffff    |  3.958 |       3 | PASS   |
| light | focus / inset                            | #075985    | #eaf0f3    |  6.575 |       3 | PASS   |
| light | control boundary / inset                 | #6c8393    | #eaf0f3    |  3.441 |       3 | PASS   |
| light | focus / raised                           | #075985    | #ffffff    |  7.563 |       3 | PASS   |
| light | control boundary / raised                | #6c8393    | #ffffff    |  3.958 |       3 | PASS   |
| light | focus / overlay                          | #075985    | #ffffff    |  7.563 |       3 | PASS   |
| light | control boundary / overlay               | #6c8393    | #ffffff    |  3.958 |       3 | PASS   |
| light | focus / row-hover                        | #075985    | #eaf0f3    |  6.575 |       3 | PASS   |
| light | control boundary / row-hover             | #6c8393    | #eaf0f3    |  3.441 |       3 | PASS   |
| light | focus / row-pressed                      | #075985    | #dde3e8    |  5.844 |       3 | PASS   |
| light | control boundary / row-pressed           | #6c8393    | #dde3e8    |  3.059 |       3 | PASS   |
| light | focus / interactive                      | #075985    | #e6f7f5    |  6.838 |       3 | PASS   |
| light | control boundary / interactive           | #6c8393    | #e6f7f5    |  3.579 |       3 | PASS   |
| light | state.success                            | #166534    | #f0fdf4    |  6.812 |     4.5 | PASS   |
| light | state.warning                            | #854d0e    | #fffbeb    |  6.607 |     4.5 | PASS   |
| light | state.danger                             | #9f1239    | #fff1f2    |  7.297 |     4.5 | PASS   |
| light | state.info                               | #1e40af    | #eff6ff    |  8.015 |     4.5 | PASS   |
| light | state.neutral                            | #334f63    | #eaf0f3    |  7.484 |     4.5 | PASS   |
| light | action.primary (compatibility)           | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| light | action.primary-hover (compatibility)     | #f5f6f8    | #163f5b    | 10.242 |     4.5 | PASS   |
| light | action.primary-pressed (compatibility)   | #f5f6f8    | #123149    | 12.439 |     4.5 | PASS   |
| light | action.secondary (compatibility)         | #0d1b2a    | #eaf0f3    | 15.122 |     4.5 | PASS   |
| light | action.secondary-hover (compatibility)   | #0d1b2a    | #dde3e8    | 13.441 |     4.5 | PASS   |
| light | action.secondary-pressed (compatibility) | #0d1b2a    | #bbc7d0    | 10.099 |     4.5 | PASS   |
| light | action.danger (compatibility)            | #ffffff    | #b91c1c    |  6.470 |     4.5 | PASS   |
| light | action.danger-hover (compatibility)      | #ffffff    | #991b1b    |  8.310 |     4.5 | PASS   |
| light | action.danger-pressed (compatibility)    | #ffffff    | #7f1d1d    | 10.020 |     4.5 | PASS   |
| light | action.primary (approved opt-in)         | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| light | action.primary-hover (approved opt-in)   | #f5f6f8    | #163f5b    | 10.242 |     4.5 | PASS   |
| light | action.primary-pressed (approved opt-in) | #f5f6f8    | #123149    | 12.439 |     4.5 | PASS   |
| light | action.disabled                          | #405c6f    | #d5dfe5    |  5.209 |     4.5 | PASS   |
| light | action.pending                           | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| light | action.quiet-hover                       | #086459    | #e6f7f5    |  6.377 |     4.5 | PASS   |
| light | action.quiet-pressed                     | #086459    | #c4eee7    |  5.619 |     4.5 | PASS   |
| light | selection                                | #0d1b2a    | #e6f7f5    | 15.727 |     4.5 | PASS   |
| dark  | text.primary / surface.canvas            | #f5f6f8    | #0d1b2a    | 16.085 |     4.5 | PASS   |
| dark  | text.secondary / surface.canvas          | #d5e4e8    | #0d1b2a    | 13.329 |     4.5 | PASS   |
| dark  | text.muted / surface.canvas              | #b8d1d6    | #0d1b2a    | 10.875 |     4.5 | PASS   |
| dark  | text.link / surface.canvas               | #80ded0    | #0d1b2a    | 10.997 |     4.5 | PASS   |
| dark  | text.primary / surface.panel             | #f5f6f8    | #133147    | 12.465 |     4.5 | PASS   |
| dark  | text.secondary / surface.panel           | #d5e4e8    | #133147    | 10.329 |     4.5 | PASS   |
| dark  | text.muted / surface.panel               | #b8d1d6    | #133147    |  8.427 |     4.5 | PASS   |
| dark  | text.link / surface.panel                | #80ded0    | #133147    |  8.522 |     4.5 | PASS   |
| dark  | text.primary / surface.inset             | #f5f6f8    | #10283b    | 13.984 |     4.5 | PASS   |
| dark  | text.secondary / surface.inset           | #d5e4e8    | #10283b    | 11.588 |     4.5 | PASS   |
| dark  | text.muted / surface.inset               | #b8d1d6    | #10283b    |  9.454 |     4.5 | PASS   |
| dark  | text.link / surface.inset                | #80ded0    | #10283b    |  9.561 |     4.5 | PASS   |
| dark  | text.primary / surface.raised            | #f5f6f8    | #173a52    | 11.012 |     4.5 | PASS   |
| dark  | text.secondary / surface.raised          | #d5e4e8    | #173a52    |  9.125 |     4.5 | PASS   |
| dark  | text.muted / surface.raised              | #b8d1d6    | #173a52    |  7.445 |     4.5 | PASS   |
| dark  | text.link / surface.raised               | #80ded0    | #173a52    |  7.529 |     4.5 | PASS   |
| dark  | text.primary / surface.overlay           | #f5f6f8    | #10283b    | 13.984 |     4.5 | PASS   |
| dark  | text.secondary / surface.overlay         | #d5e4e8    | #10283b    | 11.588 |     4.5 | PASS   |
| dark  | text.muted / surface.overlay             | #b8d1d6    | #10283b    |  9.454 |     4.5 | PASS   |
| dark  | text.link / surface.overlay              | #80ded0    | #10283b    |  9.561 |     4.5 | PASS   |
| dark  | text.primary / surface.row-hover         | #f5f6f8    | #173a52    | 11.012 |     4.5 | PASS   |
| dark  | text.secondary / surface.row-hover       | #d5e4e8    | #173a52    |  9.125 |     4.5 | PASS   |
| dark  | text.muted / surface.row-hover           | #b8d1d6    | #173a52    |  7.445 |     4.5 | PASS   |
| dark  | text.link / surface.row-hover            | #80ded0    | #173a52    |  7.529 |     4.5 | PASS   |
| dark  | text.primary / surface.row-pressed       | #f5f6f8    | #1c3447    | 11.903 |     4.5 | PASS   |
| dark  | text.secondary / surface.row-pressed     | #d5e4e8    | #1c3447    |  9.863 |     4.5 | PASS   |
| dark  | text.muted / surface.row-pressed         | #b8d1d6    | #1c3447    |  8.047 |     4.5 | PASS   |
| dark  | text.link / surface.row-pressed          | #80ded0    | #1c3447    |  8.138 |     4.5 | PASS   |
| dark  | text.primary / surface.interactive       | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| dark  | text.secondary / surface.interactive     | #d5e4e8    | #1b4f72    |  6.683 |     4.5 | PASS   |
| dark  | text.muted / surface.interactive         | #b8d1d6    | #1b4f72    |  5.452 |     4.5 | PASS   |
| dark  | text.link / surface.interactive          | #80ded0    | #1b4f72    |  5.514 |     4.5 | PASS   |
| dark  | focus / canvas                           | #67e8f9    | #0d1b2a    | 12.000 |       3 | PASS   |
| dark  | control boundary / canvas                | #91a4b2    | #0d1b2a    |  6.756 |       3 | PASS   |
| dark  | focus / panel                            | #67e8f9    | #133147    |  9.299 |       3 | PASS   |
| dark  | control boundary / panel                 | #91a4b2    | #133147    |  5.236 |       3 | PASS   |
| dark  | focus / inset                            | #67e8f9    | #10283b    | 10.432 |       3 | PASS   |
| dark  | control boundary / inset                 | #91a4b2    | #10283b    |  5.874 |       3 | PASS   |
| dark  | focus / raised                           | #67e8f9    | #173a52    |  8.215 |       3 | PASS   |
| dark  | control boundary / raised                | #91a4b2    | #173a52    |  4.625 |       3 | PASS   |
| dark  | focus / overlay                          | #67e8f9    | #10283b    | 10.432 |       3 | PASS   |
| dark  | control boundary / overlay               | #91a4b2    | #10283b    |  5.874 |       3 | PASS   |
| dark  | focus / row-hover                        | #67e8f9    | #173a52    |  8.215 |       3 | PASS   |
| dark  | control boundary / row-hover             | #91a4b2    | #173a52    |  4.625 |       3 | PASS   |
| dark  | focus / row-pressed                      | #67e8f9    | #1c3447    |  8.879 |       3 | PASS   |
| dark  | control boundary / row-pressed           | #91a4b2    | #1c3447    |  5.000 |       3 | PASS   |
| dark  | focus / interactive                      | #67e8f9    | #1b4f72    |  6.016 |       3 | PASS   |
| dark  | control boundary / interactive           | #91a4b2    | #1b4f72    |  3.387 |       3 | PASS   |
| dark  | state.success                            | #86efac    | #12362b    |  9.417 |     4.5 | PASS   |
| dark  | state.warning                            | #fcd34d    | #3c2d12    |  9.240 |     4.5 | PASS   |
| dark  | state.danger                             | #fda4af    | #431c28    |  7.737 |     4.5 | PASS   |
| dark  | state.info                               | #93c5fd    | #162f4c    |  7.537 |     4.5 | PASS   |
| dark  | state.neutral                            | #d5e4e8    | #10283b    | 11.588 |     4.5 | PASS   |
| dark  | action.primary (compatibility)           | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| dark  | action.primary-hover (compatibility)     | #f5f6f8    | #163f5b    | 10.242 |     4.5 | PASS   |
| dark  | action.primary-pressed (compatibility)   | #f5f6f8    | #123149    | 12.439 |     4.5 | PASS   |
| dark  | action.secondary (compatibility)         | #f5f6f8    | #173a52    | 11.012 |     4.5 | PASS   |
| dark  | action.secondary-hover (compatibility)   | #f5f6f8    | #1c3447    | 11.903 |     4.5 | PASS   |
| dark  | action.secondary-pressed (compatibility) | #f5f6f8    | #294556    |  9.337 |     4.5 | PASS   |
| dark  | action.danger (compatibility)            | #ffffff    | #b91c1c    |  6.470 |     4.5 | PASS   |
| dark  | action.danger-hover (compatibility)      | #ffffff    | #991b1b    |  8.310 |     4.5 | PASS   |
| dark  | action.danger-pressed (compatibility)    | #ffffff    | #7f1d1d    | 10.020 |     4.5 | PASS   |
| dark  | action.primary (approved opt-in)         | #0d1b2a    | #86bad6    |  8.290 |     4.5 | PASS   |
| dark  | action.primary-hover (approved opt-in)   | #0d1b2a    | #b9d8e9    | 11.647 |     4.5 | PASS   |
| dark  | action.primary-pressed (approved opt-in) | #0d1b2a    | #5299bd    |  5.508 |     4.5 | PASS   |
| dark  | action.disabled                          | #b8d1d6    | #294556    |  6.312 |     4.5 | PASS   |
| dark  | action.pending                           | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
| dark  | action.quiet-hover                       | #80ded0    | #173a52    |  7.529 |     4.5 | PASS   |
| dark  | action.quiet-pressed                     | #80ded0    | #1c3447    |  8.138 |     4.5 | PASS   |
| dark  | selection                                | #f5f6f8    | #1b4f72    |  8.065 |     4.5 | PASS   |
