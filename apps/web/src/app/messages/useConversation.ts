import { OfflineError, type ConversationState, type Counterpart, type Message } from '@mynet/data'
import {
  useConversationRepository,
  useDocumentVisible,
  useMessageRepository,
} from '@mynet/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * T063 (007) — one conversation's history, kept fresh while it is being looked at
 * (FR-518, FR-562, FR-585, research R4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A THREE-SECOND POLL, RUNNING ONLY WHILE A THREAD IS OPEN AND THE TAB IS VISIBLE.**
 *
 * Both conditions are load-bearing and neither is a performance tweak.
 *
 * *Only while a thread is open*, because a poll that ran from the destination would keep asking
 * about a conversation nobody is reading, on a phone, at a conference, on cellular data.
 *
 * *Only while visible*, because a backgrounded tab is a tab nobody is looking at — and the
 * browser throttles its timers unpredictably anyway, so a poll that "runs" there is a poll that
 * fires in bursts when the tab wakes. It refetches **immediately** on becoming visible rather
 * than waiting for the next tick, which is the moment freshness actually matters: somebody has
 * just come back to the conversation.
 *
 * **This is the freshness path that does not depend on permission** (FR-552, M7). Web Push covers
 * the closed application; this covers the open one, and the two are deliberately independent.
 * An attendee who denies notification permission gets a fully working product, which is why the
 * poll is not optional and not conditional on anything.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Nothing here is a cache** (FR-563). The state lives for as long as the thread is rendered, is
 * keyed by nobody, survives no navigation, and is never written to disk. It is the rendered list,
 * which is the same distinction 006's `useDirectory` had to draw for its de-duplication.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** How often an open, visible thread asks for anything new. Research R4 chose it for SC-502. */
const POLL_INTERVAL_MS = 3_000

/**
 * The ceiling the backoff climbs to while refreshes keep failing.
 *
 * A minute rather than "give up": the thread must recover on its own when the service does, and an
 * attendee who put their phone down should not have to reload to find out. Between three seconds
 * and a minute the request rate falls by twenty times, which is the point — during an incident the
 * load has to *drop*, not hold steady.
 */
const MAX_POLL_INTERVAL_MS = 60_000

/**
 * How many consecutive failures before the reader is told the thread has stopped keeping up.
 *
 * Not one: a single missed tick on a train is ordinary and self-correcting, and announcing it
 * would train people to ignore the notice. Three is roughly ten seconds of genuine silence.
 */
const STALE_AFTER_FAILURES = 3

/**
 * Jitter, so a hall full of clients does not re-converge on the same instant after an outage.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Isolated to one named function rather than sprinkled through the effect, so what it is for is
 * legible: **spread, not entropy**. It is not a device capability — nothing about it is a
 * browser's answer to a question, which is what Principle V's interfaces exist to mediate — so it
 * needs no port and `mynet/no-direct-platform-access` correctly does not flag it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const jitter = (): number => Math.random()

export type ConversationStatus = 'loading' | 'ready' | 'offline' | 'failed'

export interface OpenConversation {
  /** **Oldest first**, reversed once here so no consumer has to ask which order this is in. */
  readonly messages: readonly Message[]
  readonly status: ConversationStatus
  readonly state: ConversationState
  /**
   * Who this conversation is with, or `null` — either because it has not loaded yet, or because
   * they have deleted their account (FR-573). The two are told apart by `status`, never by this
   * field, so no caller can render a placeholder person for a thread that is merely loading.
   */
  readonly counterpart: Counterpart | null
  readonly hasMore: boolean
  readonly loadingOlder: boolean
  readonly loadOlder: () => void
  readonly retry: () => void
  /** Re-reads now. Used after a send, so the thread shows it without waiting for a tick. */
  readonly refresh: () => Promise<void>
  /**
   * What to announce to assistive technology, or `null` when nothing has arrived (FR-585).
   *
   * A sentence rather than a count, and **only for messages from the other person**: announcing
   * the attendee's own message would tell them something they just did.
   */
  readonly arrived: Arrival | null
  /**
   * True once refreshes have been failing long enough to mean it (FR-562).
   *
   * Distinct from `status`: the conversation on screen is real and readable, it has simply stopped
   * keeping up. Saying so is the alternative to a thread that looks current and is not.
   */
  readonly stale: boolean
}

/**
 * An announcement, and how many have been made.
 *
 * The count exists only to make each arrival a **distinct value**, so the live region is replaced
 * rather than updated. It is never shown to anybody.
 */
export interface Arrival {
  readonly text: string
  readonly count: number
}

