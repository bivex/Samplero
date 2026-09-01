## User Journey Map

Updated: 2026-03-06

### Overview

This document maps the main customer-facing flows for:

- plugin purchase
- sample pack purchase
- downloads and re-downloads
- license activation
- recovery and billing support

### Core Journey: Plugin Customer

| Step | Screen | Entry point | Next |
|---|---|---|---|
| 1 | Storefront / Product | ads, product catalog, landing page | Checkout |
| 2 | Checkout | Buy now CTA | Post-purchase Delivery |
| 3 | Post-purchase Delivery | successful payment | My Downloads & Licenses or direct download |
| 4 | My Downloads & Licenses | cabinet entry | Download Hub, License Detail / Devices |
| 5 | Download Hub | select build/version | install plugin |
| 6 | Plugin Activation Modal | inside plugin | success or License Activation Helper |
| 7 | License Detail / Devices | if slots/devices need management | revoke device, retry activation |

### Core Journey: Sample Pack Customer

| Step | Screen | Entry point | Next |
|---|---|---|---|
| 1 | Sample Pack Product | catalog, promo page | Checkout |
| 2 | Checkout | Buy sample pack CTA | Post-purchase Delivery |
| 3 | Post-purchase Delivery | successful payment | direct ZIP download or Download Hub |
| 4 | Download Hub | cabinet or delivery CTA | repeat ZIP download |
| 5 | Orders / Help | billing/help needs | Refund / Billing Request |

### Returning Customer: Re-downloads

| Step | Screen | Entry point | Next |
|---|---|---|---|
| 1 | Sign in / Access | site header, email link, cabinet entry | My Downloads & Licenses |
| 2 | My Downloads & Licenses | authenticated cabinet | Download Hub |
| 3 | Download Hub | choose plugin build or sample pack ZIP | download file |

### Device Activation Journey

| Step | Screen | Entry point | Next |
|---|---|---|---|
| 1 | Plugin Activation Modal | plugin opened in DAW | success or helper |
| 2 | License Activation Helper | activation issue or onboarding | back to modal |
| 3 | License Detail / Devices | slot full or revoke needed | free slot / revoke device |
| 4 | Plugin Activation Modal | retry activation | success |

### Recovery and Support Journey

| Problem | Screen | Next |
|---|---|---|
| Lost access to purchases | Sign in / Access | My Downloads & Licenses |
| Lost license key | Support / Recovery | Sign in / Access or support request |
| Missing receipt | Support / Recovery | Orders / Help |
| Refund or invoice needed | Orders / Help | Refund / Billing Request |
| Payment still pending | Error / Empty States | Orders / Help |
| Activation limit reached | Error / Empty States | License Detail / Devices |
| Offline grace expired | Error / Empty States | License Activation Helper |

### Public Screens

| Screen | Main purpose | Typical next step |
|---|---|---|
| Storefront / Product | sell plugin product | Checkout |
| Sample Pack Product | sell archive/sample product | Checkout |
| Checkout | payment and fulfillment entry | Post-purchase Delivery |
| Post-purchase Delivery | immediate success state and download CTA | cabinet or direct download |

### Authenticated Cabinet Screens

| Screen | Main purpose | Typical next step |
|---|---|---|
| Sign in / Access | cabinet entry and recovery | My Downloads & Licenses |
| My Downloads & Licenses | central ownership view | Download Hub / License Detail |
| Download Hub | unified downloads for plugins and sample packs | file download |
| License Detail / Devices | manage activations and slots | revoke / retry activation |
| Orders / Help | order history and help entry | Refund / Billing Request |
| Support / Recovery | support discovery and recovery | support or billing flow |

### In-App Screen

| Screen | Main purpose | Typical next step |
|---|---|---|
| Plugin Activation Modal | activate plugin on current device | success or helper |

### Support / Exception Screens

| Screen | Main purpose | Typical next step |
|---|---|---|
| License Activation Helper | activation instructions and recovery | back to plugin activation |
| Error / Empty States | payment/download/activation exception states | support or cabinet action |
| Refund / Billing Request | refund, invoice, VAT, billing support | request submitted |

### Primary User Flow

| Priority | Screen |
|---|---|
| Primary | Storefront / Product |
| Primary | Checkout |
| Primary | Post-purchase Delivery |
| Primary | My Downloads & Licenses |
| Primary | Download Hub |
| Primary | Plugin Activation Modal |
| Secondary | License Detail / Devices |
| Secondary | Orders / Help |
| Secondary | Sign in / Access |
| Support-only | Support / Recovery |
| Support-only | Error / Empty States |
| Support-only | Refund / Billing Request |

### Recommended Implementation Order

| Phase | Screens |
|---|---|
| 1 | Storefront / Product, Sample Pack Product, Checkout, Post-purchase Delivery |
| 2 | Sign in / Access, My Downloads & Licenses, Download Hub |
| 3 | Plugin Activation Modal, License Activation Helper, License Detail / Devices |
| 4 | Orders / Help, Support / Recovery |
| 5 | Error / Empty States, Refund / Billing Request |

### Related Wireframes

| File | Scope |
|---|---|
| `docs/wireframes/license-server-admin-ui-mockups.*` | admin flows |
| `docs/wireframes/license-server-customer-ui-mockups.*` | main customer flow |
| `docs/wireframes/wireframe3.*` | missing/supporting customer screens |
| `docs/wireframes/wireframe4.*` | activation, download hub, error states, billing |