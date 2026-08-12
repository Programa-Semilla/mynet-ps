# Contract: Infrastructure and Access

**Feature**: 010 | **Date**: 2026-08-10

What exists in the subscription after this feature, and **what may reach what**. Recorded because
the plan's post-design constitution re-check found two additions with a security posture — an
Azure Storage account and a just-in-time firewall rule — that no product-facing declaration row
covers, and a reviewer cannot audit what is not written down.

## What exists

| Resource | Group | Notes |
|---|---|---|
| VM `vm-mynet-uat` | `rg-mynet-uat` | `Standard_B2als_v2`, `centralus` (R8). Runs the whole stack under Compose. |
| Static public IP | `rg-mynet-uat` | The A record for `mynet-dev.programasemilla.com` points here. |
| Network security group | `rg-mynet-uat` | Ports 80 and 443 public. **Port 22 restricted** — see below. |
| OS disk | `rg-mynet-uat` | 64 GB. Holds the database volume, avatar bytes, and local backups. |
| **Storage account + private container** | **`rg-mynet-backups` (new)** | The off-host backup target (R4). Deliberately in its own group so deleting the environment's group does not delete its backups. |

**Production is not provisioned by this feature.** No resource named `prod` is created.

## What may reach what

```
public internet ──443──▶ Caddy ──▶ client bundle (static)
                           └─────▶ API container  ──▶ PostgreSQL (loopback only)
                                                        │
                                     backup job ────────┘
                                          │
                                          ▼  write-only
                                   Storage container (rg-mynet-backups)

deploy job ──22──▶ VM        (only while a deploy is running — see below)
operator   ──22──▶ VM        (one address, set at provision time)
```

- **The database is reachable only from its own host.** Loopback binding, not a firewall rule — so
  it stays true if the firewall is misconfigured.
- **The backup job's credential is write-only.** A compromised VM can add backups; it cannot read
  or delete the history. This is what makes the off-host copy a defence against the host rather
  than merely a second location.
- **Client and API share one origin**, which is what keeps `SameSite=Lax` a genuine CSRF defence
  and `connect-src 'self'` literally true.

## Port 22, and the one piece of this feature that widens access

**The problem** (R1): provisioning locks the port-22 rule to the operator's own address, discovered
at provision time. Hosted build runners have no stable address. A pipeline that deploys over SSH
cannot reach the host.

**The decision**: the deploy job adds a rule scoped to **its own single egress address** at the
start of a run and removes it at the end.

**The three properties that make this acceptable, all of which are requirements rather than
intentions:**

1. **One address, never a range.** FR-833 forbids admitting an unbounded set of origins. GitHub's
   published Actions ranges are thousands of addresses belonging to anyone who can run a workflow,
   and widening to them was rejected.
2. **Teardown runs on every exit path**, including cancellation. The existing job already knows
   this failure shape — it disables run cancellation precisely because a cancelled deploy strands a
   maintenance flag on the VM that nothing else clears.
3. **A stale rule is detected, not just prevented.** The job asserts at start that no rule from a
   previous run survives, and fails loudly if one does. **This is the property that matters**:
   teardown that runs is not the same as teardown that worked, and a leaked rule is permanent
   public SSH exposure that nothing would otherwise report.

**The successor, recorded deliberately.** Running the deploy through the Azure agent instead of SSH,
with the built bundle fetched from the storage account above, would delete port-22 administrative
access from the deploy path entirely rather than time-boxing it. It is the better end-state and was
not taken here only because rewriting the transport in the same change that first proves the deploy
works makes a failure impossible to attribute. R4's storage account is provisioned in a way that
does not preclude it.

## Credentials and what each can do

| Identity | Can | Cannot |
|---|---|---|
| Deploy service principal | Manage `rg-mynet-uat`; write one NSG rule | Reach production; read backups |
| Backup job (on the VM) | Write blobs to the container | Read or delete blobs |
| Operator (human) | SSH from one address; full subscription access | — |

## What this feature deliberately does not create

- **No production resource of any kind** (FR-894).
- **No public database endpoint**, no bastion, no VPN.
- **No monitoring or alerting stack.** Not required by any requirement, and adding one would be
  scope this feature is not entitled to take. Worth naming as an absence rather than leaving a
  reviewer to wonder: **nothing will page anybody when UAT goes down**, and that is accepted for a
  non-production environment holding seeded data.
- **No second environment.** One UAT, as the spec's Assumptions state.
