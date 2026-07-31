-- Drop the legacy remote ServerAgent / Server Status system.
-- Proxmox (/pve) replaces the server-monitoring UI, and the Pi agent
-- system (chat + scheduled tasks) replaces remote agent execution.
--
-- The `server_agents` table is dropped entirely. The `run_on_agent` and
-- `agent_hostname` columns are removed from `macros` because the runner
-- no longer dispatches commands to remote hosts; macros always run
-- locally now.

-- Safety: a schedule attached to a macro that was flagged to run on a
-- remote agent must NOT silently start executing locally once the flag
-- is gone. Disable those schedules BEFORE dropping the column so a
-- legacy "remote" schedule can never fire against the local runner.
UPDATE "schedules"
SET "enabled" = 0
WHERE "macro_id" IN (SELECT "id" FROM "macros" WHERE "run_on_agent" = 1);

-- `IF EXISTS` keeps this migration idempotent with the operator cleanup
-- script (scripts/util/remove-legacy-agents.ts): if the script already
-- dropped the table on an un-migrated database, this still applies.
DROP TABLE IF EXISTS "server_agents";

ALTER TABLE "macros" DROP COLUMN "run_on_agent";
ALTER TABLE "macros" DROP COLUMN "agent_hostname";
