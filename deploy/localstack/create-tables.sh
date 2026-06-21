#!/usr/bin/env bash
# Idempotent DynamoDB table creation for Hidromedusa (LocalStack or real AWS).
# Re-running is safe: each table is created only if it does not already exist.
#
# Usage:
#   DYNAMODB_ENDPOINT=http://localhost:4566 ./deploy/localstack/create-tables.sh
#   (or just ./create-tables.sh — defaults to localhost:4566)
set -euo pipefail

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="${DDB_TABLE_PREFIX:-hm_}"

# LocalStack ignores credentials but the CLI still requires them to be present.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="$REGION"

aws_ddb() {
  aws --endpoint-url="$ENDPOINT" --region "$REGION" dynamodb "$@"
}

# create_table <table-name> <create-args...>
# Guards with describe-table so the create only runs when absent.
create_table() {
  local name="$1"; shift
  if aws_ddb describe-table --table-name "$name" >/dev/null 2>&1; then
    echo "✓ $name already exists — skipping"
    return 0
  fi
  echo "→ creating $name"
  aws_ddb create-table --table-name "$name" "$@" >/dev/null
  echo "✓ created $name"
}

# hm_tickets — PK id (S), GSI claimNorm-index on claimNorm (S)
create_table "${PREFIX}tickets" \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=claimNorm,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    '[{"IndexName":"claimNorm-index","KeySchema":[{"AttributeName":"claimNorm","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]'

# hm_tasks — PK panelId (S)
create_table "${PREFIX}tasks" \
  --attribute-definitions AttributeName=panelId,AttributeType=S \
  --key-schema AttributeName=panelId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# hm_newsletter — PK email (S)
create_table "${PREFIX}newsletter" \
  --attribute-definitions AttributeName=email,AttributeType=S \
  --key-schema AttributeName=email,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# hm_sessions — PK token (S)
create_table "${PREFIX}sessions" \
  --attribute-definitions AttributeName=token,AttributeType=S \
  --key-schema AttributeName=token,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo "All tables ready (prefix '${PREFIX}', endpoint ${ENDPOINT})."
