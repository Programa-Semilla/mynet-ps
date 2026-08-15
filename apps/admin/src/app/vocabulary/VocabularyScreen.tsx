import type { AdminInterestOption, AdminSector, AdminSubsector } from '@mynet/data'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'

/**
 * T176, T177 (014 tranche 2) — **the vocabulary destination** (FR-1085, FR-1086, FR-1089,
 * FR-1092's shipped condition, FR-1094, FR-1094a, FR-1094b, FR-1094c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE EMPTY STATE IS THE FIRST THING A REAL OPERATOR SEES, AND IT INVITES AUTHORING.**
 *
 * The vocabulary ships with the client's four sectors and NOTHING else — the subsector and
 * interest lists do not exist yet (FR-1086) — so "no subsectors yet: add the first" is not an
 * edge case, it is day one. An empty list that reads as broken teaches an operator the screen
 * failed; one that invites teaches them what the screen is for. Every list here renders that
 * invitation, following the rule 005 set: the states most likely to be skipped are the ones on
 * screen first.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE THREE RULES ARE SURFACED WHERE THE CONTROLS ARE**, because the server enforces them and
 * an operator should not learn them from a refusal: renaming or deleting a value attendees hold
 * is refused (retire it instead — FR-1094c, FR-1094), and retiring is reversible and writes to
 * no attendee record (FR-1094b). The controls stay ENABLED and the server decides — hiding them
 * would require this client to know who holds what, which is exactly the census FR-1099b forbids
 * it ever being told.
 *
 * **No count of holders appears anywhere on this screen, and none can**: the repository has no
 * method that could carry one. Refusals are classified on `error.code`, never on the class, and
 * the vocabulary's five codes each render their own sentence (`errors.ts`).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

type Lists = {
  readonly sectors: readonly AdminSector[]
  readonly subsectors: readonly AdminSubsector[]
  readonly interests: readonly AdminInterestOption[]
}

const field =
  'w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary'
const primary =
  'min-h-9 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'
const quiet =
  'min-h-9 rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-primary hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

export const VocabularyScreen = () => {
  const { services } = useAdminSession()

  const [lists, setLists] = useState<Lists | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailure(null)
    try {
      const [sectors, subsectors, interests] = await Promise.all([
        services.vocabulary.sectors(),
        services.vocabulary.subsectors(),
        services.vocabulary.interests(),
      ])
      setLists({ sectors, subsectors, interests })
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }, [services])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  /** Every act follows the same path: perform, re-read, or surface the server's refusal. */
  const act = async (perform: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await perform()
      await load()
    } catch (error) {
      setFailure(describe(classify(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-text-primary">Vocabulary</h1>
      <p className="mt-1 text-sm text-text-muted">
        The sectors, subsectors and networking interests every attendee chooses from — shared by the
        whole product. Values attendees hold cannot be renamed or deleted under them: retiring
        withdraws a value from new choice, keeps it for everyone who has it, and can be reversed.
      </p>

      {failure ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      {lists === null && failure === null ? (
        <p className="mt-4 text-sm text-text-muted">Loading the vocabulary…</p>
      ) : null}

      {lists ? (
        <>
          <section aria-labelledby="vocabulary-sectors" className="mt-6">
            <h2 id="vocabulary-sectors" className="text-lg font-semibold text-text-primary">
              Sectors
            </h2>
            {lists.sectors.length === 0 ? (
              <p className="mt-2 rounded-lg bg-cream-200 px-3 py-3 text-sm">
                No sectors yet — add the first. Everything else here hangs off them.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {lists.sectors.map((sector) => (
                  <ValueRow
                    key={sector.id}
                    value={sector}
                    what={`sector ${sector.label}`}
                    busy={busy}
                    onRename={(label) =>
                      act(() => services.vocabulary.renameSector(sector.id, { label }))
                    }
                    onRetire={() => act(() => services.vocabulary.retireSector(sector.id))}
                    onUnretire={() => act(() => services.vocabulary.unretireSector(sector.id))}
                    onDelete={() => act(() => services.vocabulary.deleteSector(sector.id))}
                  >
                    {/* The subsectors of this sector, grouped beneath it (FR-1087). */}
                    <SubsectorGroup
                      sector={sector}
                      subsectors={lists.subsectors.filter((one) => one.sectorId === sector.id)}
                      busy={busy}
                      act={act}
                    />
                  </ValueRow>
                ))}
              </ul>
            )}
            <AddValue
              what="sector"
              busy={busy}
              onAdd={(label) => act(() => services.vocabulary.createSector({ label }))}
            />
          </section>

          <section aria-labelledby="vocabulary-interests" className="mt-8">
            <h2 id="vocabulary-interests" className="text-lg font-semibold text-text-primary">
              Networking interests
            </h2>
            {lists.interests.length === 0 ? (
              // FR-1086's shipped condition, worded as an invitation: this list is EMPTY on day
              // one because the client's list has not arrived, and the screen exists precisely
              // so that filling it needs no deployment.
              <p className="mt-2 rounded-lg bg-cream-200 px-3 py-3 text-sm">
                No interests yet — add the first. Attendees choose from this list; until it has
                values, their interest chooser explains that none are defined.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {lists.interests.map((interest) => (
                  <ValueRow
                    key={interest.id}
                    value={interest}
                    what={`interest ${interest.label}`}
                    busy={busy}
                    onRename={(label) =>
                      act(() => services.vocabulary.renameInterest(interest.id, { label }))
                    }
                    onRetire={() => act(() => services.vocabulary.retireInterest(interest.id))}
                    onUnretire={() => act(() => services.vocabulary.unretireInterest(interest.id))}
                    onDelete={() => act(() => services.vocabulary.deleteInterest(interest.id))}
                  />
                ))}
              </ul>
            )}
            <AddValue
              what="interest"
              busy={busy}
              onAdd={(label) => act(() => services.vocabulary.createInterest({ label }))}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}

/**
 * One sector's subsectors, listed beneath it with their own add control — the grouping IS the
 * rule on screen: every subsector belongs to exactly one sector (FR-1087).
 */
const SubsectorGroup = ({
  sector,
  subsectors,
  busy,
  act,
}: {
  sector: AdminSector
  subsectors: readonly AdminSubsector[]
  busy: boolean
  act: (perform: () => Promise<void>) => Promise<void>
}) => {
  const { services } = useAdminSession()

  return (
    <div className="mt-2 border-l-2 border-border-subtle pl-3">
      {subsectors.length === 0 ? (
        <p className="text-xs text-text-muted">
          No subsectors of {sector.label} yet — add the first below.
        </p>
      ) : (
        <ul className="space-y-1">
          {subsectors.map((subsector) => (
            <ValueRow
              key={subsector.id}
              value={subsector}
              what={`subsector ${subsector.label}`}
              compact
              busy={busy}
              onRename={(label) =>
                act(() => services.vocabulary.renameSubsector(subsector.id, { label }))
              }
              onRetire={() => act(() => services.vocabulary.retireSubsector(subsector.id))}
              onUnretire={() => act(() => services.vocabulary.unretireSubsector(subsector.id))}
              onDelete={() => act(() => services.vocabulary.deleteSubsector(subsector.id))}
            />
          ))}
        </ul>
      )}
      <AddValue
        what={`subsector of ${sector.label}`}
        busy={busy || sector.retiredAt !== null}
        disabledBecause={
          sector.retiredAt !== null
            ? 'This sector is retired, so a new subsector of it could never be chosen. Un-retire it first.'
            : null
        }
        onAdd={(label) =>
          act(() => services.vocabulary.createSubsector({ sectorId: sector.id, label }))
        }
      />
    </div>
  )
}

/**
 * One value: its label, its retired state, and the four acts. Rename is an inline edit rather
 * than a dialog — one field does not earn a modal — and every control names its subject so a
 * list of these does not read as "Rename, Rename, Rename" to a screen reader.
 */
const ValueRow = ({
  value,
  what,
  busy,
  compact = false,
  onRename,
  onRetire,
  onUnretire,
  onDelete,
  children,
}: {
  value: AdminSector
  what: string
  busy: boolean
  compact?: boolean
  onRename: (label: string) => void
  onRetire: () => void
  onUnretire: () => void
  onDelete: () => void
  children?: ReactNode
}) => {
  const inputId = useId()
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(value.label)
  const retired = value.retiredAt !== null

  return (
    <li
      className={
        compact
          ? 'rounded-lg bg-surface-card px-2 py-1.5'
          : 'rounded-2xl border border-border-subtle bg-surface-card p-3'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <>
            <label htmlFor={inputId} className="sr-only">
              New name for {what}
            </label>
            <input
              id={inputId}
              className={`${field} max-w-56`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <button
              type="button"
              className={primary}
              disabled={busy || label.trim() === ''}
              onClick={() => {
                setRenaming(false)
                onRename(label.trim())
              }}
            >
              Save {what}
            </button>
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => {
                setRenaming(false)
                setLabel(value.label)
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
              {value.label}
            </span>
            {retired ? (
              // Never colour-only (Principle IV): the word is the cue, the tint is extra.
              <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-text-muted">
                Retired — kept by holders, offered to nobody
              </span>
            ) : null}
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => setRenaming(true)}
            >
              Rename {what}
            </button>
            {retired ? (
              <button type="button" className={quiet} disabled={busy} onClick={onUnretire}>
                Un-retire {what}
              </button>
            ) : (
              <button type="button" className={quiet} disabled={busy} onClick={onRetire}>
                Retire {what}
              </button>
            )}
            <button type="button" className={quiet} disabled={busy} onClick={onDelete}>
              Delete {what}
            </button>
          </>
        )}
      </div>
      {children}
    </li>
  )
}

/** The add control — a label field and a button, disabled while blank, with the reason stated. */
const AddValue = ({
  what,
  busy,
  disabledBecause = null,
  onAdd,
}: {
  what: string
  busy: boolean
  disabledBecause?: string | null
  onAdd: (label: string) => void
}) => {
  const inputId = useId()
  const [label, setLabel] = useState('')

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          New {what}
        </label>
        <input
          id={inputId}
          className={`${field} max-w-56`}
          placeholder={`New ${what}…`}
          value={label}
          disabled={disabledBecause !== null}
          onChange={(event) => setLabel(event.target.value)}
        />
        <button
          type="button"
          className={primary}
          disabled={busy || label.trim() === '' || disabledBecause !== null}
          onClick={() => {
            onAdd(label.trim())
            setLabel('')
          }}
        >
          Add {what}
        </button>
      </div>
      {disabledBecause ? <p className="mt-1 text-xs text-text-muted">{disabledBecause}</p> : null}
    </div>
  )
}
