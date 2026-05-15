// src/config/cashfreePayout.js
import axios from "axios";
import crypto from 'crypto';

// Payouts require their own Client ID and Secret from the Cashfree Payout Dashboard
function getPayoutCredentials() {
  return {
    clientId: process.env.CASHFREE_PAYOUT_CLIENT_ID,
    clientSecret: process.env.CASHFREE_PAYOUT_CLIENT_SECRET,
  };
}

// V2 API Base URLs
function getPayoutBaseUrl() {
  const mode = String(process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return mode === "production" || mode === "prod"
    ? "https://api.cashfree.com/payout"
    : "https://sandbox.cashfree.com/payout";
}

// 1. Get Authentication Headers (V2 completely removes Bearer Tokens)
export async function getPayoutToken() {
  const { clientId, clientSecret } = getPayoutCredentials(); 
  
  let publicKey = process.env.CASHFREE_PAYOUT_PUBLIC_KEY;
  if (!clientId || !clientSecret || !publicKey) {
      throw new Error("Cashfree credentials or Public Key missing in .env");
  }
  
  publicKey = publicKey.replace(/\\n/g, '\n'); 

  // Step A: Create the payload (clientId + current unix timestamp)
  const timestamp = Math.floor(Date.now() / 1000);
  const dataToEncrypt = `${clientId}.${timestamp}`;

  // Step B: Encrypt the payload using RSA OAEP padding
  const encrypted = crypto.publicEncrypt({
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
  }, Buffer.from(dataToEncrypt, 'utf8'));

  const signature = encrypted.toString('base64');

  // V2 requires these specific headers attached to every API call.
  // Returning this object allows your server.js to work without any edits!
  return {
    "Content-Type": "application/json",
    "x-api-version": "2024-01-01",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-cf-signature": signature
  };
}

// 2. Add UPI Beneficiary (V2 Standard)
export async function addUpiBeneficiary(headers, beneId, upiId, name, email) {
  try {
    await axios.post(`${getPayoutBaseUrl()}/beneficiary`, {
      beneficiary_id: beneId,
      // V2 strictly requires names to be only letters and spaces
      beneficiary_name: (name || "Stribble Partner").replace(/[^a-zA-Z\s]/g, '').trim(),
      beneficiary_instrument_details: {
        vpa: upiId
      },
      beneficiary_contact_details: {
        beneficiary_email: email || process.env.ADMIN_EMAIL || "admin@stribble.site",
        beneficiary_phone: "9999999999"
      }
    }, { headers });
    return true;
  } catch (error) {
    // Status 422 or 409 means beneficiary already exists, which is perfectly fine
    if (error.response?.status === 422 || error.response?.status === 409) return true; 
    console.error("Cashfree V2 Bene Error:", error.response?.data || error.message);
    throw error;
  }
}

// 3. Request UPI Transfer (V2 Standard)
export async function requestUpiTransfer(headers, transferId, beneId, amount) {
  try {
    const { data } = await axios.post(`${getPayoutBaseUrl()}/transfers`, {
      transfer_id: transferId,
      transfer_amount: Number(amount), // V2 strictly expects a number
      transfer_mode: "upi",
      beneficiary_details: {
        beneficiary_id: beneId
      }
    }, { headers });

    return data;
  } catch (error) {
    console.error("Cashfree V2 Transfer Error:", error.response?.data || error.message);
    throw new Error(`Transfer Failed: ${error.response?.data?.message || error.message}`);
  }
}

// 4. Add Bank Beneficiary (V2 Standard)
export async function addBankBeneficiary(headers, beneId, name, email, bankAccount, ifsc) {
  try {
    await axios.post(`${getPayoutBaseUrl()}/beneficiary`, {
      beneficiary_id: beneId,
      beneficiary_name: (name || "Stribble Partner").replace(/[^a-zA-Z\s]/g, '').trim(),
      beneficiary_instrument_details: {
        bank_account_number: bankAccount,
        bank_ifsc: ifsc
      },
      beneficiary_contact_details: {
        beneficiary_email: email || process.env.ADMIN_EMAIL || "admin@stribble.site",
        beneficiary_phone: "9999999999"
      }
    }, { headers });
    return true;
  } catch (error) {
    if (error.response?.status === 422 || error.response?.status === 409) return true; 
    console.error("Cashfree V2 Bank Bene Error:", error.response?.data || error.message);
    throw error;
  }
}

// 5. Execute Bank Transfer (V2 Standard)
export async function requestBankTransfer(headers, transferId, beneId, amount, mode = "imps") {
  try {
    const { data } = await axios.post(`${getPayoutBaseUrl()}/transfers`, {
      transfer_id: transferId,
      transfer_amount: Number(amount),
      transfer_mode: mode, 
      beneficiary_details: {
        beneficiary_id: beneId
      }
    }, { headers });

    return data;
  } catch (error) {
    console.error("Cashfree V2 Bank Transfer Error:", error.response?.data || error.message);
    throw new Error(`Transfer Failed: ${error.response?.data?.message || error.message}`);
  }
}