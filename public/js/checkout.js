// C:\Ebook\public\js\checkout.js
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
    const checkoutCard = document.querySelector(".checkout-form");
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

    const placeholderThumb = "/images/placeholder-course.png";
    if (miniThumb) {
      if (course.thumbnail && typeof course.thumbnail === "string" && course.thumbnail.trim() !== "") {
        miniThumb.src = course.thumbnail;
        miniThumb.style.display = "";
      } else {
        miniThumb.src = placeholderThumb;
      }
    }
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

  function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errDiv = document.getElementById("err-" + inputId);

    if (input) input.classList.remove("input-error", "shake");
    if (errDiv) {
      errDiv.style.display = "none";
      errDiv.textContent = "";
    }
  }


  ["email", "coupon", "otp"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => clearError(id));
      el.addEventListener("focus", () => clearError(id));
    }
  });


  function showError(inputElOrMsg, msgMaybe) {
    let msg = msgMaybe;
    let inputEl = null;


    if (typeof inputElOrMsg === "string" && !msgMaybe) {
      msg = inputElOrMsg;
    } else {
      inputEl = inputElOrMsg;
    }


    if (inputEl && inputEl.id) {

      inputEl.classList.add("input-error", "shake");
      setTimeout(() => inputEl.classList.remove("shake"), 500);


      const errorDiv = document.getElementById("err-" + inputEl.id);
      if (errorDiv) {
        errorDiv.textContent = msg || "Invalid entry";
        errorDiv.style.display = "block";
        return;
      }
    }

    if (typeof showNotification === "function") {
      showNotification("error", msg || "Something went wrong", 5000);
    } else {
      alert(msg);
    }
  }

  // REUSABLE INLINE SUCCESS FUNCTION
  function showInlineSuccess(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;

    // 1. Render HTML (Green Box with Checkmark)
    el.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${message}</span>
    `;

    // 2. Apply Styles
    el.className = "field-success"; // Uses the green CSS we added earlier
    el.style.display = "flex";

    // 3. Timer: Auto-hide after 3 seconds
    if (el.dataset.timer) clearTimeout(el.dataset.timer);
    el.dataset.timer = setTimeout(() => {
      el.style.display = "none";
      el.className = "";
    }, 3000);
  }

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

  // fetch and show default coupon hint (if server provides) — errors ignored
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

  // APPLY coupon handler (validate coupon-only)
  async function applyCoupon() {
    const code = (couponInput.value || "").trim();
    if (!code) { showError(couponInput, "Enter coupon code"); return; }
    if (!selectedCourseId && course?._id) selectedCourseId = course._id;
    setLoading(applyCouponBtn, true, "Checking…");
    try {
      // Validate coupon via public endpoint (POST)
      const result = await safeJsonFetch(`${API_BASE}/api/validate/coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCode: code, courseId: selectedCourseId })
      });
      console.log("DEBUG coupon-validate result:", result);

      const coupon = result.coupon || result;
      if (!coupon) throw new Error("Invalid coupon code. Please enter a valid coupon code");

      // compute savings robustly:
      const base = Number(priceDataset.amount || (course?.price || 0));
      let savings = 0;

      // server may return percent or fixed discount using different keys
      const pct = Number(coupon?.percent ?? coupon?.value?.percent ?? 0);
      const fixed = Number(coupon?.discount ?? coupon?.value ?? coupon?.amount ?? 0);

      if (pct > 0) {
        savings = Math.round((base * pct) / 100);
      } else {
        savings = fixed;
      }
      appliedCoupon = coupon;
      const final = Math.max(0, base - savings);
      priceDataset.finalAmount = final;

      if (priceBeforeEl) { priceBeforeEl.style.display = ""; priceBeforeEl.textContent = "₹" + base; }
      if (priceNowEl) priceNowEl.textContent = "₹" + final;
      if (priceSavingsEl) { priceSavingsEl.style.display = ""; priceSavingsEl.textContent = `You saved ₹${savings}`; }

      const shownCode = code || coupon?.code || coupon?.code?.toString?.() || "coupon";
      sessionStorage.setItem("buyerCoupon", code);
      const msgDiv = document.getElementById("couponMessage");
      if (msgDiv) {
        // 1. Render the message
        msgDiv.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Coupon <strong>'${shownCode}'</strong> applied! You saved ₹${savings}</span>
        `;

        // 2. Show it with the green style
        msgDiv.className = "field-success";
        msgDiv.style.display = "flex";

        // 3. AUTO-HIDE LOGIC (The Fix)
        // Clear any existing timer so we don't hide the new message too early
        if (window.couponTimer) clearTimeout(window.couponTimer);

        window.couponTimer = setTimeout(() => {
          msgDiv.style.display = "none";
          msgDiv.className = ""; // Remove style class
        }, 3000);
      }

      // Change "Apply" button to "Applied" visual state (Optional but nice)
      if (applyCouponBtn) {
        applyCouponBtn.textContent = "Applied";
        applyCouponBtn.style.backgroundColor = "#10b981"; // Green
        applyCouponBtn.style.borderColor = "#10b981";
        setTimeout(() => {
          applyCouponBtn.textContent = "Apply";
          applyCouponBtn.style.backgroundColor = ""; // Reset
          applyCouponBtn.style.borderColor = "";
        }, 2000);
      }

      // Clear any previous error messages on the coupon field
      clearError('coupon');
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

  // Validate & Send OTP — coupon optional (allow empty coupon)
  // VALIDATE & SEND OTP
  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const couponCode = (couponInput.value || "").trim();
      if (!selectedCourseId && course?._id) selectedCourseId = course._id;

      // 1. Validate Email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showError(emailInput, "Invalid email. Please enter a valid email");
        return;
      }

      if (!selectedCourseId) {
        showError(null, "No course selected.");
        return;
      }

      setLoading(validateBtn, true, "Checking…");

      try {
        // 2. Call API
        const serverResp = await safeJsonFetch(`${API_BASE}/api/checkout/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, couponCode: couponCode || "", courseId: selectedCourseId })
        });

        const serverCoupon = serverResp?.coupon || null;

        // Check if coupon was entered but rejected by server
        if (couponCode && !serverCoupon) {
          throw new Error("Invalid coupon code. Please enter a valid coupon code");
        }

        // 3. Handle Success (Coupon vs No Coupon)
        const baseAmount = Number(priceDataset.amount || course?.price || 0);

        if (serverCoupon) {
          // --- COUPON VALID LOGIC ---
          let savings = 0;
          const pct = Number(serverCoupon.value ?? serverCoupon.percent ?? 0);
          const fixed = Number(serverCoupon.value ?? serverCoupon.discount ?? 0);
          if (pct > 0) savings = Math.round((baseAmount * pct) / 100);
          else savings = fixed;

          priceDataset.finalAmount = Math.max(0, baseAmount - savings);

          // Update Price Panel
          if (priceNowEl) {
            priceNowEl.textContent = "₹" + priceDataset.finalAmount;
            priceNowEl.classList.add("text-green");
          }
          if (priceBeforeEl) {
            priceBeforeEl.textContent = "₹" + baseAmount;
            priceBeforeEl.style.display = "";
          }
          if (priceSavingsEl) {
            priceSavingsEl.textContent = `You saved ₹${savings}`;
            priceSavingsEl.style.display = "";
          }

          sessionStorage.setItem("buyerCoupon", couponCode);

          // SHOW INLINE SUCCESS (Green text below email)
          showInlineSuccess("msg-email", "Coupon Validated & OTP Sent!");

        } else {
          // --- NO COUPON LOGIC ---
          priceDataset.finalAmount = baseAmount;
          if (priceNowEl) {
            priceNowEl.textContent = "₹" + baseAmount;
            priceNowEl.classList.remove("text-green");
          }
          if (priceBeforeEl) priceBeforeEl.style.display = "none";
          if (priceSavingsEl) priceSavingsEl.style.display = "none";

          sessionStorage.setItem("buyerCoupon", "");

          // SHOW INLINE SUCCESS (Green text below email)
          showInlineSuccess("msg-email", `OTP sent to ${email}`);
        }

        sessionStorage.setItem("buyerEmail", email);

        // 4. Enable Next Steps
        if (otpInput) otpInput.disabled = false;
        if (verifyOtpBtn) verifyOtpBtn.disabled = false;

        // Clear any previous errors
        clearError('email');
        clearError('coupon');

      } catch (err) {
        // Handle specific errors
        let msg = err.message;
        if (msg.toLowerCase().includes("coupon")) {
          showError(couponInput, "Invalid coupon code. Please enter a valid coupon code");
        } else {
          showError(emailInput, msg || "Validation failed");
        }

        // Reset Prices on error
        if (priceNowEl) {
          priceNowEl.textContent = "₹" + (priceDataset.amount || 0);
          priceNowEl.classList.remove("text-green");
        }
        if (priceBeforeEl) priceBeforeEl.style.display = "none";
        if (priceSavingsEl) priceSavingsEl.style.display = "none";

      } finally {
        setLoading(validateBtn, false, "Validate & Send OTP");
      }
    });
  }

  // Verify OTP
  // VERIFY OTP
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const otp = (otpInput.value || "").trim();

      // 1. Basic Check
      if (!otp) {
        showError(otpInput, "Please enter the OTP");
        return;
      }

      setLoading(verifyOtpBtn, true, "Verifying…");

      try {
        // 2. Call API
        const data = await safeJsonFetch(`${API_BASE}/api/checkout/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp })
        });

        // 3. Handle Error
        if (!data?.success) {
          showError(otpInput, "Invalid OTP. Please enter a valid OTP");
          return;
        }

        // 4. Handle Success
        // SHOW INLINE SUCCESS (Green text below OTP)
        showInlineSuccess("msg-otp", "OTP Verified Successfully!");

        // Clear any error styles
        clearError('otp');

        // Enable Payment
        if (paymentBtn) paymentBtn.disabled = false;

      } catch (err) {
        showError(otpInput, "Invalid OTP. Please enter a valid OTP");
      } finally {
        setLoading(verifyOtpBtn, false, "Verify OTP");
      }
    });
  }

  // Payment submit — coupon optional; server will reject if an invalid coupon somehow slipped through
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); // always prevent native submit
      if (!course) { showError(null, "No course selected!"); return; }

      const email = (emailInput.value || "").trim();
      const coupon = (couponInput.value || "").trim();
      const finalAmount = Number(priceDataset.finalAmount || course.price || 0);

      if (!selectedCourseId && course?._id) selectedCourseId = course._id;
      if (!selectedCourseId) return showError(null, "No course selected. Can't create order.");

      setLoading(paymentBtn, true, "Processing Payment...");

      try {
        // Server expects email + courseId + couponCode (couponCode may be empty string)
        const payload = { email, courseId: selectedCourseId, couponCode: coupon || "" };
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
                sessionStorage.removeItem("buyerCoupon");
                sessionStorage.removeItem("buyerEmail");

                // Get the link from server response
                const downloadUrl = verifyData.downloadLink || "#";

                // Inject Styles + HTML
                const successStyles = `
                  <style>
                    body { margin: 0; overflow: hidden; font-family: 'Inter', sans-serif; }
                    .payment-success-wrapper {
                      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                      background: #ffffff; z-index: 9999; display: flex;
                      align-items: center; justify-content: center;
                      animation: fadeInPage 0.5s ease-out forwards;
                    }
                    .success-card {
                      text-align: center; max-width: 480px; width: 90%; padding: 40px;
                      transform: translateY(20px); opacity: 0;
                      animation: slideUpCard 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
                    }
                    .success-title {
                      font-size: 2rem; font-weight: 800; color: #0f172a;
                      margin: 24px 0 12px; letter-spacing: -0.03em;
                    }
                    .success-desc {
                      color: #64748b; font-size: 1.05rem; line-height: 1.6; margin-bottom: 32px;
                    }
                    .email-highlight { color: #0f172a; font-weight: 700; }
                    
                    /* Primary Action: Download */
                    .btn-download {
                      display: inline-flex; align-items: center; justify-content: center;
                      background-color: #2563eb; /* Bright Blue */
                      color: white; width: 100%; max-width: 280px;
                      padding: 16px 24px; border-radius: 12px; text-decoration: none;
                      font-weight: 700; font-size: 1.1rem;
                      transition: all 0.2s; box-shadow: 0 10px 20px -5px rgba(37, 99, 235, 0.4);
                      margin-bottom: 16px;
                    }
                    .btn-download:hover { transform: translateY(-3px); box-shadow: 0 15px 30px -5px rgba(37, 99, 235, 0.5); }
                    
                    /* Secondary: Home */
                    .btn-home {
                      display: inline-block; color: #64748b; font-weight: 600;
                      text-decoration: none; font-size: 0.95rem; margin-top: 12px;
                    }
                    .btn-home:hover { color: #0f172a; text-decoration: underline; }

                    /* Checkmark Animation */
                    .checkmark-circle {
                      width: 80px; height: 80px; border-radius: 50%; display: block;
                      stroke-width: 2; stroke: #10b981; stroke-miterlimit: 10;
                      margin: 0 auto; box-shadow: inset 0 0 0 #10b981;
                      animation: fill 0.4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
                    }
                    .checkmark-check {
                      transform-origin: 50% 50%; stroke-dasharray: 48; stroke-dashoffset: 48;
                      animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
                    }
                    @keyframes fadeInPage { to { opacity: 1; } }
                    @keyframes slideUpCard { to { opacity: 1; transform: translateY(0); } }
                    @keyframes stroke { 100% { stroke-dashoffset: 0; } }
                    @keyframes scale { 0%, 100% { transform: none; } 50% { transform: scale3d(1.1, 1.1, 1); } }
                    @keyframes fill { 100% { box-shadow: inset 0 0 0 50px #ecfdf5; } }
                  </style>
                `;

                document.body.innerHTML = successStyles + `
                  <div class="payment-success-wrapper">
                    <div class="success-card">
                      
                      <svg class="checkmark-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark-circle-bg" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                      </svg>

                      <h1 class="success-title">Payment Successful!</h1>
                      
                      <p class="success-desc">
                        Thank you for your purchase. You can download your course below.
                        <br><span style="font-size:0.9rem; opacity:0.8;">(A copy has also been sent to <span class="email-highlight">${email}</span>)</span>
                      </p>

                      <a href="${downloadUrl}" target="_blank" class="btn-download">
                        Download Course ⬇
                      </a>
                      
                      <br>

                      <a href="/" class="btn-home">Return to Home</a>
                      
                      <div style="margin-top:30px; border-top:1px solid #f1f5f9; padding-top:20px;">
                        <a href="#" onclick="window.print()" style="color:#94a3b8; font-size:0.8rem;">Download Receipt</a>
                      </div>

                    </div>
                  </div>
                `;
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

  if (paymentBtn) paymentBtn.disabled = true;

  // small accessibility: show year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
