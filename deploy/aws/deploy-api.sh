#!/usr/bin/env bash
# ── Deploy del backend Hidromedusa a AWS (Lambda + Function URL + DynamoDB) ─────
# Lo más barato: 1 Lambda con Function URL (sin API Gateway) + DynamoDB on-demand.
# Idempotente: se puede re-correr. Requiere: AWSLambda_FullAccess + IAMFullAccess.
set -euo pipefail

REGION="${AWS_REGION:-sa-east-1}"
PREFIX="hm_"
ROLE="hidromedusa-api-role"
FN="hidromedusa-api"
RUNTIME="nodejs20.x"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"        # repo root
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
USER_NAME="$(aws iam get-user --query 'User.UserName' --output text)"

DDB_RES="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${PREFIX}*"
DDB_IDX="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${PREFIX}*/index/*"

echo "🪼 Deploy API Hidromedusa → región ${REGION}, cuenta ${ACCOUNT}, user ${USER_NAME}"
echo "────────────────────────────────────────────"

# ── 0) Permitir al user CLI gestionar tablas hm_* (usa IAMFullAccess) ───────────
echo "→ [0/6] Policy DynamoDB (deploy) en el user ${USER_NAME}"
aws iam put-user-policy --user-name "${USER_NAME}" --policy-name hm-dynamodb-deploy \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"dynamodb:ListTables\",\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":\"dynamodb:*\",\"Resource\":[\"${DDB_RES}\",\"${DDB_IDX}\"]}]}"
sleep 8   # propagación IAM

# ── 1) Tablas DynamoDB on-demand ───────────────────────────────────────────────
create_table () {
  local name="$1"; shift
  if aws dynamodb describe-table --region "${REGION}" --table-name "${name}" >/dev/null 2>&1; then
    echo "   ${name}: ya existe"
  else
    aws dynamodb create-table --region "${REGION}" --table-name "${name}" \
      --billing-mode PAY_PER_REQUEST "$@" >/dev/null
    echo "   ${name}: creada"
  fi
}
echo "→ [1/6] Tablas DynamoDB"
create_table "${PREFIX}tickets" \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=claimNorm,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes "[{\"IndexName\":\"claimNorm-index\",\"KeySchema\":[{\"AttributeName\":\"claimNorm\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}]"
create_table "${PREFIX}newsletter" \
  --attribute-definitions AttributeName=email,AttributeType=S \
  --key-schema AttributeName=email,KeyType=HASH
echo "   esperando ACTIVE…"
aws dynamodb wait table-exists --region "${REGION}" --table-name "${PREFIX}tickets"
aws dynamodb wait table-exists --region "${REGION}" --table-name "${PREFIX}newsletter"

# ── 2) Rol de ejecución del Lambda ─────────────────────────────────────────────
echo "→ [2/6] Rol de ejecución ${ROLE}"
if ! aws iam get-role --role-name "${ROLE}" >/dev/null 2>&1; then
  aws iam create-role --role-name "${ROLE}" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  echo "   creado"
else
  echo "   ya existe"
fi
aws iam attach-role-policy --role-name "${ROLE}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "${ROLE}" --policy-name hm-dynamodb \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\",\"dynamodb:Query\",\"dynamodb:Scan\"],\"Resource\":[\"${DDB_RES}\",\"${DDB_IDX}\"]}]}"
ROLE_ARN="$(aws iam get-role --role-name "${ROLE}" --query 'Role.Arn' --output text)"
sleep 8   # propagación del rol antes de crear la función

# ── 3) Empaquetar el código (SDK v3 lo da el runtime) ──────────────────────────
echo "→ [3/6] Zip del código"
ZIP="/tmp/hm-api.zip"; rm -f "${ZIP}"
( cd "${HERE}/lambdas" && zip -qr "${ZIP}" aws-handler.js tickets newsletter lib jellyfish )
echo "   $(du -h "${ZIP}" | cut -f1) → ${ZIP}"

