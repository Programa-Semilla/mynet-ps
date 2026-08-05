# EventLink Attendee Platform Design

## Product goal

Create a polished, interactive product demo for a multi-event attendee engagement and professional networking platform. The primary experience should feel like an authenticated attendee workspace rather than a marketing landing page.

The site should quickly answer three attendee questions:

1. What is happening next?
2. Who should I meet?
3. Where are my conversations, notes, and appointments?

## Scope

The initial version is a single-route, front-end product demo using realistic sample data. It demonstrates the complete attendee journey without external services, authentication, or durable storage.

Included capabilities:

- Multi-event switching
- Personalized daily agenda
- Session browsing and agenda management
- Session notes and Q&A
- Attendee discovery with relevant profile details
- Digital business-card sharing
- Direct-message preview and composition
- Networking appointment scheduling
- Responsive desktop and mobile layouts

Not included in this version:

- Organizer administration
- Real authentication
- Persistent databases or uploads
- Payment processing
- Live chat delivery, notifications, or calendar integrations

## Experience architecture

### Application shell

The desktop experience uses a narrow left navigation rail, a contextual top bar, and a flexible main workspace. The mobile experience replaces the rail with a compact header and a bottom navigation bar.

Primary destinations are Home, Agenda, Discover, Messages, and Network. The first view is Home and is built around the attendee's active event.

### Home dashboard

The first viewport should feel immediately useful rather than introductory. It contains:

- Event switcher with the active event and location
- Friendly attendee greeting and current day context
- A prominent “Up next” session card with time, room, speaker, and a join/view action
- A compact schedule timeline for the rest of the day
- Recommended people to meet, based on shared interests and goals
- Networking appointment summary
- Unread-message indicator

### Agenda

Agenda displays the attendee's personalized schedule in chronological order. Sessions show time, track, room, speakers, and saved state. The attendee can add or remove sessions and open a session detail panel.

The session panel supports:

- Session overview
- Personal notes with a local save interaction
- Audience questions and upvoting
- Speaker information

### Discover

Discover presents attendees as information-rich, scannable cards. Search and role/interest filters update the visible results. Each profile exposes company, role, interests, networking intent, and availability.

The attendee can open a profile, share a digital business card, start a message, or schedule a meeting.

### Messages

Messages uses a conversation list and a focused thread. The attendee can switch conversations and compose a new demo message. Message actions update local interface state but do not contact external recipients.

### Network and appointments

Network brings together saved contacts, exchanged digital cards, and scheduled appointments. Meeting scheduling uses a compact modal with selectable time slots and a short topic field. Confirming a slot adds it to the local appointment list and produces clear success feedback.

## Visual direction

The interface uses an editorial conference aesthetic: deep navy surfaces, warm coral accents, soft cream backgrounds, white content cards, and subtle mint status cues. Typography is confident and contemporary, with restrained rounded corners and purposeful shadows.

The design avoids a generic enterprise-dashboard appearance. Event content, people, sessions, and time are the strongest visual elements. Interface icons come from a consistent icon set; decorative shapes remain subtle and geometric.

## Interaction model

The implementation uses client-side state for the product-demo interactions:

- Navigation changes the active workspace
- Event switching updates event-specific summary content
- Search and filters update attendee results
- Session save state toggles immediately
- Notes are editable and visibly saved locally
- Q&A upvotes increment locally
- Conversations can be selected and demo messages appended
- Meeting confirmation creates a local appointment
- Digital-card sharing displays a confirmation state

Every interactive control has an accessible label, visible focus state, and keyboard support. Modals trap attention conceptually through a clear close action and Escape-key behavior where practical.

## Data flow and boundaries

Representative event, session, attendee, message, and appointment data live in focused in-file constants for this single-route demo. Small presentational components receive explicit data and callbacks. App-level state controls navigation, overlays, saved sessions, notes, messages, and appointments.

No network request is required for the demo. Browser reloads reset state, which is acceptable for the defined scope.

## Responsive behavior

- Desktop: persistent navigation rail and multi-column dashboard
- Tablet: reduced rail, flexible two-column cards, and stacked detail areas
- Mobile: compact top context, bottom navigation, single-column cards, full-width overlays, and touch-sized controls

No content or primary action should require horizontal scrolling.

## Error and empty states

The demo handles expected local states:

- No attendee search results: clear message and reset-filter action
- No saved agenda sessions: invitation to explore sessions
- No messages in a thread: conversation starter prompt
- No available meeting slots: explanation and close action
- Invalid empty message or meeting topic: disabled confirmation rather than an error after submission

## Validation

The completed experience will be checked for:

- Production build success
- Correct rendering at desktop and mobile sizes
- Working navigation and event switching
- Attendee search/filter behavior
- Session save, notes, and Q&A behavior
- Message composition
- Digital-card sharing feedback
- Meeting scheduling and appointment creation
- Keyboard focus visibility and accessible labels

## Success criteria

The finished site succeeds when a viewer can understand the product within the first viewport and can complete the core demo journey: inspect the next session, discover a relevant attendee, share a card or message them, and schedule a networking appointment.
