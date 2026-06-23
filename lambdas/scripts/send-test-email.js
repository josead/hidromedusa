// One-shot script: send a real confirmation email via SES.
// Run from lambdas/: node scripts/send-test-email.js
//
// Needs: AWS credentials in env (already configured via aws-cli).

process.env.SES_ENABLED  = '1';
process.env.SES_FROM     = 'Hidromedusa <entrada@hidromedusa.com>';
process.env.SES_REGION   = 'sa-east-1';
process.env.AWS_REGION   = 'sa-east-1';
process.env.API_BASE      = 'https://p2vsvdihylfl6w4c6pfnnuwd4u0dwcvw.lambda-url.sa-east-1.on.aws';

const email = require('../lib/email');

const TO    = 'chamot11@gmail.com';
const NAME  = 'Jose';
const CLAIM = 'bioluz-cosmico';   // <-- change to any real claim if you have one

async function main() {
  console.log(`Sending confirmation email to ${TO} for claim "${CLAIM}" ...`);
  const result = await email.sendTicketConfirmation({ to: TO, name: NAME, claim: CLAIM });
  if (result.sent) {
    console.log('✓ Sent! MessageId:', result.messageId);
  } else {
    console.log('✗ Skipped/failed:', result.reason || result.error);
  }
}

main().catch(console.error);
