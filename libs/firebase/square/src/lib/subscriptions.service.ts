/**
 * Square Subscriptions API service
 *
 * Recurring billing for the Craft Club membership. Square owns the billing
 * cycle, retries, and dunning; we react to subscription/invoice webhooks to
 * mirror state. A subscription charges a card on file (see {@link CardsService})
 * against a Catalog subscription plan variation.
 *
 * @see https://developer.squareup.com/docs/subscriptions-api/overview
 */
import { SquareClient, Square } from 'square';

export interface CreateSubscriptionInput {
  /** Catalog subscription plan variation to enroll in (the $30/mo plan). */
  planVariationId: string;
  /** Square customer to bill. */
  customerId: string;
  /** Card on file to charge. */
  cardId: string;
  /** Location the subscription belongs to. */
  locationId: string;
  /** Idempotency key — repeated calls with the same key are de-duped. */
  idempotencyKey: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  status?: string;
  /** `YYYY-MM-DD` end of the current paid period, when Square provides it. */
  chargedThroughDate?: string;
}

export interface CancelSubscriptionResult {
  status?: string;
  /** `YYYY-MM-DD` date the subscription is scheduled to stop billing. */
  canceledDate?: string;
}

export class SubscriptionsService {
  constructor(private readonly client: SquareClient) {}

  /** Enroll a customer's card on file in a subscription plan variation. */
  async create(
    input: CreateSubscriptionInput
  ): Promise<CreateSubscriptionResult> {
    const response = await this.client.subscriptions.create({
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      planVariationId: input.planVariationId,
      customerId: input.customerId,
      cardId: input.cardId,
    });

    throwIfErrors(response.errors, 'create subscription');

    const subscription = response.subscription;
    if (!subscription?.id) {
      throw new Error('Square subscription create returned no id');
    }

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      chargedThroughDate: subscription.chargedThroughDate,
    };
  }

  /**
   * Cancel at the end of the current billing period (Square stops billing on
   * the period boundary rather than immediately).
   */
  async cancel(subscriptionId: string): Promise<CancelSubscriptionResult> {
    const response = await this.client.subscriptions.cancel({
      subscriptionId,
    });

    throwIfErrors(response.errors, 'cancel subscription');

    return {
      status: response.subscription?.status,
      canceledDate: response.subscription?.canceledDate ?? undefined,
    };
  }

  /** Pause billing (admin action). Square stops charging until resumed. */
  async pause(subscriptionId: string): Promise<{ status?: string }> {
    const response = await this.client.subscriptions.pause({ subscriptionId });
    throwIfErrors(response.errors, 'pause subscription');
    return { status: response.subscription?.status };
  }

  /** Resume a paused subscription (admin action). */
  async resume(subscriptionId: string): Promise<{ status?: string }> {
    const response = await this.client.subscriptions.resume({
      subscriptionId,
    });
    throwIfErrors(response.errors, 'resume subscription');
    return { status: response.subscription?.status };
  }

  /** Swap the card a subscription charges (used by self-service payment change). */
  async updateCard(subscriptionId: string, cardId: string): Promise<void> {
    const response = await this.client.subscriptions.update({
      subscriptionId,
      subscription: { cardId },
    });

    throwIfErrors(response.errors, 'update subscription');
  }

  /** Fetch the current state of a subscription. */
  async get(subscriptionId: string): Promise<Square.Subscription | undefined> {
    const response = await this.client.subscriptions.get({ subscriptionId });
    throwIfErrors(response.errors, 'get subscription');
    return response.subscription;
  }
}

function throwIfErrors(
  errors: Square.Error_[] | undefined,
  operation: string
): void {
  if (!errors || errors.length === 0) return;
  const msg = errors
    .map((e) => e.detail || e.code || 'Unknown error')
    .join('; ');
  throw new Error(`Square ${operation} error: ${msg}`);
}
