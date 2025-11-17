// public/js/checkout.js
// Checkout script matched to the provided checkout.html structure
// - Uses priceNow/priceBefore/priceSavings from HTML
// - Creates #notification container if missing
// - Enforces coupon validation before sending OTP/payment

const urlParams = new URLSearchParams(window.location.search);
let selectedCourseId = urlParams.get("courseId");

// API base (settings.js sets window.API_BASE)
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

/** safeJsonFetch: fetch wrapper that surfaces server error text as thrown Error */
async function safeJsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return parsed;
}

document.addEventListener("DOMContentLoaded", () => {
  // read course saved by course page (if present)
  const course = JSON.parse(localStorage.getItem("selectedCourse") || "null");
  if (!selectedCourseId && course?._id) {
    selectedCourseId = course._id;
    console.log("[checkout] courseId taken from localStorage:", selectedCourseId);
  }

  // Elements mapping (match to your HTML)
  const emailInput = document.getElementById("email");
  const couponInput = document.getElementById("coupon");
  const otpInput = document.getElementById("otp");
  const validateBtn = document.getElementById("validate-btn");
  const verifyOtpBtn = document.getElementById("verify-otp-btn");
  const paymentBtn = document.getElementById("payment-btn");
  const form = document.getElementById("checkoutForm");

  // Price display elements you have in HTML
  const priceBeforeEl = document.getElementById("priceBefore");
  const priceNowEl = document.getElementById("priceNow");
  const priceSavingsEl = document.getElementById("priceSavings");

  // mini course info in price panel
  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");
  const miniType = document.getElementById("miniType");

  // coupon UI elements present in your HTML
  const applyCouponBtn = document.getElementById("apply-coupon-btn");
  const couponHint = document.getElementById("couponHint");
  const defaultCouponTag = document.getElementById("defaultCouponTag");

  // optional container where to show inline messages
  let notificationBox = document.getElementById("notification");
  // if not present, create one inside the checkout card for consistent UI
  if (!notificationBox) {
    const checkoutCard = document.querySelector(".checkout-card");
    if (checkoutCard) {
      notificationBox = document.createElement("div");
      notificationBox.id = "notification";
      notificationBox.setAttribute("aria-live", "polite");
      notificationBox.style.marginBottom = "8px";
      checkoutCard.insertBefore(notificationBox, checkoutCard.firstChild);
    }
  }

  // internal price dataset when totalAmount id is not used
  let priceDataset = {
    amount: 0,       // base price (in ₹)
    finalAmount: 0   // amount after coupon (in ₹)
  };

  // Initialize price state from the 'course' stored or fallback zeros
  if (course) {
    const base = Number(course.price || 0);
    priceDataset.amount = base;
    priceDataset.finalAmount = base;
    if (priceNowEl) priceNowEl.textContent = "₹" + base;
    if (priceBeforeEl) priceBeforeEl.style.display = "none";
    if (priceSavingsEl) priceSavingsEl.style.display = "none";
    // mini info
    if (miniTitle) miniTitle.textContent = course.title || "Untitled course";
    if (miniThumb && course.thumbnail) miniThumb.src = course.thumbnail;
  } else {
    // nothing selected
    if (priceNowEl) priceNowEl.textContent = "₹0";
  }

  // helpers: UI notifications
  let _notifyTimer = null;
  function clearNotifications() {
    if (!notificationBox) return;
    notificationBox.innerHTML = "";
    notificationBox.style.display = "none";
    if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = null; }
  }
  function showNotification(type, message, autoHideMs = 5000) {
    if (!notificationBox) {
      // fallback to alert/console
      console.log(type, message);
      return;
    }
    clearNotifications();
    notificationBox.style.display = "block";
    const card = document.createElement("div");
    card.className = `notify-card notify-${type}`;
    card.style.padding = "10px 12px";
    card.style.borderRadius = "10px";
    card.style.marginBottom = "8px";
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.gap = "12px";
    card.style.boxShadow = "0 8px 18px rgba(0,0,0,0.04)";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "10px";

    const icon = document.createElement("div");
    icon.textContent = (type === "success") ? "✓" : "⚠️";
    icon.style.fontWeight = "700";

    const msg = document.createElement("div");
    msg.textContent = message;

    left.appendChild(icon);
    left.appendChild(msg);

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.border = "none";
    closeBtn.style.background = "transparent";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => { clearNotifications(); };

    card.appendChild(left);
    card.appendChild(closeBtn);

    notificationBox.appendChild(card);

    if (_notifyTimer) clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(() => { clearNotifications(); }, autoHideMs);
  }
  function showSuccess(msg) { showNotification("success", msg, 5000); }
  function showError(inputEl, msg) {
    if (inputEl && inputEl.classList) {
      inputEl.classList.add("input-error", "shake");
      setTimeout(() => inputEl.classList.remove("input-error", "shake"), 700);
    }
    showNotification("error", msg, 6000);
  }

  // small utility to set loading state on a button
  function setLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset._orig = btn.textContent;
      btn.textContent = text || "Processing…";
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset._orig || btn.textContent;
      btn.disabled = false;
    }
  }

  // keep an appliedCoupon object
  let appliedCoupon = null;

  // fetch and show default coupon hint (if server provides)
  async function fetchDefaultCoupon() {
    if (!couponHint || !defaultCouponTag) return;
    try {
      const data = await safeJsonFetch(`${API_BASE}/api/coupons/default`);
      const coupon = data.coupon || data;
      if (coupon && coupon.code) {
        couponHint.style.display = "flex";
        defaultCouponTag.textContent = coupon.code;
      } else {
        couponHint.style.display = "none";
      }
    } catch (e) {
      couponHint.style.display = "none";
    }
  }

  // APPLY coupon handler (optional separate apply button)
  async function applyCoupon() {
    const code = (couponInput.value || "").trim();
    if (!code) { showError(couponInput, "Enter coupon code"); return; }
    if (!selectedCourseId && course?._id) selectedCourseId = course._id;
    setLoading(applyCouponBtn, true, "Checking…");
    try {
      // try GET then POST
      let result = null;
      try {
        result = await safeJsonFetch(`${API_BASE}/api/coupons/validate?code=${encodeURIComponent(code)}&courseId=${encodeURIComponent(selectedCourseId)}`);
      } catch (err) {
        result = await safeJsonFetch(`${API_BASE}/api/coupons/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, courseId: selectedCourseId })
        });
      }
      const coupon = result.coupon || result;
      if (!coupon) throw new Error("Invalid coupon");

      // compute savings
      const base = Number(priceDataset.amount || (course?.price || 0));
      let savings = 0;
      if (coupon.type === "percent" || coupon.percent) {
        const pct = Number(coupon.value ?? coupon.percent ?? 0);
        savings = Math.round((base * pct) / 100);
      } else {
        savings = Number(coupon.value ?? coupon.discount ?? 0);
      }
      appliedCoupon = coupon;
      const final = Math.max(0, base - savings);
      priceDataset.finalAmount = final;

      if (priceBeforeEl) { priceBeforeEl.style.display = ""; priceBeforeEl.textContent = "₹" + base; }
      if (priceNowEl) priceNowEl.textContent = "₹" + final;
      if (priceSavingsEl) { priceSavingsEl.style.display = ""; priceSavingsEl.textContent = `You saved ₹${savings}`; }

      sessionStorage.setItem("buyerCoupon", code);
      showSuccess(`Coupon "${coupon.code}" applied — you saved ₹${savings}`);
    } catch (err) {
      appliedCoupon = null;
      if (priceBeforeEl) priceBeforeEl.style.display = "none";
      if (priceSavingsEl) priceSavingsEl.style.display = "none";
      if (priceNowEl) priceNowEl.textContent = "₹" + (priceDataset.amount || (course?.price || 0));
      showError(couponInput, err.message || "Invalid coupon");
    } finally {
      setLoading(applyCouponBtn, false, "Apply");
    }
  }
  if (applyCouponBtn) applyCouponBtn.addEventListener("click", applyCoupon);

  // Validate & Send OTP — coupon required
  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const couponCode = (couponInput.value || "").trim();
      if (!selectedCourseId && course?._id) selectedCourseId = course._id;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) { showError(emailInput, "Enter a valid email address."); return; }
      if (!couponCode) { showError(couponInput, "Coupon is required to proceed. Enter coupon code."); return; }
      if (!selectedCourseId) { showError(null, "No course selected. Choose a course first."); return; }

      setLoading(validateBtn, true, "Checking coupon…");

      try {
        // try endpoint that validates coupon and sends OTP
        let serverResp = null;
        let usedCheckoutValidate = false;
        try {
          serverResp = await safeJsonFetch(`${API_BASE}/api/checkout/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, couponCode, courseId: selectedCourseId })
          });
          usedCheckoutValidate = true;
        } catch (err) {
          // fallback to coupon validate only
          try {
            serverResp = await safeJsonFetch(`${API_BASE}/api/coupons/validate?code=${encodeURIComponent(couponCode)}&courseId=${encodeURIComponent(selectedCourseId)}`);
          } catch (err2) {
            serverResp = await safeJsonFetch(`${API_BASE}/api/coupons/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: couponCode, courseId: selectedCourseId })
            });
          }
        }

        const serverCoupon = serverResp?.coupon || serverResp || serverResp?.appliedCoupon;
        if (!serverCoupon || !serverCoupon.code) throw new Error(serverResp?.message || "Coupon validation failed");

        // compute savings & set appliedCoupon
        const baseAmount = Number(priceDataset.amount || course?.price || 0);
        let savings = 0;
        if (serverCoupon.type === "percent" || serverCoupon.percent) {
          const pct = Number(serverCoupon.value ?? serverCoupon.percent ?? 0);
          savings = Math.round((baseAmount * pct) / 100);
        } else {
          savings = Number(serverCoupon.value ?? serverCoupon.discount ?? 0);
        }
        appliedCoupon = serverCoupon;
        const final = Math.max(0, baseAmount - savings);
        priceDataset.finalAmount = final;

        if (priceBeforeEl) { priceBeforeEl.style.display = ""; priceBeforeEl.textContent = "₹" + baseAmount; }
        if (priceNowEl) priceNowEl.textContent = "₹" + final;
        if (priceSavingsEl) { priceSavingsEl.style.display = ""; priceSavingsEl.textContent = `You saved ₹${savings}`; }

        // store buyer email/coupon locally
        sessionStorage.setItem("buyerEmail", email);
        sessionStorage.setItem("buyerCoupon", couponCode);

        // if we used coupons/validate fallback, explicitly request OTP send
        if (!usedCheckoutValidate) {
          let otpSent = false;
          try {
            // preferred endpoint
            await safeJsonFetch(`${API_BASE}/api/checkout/send-otp`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email })
            });
            otpSent = true;
          } catch (otpErr) {
            try {
              await safeJsonFetch(`${API_BASE}/api/validate/email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
              });
              otpSent = true;
            } catch (otpErr2) {
              console.warn("OTP send failed after coupon-only validation:", otpErr2);
            }
          }

          if (otpSent) showSuccess(`Coupon "${appliedCoupon.code}" validated — OTP sent to ${email}.`);
          else showSuccess(`Coupon validated. Please request OTP or try again to send OTP.`);
        } else {
          showSuccess(`Coupon "${appliedCoupon.code}" validated — OTP sent to ${email}.`);
        }

        // enable OTP input and verify button
        if (otpInput) otpInput.disabled = false;
        if (verifyOtpBtn) verifyOtpBtn.disabled = false;
      } catch (err) {
        appliedCoupon = null;
        if (priceBeforeEl) priceBeforeEl.style.display = "none";
        if (priceSavingsEl) priceSavingsEl.style.display = "none";
        if (priceNowEl) priceNowEl.textContent = "₹" + (priceDataset.amount || (course?.price || 0));
        showError(couponInput, err.message || "Coupon validation failed. Enter valid coupon.");
      } finally {
        setLoading(validateBtn, false, "Validate & Send OTP");
      }
    });
  }

  // Verify OTP
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const otp = (otpInput.value || "").trim();
      if (!otp) { showError(otpInput, "Enter OTP"); return; }

      setLoading(verifyOtpBtn, true, "Verifying…");
      try {
        const data = await safeJsonFetch(`${API_BASE}/api/checkout/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp })
        });
        if (!data?.success) {
          showError(otpInput, data?.message || "OTP verification failed");
          return;
        }
        showSuccess("OTP verified! You can now proceed to payment.");
        if (paymentBtn) paymentBtn.disabled = false;
      } catch (err) {
        showError(otpInput, err.message || "OTP verification failed");
      } finally {
        setLoading(verifyOtpBtn, false, "Verify OTP");
      }
    });
  }

  // Payment submit — require appliedCoupon
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); // always prevent native submit
      if (!appliedCoupon) { showError(couponInput, "A validated coupon is required to proceed to payment."); return; }
      if (!course) { showError(null, "No course selected!"); return; }

      const email = (emailInput.value || "").trim();
      const coupon = (couponInput.value || "").trim();
      const finalAmount = Number(priceDataset.finalAmount || course.price || 0);

      if (!selectedCourseId && course?._id) selectedCourseId = course._id;
      if (!selectedCourseId) return showError(null, "No course selected. Can't create order.");

      setLoading(paymentBtn, true, "Processing Payment...");

      try {
        const payload = { amount: finalAmount, courseId: selectedCourseId, couponCode: coupon, email };
        const data = await safeJsonFetch(`${API_BASE}/api/payment/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!data?.success) throw new Error(data?.message || "Payment order creation failed");

        // open Razorpay
        const options = {
          key: data.keyId || (window.RAZORPAY_KEY_ID || ""),
          amount: data.amountPaise,
          currency: data.currency,
          name: "Stribble",
          description: course.title || "Course purchase",
          order_id: data.orderId,
          handler: async function (response) {
            try {
              const verifyData = await safeJsonFetch(`${API_BASE}/api/payment/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email,
                  courseTitle: course.title,
                  courseId: selectedCourseId,
                  amount: finalAmount,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                })
              });

              if (verifyData.success) {
                showSuccess("Payment successful! 🎉 Course has been sent to your email.");
                sessionStorage.removeItem("buyerCoupon");
                sessionStorage.removeItem("buyerEmail");
              } else {
                showError(null, verifyData.message || "Payment verification failed");
              }
            } catch (err) {
              showError(null, err.message || "Payment verification error");
            }
          },
          theme: { color: "#182A42" }
        };

        const rzp = new Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          console.error("Razorpay payment.failed", resp);
          showError(null, "Payment failed or cancelled. Please try again.");
        });
        rzp.open();
      } catch (err) {
        showError(null, err.message || "Payment failed. Try again!");
      } finally {
        setLoading(paymentBtn, false, "Proceed to Pay");
      }
    });
  }

  // Initialize UI: fetch default coupon and disable payment until OTP verify
  fetchDefaultCoupon();
  if (paymentBtn) paymentBtn.disabled = true;

  // small accessibility: show year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
