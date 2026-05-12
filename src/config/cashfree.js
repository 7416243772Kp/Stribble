import { Cashfree, CFEnvironment } from "cashfree-pg";
import crypto from "crypto";

// ==========================================
// 1. CONFIG & UTILITIES
// ==========================================

export function cashfreeConfigReady() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

export function getCashfreeMode() {
  return process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
}

export function buildCashfreeIdempotencyKey() {
  return crypto.randomUUID(); 
}

export function buildCashfreeCustomerId(identifier) {
  if (!identifier) return `cust_${Date.now()}`;
  return String(identifier).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

export function buildCashfreeOrderId() {
  return `stribble_order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function normalizeCashfreeError(error) {
  if (error.response && error.response.data) {
    return error.response.data.message || JSON.stringify(error.response.data);
  }
  return error.message || "An unknown Cashfree error occurred";
}

// cashfree-pg v5: Cashfree is a class — constructor(env, clientId, clientSecret).
// CFEnvironment is a separate export for SANDBOX / PRODUCTION.
// XApiVersion must be set explicitly; the SDK defaults to "2025-01-01" which uses
// a different auth scheme and causes 401 errors with standard PG credentials.
function getCashfreeClient() {
  const cashfree = new Cashfree(
    process.env.CASHFREE_ENV === "production"
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX,
    process.env.CASHFREE_CLIENT_ID,
    process.env.CASHFREE_CLIENT_SECRET
  );
  cashfree.XApiVersion = "2023-08-01";
  return cashfree;
}


// ==========================================
// 2. CORE SDK API CALLS
// ==========================================

export async function createCashfreeOrder(payload) {
  const cashfree = getCashfreeClient();
  try {
    const response = await cashfree.PGCreateOrder(payload);
    return response.data; 
  } catch (error) {
    console.error("Cashfree Order Error:", normalizeCashfreeError(error));
    throw error;
  }
}

export async function createCashfreeRefund(orderId, refundPayload) {
  const cashfree = getCashfreeClient();
  try {
    const response = await cashfree.PGOrderCreateRefund(orderId, refundPayload);
    return response.data;
  } catch (error) {
    console.error("Cashfree Refund Error:", normalizeCashfreeError(error));
    throw error;
  }
}

export async function fetchCashfreeOrder(orderId) {
  const cashfree = getCashfreeClient();
  try {
    const response = await cashfree.PGFetchOrder(orderId);
    return response.data;
  } catch (error) {
    console.error("Cashfree Fetch Order Error:", normalizeCashfreeError(error));
    throw error;
  }
}

export async function fetchCashfreePayments(orderId) {
  const cashfree = getCashfreeClient();
  try {
    // Fetches all payment attempts for a specific order to check if one succeeded
    const response = await cashfree.PGOrderFetchPayments(orderId);
    return response.data;
  } catch (error) {
    console.error("Cashfree Fetch Payments Error:", normalizeCashfreeError(error));
    throw error;
  }
}


// ==========================================
// 3. WEBHOOK VERIFICATION
// ==========================================

export function verifyCashfreeWebhookSignature(signature, rawBody, timestamp) {
  try {
    const cashfree = getCashfreeClient();
    // Use the official SDK's built-in webhook signature verifier
    cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    return true; // If it doesn't throw an error, it is valid
  } catch (error) {
    // Fallback to manual crypto verification just in case the payload formats slightly differently
    try {
      const secret = process.env.CASHFREE_CLIENT_SECRET;
      const bodyToHash = (timestamp || "") + (rawBody || "");
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(bodyToHash)
        .digest("base64");
      
      return expectedSignature === signature;
    } catch (fallbackError) {
      return false;
    }
  }
}