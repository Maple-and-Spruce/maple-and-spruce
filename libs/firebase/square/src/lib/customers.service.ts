/**
 * Square Customers API service
 *
 * Email-first customer upsert. Square customers are not strictly deduplicated,
 * so we look up by exact email before creating to avoid duplicate profiles when
 * the same person subscribes, is invoiced, or registers.
 *
 * @see https://developer.squareup.com/docs/customers-api/what-it-does
 */
import { SquareClient, Square } from 'square';

export interface UpsertCustomerInput {
  email: string;
  name?: string;
  phone?: string;
}

/** Slim projection of a Square customer used by read-only callers. */
export interface SquareCustomer {
  emailAddress?: string;
  givenName?: string;
  familyName?: string;
}

export class CustomersService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Fetch a Square customer by id. Returns null if the customer can't be
   * found (missing id, or an error/empty response) so callers can treat an
   * absent buyer the same way as a POS sale rung up with no customer attached.
   */
  async get(customerId: string): Promise<SquareCustomer | null> {
    const response = await this.client.customers.get({ customerId });

    const customer = response.customer;
    if (!customer) {
      return null;
    }

    return {
      emailAddress: customer.emailAddress ?? undefined,
      givenName: customer.givenName ?? undefined,
      familyName: customer.familyName ?? undefined,
    };
  }

  /** Find a Square customer by exact email, or create one. Returns the ID. */
  async upsertByEmail(input: UpsertCustomerInput): Promise<string> {
    const searchResponse = await this.client.customers.search({
      query: {
        filter: { emailAddress: { exact: input.email } },
      },
    });

    const existingId = searchResponse.customers?.[0]?.id;
    if (existingId) {
      return existingId;
    }

    const [givenName, ...familyNameParts] = (input.name ?? '').split(' ');
    const familyName = familyNameParts.join(' ') || undefined;

    const createResponse = await this.client.customers.create({
      idempotencyKey: `craftclub-customer-${input.email}`,
      givenName: givenName || input.email,
      familyName,
      emailAddress: input.email,
      phoneNumber: input.phone,
    });

    throwIfErrors(createResponse.errors, 'create customer');

    const newId = createResponse.customer?.id;
    if (!newId) {
      throw new Error('Square customer create returned no id');
    }
    return newId;
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
