
# Project Initialization Guide

## Background

This directory contains a prototype created from the client's initial product requirements.

The prototype was produced through the following process:

1. The client provided reference images representing the product they wanted to build.
2. Those images were analyzed and used to create the `requirements.md` file.
3. The `requirements.md` file was then provided to another AI agent.
4. That agent generated the prototype included in this directory.

The prototype was used to validate the proposed product direction with the client. The client has approved the prototype, and the project is now ready to move beyond prototyping and into the implementation of the actual production-ready product.

## Objective

The goal of the next phase is to initialize the real project using the approved prototype and the documented requirements as the primary sources of context.

The prototype should be treated as a visual and functional reference, not as production-ready code. Do not assume that its architecture, implementation decisions, code quality, or internal structure should be preserved.

The `requirements.md` file is the primary source of truth for the product requirements, including any recommendations it contains regarding the technology stack.

## First Task: Create `CLAUDE.md`

Before initializing or implementing the production application, create a `CLAUDE.md` file at the root of the project.

The purpose of `CLAUDE.md` is limited to providing durable project context for future AI-assisted development sessions.

It should include:

* A concise description of the product and its purpose.
* The primary users or actors identified in `requirements.md`.
* The main product capabilities and workflows.
* Important domain terminology.
* Relevant business rules and constraints.
* The approved technology stack or technology recommendations documented in `requirements.md`.
* The role of the existing prototype and how it should be used as a reference.
* The authoritative project files and the priority order in which they should be consulted.
* Known assumptions, ambiguities, or unresolved decisions that should not be silently inferred.

It should not include:

* Temporary implementation plans.
* Session-specific tasks.
* Progress updates.
* Generated task lists.
* Detailed coding instructions that are not supported by the available requirements.
* Invented architecture, APIs, data models, integrations, or business rules.
* Claims that the prototype is production-ready.

## Source Priority

Use the available project materials in the following order:

1. `requirements.md` — authoritative product requirements and technology-stack guidance.
2. Client-provided reference images — visual intent and product expectations.
3. Existing prototype — approved interaction and presentation reference.
4. Existing source code — implementation reference only, unless explicitly confirmed as production architecture.

When sources conflict, do not resolve the conflict by assumption. Document the discrepancy and preserve it as an open question.

## Expected Approach

Before creating `CLAUDE.md`:

1. Review the complete `requirements.md` file.
2. Inspect the directory structure and identify the prototype entry point.
3. Review the client reference images, when available.
4. Identify the technology-stack recommendations explicitly stated in the requirements.
5. Separate confirmed requirements from prototype-specific implementation choices.
6. Record material ambiguities rather than inventing missing details.

After this review, generate `CLAUDE.md` with project context only.

Do not begin production implementation until the project context has been captured and the proposed initialization approach has been validated against the requirements.

## Guiding Principle

The approved prototype confirms the intended product direction. It does not automatically validate the prototype's technical implementation.

The production project must be initialized from the documented requirements, using the prototype as a reference and following the technology-stack recommendations already established in `requirements.md`.



Final recommendation given by another AI

Adopt the following staged architecture:

Start with React and TypeScript as an installable PWA. Preserve the EventLink responsive layouts, accessibility model, navigation, attendee cards, agenda, messages, and local interactions. Add a manifest, application icons, an offline shell, versioned caching, and explicit online/offline states. Do not implement complex synchronization until persistent user accounts and a backend are actual requirements.

Create a platform abstraction layer now. Application code should call interfaces such as NotificationService, CalendarService, CameraService, ContactShareService, SecureStorage, and ConnectivityService rather than calling browser or native APIs directly. The initial implementation can use web capabilities or no-op demo implementations. Capacitor or another native framework can later provide platform implementations without rewriting product logic.

Use a Linux-based CI pipeline for the web product. Run type checking, linting, unit tests, component tests, accessibility checks, end-to-end browser tests, production builds, and preview deployments on every change. This requires no Apple infrastructure.

Add Capacitor only when one of three triggers occurs: App Store distribution becomes mandatory; a required capability is not adequately available through the web platform; or field testing demonstrates that PWA installation materially harms adoption. At that point, use Codemagic or Bitrise for iOS builds and signing, TestFlight for beta testing, and Google Play internal testing for Android. Capacitor is explicitly designed to convert existing web applications into iOS, Android, and PWA deployments while retaining access to native SDKs through plugins. 

Use at least one physical iPhone before production. Cloud CI proves that the app compiles and automated device farms broaden coverage, but neither completely substitutes for checking installation, safe areas, keyboard behavior, gestures, camera permissions, notifications, deep links, WebView behavior, and real attendee conditions on a physical device.

Reconsider Flutter only if rich animation or bespoke rendering becomes a defining product requirement. Reconsider React Native with Expo if the roadmap becomes app-store-first and accumulates multiple native integrations such as BLE, substantial background processing, advanced notifications, or proprietary mobile SDKs. In that case, Expo EAS is the least operationally burdensome no-Mac workflow. 

For the information currently available, the final ranking is:

Rank	Choice	Decision
Best current choice	React/TypeScript PWA	Build and validate the product without creating a mobile rewrite
Best store-enabled evolution	React + Capacitor, optionally Ionic UI	Maximum reuse with access to native packaging and plugins
Best app-store-first alternative	React Native + Expo	Select when native integrations become more important than desktop-web reuse
Best rich-UI alternative	Flutter	Select when animation and rendering consistency justify a rewrite
Conditional enterprise choice	.NET MAUI	Select only for a strongly C#/.NET-centered team
Not recommended	Xamarin or Unity	Xamarin is unsupported; Unity is mismatched unless the product becomes 3D/game/AR-centric
