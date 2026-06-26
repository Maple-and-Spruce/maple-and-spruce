// Square utility and constants
export {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
  type SquareSecrets,
  type SquareStrings,
} from './lib/square.utility';

// Catalog service
export {
  CatalogService,
  type CatalogVariationInput,
  type CreateCatalogItemInput,
  type CreateCatalogItemResult,
  type UpdateCatalogItemInput,
  type UpdateCatalogItemResult,
  type UpdateCatalogVariationInput,
  type UploadCatalogImageInput,
  type UploadCatalogImageResult,
} from './lib/catalog.service';

// Inventory service
export {
  InventoryService,
  type SetInventoryInput,
  type AdjustInventoryInput,
  type InventoryCountResult,
} from './lib/inventory.service';

// Orders service
export {
  OrdersService,
  type CreateOrderInput,
  type CreateOrderResult,
  type OrderLineItemInput,
  type OrderTaxInput,
  type OrderDiscountInput,
} from './lib/orders.service';

// Payments service
export {
  PaymentsService,
  PaymentError,
  getPaymentErrorMessage,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type RefundPaymentInput,
  type RefundPaymentResult,
  type GetPaymentResult,
} from './lib/payments.service';

// Invoices service
export {
  InvoicesService,
  type SendInvoiceInput,
  type SendInvoiceResult,
  type InvoiceCustomerInput,
  type InvoiceLineItemInput,
} from './lib/invoices.service';

// Cards service (cards on file for subscription billing)
export {
  CardsService,
  type CreateCardOnFileInput,
  type CreateCardOnFileResult,
} from './lib/cards.service';

// Subscriptions service (recurring Craft Club billing)
export {
  SubscriptionsService,
  type CreateSubscriptionInput,
  type CreateSubscriptionResult,
  type CancelSubscriptionResult,
} from './lib/subscriptions.service';

// Customers service (email-first upsert)
export {
  CustomersService,
  type UpsertCustomerInput,
} from './lib/customers.service';