export const useConversation = (conversationId: string): OpenConversation => {
  const messagesRepository = useMessageRepository()
  const conversations = useConversationRepository()
  const visible = useDocumentVisible()

  const [messages, setMessages] = useState<readonly Message[]>([])
  const [status, setStatus] = useState<ConversationStatus>('loading')
  const [state, setState] = useState<ConversationState>('open')
  const [counterpart, setCounterpart] = useState<Counterpart | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [arrived, setArrived] = useState<Arrival | null>(null)

  /**
   * Whether this thread has stopped keeping up, after enough consecutive failed refreshes to mean
   * something rather than a single missed tick.
   *
   * FR-562 promises a thread that updates itself. When it cannot, saying so is the honest
   * alternative to a screen that looks current and is not — and it is deliberately **not** the
   * `failed` status, because the conversation on screen is still real and still readable.
   */
  const [stale, setStale] = useState(false)

  /** Consecutive failed refreshes. Drives both the backoff and the notice above. */
  const failures = useRef(0)

  /**
   * Whether a first read has completed. Distinct from `announcedThrough`, which is the *id* of
   * the last counterpart message seen and is legitimately `null` for a thread nobody has written
   * into — conflating the two is what silenced the first arrival in an empty thread.
   */
  const baselined = useRef(false)

  /**
   * The newest message from the counterpart that has already been **announced**, so an arrival is
   * recognised without diffing whole lists and the announcement fires once per arrival rather
   * than on every poll returning the same page.
   *
   * Named for what it tracks rather than "last seen", which reads as presence — a concept M5 puts
   * out of scope entirely, and one `tests/unit/messages-absences.test.ts` refuses by name. The
   * guard is blunt on purpose, and it caught this.
   */
  const announcedThrough = useRef<string | null>(null)
  /** The message the server has already been told about, so a poll does not re-`PUT` every tick. */
  const markedThrough = useRef<string | null>(null)
  /** Whether any read has ever succeeded for this conversation. See the catch below. */
  const settled = useRef(false)

  /** Advanced at issue, so a superseded read cannot apply over a newer one. 006's `newest`. */
  const newestIssued = useRef(0)
  const issued = useRef(0)

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THERE IS NO "THE CONVERSATION CHANGED" RESET IN THIS HOOK, AND ITS ABSENCE IS DELIBERATE.**
   *
   * `useAsync` and `useDirectory` both clear their state during render when their inputs change,
   * because no frame may be painted with one conference's content under another's name. The same
   * hazard exists here — one conversation's messages under another's heading — and it is closed
   * differently: `Thread.tsx` renders the thread with `key={conversationId}`, so opening a
   * different conversation **remounts** rather than re-runs.
   *
   * That is stronger than a reset and is not merely equivalent to it. A reset has to remember
   * every piece of state, including the two refs below, and a piece forgotten is a leak from one
   * correspondence into another. A remount cannot forget: `useState` starts at its initial value
   * and `useRef` starts at `null`, for everything, by construction. It also keeps this hook free
   * of ref writes during render, which `react-hooks/refs` refuses outright.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */

  /**
   * T097 (007) — the read position follows what has actually been **displayed** (FR-528, FR-529).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Advanced from the rendered page rather than on open**, which is the distinction FR-529
   * draws. Marking a whole conversation read the moment its address is visited would mark
   * messages read that the reader has not seen — and sending a reply must not silently clear
   * older unread messages above it either, which is the same failure arriving from the other
   * direction. The newest message on screen is the honest high-water mark.
   *
   * Fired only when that mark changes, so a three-second poll on a quiet thread issues no writes
   * at all. The route is idempotent and monotonic anyway, so a duplicate would be harmless —
   * this is about not writing every three seconds forever.
   *
   * A failure is swallowed deliberately: a read position that could not be recorded is a dot that
   * stays on a little longer, and interrupting somebody reading a conversation to tell them so
   * would be worse than the thing it reports.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const advanceReadPosition = useCallback(
    (ordered: readonly Message[]): void => {
      const newest = ordered[ordered.length - 1]
      if (!newest || markedThrough.current === newest.messageId) return

      markedThrough.current = newest.messageId
      void conversations.markRead(conversationId, newest.messageId).catch(() => {})
    },
    [conversations, conversationId],
  )

  const read = useCallback(async (): Promise<void> => {
    if (!conversationId) return

    const sequence = ++issued.current
    newestIssued.current = sequence

    try {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **A POLL DOES NOT RE-ASK FOR THE FACE.**
      //
      // The counterpart's avatar is the bulk of this response — a few kilobytes of base64 that
      // nothing can compress further — and it cannot change while the thread is mounted, because
      // the thread remounts on `conversationId`. Re-fetching it every three seconds cost roughly
      // 60–110 KB a minute per attendee on a venue's cellular connection, for a picture already
      // on screen. The first read asks for it; every refresh after that does not.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const page = await messagesRepository.list(
        conversationId,
        settled.current ? { counterpart: false } : {},
      )
      if (sequence !== newestIssued.current) return

      // Newest-first over the wire (a thread opens at its most recent message); oldest-first
      // for display (FR-515). Reversed once, here.
      const ordered = [...page.messages].reverse()

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **A POLL MERGES. IT MUST NOT REPLACE, AND REPLACING BROKE "SHOW EARLIER MESSAGES".**
      //
      // Every tick re-reads *page one*. This used to `setMessages(ordered)` and
      // `setCursor(page.nextCursor)` unconditionally, so any older pages the reader had loaded
      // through `loadOlder` — which prepends and advances the cursor — were discarded within
      // three seconds and the cursor was rewound to page one's. "Show earlier messages"
      // reappeared, and reading back through a thread was impossible while the tab was visible.
      //
      // So: splice in only what is genuinely new, keep everything already loaded, and leave the
      // cursor alone once a baseline exists. `settled.current` is the discriminator — a first
      // read owns the list, every later read only adds to it.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      if (settled.current) {
        setMessages((current) => {
          const known = new Set(current.map((message) => message.messageId))
          const additions = ordered.filter((message) => !known.has(message.messageId))
          // Same array when nothing arrived, so React re-renders nothing and the scroll effect
          // below does not fire on a quiet thread.
          return additions.length === 0 ? current : [...current, ...additions]
        })
      } else {
        setMessages(ordered)
        setCursor(page.nextCursor)
      }
      setState(page.state)
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **KEPT, NOT OVERWRITTEN, WHEN THE POLL DID NOT ASK FOR IT.**
      //
      // A refresh sends `counterpart: false`, so `page.counterpart` is `null` — meaning "not
      // requested", not "gone". Writing that straight through would blank the thread header and
      // the safety controls three seconds after opening.
      //
      // The one case that *must* still get through is the counterpart genuinely disappearing: an
      // account deleted mid-thread arrives as `state: 'one_sided'`, which is carried on every
      // page and is what actually drives the closed-thread treatment (FR-573, FR-574). So the
      // header is only cleared when the server had something to say about it.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      if (!settled.current || page.counterpart) setCounterpart(page.counterpart)
      else if (page.state === 'one_sided') setCounterpart(null)
      setStatus('ready')
      settled.current = true
      // A good read clears the streak and the staleness notice together.
      failures.current = 0
      setStale(false)

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **ANNOUNCING THE SAME SENTENCE TWICE ANNOUNCES IT ONCE** (FR-585).
      //
      // Two defects lived here, and together they meant the live region fired at most once per
      // mounted thread — and never at all in a thread that opened empty:
      //
      //   1. `setArrived('A new message arrived.')` wrote the **same string literal** every time.
      //      React bails out on `Object.is`-equal state, so the second arrival mutated no DOM, and
      //      an `aria-live` region that does not change is not re-announced. Arrival #1 spoke;
      //      #2..N were silent.
      //   2. The guard required `announcedThrough.current !== null`, but a first read of an empty
      //      or all-mine thread *sets* it to `null` — so the counterpart's very first message was
      //      skipped in exactly the thread where it matters most.
      //
      // Fixed by separating "have we established a baseline" from "what was the last id", and by
      // carrying a counter so each arrival is a distinct value. The counter is not rendered: the
      // region shows `text`, and `key` is what forces the region to be replaced rather than
      // updated, which is what makes a screen reader speak it again.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const newestFromThem = [...ordered].reverse().find((message) => !message.mine)

      if (
        baselined.current &&
        newestFromThem &&
        newestFromThem.messageId !== announcedThrough.current
      ) {
        setArrived((previous) => ({
          text: 'A new message arrived.',
          count: (previous?.count ?? 0) + 1,
        }))
      }

      announcedThrough.current = newestFromThem?.messageId ?? null
      // A first read establishes the baseline without announcing it: everything is "new" the
      // first time, and reading a thread is not an arrival.
      baselined.current = true

      advanceReadPosition(ordered)
    } catch (error: unknown) {
      if (sequence !== newestIssued.current) return
      // ═══════════════════════════════════════════════════════════════════════════════════
      // **A FAILED READ BLANKS THE SCREEN ONLY WHEN THERE IS NOTHING ON IT YET.**
      //
      // A three-second refresh that missed must leave the conversation where it is and try
      // again — a tunnel must not delete a thread from under somebody who is reading it. A
      // *first* read that fails owns the screen and has to say so, or the attendee sits in
      // front of a spinner forever.
      //
      // The condition is **"has anything ever loaded"** rather than "was this the initial
      // read", and the difference is a defect this hook actually had: the poll fires its first
      // read immediately, so the initial read and the poll's were in flight together, the
      // poll's claimed the newest sequence, and the initial read's rejection was discarded as
      // superseded — leaving a failed thread rendering "Loading this conversation…"
      // indefinitely. `messages-states.test.ts` caught it.
      //
      // Written as a ref rather than as a `status !== 'loading'` check because `status` is
      // captured by this callback's closure and would be stale by exactly the window that
      // matters.
      // ═══════════════════════════════════════════════════════════════════════════════════
      if (settled.current) {
        // Already on screen, so the thread stays where it is — but the *scheduler* is told, so a
        // failing refresh slows down instead of hammering a service that is already struggling.
        failures.current += 1
        setStale(failures.current >= STALE_AFTER_FAILURES)
        return
      }
      setStatus(error instanceof OfflineError ? 'offline' : 'failed')
    }
  }, [messagesRepository, conversationId, advanceReadPosition])

  useEffect(() => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Not scheduled at all while the tab is hidden**, rather than scheduled and skipped. The
    // difference matters: a browser throttles a background tab's timers unpredictably, so an
    // interval that "runs" there fires in bursts when the tab wakes — several requests at once,
    // for a conversation nobody was reading.
    //
    // Because `visible` is a dependency, coming back mounts a fresh interval *and* the effect
    // body runs immediately — which is the refetch-on-visible that research R4 asks for, without
    // a second listener to keep in step with the first.
    // ───────────────────────────────────────────────────────────────────────────────────────
    if (!conversationId || !visible) return

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **One effect, not two — the initial read IS the poll's first tick.**
    //
    // Two effects, one loud and one quiet, is the obvious shape and it was the wrong one: both
    // fired on mount, the poll's claimed the newest sequence, and the initial read's failure was
    // then discarded as superseded. Reading once here removes the race rather than sequencing
    // around it, and `settled` above decides what a failure does to the screen.
    //
    // `read` is `async` and every `setState` in it runs after an `await`, so nothing here is a
    // synchronous state update in an effect body — the rule simply cannot see through a call.
    // ───────────────────────────────────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **A SELF-SCHEDULING TIMEOUT, NOT A FIXED INTERVAL — BECAUSE A FIXED ONE NEVER SHEDS LOAD.**
    //
    // This was `setInterval(read, 3000)` with no backoff and no jitter, and after the first
    // successful read every failure was swallowed with no state change at all. Two consequences,
    // and the second is the one an attendee lives with:
    //
    //   - **During an incident the load does not fall.** Every client with a thread open keeps
    //     issuing twenty requests a minute indefinitely, which is the worst possible shape for a
    //     single small VM trying to recover — and because every client shares one fixed period,
    //     recovery arrives as a synchronised burst rather than a ramp.
    //   - **The failure is invisible.** Somebody sits in a thread that stopped updating ten
    //     minutes ago and looks exactly like one that is current, which quietly undoes SC-502.
    //
    // Exponential backoff to a one-minute ceiling, plus ±20% jitter so a conference hall's worth
    // of clients do not re-converge on the same instant. A success resets both.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = (): void => {
      if (cancelled) return

      const backoff = Math.min(POLL_INTERVAL_MS * 2 ** failures.current, MAX_POLL_INTERVAL_MS)
      // Deterministic jitter would not be jitter. `Math.random` is a platform call feature code
      // may not make, so it is reached through the timing helper alongside the interval itself.
      const jittered = backoff * (0.8 + jitter() * 0.4)

      timer = setTimeout(() => {
        void read().finally(schedule)
      }, jittered)
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read().finally(schedule)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `attempt` is the retry: bumping it re-runs this effect, which reads immediately.
  }, [read, conversationId, visible, attempt])

  /**
   * T064 — older messages, as the reader scrolls back.
   *
   * The page arrives newest-first and is reversed before being **prepended**, so the reader's
   * position is preserved and the order stays oldest-first. The cursor guarantees no duplicates
   * and no omissions (research R6), so there is nothing to de-duplicate against — unlike the
   * directory, where 006 had to.
   */
  const loadOlder = useCallback(() => {
    if (!cursor || loadingOlder) return
    setLoadingOlder(true)

    messagesRepository
      .list(conversationId, { cursor })
      .then((page) => {
        setMessages((current) => [...[...page.messages].reverse(), ...current])
        setCursor(page.nextCursor)
      })
      .catch(() => {
        // What is already shown is not discarded. A further page failing is not the thread
        // failing, and blanking a conversation because its history could not be extended would
        // lose the reader their place for nothing.
      })
      .finally(() => setLoadingOlder(false))
  }, [messagesRepository, conversationId, cursor, loadingOlder])

  const retry = useCallback(() => {
    setStatus('loading')
    // Cleared, so a retry that fails again reports the failure rather than being swallowed as a
    // refresh of something already on screen.
    settled.current = false
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(async () => {
    await read()
  }, [read])

  return {
    messages,
    status,
    state,
    counterpart,
    hasMore: cursor !== null,
    loadingOlder,
    loadOlder,
    retry,
    refresh,
    arrived,
    stale,
  }
}
