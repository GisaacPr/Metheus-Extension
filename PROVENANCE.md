# Provenance

This document explains the technical origin of Metheus Extension and summarizes what is inherited versus what is implemented and evolved by Metheus.

## Origin

Metheus Extension started from an open-source subtitle/player foundation.  
That foundation is an important part of the project history and remains properly credited.

## Inherited Foundation

The inherited base includes portions of browser-extension runtime and subtitle/player primitives, such as:

- video and subtitle synchronization groundwork
- subtitle parsing/extraction baseline pieces
- core extension scaffolding that accelerated initial development

Legal attribution for inherited portions is maintained in:

- [LICENSE.md](LICENSE.md)
- required third-party notice areas

## Metheus Implementation And Product Direction

Metheus expanded and reworked the project into a broader immersion system. Key areas include:

- Metheus account sync and platform integration
- browser-to-web bridge workflows for Metheus web app interoperability
- web-wide study flow (dictionary hover, reading-oriented workflows, page colorization)
- vocabulary-state-aware subtitle colorization tied to Metheus learning state
- L+1 / comprehensible-input oriented highlighting logic
- Metheus mining UX patterns for fast in-page capture
- dictionary stack evolution (offline-first data, online enrichment, contextual ranking)
- Metheus-specific UI, settings model, and product behavior across contexts

## Practical Reading Of This Repository

The most accurate description is:

> Metheus Extension is an independently developed immersion product built on top of an earlier open-source subtitle/player foundation.

The repository contains both inherited and newly built/evolved areas, and it should be read as a living product codebase with clear provenance.

## Attribution Policy

Metheus keeps attribution where it is legally and ethically required while documenting ongoing product and engineering work transparently.

For license terms and third-party notices, see [LICENSE.md](LICENSE.md).
