// src/config/cashfreePayout.js
import axios from "axios";

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

// 1. Get the Bearer Token required for Payouts
export async function getPayoutToken() {
  const { clientId, clientSecret } = getPayoutCredentials();
  if (!clientId || !clientSecret) throw new Error("Cashfree Payout credentials missing");

  const { data } = await axios.post(`${getPayoutBaseUrl()}/authorize`, {}, {
    headers: {
      "X-Client-Id": clientId,
      "X-Client-Secret": clientSecret
    }
  });
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

// 3. Execute the Transfer
export async function requestUpiTransfer(token, transferId, beneId, amount) {
  const { data } = await axios.post(`${getPayoutBaseUrl()}/requestTransfer`, {
    transferId: transferId,
    beneId: beneId,
    amount: Number(amount).toFixed(2),
    transferMode: "upi"
  }, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return data;
}