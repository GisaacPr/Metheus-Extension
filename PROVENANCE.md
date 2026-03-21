# Provenance

This document exists to explain the technical origin of Metheus Extension clearly and without reducing the project to a one-line label.

## Short Version

Metheus Extension started on top of an open-source subtitle/player foundation.

That origin matters and remains credited.

At the same time, the current Metheus product should not be understood only as "the old project with branding." The runtime, product scope, integration model, and user experience have diverged materially.

## What Was Inherited

Metheus did not begin from an empty repository.

Inherited areas include parts of the subtitle/player foundation and browser-extension infrastructure that made it possible to bootstrap video synchronization, subtitle extraction, and extension runtime behavior faster than rebuilding every primitive from scratch.

That work remains acknowledged in:

- [LICENSE.md](LICENSE.md)
- places where legal attribution is required

## What Metheus Added Or Reworked

Metheus is not just a subtitle tool. It is an immersion system with product goals that go beyond the original foundation.

Examples of Metheus-specific direction and implementation include:

- Metheus sync and platform integration
- browser-to-web-app bridge behavior for the Metheus platform
- web-wide hover dictionary and reading workflow
- vocabulary-aware subtitle colorization tied to Metheus word state
- L+1 / comprehensible-input highlighting flows
- Metheus-specific mining UX, including lightweight in-page controls
- Metheus dictionary flows, offline-first behavior, and online enrichment choices
- Metheus-specific UI, settings, and product experience decisions

Some files or paths may still resemble the upstream project because they live in the same problem space or evolved from a common starting point. Shared structure does not automatically mean identical implementation.

## How To Read The Project

The most accurate description is:

> Metheus Extension is an independently developed immersion product built on top of an earlier open-source subtitle/player foundation.

That is more accurate than either of these extremes:

- "Metheus is entirely from scratch."
- "Metheus is only the earlier project with branding."

Both erase important parts of the real history.

## Why This Document Exists

Open-source provenance should be handled with clarity, not with vagueness or overstatement.

This document is here to make three things explicit:

1. The project acknowledges the foundation it started from.
2. The current Metheus product includes substantial work, direction, and implementation beyond that foundation.
3. Attribution belongs where it is legally and ethically required, but it should not replace an accurate description of what Metheus is today.

## Legal Note

For license terms and third-party notices, see [LICENSE.md](LICENSE.md).
