const swaggerJSDoc = require("swagger-jsdoc");

const auth = [{ bearerAuth: [] }];
const id = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];
const productBody = {
  type: "object",
  required: ["name", "description", "price", "category"],
  properties: {
    name: { type: "string", example: "Ruby Gemstone" },
    description: { type: "string", example: "Natural astrology gemstone" },
    price: { type: "number", example: 2500 },
    category: { type: "string", example: "gemstones" },
    imageUrl: { type: "string", example: "https://example.com/ruby.jpg" },
    stock: { type: "integer", example: 10 }
  }
};
const jsonBody = (schema) => ({
  required: true,
  content: { "application/json": { schema } }
});
const response = (description = "Success") => ({ 200: { description } });
const protectedRoute = (operation) => ({ ...operation, security: auth });

module.exports = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Astrology Products E-commerce API",
      version: "1.0.0",
      description: "V1 REST API for the astrology products e-commerce platform."
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      },
      schemas: {
            Product: { type: "object", properties: {
              ...productBody.properties,
              sku: { type: "string", example: "RUBY-001" },
              images: { type: "array", items: { type: "string" } },
              featured: { type: "boolean", example: true }
            } },
        Category: {
          type: "object",
          required: ["name", "slug"],
          properties: {
            name: { type: "string", example: "Gemstones" },
            slug: { type: "string", example: "gemstones" },
            description: { type: "string", example: "Astrology gemstones" }
          }
        },
        Address: {
          type: "object",
          required: ["fullName", "address", "city", "state", "postalCode", "country"],
          properties: {
            fullName: { type: "string", example: "Test Customer" },
            useRegisteredMobile: { type: "boolean", example: true, description: "Use the customer's registered mobile for delivery calls and notifications" },
            mobile: { type: "string", example: "+919876543210", description: "Required only when useRegisteredMobile is false" },
            address: { type: "string", example: "123 Main Street" },
            city: { type: "string", example: "Mumbai" },
            state: { type: "string", example: "Maharashtra" },
            postalCode: { type: "string", example: "400001" },
            country: { type: "string", example: "India" }
          }
        }
      }
    },
    paths: {
      "/": { get: { summary: "API welcome message", responses: response() } },
      "/api/health": { get: { summary: "Health check", responses: response() } },
      "/api/auth/register": {
        post: {
          tags: ["Authentication"],
          summary: "Register customer",
          requestBody: jsonBody({
            type: "object",
            required: ["name", "mobile", "email", "password", "confirmPassword"],
            properties: {
              name: { type: "string", example: "Test Customer" },
              mobile: { type: "string", example: "+919876543210" },
              email: { type: "string", example: "customer@example.com" },
              password: { type: "string", example: "password123" },
              confirmPassword: { type: "string", example: "password123" }
            }
          }),
          responses: { 201: { description: "Registered" }, 409: { description: "Email exists" } }
        }
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "Login customer or admin",
          requestBody: jsonBody({
            type: "object",
            required: ["identifier", "password"],
            properties: {
              identifier: { type: "string", example: "admin@example.com", description: "Registered email address or mobile number" },
              password: { type: "string", example: "admin123" }
            }
          }),
          responses: response("JWT token returned")
        }
      },
      "/api/auth/me": {
        get: protectedRoute({ tags: ["Authentication"], summary: "Get current user", responses: response() }),
        patch: protectedRoute({
          tags: ["Authentication"],
          summary: "Update customer name or mobile number",
          requestBody: jsonBody({
            type: "object",
            properties: {
              name: { type: "string", example: "Sabir" },
              mobile: { type: "string", example: "+919876543210" }
            }
          }),
          responses: response("Profile updated")
        })
      },
      "/api/auth/logout": {
        post: protectedRoute({ tags: ["Authentication"], summary: "Logout current user", responses: response() })
      },
      "/api/auth/forgot-password/request-otp": {
        post: {
          tags: ["Authentication"],
          summary: "Request OTP for forgot password",
          description: "Step 1: Enter email or mobile number to receive a 6-digit verification OTP.",
          requestBody: jsonBody({
            type: "object",
            required: ["identifier"],
            properties: {
              identifier: { type: "string", example: "customer@example.com", description: "Registered email address or 10-digit mobile number" }
            }
          }),
          responses: response("OTP sent to registered contact")
        }
      },
      "/api/auth/forgot-password/verify-otp": {
        post: {
          tags: ["Authentication"],
          summary: "Verify OTP and reset password",
          description: "Step 2: Enter received OTP and new password to update account password.",
          requestBody: jsonBody({
            type: "object",
            required: ["identifier", "otp", "password"],
            properties: {
              identifier: { type: "string", example: "customer@example.com", description: "Registered email address or mobile number" },
              otp: { type: "string", example: "123456", description: "6-digit OTP received via email/SMS" },
              password: { type: "string", example: "NewPassword@123", description: "New password (min 8 characters)" },
              confirmPassword: { type: "string", example: "NewPassword@123", description: "Confirm new password" }
            }
          }),
          responses: response("Password updated successfully")
        }
      },
      "/api/auth/forgot-password": {
        post: {
          tags: ["Authentication"],
          summary: "Request OTP for forgot password (alias)",
          requestBody: jsonBody({
            type: "object",
            required: ["identifier"],
            properties: {
              identifier: { type: "string", example: "customer@example.com" }
            }
          }),
          responses: response("OTP sent to registered contact")
        }
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Authentication"],
          summary: "Reset password using OTP (alias)",
          requestBody: jsonBody({
            type: "object",
            required: ["identifier", "otp", "password"],
            properties: {
              identifier: { type: "string", example: "customer@example.com" },
              otp: { type: "string", example: "123456" },
              password: { type: "string", example: "NewPassword@123" },
              confirmPassword: { type: "string", example: "NewPassword@123" }
            }
          }),
          responses: response("Password updated successfully")
        }
      },
      "/api/auth/change-password": {
        post: protectedRoute({
          tags: ["Authentication"],
          summary: "Change password for logged-in user",
          requestBody: jsonBody({
            type: "object",
            required: ["currentPassword", "newPassword"],
            properties: {
              currentPassword: { type: "string", example: "OldPassword@123" },
              newPassword: { type: "string", example: "NewPassword@123" },
              confirmPassword: { type: "string", example: "NewPassword@123" }
            }
          }),
          responses: response("Password changed successfully")
        })
      },
      "/api/auth/refresh-token": {
        post: protectedRoute({
          tags: ["Authentication"],
          summary: "Refresh JWT access token",
          responses: response("New JWT access token returned")
        })
      },
      "/api/auth/me/preferences": {
        patch: protectedRoute({
          tags: ["Authentication"],
          summary: "Update user notification preferences",
          requestBody: jsonBody({
            type: "object",
            properties: {
              orderEmail: { type: "boolean", example: true },
              orderSms: { type: "boolean", example: true },
              orderWhatsapp: { type: "boolean", example: true },
              marketingEmail: { type: "boolean", example: false },
              marketingSms: { type: "boolean", example: false },
              marketingWhatsapp: { type: "boolean", example: false }
            }
          }),
          responses: response("Preferences updated")
        })
      },
      "/api/categories": {
        get: { tags: ["Categories"], summary: "List categories", responses: response() },
        post: protectedRoute({
          tags: ["Categories"],
          summary: "Create category (admin)",
          requestBody: jsonBody({ $ref: "#/components/schemas/Category" }),
          responses: { 201: { description: "Created" } }
        })
      },
      "/api/categories/{id}": {
        get: {
          tags: ["Categories"],
          summary: "Get category by ID",
          parameters: id,
          responses: response()
        },
        patch: protectedRoute({
          tags: ["Categories"],
          summary: "Update category (admin)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            properties: {
              name: { type: "string", example: "Updated Category Name" },
              slug: { type: "string", example: "updated-category-name" },
              description: { type: "string", example: "Updated description" },
              active: { type: "boolean", example: true }
            }
          }),
          responses: response("Category updated")
        }),
        delete: protectedRoute({
          tags: ["Categories"],
          summary: "Delete or archive category (admin)",
          parameters: [
            ...id,
            {
              name: "hard",
              in: "query",
              required: false,
              schema: { type: "boolean" },
              description: "Set to true for permanent deletion; false archives the category"
            }
          ],
          responses: response("Category deleted/archived")
        })
      },
      "/api/categories/slug/{slug}": {
        get: {
          tags: ["Categories"],
          summary: "Get category by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: response()
        }
      },
      "/api/products": {
        get: {
          tags: ["Products"],
          summary: "List and search products",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" }, description: "Search keyword" },
            { name: "category", in: "query", schema: { type: "string" }, description: "Category name or slug" },
            { name: "minPrice", in: "query", schema: { type: "number" } },
            { name: "maxPrice", in: "query", schema: { type: "number" } },
            { name: "inStock", in: "query", schema: { type: "boolean" } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["popularity", "price_asc", "price_desc", "rating", "newest"] } }
          ],
          responses: response()
        },
        post: protectedRoute({
          tags: ["Products"],
          summary: "Create product (admin)",
          requestBody: jsonBody(productBody),
          responses: { 201: { description: "Created" } }
        })
      },
      "/api/products/featured": {
        get: { tags: ["Products"], summary: "List featured products", responses: response() }
      },
      "/api/products/latest": {
        get: { tags: ["Products"], summary: "List latest products", responses: response() }
      },
      "/api/shipping-settings": {
        get: { tags: ["Shipping"], summary: "Get shipping charges and delivery estimate", responses: response() },
        put: protectedRoute({
          tags: ["Shipping"],
          summary: "Update shipping settings (admin)",
          requestBody: jsonBody({
            type: "object",
            properties: {
              charge: { type: "number", example: 80 },
              freeShippingMinimum: { type: "number", example: 999 },
              estimatedDaysMin: { type: "integer", example: 3 },
              estimatedDaysMax: { type: "integer", example: 7 }
            }
          }),
          responses: response("Shipping settings updated")
        })
      },
      "/api/cart": {
        get: protectedRoute({ tags: ["Cart"], summary: "Get user active cart", responses: response() }),
        delete: protectedRoute({ tags: ["Cart"], summary: "Clear user cart", responses: response("Cart cleared") })
      },
      "/api/cart/items": {
        post: protectedRoute({
          tags: ["Cart"],
          summary: "Add item to cart",
          requestBody: jsonBody({
            type: "object",
            required: ["productId"],
            properties: {
              productId: { type: "string", example: "60c72b2f9b1d8b2bad000001" },
              quantity: { type: "integer", example: 1 }
            }
          }),
          responses: response("Item added to cart")
        })
      },
      "/api/cart/items/{productId}": {
        patch: protectedRoute({
          tags: ["Cart"],
          summary: "Update item quantity in cart",
          parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({
            type: "object",
            required: ["quantity"],
            properties: {
              quantity: { type: "integer", example: 2 }
            }
          }),
          responses: response("Cart updated")
        }),
        delete: protectedRoute({
          tags: ["Cart"],
          summary: "Remove item from cart",
          parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }],
          responses: response("Item removed from cart")
        })
      },
      "/api/products/{id}": {
        get: { tags: ["Products"], summary: "Product details", parameters: id, responses: response() },
        patch: protectedRoute({
          tags: ["Products"],
          summary: "Update product (admin)",
          parameters: id,
          requestBody: jsonBody(productBody),
          responses: response("Updated")
        }),
        delete: protectedRoute({
          tags: ["Products"],
          summary: "Archive product (admin)",
          parameters: id,
          responses: response("Archived")
        })
      },
      "/api/products/{id}/inventory": {
        patch: protectedRoute({
          tags: ["Products"],
          summary: "Set inventory quantity (admin)",
          parameters: id,
          requestBody: jsonBody({ type: "object", required: ["quantity"], properties: { quantity: { type: "integer" } } }),
          responses: response("Inventory updated")
        })
      },
      "/api/products/{id}/inventory/adjust": {
        post: protectedRoute({
          tags: ["Products"],
          summary: "Adjust inventory quantity (admin)",
          parameters: id,
          requestBody: jsonBody({ type: "object", required: ["amount"], properties: { amount: { type: "integer" } } }),
          responses: response("Inventory adjusted")
        })
      },
      "/api/products/slug/{slug}": {
        get: {
          tags: ["Products"],
          summary: "Get product details by URL slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: response()
        }
      },
      "/api/products/{id}/related": {
        get: {
          tags: ["Products"],
          summary: "Get related products in the same category",
          parameters: id,
          responses: response()
        }
      },
      "/api/reviews/product/{productId}": {
        get: {
          tags: ["Reviews"],
          summary: "Get approved reviews for a product",
          parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }],
          responses: response()
        }
      },
      "/api/reviews": {
        post: protectedRoute({
          tags: ["Reviews"],
          summary: "Submit product review",
          requestBody: jsonBody({
            type: "object",
            required: ["product", "rating"],
            properties: {
              product: { type: "string", example: "60c72b2f9b1d8b2bad000001" },
              rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
              comment: { type: "string", example: "Authentic energized gemstone. Felt the positive aura immediately!" }
            }
          }),
          responses: { 201: { description: "Review submitted" } }
        })
      },
      "/api/coupons/apply": {
        post: {
          tags: ["Coupons"],
          summary: "Validate and apply discount coupon to order subtotal",
          requestBody: jsonBody({
            type: "object",
            required: ["code", "subtotal"],
            properties: {
              code: { type: "string", example: "ASTRO10" },
              subtotal: { type: "number", example: 1500 }
            }
          }),
          responses: response("Coupon details and calculated discount returned")
        }
      },
      "/api/coupons": {
        get: { tags: ["Coupons"], summary: "List active promotional coupons", responses: response() },
        post: protectedRoute({
          tags: ["Coupons"],
          summary: "Create coupon (admin)",
          requestBody: jsonBody({
            type: "object",
            required: ["code", "discountType", "discountValue"],
            properties: {
              code: { type: "string", example: "DIWALI20" },
              discountType: { type: "string", enum: ["percentage", "fixed"], example: "percentage" },
              discountValue: { type: "number", example: 20 },
              minimumOrderValue: { type: "number", example: 999 },
              maximumDiscount: { type: "number", example: 500 }
            }
          }),
          responses: { 201: { description: "Coupon created" } }
        })
      },
      "/api/addresses": {
        get: protectedRoute({ tags: ["Addresses"], summary: "List addresses", responses: response() }),
        post: protectedRoute({
          tags: ["Addresses"],
          summary: "Create address",
          requestBody: jsonBody({ $ref: "#/components/schemas/Address" }),
          responses: { 201: { description: "Created" } }
        })
      },
      "/api/addresses/{id}": {
        patch: protectedRoute({ tags: ["Addresses"], summary: "Update address", parameters: id, responses: response() }),
        delete: protectedRoute({ tags: ["Addresses"], summary: "Delete address", parameters: id, responses: response() })
      },
      "/api/orders": {
        get: protectedRoute({ tags: ["Orders"], summary: "List all orders (admin)", responses: response() }),
        post: protectedRoute({
          tags: ["Orders"],
          summary: "Checkout and create order",
          requestBody: jsonBody({
            type: "object",
            required: ["shippingAddress"],
            properties: {
              items: { type: "array", items: { type: "object" } },
              addressId: { type: "string", example: "ADDRESS_ID", description: "Use a saved address belonging to the logged-in user" },
              shippingAddress: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Address" }] },
              paymentMethod: { type: "string", enum: ["upi", "card", "online", "razorpay", "easebuzz"], example: "upi" }
            }
          }),
          responses: { 201: { description: "Order created" } }
        })
      },
      "/api/orders/mine": {
        get: protectedRoute({ tags: ["Orders"], summary: "Current user's order history", responses: response() })
      },
      "/api/orders/{id}": {
        get: protectedRoute({ tags: ["Orders"], summary: "Order details", parameters: id, responses: response() })
      },
      "/api/orders/{id}/status": {
        patch: protectedRoute({ tags: ["Orders"], summary: "Update order status (admin)", parameters: id, responses: response() })
      },
      "/api/orders/{id}/payment": {
        patch: protectedRoute({ tags: ["Orders"], summary: "Update order payment (admin)", parameters: id, responses: response() })
      },
      "/api/orders/{id}/tracking": {
        get: protectedRoute({ tags: ["Orders"], summary: "Track order status", parameters: id, responses: response() })
      },
      "/api/orders/{id}/invoice": {
        get: protectedRoute({
          tags: ["Orders"],
          summary: "Download PDF invoice for order",
          parameters: id,
          responses: { 200: { description: "PDF invoice document" } }
        })
      },
      "/api/orders/{id}/reorder": {
        post: protectedRoute({
          tags: ["Orders"],
          summary: "Reorder items from a past order into active cart",
          parameters: id,
          responses: response("Items added to cart for review")
        })
      },
      "/api/orders/{id}/cancel": {
        post: protectedRoute({
          tags: ["Orders"],
          summary: "Cancel an order (restores stock if not yet shipped)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            properties: {
              reason: { type: "string", example: "Changed my mind" }
            }
          }),
          responses: response("Order cancelled successfully")
        })
      },

      "/api/payments/{orderId}": {
        get: protectedRoute({ tags: ["Payments"], summary: "Get order payment", parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }], responses: response() }),
        patch: protectedRoute({
          tags: ["Payments"],
          summary: "Update payment status (admin)",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["pending", "paid", "failed", "refunded"], example: "paid" },
              transactionId: { type: "string", example: "pay_manual_12345" }
            }
          }),
          responses: response("Payment status updated successfully")
        })
      },
      "/api/payments/{orderId}/razorpay": {
        post: protectedRoute({
          tags: ["Payments"],
          summary: "Create Razorpay gateway order",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({
            type: "object",
            properties: {
              method: { type: "string", enum: ["upi", "card"], example: "upi" }
            }
          }),
          responses: {
            201: { description: "Razorpay order created with keyId" },
            503: { description: "Razorpay credentials not configured in environment" }
          }
        })
      },
      "/api/payments/{orderId}/initiate": {
        post: protectedRoute({
          tags: ["Payments"],
          summary: "Initiate payment",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({
            type: "object",
            required: ["method"],
            properties: {
              method: { type: "string", enum: ["upi", "card"], example: "upi" }
            }
          }),
          responses: { 201: { description: "Payment initiated" } }
        })
      },
      "/api/payments/{orderId}/verify": {
        post: protectedRoute({
          tags: ["Payments"],
          summary: "Verify Razorpay payment signature",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({
            type: "object",
            required: ["razorpayOrderId", "transactionId", "signature"],
            properties: {
              razorpayOrderId: { type: "string", example: "order_Kxyz12345" },
              transactionId: { type: "string", example: "pay_Kxyz67890" },
              signature: { type: "string", example: "9f83cf..." }
            }
          }),
          responses: {
            200: { description: "Payment verified successfully and order confirmed" },
            400: { description: "Invalid Razorpay signature" }
          }
        })
      },
      "/api/webhooks/razorpay": {
        post: {
          tags: ["Payments"],
          summary: "Razorpay webhook handler for server-to-server notifications",
          parameters: [
            {
              name: "x-razorpay-signature",
              in: "header",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            200: { description: "Webhook event received and processed" },
            400: { description: "Invalid webhook signature" }
          }
        }
      },

      "/api/admin/dashboard": {
        get: protectedRoute({ tags: ["Admin"], summary: "Admin dashboard summary KPIs", responses: response() })
      },
      "/api/admin/dashboard/summary": {
        get: protectedRoute({ tags: ["Admin"], summary: "Admin dashboard summary KPIs", responses: response() })
      },
      "/api/admin/dashboard/sales": {
        get: protectedRoute({ tags: ["Admin"], summary: "Admin dashboard sales analytics & monthly breakdown", responses: response() })
      },
      "/api/admin/dashboard/orders": {
        get: protectedRoute({ tags: ["Admin"], summary: "Admin dashboard orders status breakdown & recent orders", responses: response() })
      },
      "/api/admin/dashboard/inventory": {
        get: protectedRoute({ tags: ["Admin"], summary: "Admin dashboard inventory indicators & category distribution", responses: response() })
      },
      "/api/admin/customers": {

        get: protectedRoute({ tags: ["Admin"], summary: "List customers", responses: response() })
      },
      "/api/admin/customers/{id}": {
        get: protectedRoute({ tags: ["Admin"], summary: "Get customer and orders", parameters: id, responses: response() })
      },
      "/api/admin/inventory": {
        get: protectedRoute({ tags: ["Admin"], summary: "List inventory", responses: response() })
      },
      "/api/inventory": {
        get: protectedRoute({
          tags: ["Inventory"],
          summary: "List inventory with low/out-of-stock filters (admin)",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "outOfStock", in: "query", schema: { type: "boolean" } },
            { name: "lowStock", in: "query", schema: { type: "boolean" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } }
          ],
          responses: response()
        })
      },
      "/api/inventory/{id}": {
        patch: protectedRoute({
          tags: ["Inventory"],
          summary: "Set product stock quantity (admin)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            required: ["quantity"],
            properties: { quantity: { type: "integer", minimum: 0, example: 50 } }
          }),
          responses: response("Stock updated successfully")
        })
      },
      "/api/inventory/{id}/adjust": {
        post: protectedRoute({
          tags: ["Inventory"],
          summary: "Adjust product stock by delta amount (admin)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            required: ["amount"],
            properties: { amount: { type: "integer", example: 10, description: "Positive to add stock, negative to reduce" } }
          }),
          responses: response("Stock adjusted successfully")
        })
      },
      "/api/admin/dashboard/summary": {
        get: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Get aggregated dashboard summary counters (admin)",
          responses: response()
        })
      },
      "/api/admin/dashboard/sales": {
        get: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Get aggregated sales and revenue analytics (admin)",
          responses: response()
        })
      },
      "/api/admin/dashboard/orders": {
        get: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Get aggregated order distribution and recent orders feed (admin)",
          responses: response()
        })
      },
      "/api/admin/dashboard/inventory": {
        get: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Get real-time inventory distribution and low-stock alerts (admin)",
          responses: response()
        })
      },
      "/api/admin/customers": {
        get: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "List customers directory with search and sanitized passwords (admin)",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "active", in: "query", schema: { type: "boolean" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } }
          ],
          responses: response()
        })
      },
      "/api/admin/customers/{id}/status": {
        patch: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Activate or deactivate customer account (admin)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            required: ["active"],
            properties: { active: { type: "boolean" } }
          }),
          responses: response("Customer status updated")
        })
      },
      "/api/admin/products/{id}/return-policy": {
        patch: protectedRoute({
          tags: ["Admin Dashboard"],
          summary: "Update return and replacement policy for a product (admin)",
          parameters: id,
          requestBody: jsonBody({
            type: "object",
            properties: {
              isReturnable: { type: "boolean" },
              returnWindowDays: { type: "integer", minimum: 0 },
              isReplaceable: { type: "boolean" }
            }
          }),
          responses: response("Product return policy updated")
        })
      },
      "/api/payments/create-order": {
        post: {
          tags: ["Payments"],
          summary: "Initiate direct online payment order (Razorpay or Easebuzz)",
          requestBody: jsonBody({
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: { type: "object" } },
              shippingAddress: { type: "object" },
              gateway: { type: "string", enum: ["razorpay", "easebuzz"], example: "easebuzz" }
            }
          }),
          responses: response("Payment order created")
        }
      },
      "/api/payments/verify": {
        post: {
          tags: ["Payments"],
          summary: "Verify direct Razorpay payment signature",
          requestBody: jsonBody({
            type: "object",
            required: ["recordId", "orderId", "paymentId"],
            properties: {
              recordId: { type: "string" },
              orderId: { type: "string" },
              paymentId: { type: "string" },
              signature: { type: "string" }
            }
          }),
          responses: response("Payment verified successfully")
        }
      },
      "/api/payments/easebuzz/create-order": {
        post: {
          tags: ["Payments - Easebuzz"],
          summary: "Initiate Easebuzz payment order with access_key",
          requestBody: jsonBody({
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: { type: "object" } },
              shippingAddress: { type: "object" }
            }
          }),
          responses: response("Easebuzz payment link initiated")
        }
      },
      "/api/payments/easebuzz/verify": {
        post: {
          tags: ["Payments - Easebuzz"],
          summary: "Verify Easebuzz payment response and reverse hash",
          requestBody: jsonBody({
            type: "object",
            required: ["txnid", "status"],
            properties: {
              recordId: { type: "string" },
              txnid: { type: "string" },
              status: { type: "string", example: "success" },
              easepayid: { type: "string" },
              amount: { type: "number" },
              hash: { type: "string" }
            }
          }),
          responses: response("Easebuzz payment verified and order marked paid")
        }
      },
      "/api/payments/easebuzz/callback": {
        post: {
          tags: ["Payments - Easebuzz"],
          summary: "Easebuzz payment gateway return callback / webhook",
          responses: response("Easebuzz callback handled")
        }
      },
      "/api/payments/{orderId}/easebuzz": {
        post: protectedRoute({
          tags: ["Payments - Easebuzz"],
          summary: "Initiate Easebuzz payment for an existing order",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          responses: response("Easebuzz order initiated")
        })
      },
      "/api/payments/{orderId}/razorpay": {
        post: protectedRoute({
          tags: ["Payments"],
          summary: "Initiate Razorpay order for an existing order",
          parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
          responses: response("Razorpay order initiated")
        })
      }
    }
  },
  apis: []
});
