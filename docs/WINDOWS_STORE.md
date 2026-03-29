# Windows Store Publishing Guide

## Overview

PrivateClaw is published to the Microsoft Store as an MSIX app.

- **Store URL**: https://apps.microsoft.com/detail/9P12LL1LT8RD
- **Package Identity**: `GuangGuangAIStudio.PrivateClaw`
- **Publisher**: `CN=C2C7AF54-16DE-44AC-9393-7EA6D433CCD2`
- **PFN**: `GuangGuangAIStudio.PrivateClaw_0vj9cwwbafpsa`
- **Seller ID**: `94118520`

## Architecture

Flutter 3.41.6 stable does **not** support native Windows ARM64 builds.
The MSIXBUNDLE currently contains x64 only. ARM64 Windows users run x64
binaries via WoW64/Prism emulation. This will be revisited when Flutter
stable adds ARM64 Windows support ([flutter/flutter#62597](https://github.com/flutter/flutter/issues/62597)).

## Build Pipeline

### 1. MSIX Package (per-arch)

Built by `scripts/build-windows-store-package.mjs` during the
`desktop` job in `.github/workflows/app-release.yml`.
Only the `windows-x64` matrix entry produces an MSIX
(condition: `matrix.arch == 'x64'`).

### 2. MSIXBUNDLE

Built by `scripts/build-windows-store-bundle.mjs` during the
`windows-store-bundle` job. Downloads per-arch MSIX artifacts and
invokes `MakeAppx.exe bundle` to produce a single `.msixbundle`.

### 3. Version Encoding

`scripts/resolve-windows-store-version.mjs` converts
`<semver>+<buildNumber>` → MSIX 4-part version
(`Major.Minor.Patch.0` with semver packed into field 1 and
build number split across fields 2–3).

## Store Assets

All store listing assets are in `apps/privateclaw_app/windows-store-assets/`:

| File | Purpose |
|------|---------|
| `StoreLogo_1080x1080.png` | Square store logo (1080×1080) |
| `StorePoster_720x1080.png` | Portrait poster (720×1080) |
| `Screenshot_1366x768.png` | Desktop screenshot (1366×768) |
| `Screenshot_1920x1080.png` | Desktop screenshot alt (1920×1080) |
| `Listing_en-us.txt` | English store listing copy |
| `Listing_zh-cn.txt` | 简体中文 store listing copy |
| `Listing_zh-tw.txt` | 繁體中文 store listing copy |
| `StoreListing.md` | Combined listing reference |

## Submission API

### Credentials

Store API credentials in `apps/privateclaw_app/windows-store.env`
(gitignored):

```
WINDOWS_STORE_TENANT_ID=<Azure AD Tenant ID>
WINDOWS_STORE_CLIENT_ID=<Azure AD App Client ID>
WINDOWS_STORE_CLIENT_SECRET=<Azure AD App Client Secret>
```

### Script: `scripts/windows-store-listing.mjs`

Manages Store submissions via the Partner Center legacy API
(`manage.devcenter.microsoft.com/v1.0/my`).

```bash
# Auth test
node scripts/windows-store-listing.mjs --test

# Update listings + upload package (draft)
node scripts/windows-store-listing.mjs --submit --package <path.msixbundle>

# Update + commit for certification
node scripts/windows-store-listing.mjs --submit --package <path.msixbundle> --commit

# Delete existing draft + recreate
node scripts/windows-store-listing.mjs --submit --fresh --package <path.msixbundle>
```

### Important Notes

1. **First submission must be done via Partner Center UI.**
   The legacy API cannot populate listings/pricing/properties for
   brand-new apps. After the first submission is published, subsequent
   updates work fully via API.

2. **Pricing must be set in the UI.** The legacy API does not support
   paid price tiers (`Tier*` values return "Price Tier is not supported").

3. The new Store API (`api.store.microsoft.com`) is for MSI/EXE apps
   only and does not support MSIX submissions.

## First Submission Checklist (Completed 2026-03-28)

- [x] Reserve app name in Partner Center
- [x] Complete Age Ratings questionnaire
- [x] Generate MSIXBUNDLE via GitHub Actions
- [x] Upload MSIXBUNDLE package
- [x] Fill Store listings in 3 languages (en-us, zh-cn, zh-tw)
- [x] Upload screenshots and logos
- [x] Set pricing ($7.99 USD)
- [x] Set properties (category, privacy URL, support contact)
- [x] Submit for certification

## TODO: Full CI/CD Integration

After the first submission is published and the legacy API can manage
subsequent submissions, integrate the following into the release workflow:

### Phase 1: Automated Store Update on Release

- [ ] Add `WINDOWS_STORE_TENANT_ID`, `WINDOWS_STORE_CLIENT_ID`, and
      `WINDOWS_STORE_CLIENT_SECRET` as GitHub Actions secrets
- [ ] Add a `windows-store-publish` job to `app-release.yml` that:
  1. Downloads the `windows-store-bundle` artifact
  2. Runs `scripts/windows-store-listing.mjs --submit --package <bundle> --commit`
  3. Reports certification status
- [ ] Gate the publish job behind `include_store` workflow input (default: false)
      to allow selective Store publishing

### Phase 2: ARM64 Support

- [ ] Monitor Flutter stable for Windows ARM64 support
      ([flutter/flutter#62597](https://github.com/flutter/flutter/issues/62597))
- [ ] When available: remove x64-only conditions from MSIX build steps
- [ ] Update `build-windows-store-bundle.mjs` to require both `x64` and `arm64`
- [ ] Test ARM64 MSIX on Windows ARM64 hardware

### Phase 3: Enhanced Automation

- [ ] Add screenshot generation automation (e.g., Flutter integration tests
      with screenshot capture)
- [ ] Add Store listing update support for new features/changelogs
- [ ] Consider migrating to the new Product Ingestion API
      (`graph.microsoft.com/rp/product-ingestion`) if Microsoft adds MSIX support
- [ ] Add certification status polling and notification on publish
