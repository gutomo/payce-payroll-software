# Runbook: disaster recovery restore

**Scope:** restoring the Payce data tier after data loss or a region-level outage.
**Targets (architecture doc §10):** RPO ≤ 5 min · RTO ≤ 1 hr.
**Owner:** Platform engineering on-call.

This runbook assumes the Phase 7 DR stack ([`infra/modules/dr`](../../infra/modules/dr)) is applied:
an AWS Backup plan in the primary region copies recovery points to a vault in the DR region, and Aurora
PITR is enabled on the cluster. **The skeleton is not yet applied** — until it is, this is the intended
procedure, not a tested one.

## Recovery mechanisms (pick by failure mode)

| Failure                                        | Mechanism                                                | Expected RPO                     | Expected RTO |
| ---------------------------------------------- | -------------------------------------------------------- | -------------------------------- | ------------ |
| Bad write / logical corruption, region healthy | **Aurora PITR** to a timestamp just before the event     | ≤ 5 min                          | < 1 hr       |
| Accidental cluster deletion, region healthy    | **AWS Backup** restore from the primary-region vault     | since last recovery point        | < 1 hr       |
| Region loss                                    | **AWS Backup** restore from the **DR-region** vault copy | since last copied recovery point | ≤ 1 hr       |

## Before you start

1. Declare the incident; open a bridge; record the **target restore time** (UTC) — the last known-good
   moment. Every later step keys off this timestamp.
2. Confirm the failure mode (which row above) so you restore from the right source/region.
3. Freeze writes to the affected store if it is still reachable (scale app to 0 / disable the writer) to
   avoid restoring into a moving target.

## Path A — Aurora PITR (region healthy)

1. In the **primary** region, restore the cluster to the target time:
   `aws rds restore-db-cluster-to-point-in-time --source-db-cluster-identifier <cluster> --db-cluster-identifier <cluster>-restore --restore-to-time <UTC>`
2. Add an instance to the restored cluster (`create-db-instance`), wait for `available`.
3. Validate (see **Validation** below).
4. Cut over: repoint the app's DB secret/endpoint to the restored cluster writer endpoint, redeploy/scale up.

## Path B — AWS Backup restore (deletion, or region loss)

1. Choose the vault: primary-region vault for a deletion; **DR-region vault** (`<name>-dr`) for region loss.
2. Find the latest recovery point at/under the target time:
   `aws backup list-recovery-points-by-backup-vault --backup-vault-name <vault>`
3. Start the restore with the Backup service role (`module.dr.backup_role_arn`):
   `aws backup start-restore-job --recovery-point-arn <arn> --iam-role-arn <backup_role_arn> --metadata <cluster-metadata>`
4. Poll `describe-restore-job` until `COMPLETED`; the restored Aurora cluster appears in the chosen region.
5. Add an instance if the restore produced a cluster without one; wait for `available`.
6. Validate, then cut over (DB secret/endpoint → restored writer; if region loss, also fail DNS/ALB over to
   the DR region).

## Validation (before cutover)

- Row counts / latest `created_at` on a few tenant-scoped tables match the expected target time.
- **RLS is intact:** `SELECT` as the app role returns only the current tenant's rows (the `tenant_isolation`
  policy must survive the restore). Spot-check with two tenant ids.
- A read-only smoke test of the API against the restored DB passes.
- No PII appears in restore logs/tickets (golden rule 1).

## After recovery

1. Re-enable writes / scale the app back up; confirm health checks green.
2. Take a fresh on-demand backup of the restored cluster.
3. Record actual **RPO** (target time − newest recovered write) and **RTO** (incident start → cutover);
   if either missed target, file a follow-up to tune schedule/instance sizing.
4. Write the post-incident review; link the recovery-point/restore-job ARNs.

## Drill cadence

Exercise **Path B from the DR region** at least quarterly into an isolated VPC (never over the live writer),
measure RPO/RTO, and update this runbook with any drift.
