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

function getPayoutBaseUrl() {
  const mode = String(process.env.CASHFREE_ENV || "sandbox").toLowerCase();
  return mode === "production" || mode === "prod"
    ? "https://payout-api.cashfree.com/payout/v1"
    : "https://payout-gamma.cashfree.com/payout/v1";
}

// 1. Get the Bearer Token using RSA Public Key Authentication (2FA)
export async function getPayoutToken() {
  // Pull BOTH the ID and the Secret back in
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

  // Step C: Request Token with ALL Three Headers (2FA)
  const { data } = await axios.post(`${getPayoutBaseUrl()}/authorize`, {}, {
    headers: {
      "X-Client-Id": clientId,
      "X-Client-Secret": clientSecret, // <--- Restored!
      "X-Cf-Signature": signature
    }
  });

  // Catch Cashfree's silent errors
  if (data.status === "ERROR") {
    console.error("Cashfree Auth Error:", data.message);
    throw new Error(`Cashfree Auth Failed: ${data.message}`);
  }

  return data.data.token;
}

// 2. Add Beneficiary (Required before transferring funds)
export async function addUpiBeneficiary(token, beneId, upiId, name, email) {
  try {
    await axios.post(`${getPayoutBaseUrl()}/addBeneficiary`, {
      beneId: beneId,
      name: name || "Stribble Partner",
      email: email || process.env.ADMIN_EMAIL || "admin@stribble.site",
      phone: "9999999999", // Placeholder required by API
      vpa: upiId,          // This marks it as a UPI beneficiary
      address1: "India",
      city: "City",
      state: "State",
      pincode: "000000"
    }, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    return true;
  } catch (error) {
    // subCode 409 means the Beneficiary ID already exists, which is perfectly fine.
    if (error.response?.data?.subCode === '409') return true; 
    throw error;
  }
}

// 3. Request UPI Transfer
export async function requestUpiTransfer(token, transferId, beneId, amount) {
  const { data } = await axios.post(`${getPayoutBaseUrl()}/requestTransfer`, {
    transferId: transferId,
    beneId: beneId,
    amount: Number(amount).toFixed(2),
    transferMode: "upi"
  }, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  // CRITICAL FIX: Catch silent errors (like INSUFFICIENT_BALANCE)
  if (data.status === "ERROR") {
    console.error("Cashfree Transfer Rejected:", data.message);
    throw new Error(`Transfer Failed: ${data.message}`);
  }

  return data;
}

// 4. Add Bank Beneficiary
export async function addBankBeneficiary(token, beneId, name, email, bankAccount, ifsc) {
  try {
    await axios.post(`${getPayoutBaseUrl()}/addBeneficiary`, {
      beneId: beneId,
      name: name || "Stribble Partner",
      email: email || process.env.ADMIN_EMAIL || "admin@stribble.site",
      phone: "9999999999", // Placeholder required by API
      bankAccount: bankAccount, // The actual bank account number
      ifsc: ifsc,               // The bank branch IFSC code
      address1: "India",
      city: "City",
      state: "State",
      pincode: "000000"
    }, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    return true;
  } catch (error) {
    // subCode 409 means the Beneficiary ID already exists, which is fine.
    if (error.response?.data?.subCode === '409') return true; 
    throw error;
  }
}

// 5. Execute Bank Transfer
export async function requestBankTransfer(token, transferId, beneId, amount, mode = "imps") {
  const { data } = await axios.post(`${getPayoutBaseUrl()}/requestTransfer`, {
    transferId: transferId,
    beneId: beneId,
    amount: Number(amount).toFixed(2),
    transferMode: mode 
  }, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  // CRITICAL FIX: Catch silent errors
  if (data.status === "ERROR") {
    console.error("Cashfree Transfer Rejected:", data.message);
    throw new Error(`Transfer Failed: ${data.message}`);
  }

  return data;
}