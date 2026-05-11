// src/config/cashfree.js
import axios from "axios";
import crypto from "crypto";

const DEFAULT_API_VERSION = "2025-01-01";

function cashfreeEnv() {
  return String(process.env.CASHFREE_ENV || process.env.CASHFREE_MODE || "sandbox")
    .trim()
    .toLowerCase();
}

export function getCashfreeMode() {
  return cashfreeEnv() === "production" || cashfreeEnv() === "prod"
    ? "production"
    : "sandbox";
}

function getCashfreeBaseUrl() {
  if (process.env.CASHFREE_BASE_URL) return process.env.CASHFREE_BASE_URL.replace(/\/$/, "");
  return getCashfreeMode() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

export function cashfreeConfigReady() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

function cashfreeHeaders(idempotencyKey) {
  if (!cashfreeConfigReady()) {
    throw new Error("Cashfree credentials are not configured");
  }

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-version": process.env.CASHFREE_API_VERSION || DEFAULT_API_VERSION,
    "x-client-id": process.env.CASHFREE_CLIENT_ID,
    "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
  };

  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  return headers;
}

function requestConfig(idempotencyKey) {
  return {
    headers: cashfreeHeaders(idempotencyKey),
    timeout: Number(process.env.CASHFREE_TIMEOUT_MS || 15000),
  };
}

export function buildCashfreeOrderId() {
  return `strb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export function buildCashfreeIdempotencyKey() {
  return crypto.randomUUID();
}

export function buildCashfreeCustomerId(email) {
  const digest = crypto.createHash("sha1").update(String(email || "").toLowerCase()).digest("hex");
  return `cust_${digest.slice(0, 20)}`;
}

export async function createCashfreeOrder(payload, idempotencyKey) {
  const { data } = await axios.post(
    `${getCashfreeBaseUrl()}/orders`,
    payload,
    requestConfig(idempotencyKey)
  );
  return data;
}

export async function fetchCashfreeOrder(orderId) {
  const { data } = await axios.get(
    `${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
    requestConfig()
  );
  return data;
}

export async function fetchCashfreePayments(orderId) {
  const { data } = await axios.get(
    `${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}/payments`,
    requestConfig()
  );
  return Array.isArray(data) ? data : [];
}

export async function createCashfreeRefund(orderId, payload, idempotencyKey) {
  const { data } = await axios.post(
    `${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}/refunds`,
    payload,
    requestConfig(idempotencyKey)
  );
  return data;
}

export function verifyCashfreeWebhookSignature(rawBody, signature, timestamp) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET;
  if (!secret || !rawBody || !signature || !timestamp) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}${rawBody}`)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(String(signature));
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function normalizeCashfreeError(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error_description ||
    error?.response?.data?.error ||
    error?.message ||
    "Cashfree request failed"
  );
}
