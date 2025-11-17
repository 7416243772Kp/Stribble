// public/js/checkout.js
// Robust checkout script with safe API_BASE usage and fallback to localStorage

// allow selectedCourseId to be changed later if missing from URL
const urlParams = new URLSearchParams(window.location.search);
let selectedCourseId = urlParams.get("courseId");

// safe API base (settings.js should set window.API_BASE, but use fallback)
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

// small helper to fetch and surface server errors (returns parsed JSON on success)
async function safeJsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  // try parse JSON if possible
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (e) {
    parsed = null;
  }
  if (!res.ok) {
    console.error("API Error:", res.status, url, text);
    // if server returned json with message, surface it
    const msg = parsed?.message || parsed?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return parsed;
}

document.addEventListener("DOMContentLoaded", () => {
  // read stored course (course page stored this previously)
  const course = JSON.parse(localStorage.getItem("selectedCourse") || "null");

  // If URL param missing, try to use stored course id
  if (!selectedCourseId && course?._id) {
    selectedCourseId = course._id;
    console.log("[checkout] courseId taken from localStorage:", selectedCourseId);
  }

  // --- Populate UI ---
  if (course) {
    const titleEl = document.getElementById("courseTitle");
    const priceEl = document.getElementById("coursePrice");
    const totalEl = document.getElementById("totalAmount");

    if (titleEl) titleEl.textContent = "📘 " + (course.title || "Untitled Course");
    if (priceEl) priceEl.textContent = "₹" + (course.price ?? "0");
    if (totalEl) {
      totalEl.textContent = "₹" + (course.price ?? "0");
      totalEl.dataset.amount = course.price ?? 0;
      totalEl.dataset.finalAmount = course.price ?? 0;
    }
  } else {
    const titleEl = document.getElementById("courseTitle");
    if (titleEl) titleEl.textContent = "⚠️ No course selected";
  }

  // --- Elements ---
  const emailInput = document.getElementById("email");
  const couponInput = document.getElementById("coupon");
  const otpInput = document.getElementById("otp");
  const validateBtn = document.getElementById("validate-btn");
  const verifyOtpBtn = document.getElementById("verify-otp-btn");
  const paymentBtn = document.getElementById("payment-btn");
  const notificationBox = document.getElementById("notification");
  const form = document.getElementById("checkoutForm");

  // --- Helpers ---
  function setLoading(button, isLoading, text = "Processing...") {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  let _notifyTimer = null;
  function showNotification(type, message, options = {}) {
    if (!notificationBox) return console.log(type, message);
    const autoHideMs = options.autoHideMs ?? 6000;
    const showClose = options.showClose ?? true;

    if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = null; }
    notificationBox.innerHTML = "";
    notificationBox.style.display = "block";

    const card = document.createElement("div");
    card.className = `notify-card notify-${type}`;

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = type === "success" ? "✓" : "⚠️";
    card.appendChild(icon);

    const msg = document.createElement("div");
    msg.className = "msg";
    msg.innerText = message;
    card.appendChild(msg);

    if (showClose) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "close-btn";
      closeBtn.innerHTML = "✕";
      closeBtn.onclick = () => {
        card.classList.remove("show");
        setTimeout(() => {
          if (notificationBox.contains(card)) notificationBox.removeChild(card);
          if (!notificationBox.hasChildNodes()) notificationBox.style.display = "none";
        }, 220);
        if (_notifyTimer) { clearTimeout(_notifyTimer); _notifyTimer = null; }
      };
      card.appendChild(closeBtn);
    }

    notificationBox.appendChild(card);
    void card.offsetWidth;
    card.classList.add("show");

    _notifyTimer = setTimeout(() => {
      card.classList.remove("show");
      setTimeout(() => {
        if (notificationBox.contains(card)) notificationBox.removeChild(card);
        if (!notificationBox.hasChildNodes()) notificationBox.style.display = "none";
      }, 220);
      _notifyTimer = null;
    }, autoHideMs);
  }

  function showSuccess(message) { showNotification("success", message); }
  function showError(input, message) {
    if (input && input.classList) {
      input.classList.add("shake", "border-red-500");
      setTimeout(() => input.classList.remove("shake", "border-red-500"), 500);
    }
    showNotification("error", message);
  }

  // --- Restore saved coupon/email if available ---
  if (emailInput && sessionStorage.getItem("buyerEmail")) emailInput.value = sessionStorage.getItem("buyerEmail");
  if (couponInput && sessionStorage.getItem("buyerCoupon")) couponInput.value = sessionStorage.getItem("buyerCoupon");

  // --- Step 1: Validate email + coupon → send OTP ---
  if (validateBtn) {
    validateBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const coupon = (couponInput.value || "").trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) { showError(emailInput, " Enter a valid email address."); return; }
      if (!coupon) { showError(couponInput, " Please enter a coupon code."); return; }
      if (!selectedCourseId && course?._id) {
        selectedCourseId = course._id;
      }
      if (!selectedCourseId) {
        showError(null, "No course selected. Go back and click Buy on a course.");
        return;
      }

      setLoading(validateBtn, true);

      try {
        // NOTE: server's /api/validate/email expects only email in your server; 
        // if you actually want coupon validation + OTP use /api/checkout/validate on server.
        // Here we try /api/checkout/validate (coupon + course) first, fallback to /api/validate/email.
        let data = null;
        try {
          data = await safeJsonFetch(`${API_BASE}/api/checkout/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, couponCode: coupon, courseId: selectedCourseId }),
          });
        } catch (err) {
          // If checkout validate not available, try simple email OTP endpoint
          console.warn("checkout/validate failed, trying validate/email:", err.message || err);
          const fallback = await safeJsonFetch(`${API_BASE}/api/validate/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          data = fallback;
        }

        // If server responded with coupon object (from checkout/validate), update totals
        sessionStorage.setItem("buyerEmail", email);
        sessionStorage.setItem("buyerCoupon", coupon);

        try {
          const priceEl = document.getElementById("totalAmount");
          const baseAmount = Number(priceEl?.dataset.amount) || (course?.price || 0);
          const discount = Number(data?.coupon?.discount || 0);
          const final = Math.max(1, baseAmount - discount);
          if (priceEl) {
            priceEl.textContent = "₹" + final;
            priceEl.dataset.finalAmount = final;
          }
        } catch (e) {
          console.warn("Failed to update totals after coupon validation:", e);
        }

        showSuccess("OTP sent! Please check your email.");
        if (otpInput) otpInput.disabled = false;
        if (verifyOtpBtn) verifyOtpBtn.disabled = false;
      } catch (err) {
        console.error("Validate error:", err);
        showError(null, err.message || "Server error. Try again.");
      } finally {
        setLoading(validateBtn, false, "Validate & Send OTP");
      }
    });
  }

  // --- Step 2: Verify OTP ---
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      const email = (emailInput.value || "").trim();
      const otp = (otpInput.value || "").trim();
      if (!otp) { showError(otpInput, "Enter OTP"); return; }

      setLoading(verifyOtpBtn, true);
      try {
        const data = await safeJsonFetch(`${API_BASE}/api/checkout/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });

        if (!data?.success) {
          showError(otpInput, data?.message || "OTP verification failed");
          return;
        }
        showSuccess("OTP verified! You can now proceed to payment.");
        if (paymentBtn) paymentBtn.disabled = false;
      } catch (err) {
        console.error("OTP verify error:", err);
        showError(otpInput, err.message || "Server error. Try again.");
      } finally {
        setLoading(verifyOtpBtn, false, "Verify OTP");
      }
    });
  }

  // --- Step 3: Payment ---
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!course) return showError(null, "No course selected!");

      const email = (emailInput.value || "").trim();
      const coupon = (couponInput.value || "").trim();
      const finalAmount = parseFloat(document.getElementById("totalAmount")?.dataset.finalAmount) || course.price;

      if (!selectedCourseId && course?._id) selectedCourseId = course._id;
      if (!selectedCourseId) return showError(null, "No course selected. Can't create order.");

      setLoading(paymentBtn, true, "Processing Payment...");

      try {
        const payload = {
          amount: finalAmount,
          courseId: selectedCourseId,
          couponCode: coupon,
          email,
        };

        const data = await safeJsonFetch(`${API_BASE}/api/payment/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!data?.success) {
          throw new Error(data?.message || "Payment order creation failed");
        }

        // open Razorpay
        const options = {
          key: data.keyId || (window.RAZORPAY_KEY_ID || ""),
          amount: data.amountPaise,
          currency: data.currency,
          name: "Stribble",
          description: course.title,
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
                }),
              });

              if (verifyData.success) {
                showSuccess("Payment successful! 🎉 Course has been sent to your email.");
                sessionStorage.removeItem("buyerCoupon");
                sessionStorage.removeItem("buyerEmail");
              } else {
                showError(null, verifyData.message || "Payment verification failed");
              }
            } catch (err) {
              console.error("Payment verify failed:", err);
              showError(null, err.message || "Payment verification error");
            }
          },
          theme: { color: "#182A42" },
        };

        const rzp = new Razorpay(options);
        rzp.on("payment.failed", function (response) {
          console.error("Razorpay payment.failed", response);
          showError(null, "Payment failed or cancelled. Please try again.");
        });
        rzp.open();
      } catch (err) {
        console.error("Order creation / payment error:", err);
        showError(null, err.message || "Payment failed. Try again!");
      } finally {
        setLoading(paymentBtn, false, "Proceed to Pay");
      }
    });
  }
});
