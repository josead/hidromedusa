#!/usr/bin/env bash
# ── Setup ONE-TIME de la infra de hosting estático ─────────────────────────────
# Crea: bucket S3 privado + OAC + CloudFront + cert ACM + records Route53.
# Requiere permisos: s3, cloudfront, acm, route53.
# Uso: ./deploy/setup-infra.sh
set -euo pipefail

cd "$(dirname "$0")"
source ./config.sh

echo "🪼 Setup de infra para ${DOMAIN}"
echo "──────────────────────────────────────────"

# ── 1) Bucket S3 (privado; CloudFront accede via OAC) ──────────────────────────
echo "→ [1/6] Bucket S3: ${SITE_BUCKET}"
if aws s3api head-bucket --bucket "${SITE_BUCKET}" 2>/dev/null; then
  echo "   Ya existe."
else
  aws s3api create-bucket \
    --bucket "${SITE_BUCKET}" \
    --region "${AWS_REGION}" \
    --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  echo "   Creado."
fi
aws s3api put-public-access-block --bucket "${SITE_BUCKET}" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# ── 2) Certificado ACM en us-east-1 (obligatorio para CloudFront) ──────────────
echo "→ [2/6] Certificado ACM (us-east-1)"
CERT_ARN=$(aws acm list-certificates --region "${ACM_REGION}" \
  --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn | [0]" --output text)
if [[ "${CERT_ARN}" == "None" || -z "${CERT_ARN}" ]]; then
  CERT_ARN=$(aws acm request-certificate \
    --region "${ACM_REGION}" \
    --domain-name "${DOMAIN}" \
    --subject-alternative-names "${DOMAIN_WWW}" \
    --validation-method DNS \
    --query CertificateArn --output text)
  echo "   Cert solicitado: ${CERT_ARN}"
  echo "   ⚠️  Validá por DNS. Los records CNAME de validación:"
  sleep 5
  aws acm describe-certificate --region "${ACM_REGION}" --certificate-arn "${CERT_ARN}" \
    --query "Certificate.DomainValidationOptions[].ResourceRecord" --output table
  echo "   → Agregalos a Route53 (o usá el bloque automático de abajo) y re-corré este script."
else
  echo "   Ya existe: ${CERT_ARN}"
fi
export ACM_CERT_ARN="${CERT_ARN}"

# ── 3) Hosted zone Route53 ─────────────────────────────────────────────────────
echo "→ [3/6] Hosted zone Route53 para ${DOMAIN}"
ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "${DOMAIN}" \
  --query "HostedZones[0].Id" --output text 2>/dev/null | sed 's#/hostedzone/##' || echo "")
echo "   Zone ID: ${ZONE_ID:-NO ENCONTRADA}"
export HOSTED_ZONE_ID="${ZONE_ID}"

# ── 4) Origin Access Control (OAC) ─────────────────────────────────────────────
echo "→ [4/6] Origin Access Control"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='hidromedusa-oac'].Id | [0]" --output text 2>/dev/null || echo "None")
if [[ "${OAC_ID}" == "None" || -z "${OAC_ID}" ]]; then
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config \
    "Name=hidromedusa-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query "OriginAccessControl.Id" --output text)
  echo "   Creado: ${OAC_ID}"
else
  echo "   Ya existe: ${OAC_ID}"
fi

# ── 5) Distribución CloudFront ─────────────────────────────────────────────────
echo "→ [5/6] CloudFront distribution"
echo "   (Si el cert todavía no está validado, este paso falla — validá primero.)"
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, '${DOMAIN}')].Id | [0]" \
  --output text 2>/dev/null || echo "None")

if [[ "${DIST_ID}" == "None" || -z "${DIST_ID}" ]]; then
  cat > /tmp/cf-config.json <<EOF
{
  "CallerReference": "hidromedusa-$(date +%s)",
  "Aliases": { "Quantity": 2, "Items": ["${DOMAIN}", "${DOMAIN_WWW}"] },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-${SITE_BUCKET}",
      "DomainName": "${SITE_BUCKET}.s3.${AWS_REGION}.amazonaws.com",
      "OriginAccessControlId": "${OAC_ID}",
      "S3OriginConfig": { "OriginAccessIdentity": "" }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-${SITE_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 404,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 10
    }]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "${ACM_CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Comment": "Hidromedusa static site",
  "Enabled": true
}
EOF
  DIST_ID=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf-config.json \
    --query "Distribution.Id" --output text)
  echo "   Creada: ${DIST_ID}"
else
  echo "   Ya existe: ${DIST_ID}"
fi
export CLOUDFRONT_DISTRIBUTION_ID="${DIST_ID}"

# Bucket policy: solo CloudFront (via OAC) puede leer
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${SITE_BUCKET}/*",
    "Condition": { "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"
    }}
  }]
}
EOF
aws s3api put-bucket-policy --bucket "${SITE_BUCKET}" --policy file:///tmp/bucket-policy.json
echo "   Bucket policy aplicada (solo CloudFront)."

# ── 6) Route53 A/AAAA alias → CloudFront ───────────────────────────────────────
echo "→ [6/6] Route53 alias records"
CF_DOMAIN=$(aws cloudfront get-distribution --id "${DIST_ID}" --query "Distribution.DomainName" --output text)
if [[ -n "${HOSTED_ZONE_ID}" ]]; then
  for NAME in "${DOMAIN}" "${DOMAIN_WWW}"; do
    cat > /tmp/r53.json <<EOF
{ "Changes": [{ "Action": "UPSERT", "ResourceRecordSet": {
  "Name": "${NAME}", "Type": "A",
  "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "${CF_DOMAIN}", "EvaluateTargetHealth": false }
}}]}
EOF
    aws route53 change-resource-record-sets --hosted-zone-id "${HOSTED_ZONE_ID}" --change-batch file:///tmp/r53.json >/dev/null
    echo "   ${NAME} → ${CF_DOMAIN}"
  done
else
  echo "   ⚠️  Sin hosted zone — apuntá ${DOMAIN} a ${CF_DOMAIN} manualmente."
fi

echo ""
echo "════════════════════════════════════════════"
echo "✅ Infra lista. Guardá estos valores en config.sh:"
echo "   export CLOUDFRONT_DISTRIBUTION_ID=\"${DIST_ID}\""
echo "   export ACM_CERT_ARN=\"${ACM_CERT_ARN}\""
echo "   export HOSTED_ZONE_ID=\"${HOSTED_ZONE_ID}\""
echo ""
echo "Después corré:  ./deploy/deploy.sh"
