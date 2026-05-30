#!/usr/bin/env bash
# ── Configuración del deploy de Hidromedusa ────────────────────────────────────
# Editá estos valores según tu cuenta AWS.

export DOMAIN="hidromedusa.com"
export DOMAIN_WWW="www.hidromedusa.com"

# Bucket S3 que sirve el sitio estático (debe coincidir con el dominio)
export SITE_BUCKET="hidromedusa.com"

# Región del bucket (São Paulo está cerca de AR; CloudFront es global igual)
export AWS_REGION="sa-east-1"

# ACM: el certificado para CloudFront SIEMPRE debe estar en us-east-1
export ACM_REGION="us-east-1"

# Carpeta que se sube (output del frontend)
export PUBLIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../public" && pwd)"

# Se completan automáticamente tras crear la infra (setup-infra.sh los imprime)
export CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
export ACM_CERT_ARN="${ACM_CERT_ARN:-}"
export HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-}"
