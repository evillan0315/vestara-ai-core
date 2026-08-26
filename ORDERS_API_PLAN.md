# Orders API Improvement Plan

## Current State Analysis

The Orders API (`apps/api/src/routes/orders.ts`) currently provides:
- **GET /api/orders** - List orders with `customerId` and `status` filters
- **GET /api/orders/stats** - Order statistics
- **GET /api/orders/:id** - Get single order
- **POST /api/orders** - Create order (editor role)
- **PATCH /api/orders/:id** - Update status or payment status (editor role)
- **DELETE /api/orders/:id** - Cancel order (admin role)

Backed by `OrderService` in `packages/workspace/src/order-service.ts` with SQLite storage.

---

## Phase 1: Core API Enhancements (High Priority)

### 1.1 PUT /api/orders/:id - Full Order Update
- Allow updating customer info, addresses, notes, metadata, priority
- Validate immutable fields (id, createdAt, items, financial totals)
- Require editor role
- Emit `order:updated` event

### 1.2 Order Item Management
- **POST /api/orders/:id/items** - Add item to order (recalculates totals)
- **PATCH /api/orders/:id/items/:itemId** - Update item quantity/price
- **DELETE /api/orders/:id/items/:itemId** - Remove item from order
- Only allowed for orders in `pending` or `confirmed` status
- Recalculate subtotal, tax, shipping, total on changes

### 1.3 Pagination & Sorting
- Add `page`, `limit`, `sortBy`, `sortOrder` query params to GET /api/orders
- Default: page=1, limit=20, sortBy=createdAt, sortOrder=desc
- Return pagination metadata: total, page, limit, totalPages

### 1.4 Advanced Filtering
- Date range: `createdAfter`, `createdBefore`
- Payment status filter: `paymentStatus`
- Priority filter: `priority`
- Amount range: `minTotal`, `maxTotal`

---

## Phase 2: Business Logic & Workflows (High Priority)

### 2.1 Refund Workflow
- **POST /api/orders/:id/refund** - Initiate refund
  - Body: `{ amount?: number, reason: string, items?: string[] }`
  - Validates: order delivered, payment paid, amount <= paid amount
  - Updates paymentStatus to `refunded` or `partially_refunded`
  - Creates refund record (new table)

### 2.2 Shipping/Tracking Integration
- **PATCH /api/orders/:id/shipping** - Update shipping info
  - Body: `{ trackingNumber: string, carrier: string, trackingUrl?: string }`
  - Auto-transition status to `shipped` if not already
  - Sets `shippedAt` timestamp

### 2.3 Order Notes & Metadata
- **PATCH /api/orders/:id/notes** - Update internal notes
- **PATCH /api/orders/:id/metadata** - Merge metadata (preserve existing keys)
- Both require editor role, emit audit log

### 2.4 Bulk Operations
- **POST /api/orders/bulk/status** - Bulk status update
- **POST /api/orders/bulk/cancel** - Bulk cancel (admin only)
- Body: `{ orderIds: string[], status: OrderStatus }`
- Transactional: all succeed or all fail

---

## Phase 3: Validation & Error Handling (Medium Priority)

### 3.1 Input Validation
- Add Zod schemas for all request bodies
- Validate: email format, required fields, enum values, numeric ranges
- Return 400 with detailed validation errors

### 3.2 Enhanced Error Responses
- Standardized error format: `{ error: { code, message, details? } }`
- Specific error codes: `ORDER_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `INSUFFICIENT_INVENTORY`, etc.
- 409 Conflict for concurrent modification (optimistic locking via version field)

### 3.3 Optimistic Locking
- Add `version` field to Order type
- Include `If-Match` header on PATCH/PUT/DELETE
- Return 412 Precondition Failed on version mismatch

---

## Phase 4: Real-time & Events (Medium Priority)

### 4.1 WebSocket Events
- Emit events via existing event bus for:
  - `order:created`, `order:updated`, `order:status_changed`, `order:payment_changed`, `order:cancelled`, `order:refunded`
- WebSocket subscription endpoint: `GET /api/orders/events` (Server-Sent Events or WS)

### 4.2 Event Payload Standards
- Consistent payload structure with correlation IDs
- Include previous/new state for changes

---

## Phase 5: Documentation & Testing (Medium Priority)

### 5.1 OpenAPI/Swagger Spec
- Generate OpenAPI 3.1 spec for all order endpoints
- Include schemas, examples, error responses
- Integrate with existing docs generation

### 5.2 Test Coverage Expansion
- Unit tests for validation schemas
- Integration tests for all new endpoints
- Edge cases: concurrent updates, invalid transitions, large orders
- Load tests for bulk operations

### 5.3 Contract Tests
- Add to `@vestara/opencode-runtime` contract generation
- Verify API compatibility

---

## Phase 6: Performance & Scalability (Low Priority)

### 6.1 Database Indexes
- Composite indexes for common query patterns
- Index on (customer_id, status, created_at)
- Index on (status, payment_status)

### 6.2 Caching
- Cache order stats with TTL
- Invalidate on order changes

### 6.3 Archival Strategy
- Soft delete vs hard delete
- Archive old orders to separate table

---

## Implementation Order

| Priority | Task | Estimated Effort |
|----------|------|------------------|
| 1 | PUT /api/orders/:id (full update) | 2 days |
| 2 | Order item management (CRUD) | 3 days |
| 3 | Pagination & sorting | 1 day |
| 4 | Advanced filtering | 1 day |
| 5 | Refund workflow | 3 days |
| 6 | Shipping/tracking updates | 2 days |
| 7 | Notes & metadata endpoints | 1 day |
| 8 | Bulk operations | 2 days |
| 9 | Input validation (Zod) | 2 days |
| 10 | Optimistic locking | 2 days |
| 11 | WebSocket/SSE events | 2 days |
| 12 | OpenAPI documentation | 1 day |
| 13 | Expanded test coverage | 3 days |

**Total: ~25 days**

---

## Dependencies

- `packages/workspace/src/order-service.ts` - Service layer changes
- `packages/workspace/src/order-storage.ts` - Storage layer changes
- `packages/workspace/src/order-types.ts` - Type definitions
- `apps/api/src/routes/orders.ts` - Route handlers
- `apps/api/__tests__/orders-routes.test.ts` - Tests
- `@vestara/opencode-runtime` - Contract generation

---

## Acceptance Criteria

1. All new endpoints return proper HTTP status codes
2. Validation rejects invalid input with 400 and clear messages
3. Status transitions follow valid state machine
4. Financial calculations are accurate (subtotal, tax, shipping, total)
5. Audit logs capture all mutations
6. Events emitted for all state changes
7. Tests pass with >90% coverage on new code
8. OpenAPI spec validates against implementation
9. No regression in existing functionality