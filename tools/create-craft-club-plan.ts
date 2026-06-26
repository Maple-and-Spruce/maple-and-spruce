/**
 * One-time setup: create the Craft Club Catalog subscription plan in Square.
 *
 * The Craft Club is a flat $30.00/month membership billed through the Square
 * Subscriptions API. A subscription enrolls a customer's card on file in a
 * Catalog SUBSCRIPTION_PLAN_VARIATION; this script creates that plan + monthly
 * variation and prints the variation ID.
 *
 * Run it once per environment, then paste the printed variation ID into the
 * matching `.env` as `CRAFT_CLUB_PLAN_VARIATION_ID`:
 *   - sandbox → .env.dev
 *   - production → .env.prod
 *
 * Credentials:
 *   - Square: SQUARE_ACCESS_TOKEN env var (sandbox token for dev, production
 *     token for --prod). From Square Developer Dashboard → Applications.
 *
 * Usage:
 *   export SQUARE_ACCESS_TOKEN=EAAA...                      # sandbox or prod
 *   npx tsx tools/create-craft-club-plan.ts                 # sandbox
 *   npx tsx tools/create-craft-club-plan.ts --prod          # production
 */

import { randomUUID } from 'node:crypto';
import { SquareClient, SquareEnvironment } from 'square';

/** Flat monthly Craft Club price, in cents ($30.00). Mirrors CRAFT_CLUB_MONTHLY_PRICE_CENTS. */
const MONTHLY_PRICE_CENTS = 3000;

const isProd = process.argv.includes('--prod');

const accessToken = process.env['SQUARE_ACCESS_TOKEN'];
if (!accessToken) {
  console.error(
    'SQUARE_ACCESS_TOKEN env var is required. Grab one from the Square Developer Dashboard.'
  );
  process.exit(1);
}

const client = new SquareClient({
  token: accessToken,
  environment: isProd
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

const PLAN_TEMP_ID = '#craft-club-plan';
const VARIATION_TEMP_ID = '#craft-club-monthly';

async function main(): Promise<void> {
  console.log(
    `Creating Craft Club subscription plan ($${(
      MONTHLY_PRICE_CENTS / 100
    ).toFixed(2)}/month) in ${isProd ? 'PRODUCTION' : 'SANDBOX'}…`
  );

  const response = await client.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: {
      type: 'SUBSCRIPTION_PLAN',
      id: PLAN_TEMP_ID,
      subscriptionPlanData: {
        name: 'Craft Club Membership',
        subscriptionPlanVariations: [
          {
            type: 'SUBSCRIPTION_PLAN_VARIATION',
            id: VARIATION_TEMP_ID,
            subscriptionPlanVariationData: {
              name: 'Monthly',
              phases: [
                {
                  cadence: 'MONTHLY',
                  pricing: {
                    type: 'STATIC',
                    priceMoney: {
                      amount: BigInt(MONTHLY_PRICE_CENTS),
                      currency: 'USD',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  if (response.errors && response.errors.length > 0) {
    console.error('Square returned errors:');
    for (const e of response.errors) {
      console.error(`  ${e.category}/${e.code}: ${e.detail}`);
    }
    process.exit(1);
  }

  // The variation's real ID comes back via idMappings (temp → real).
  const variationMapping = response.idMappings?.find(
    (m) => m.clientObjectId === VARIATION_TEMP_ID
  );
  const planMapping = response.idMappings?.find(
    (m) => m.clientObjectId === PLAN_TEMP_ID
  );

  const variationId = variationMapping?.objectId;
  if (!variationId) {
    console.error(
      'Could not resolve the subscription plan variation ID from the response.'
    );
    console.error(JSON.stringify(response.idMappings, null, 2));
    process.exit(1);
  }

  console.log('');
  console.log('✓ Craft Club subscription plan created.');
  console.log(`  Plan ID:      ${planMapping?.objectId ?? '(unknown)'}`);
  console.log(`  Variation ID: ${variationId}`);
  console.log('');
  console.log('Next: paste this line into the matching .env file');
  console.log(`(${isProd ? '.env.prod' : '.env.dev'}):`);
  console.log('');
  console.log(`  CRAFT_CLUB_PLAN_VARIATION_ID=${variationId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
