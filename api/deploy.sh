#!/usr/bin/env bash
# RETIRED / QUARANTINED: this legacy bootstrap mixed resource creation, login,
# configuration edits, secret instructions, and deployment in one unsafe command.

echo "api/deploy.sh is disabled." >&2
echo "Use ../scripts/deploy-and-smoke-worker.sh for smoke-only checks." >&2
echo "A real release additionally requires its explicit --deploy mode and all gates." >&2
exit 64
