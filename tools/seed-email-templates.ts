/**
 * Seed script for email templates used by the Firebase Trigger Email extension.
 *
 * Writes Handlebars templates to the `email-templates` Firestore collection.
 * Each document contains a `subject` and `html` field with Handlebars syntax.
 *
 * Usage:
 *   npx tsx tools/seed-email-templates.ts          # seeds dev project
 *   npx tsx tools/seed-email-templates.ts --prod    # seeds prod project
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');

const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

console.log(`Seeding email templates to project: ${projectId}`);

// Uses Application Default Credentials (run `gcloud auth application-default login` first)
const app = initializeApp({ projectId });
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const styles = `
  body { margin: 0; padding: 0; background-color: #D5D6C8; font-family: Georgia, 'Times New Roman', serif; }
  .wrapper { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
  .header { background-color: #4A3728; padding: 32px 24px; text-align: center; }
  .header h1 { color: #D5D6C8; margin: 0; font-size: 24px; font-weight: normal; letter-spacing: 1px; }
  .content { padding: 32px 24px; color: #7A7A6E; font-size: 16px; line-height: 1.6; }
  .content h2 { color: #4A3728; font-size: 20px; margin-top: 0; }
  .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
  .detail-table td { padding: 8px 0; vertical-align: top; color: #7A7A6E; }
  .detail-table .label { font-weight: bold; color: #4A3728; width: 160px; }
  .highlight-box { background-color: #f5f5f0; border-left: 4px solid #6B7B5E; padding: 16px; margin: 24px 0; }
  .footer { background-color: #f5f5f0; padding: 24px; text-align: center; color: #7A7A6E; font-size: 14px; line-height: 1.5; }
  .footer a { color: #6B7B5E; }
  @media only screen and (max-width: 620px) {
    .wrapper { width: 100% !important; }
    .content { padding: 24px 16px !important; }
    .header { padding: 24px 16px !important; }
  }
`;

// ---------------------------------------------------------------------------
// Template: registration-confirmation
// ---------------------------------------------------------------------------

const registrationConfirmationSubject =
  'Your registration for {{className}} is confirmed!';

const registrationConfirmationHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registration Confirmation</title>
<style>${styles}</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Maple &amp; Spruce Folk Arts</h1>
  </div>
  <div class="content">
    <h2>You're registered!</h2>
    <p>Hi {{customerName}},</p>
    <p>Thank you for registering. We're excited to have you join us!</p>

    <table class="detail-table">
      <tr>
        <td class="label">Class</td>
        <td>{{className}}</td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td>{{classDate}}</td>
      </tr>
      <tr>
        <td class="label">Duration</td>
        <td>{{classDuration}}</td>
      </tr>
      <tr>
        <td class="label">Location</td>
        <td>{{classLocation}}</td>
      </tr>
      <tr>
        <td class="label">Subtotal</td>
        <td>{{subtotal}}</td>
      </tr>
      <tr>
        <td class="label">WV Sales Tax ({{taxRate}}%)</td>
        <td>{{taxAmount}}</td>
      </tr>
      <tr>
        <td class="label">Total Paid</td>
        <td><strong>{{amountPaid}}</strong></td>
      </tr>
      <tr>
        <td class="label">Confirmation #</td>
        <td>{{confirmationNumber}}</td>
      </tr>
    </table>

    {{#if receiptUrl}}
    <p><a href="{{receiptUrl}}" style="color: #6B7B5E; font-weight: bold;">View Payment Receipt</a></p>
    {{/if}}

    {{#if materialsIncluded}}
    <div class="highlight-box">
      <strong style="color: #4A3728;">Materials Included</strong><br>
      {{materialsIncluded}}
    </div>
    {{/if}}

    {{#if whatToBring}}
    <div class="highlight-box">
      <strong style="color: #4A3728;">What to Bring</strong><br>
      {{whatToBring}}
    </div>
    {{/if}}

    <p>If you have any questions, please reach out at
      <a href="mailto:katie@mapleandsprucefolkarts.com" style="color: #6B7B5E;">katie@mapleandsprucefolkarts.com</a>,
      call us at <a href="tel:+13043144506" style="color: #6B7B5E;">304-314-4506</a>,
      or visit our <a href="https://mapleandsprucefolkarts.com/contact" style="color: #6B7B5E;">contact page</a>.</p>

    <p style="font-size: 14px; color: #999;">
      Need to cancel? Please contact us at least 48 hours before the class date.
      Refunds are processed within 5–10 business days.
    </p>
  </div>
  <div class="footer">
    <strong style="color: #4A3728;">Maple &amp; Spruce Folk Arts</strong><br>
    Morgantown, WV<br>
    <a href="mailto:katie@mapleandsprucefolkarts.com">katie@mapleandsprucefolkarts.com</a> | <a href="tel:+13043144506">304-314-4506</a><br>
    <a href="https://mapleandsprucefolkarts.com">mapleandsprucefolkarts.com</a>
  </div>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Template: registration-cancelled
// ---------------------------------------------------------------------------

const registrationCancelledSubject =
  'Your registration for {{className}} has been cancelled';

const registrationCancelledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Registration Cancelled</title>
<style>${styles}</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Maple &amp; Spruce Folk Arts</h1>
  </div>
  <div class="content">
    <h2>Cancellation Confirmed</h2>
    <p>Hi {{customerName}},</p>
    <p>Your registration has been cancelled. Here are the details:</p>

    <table class="detail-table">
      <tr>
        <td class="label">Class</td>
        <td>{{className}}</td>
      </tr>
      <tr>
        <td class="label">Date</td>
        <td>{{classDate}}</td>
      </tr>
      <tr>
        <td class="label">Confirmation #</td>
        <td>{{confirmationNumber}}</td>
      </tr>
    </table>

    <div class="highlight-box">
      <strong style="color: #4A3728;">Refund: {{refundAmount}}</strong><br>
      Your refund has been initiated and will appear on your original payment method within 5–10 business days.
    </div>

    {{#if receiptUrl}}
    <p><a href="{{receiptUrl}}" style="color: #6B7B5E;">View Original Payment Receipt</a></p>
    {{/if}}

    <p>If you have any questions about your refund or would like to register for a future class,
      please reach out at
      <a href="mailto:katie@mapleandsprucefolkarts.com" style="color: #6B7B5E;">katie@mapleandsprucefolkarts.com</a>,
      call us at <a href="tel:+13043144506" style="color: #6B7B5E;">304-314-4506</a>,
      or visit our <a href="https://mapleandsprucefolkarts.com/contact" style="color: #6B7B5E;">contact page</a>.</p>
  </div>
  <div class="footer">
    <strong style="color: #4A3728;">Maple &amp; Spruce Folk Arts</strong><br>
    Morgantown, WV<br>
    <a href="mailto:katie@mapleandsprucefolkarts.com">katie@mapleandsprucefolkarts.com</a> | <a href="tel:+13043144506">304-314-4506</a><br>
    <a href="https://mapleandsprucefolkarts.com">mapleandsprucefolkarts.com</a>
  </div>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Template: agreement-signing-request
// ---------------------------------------------------------------------------

const agreementSigningRequestSubject =
  'Action Required: Please sign your {{templateName}}';

const agreementSigningRequestHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agreement Signing Request</title>
<style>${styles}</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Maple &amp; Spruce Folk Arts</h1>
  </div>
  <div class="content">
    <h2>Please Sign Your Agreement</h2>
    <p>Hi {{signerName}},</p>
    <p>We need you to review and sign the <strong>{{templateName}}</strong> before your visit.</p>

    <div class="highlight-box">
      <strong style="color: #4A3728;">Sign Your Agreement</strong><br>
      <p>Please click the link below to review and sign your agreement. You'll need to provide your signature electronically.</p>
      <p style="text-align: center; margin: 16px 0;">
        <a href="{{signingUrl}}" style="display: inline-block; background-color: #6B7B5E; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-weight: bold;">Review &amp; Sign Agreement</a>
      </p>
    </div>

    <p style="font-size: 14px; color: #999;">
      This link will expire in 30 days. If you have trouble with the link, copy and paste this URL into your browser:<br>
      <a href="{{signingUrl}}" style="color: #6B7B5E; word-break: break-all;">{{signingUrl}}</a>
    </p>

    <p>If you have any questions, please reach out at
      <a href="mailto:katie@mapleandsprucefolkarts.com" style="color: #6B7B5E;">katie@mapleandsprucefolkarts.com</a>,
      call us at <a href="tel:+13043144506" style="color: #6B7B5E;">304-314-4506</a>,
      or visit our <a href="https://mapleandsprucefolkarts.com/contact" style="color: #6B7B5E;">contact page</a>.</p>
  </div>
  <div class="footer">
    <strong style="color: #4A3728;">Maple &amp; Spruce Folk Arts</strong><br>
    Morgantown, WV<br>
    <a href="mailto:katie@mapleandsprucefolkarts.com">katie@mapleandsprucefolkarts.com</a> | <a href="tel:+13043144506">304-314-4506</a><br>
    <a href="https://mapleandsprucefolkarts.com">mapleandsprucefolkarts.com</a>
  </div>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Seed to Firestore
// ---------------------------------------------------------------------------

interface EmailTemplate {
  subject: string;
  html: string;
}

const templates: Record<string, EmailTemplate> = {
  'registration-confirmation': {
    subject: registrationConfirmationSubject,
    html: registrationConfirmationHtml,
  },
  'registration-cancelled': {
    subject: registrationCancelledSubject,
    html: registrationCancelledHtml,
  },
  'agreement-signing-request': {
    subject: agreementSigningRequestSubject,
    html: agreementSigningRequestHtml,
  },
};

async function seed(): Promise<void> {
  const collection = db.collection('email-templates');

  for (const [id, template] of Object.entries(templates)) {
    await collection.doc(id).set(template);
    console.log(`  ✓ ${id}`);
  }

  console.log('\nDone. Templates seeded successfully.');
}

seed().catch((err) => {
  console.error('Failed to seed email templates:', err);
  process.exit(1);
});