# ── 4) Crear/actualizar la función ─────────────────────────────────────────────
# Preserve existing STAFF_TOKEN on redeploy so the staff panel doesn't break.
if [ -z "${STAFF_TOKEN:-}" ]; then
  STAFF_TOKEN="$(aws lambda get-function-configuration --region "${REGION}" --function-name "${FN}" \
    --query 'Environment.Variables.STAFF_TOKEN' --output text 2>/dev/null || true)"
  [ -z "${STAFF_TOKEN}" ] || [ "${STAFF_TOKEN}" = "None" ] && STAFF_TOKEN="$(openssl rand -hex 12)"
fi
# JSON format handles special chars in SES_FROM (spaces, angle brackets).
ENVVARS="$(python3 -c "
import json, sys
print(json.dumps({'Variables': {
  'DDB_TABLE_PREFIX': '${PREFIX}',
  'STAFF_TOKEN':      '${STAFF_TOKEN}',
  'SES_ENABLED':      '1',
  'SES_FROM':         'Hidromedusa <entrada@hidromedusa.com>',
  'SES_REGION':       '${REGION}',
  'API_BASE':         'https://p2vsvdihylfl6w4c6pfnnuwd4u0dwcvw.lambda-url.sa-east-1.on.aws',
}}))")"
echo "→ [4/6] Función Lambda ${FN}"
if aws lambda get-function --region "${REGION}" --function-name "${FN}" >/dev/null 2>&1; then
  aws lambda update-function-code --region "${REGION}" --function-name "${FN}" --zip-file "fileb://${ZIP}" >/dev/null
  aws lambda wait function-updated --region "${REGION}" --function-name "${FN}"
  aws lambda update-function-configuration --region "${REGION}" --function-name "${FN}" \
    --environment "${ENVVARS}" --timeout 15 --memory-size 256 --runtime "${RUNTIME}" --handler aws-handler.handler >/dev/null
  echo "   actualizada"
else
  # reintentos por propagación del rol
  for i in 1 2 3 4 5; do
    if aws lambda create-function --region "${REGION}" --function-name "${FN}" \
      --runtime "${RUNTIME}" --handler aws-handler.handler --role "${ROLE_ARN}" \
      --zip-file "fileb://${ZIP}" --timeout 15 --memory-size 256 --environment "${ENVVARS}" >/dev/null 2>/tmp/hm-lambda-err; then
      echo "   creada"; break
    fi
    echo "   intento ${i} falló (rol propagando), reintentando…"; sleep 7
  done
fi
aws lambda wait function-active-v2 --region "${REGION}" --function-name "${FN}" 2>/dev/null || true

# ── 5) Function URL (público, con CORS) ────────────────────────────────────────
echo "→ [5/6] Function URL + permiso público"
aws lambda add-permission --region "${REGION}" --function-name "${FN}" \
  --statement-id FunctionURLPublic --action lambda:InvokeFunctionUrl \
  --principal '*' --function-url-auth-type NONE >/dev/null 2>&1 || true
CORS_CFG='{"AllowOrigins":["http://jose.dominguezantoniani.com","https://jose.dominguezantoniani.com","https://hidromedusa.com","https://www.hidromedusa.com"],"AllowMethods":["GET","POST"],"AllowHeaders":["content-type","authorization"],"MaxAge":86400}'
if aws lambda get-function-url-config --region "${REGION}" --function-name "${FN}" >/dev/null 2>&1; then
  aws lambda update-function-url-config --region "${REGION}" --function-name "${FN}" \
    --auth-type NONE --cors "${CORS_CFG}" >/dev/null
else
  aws lambda create-function-url-config --region "${REGION}" --function-name "${FN}" \
    --auth-type NONE --cors "${CORS_CFG}" >/dev/null
fi
URL="$(aws lambda get-function-url-config --region "${REGION}" --function-name "${FN}" --query 'FunctionUrl' --output text)"

# ── 6) Listo ───────────────────────────────────────────────────────────────────
echo "→ [6/6] OK"
echo "────────────────────────────────────────────"
echo "API_BASE   : ${URL%/}"
echo "STAFF_TOKEN: ${STAFF_TOKEN}"
echo "(guardá el STAFF_TOKEN — lo necesita el panel staff para emitir/liberar entradas)"
