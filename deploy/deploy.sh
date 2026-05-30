#!/usr/bin/env bash
# ── Deploy del frontend a S3 + invalidación de CloudFront ──────────────────────
# Uso: ./deploy/deploy.sh
# Requiere infra ya creada (corré setup-infra.sh una vez) y permisos S3+CloudFront.
set -euo pipefail

cd "$(dirname "$0")"
source ./config.sh

echo "🪼 Deployando Hidromedusa → s3://${SITE_BUCKET}"
echo "   Carpeta: ${PUBLIC_DIR}"

# 1) Sync de archivos. Cache largo para assets, corto para HTML (siempre fresco).
echo "→ Subiendo assets (cache largo)..."
aws s3 sync "${PUBLIC_DIR}" "s3://${SITE_BUCKET}" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "*.html" \
  --cache-control "public,max-age=31536000,immutable"

echo "→ Subiendo HTML (sin cache)..."
aws s3 sync "${PUBLIC_DIR}" "s3://${SITE_BUCKET}" \
  --region "${AWS_REGION}" \
  --exclude "*" --include "*.html" \
  --cache-control "public,max-age=0,must-revalidate" \
  --content-type "text/html; charset=utf-8"

# 2) Invalidar CloudFront para que los cambios se vean ya
if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID}" ]]; then
  echo "→ Invalidando CloudFront (${CLOUDFRONT_DISTRIBUTION_ID})..."
  aws cloudfront create-invalidation \
    --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
    --paths "/*" \
    --query "Invalidation.Id" --output text
else
  echo "⚠️  CLOUDFRONT_DISTRIBUTION_ID no seteado — salteo invalidación."
  echo "   Exportalo en config.sh tras correr setup-infra.sh"
fi

echo ""
echo "✅ Deploy completo → https://${DOMAIN}"
