
const urlParams = new URLSearchParams(window.location.search);
const selectedCourseId = urlParams.get("courseId");

document.addEventListener("DOMContentLoaded", () => {
  const course = JSON.parse(localStorage.getItem("selectedCourse"));

  if (course) {
    document.getElementById("courseTitle").textContent = "📘 " + course.title;
    document.getElementById("coursePrice").textContent = "₹" + course.price;
    document.getElementById("totalAmount").textContent = "₹" + course.price;
    document.getElementById("totalAmount").dataset.amount = course.price;
    document.getElementById("totalAmount").dataset.finalAmount = course.price;
  } else {
    document.getElementById("courseTitle").textContent = "⚠️ No course selected";
  }

  // --- Elements ---
  const emailInput = document.getElementById("email");
  const couponInput = document.getElementById("coupon");
  const otpInput = document.getElementById("otp");
  const validateBtn = document.getElementById("validate-btn");
  const verifyOtpBtn = document.getElementById("verify-otp-btn");
  const paymentBtn = document.getElementById("payment-btn");
  const notificationBox = document.getElementById("notification");

  // --- Button loading helper ---
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

  // --- Notification System ---
  let _notifyTimer = null;

  function showNotification(type, message, options = {}) {
    const autoHideMs = options.autoHideMs ?? 6000;
    const showClose = options.showClose ?? true;

    if (_notifyTimer) {
      clearTimeout(_notifyTimer);
      _notifyTimer = null;
    }
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

    void card.offsetWidth; // trigger reflow
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

  function showSuccess(message) {
    showNotification("success", message);
  }

  function showError(input, message) {
    if (input && input.classList) {
      input.classList.add("shake", "border-red-500");
      setTimeout(() => input.classList.remove("shake", "border-red-500"), 500);
    }
    showNotification("error", message);
  }

  // --- Restore saved coupon/email if available ---
  if (sessionStorage.getItem("buyerEmail")) {
    emailInput.value = sessionStorage.getItem("buyerEmail");
  }
  if (sessionStorage.getItem("buyerCoupon")) {
    couponInput.value = sessionStorage.getItem("buyerCoupon");
  }

  // --- Step 1: Validate email + coupon → send OTP ---
  validateBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const coupon = couponInput.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError(emailInput, " Enter a valid email address.");
      return;
    }

    if (!coupon) {
      showError(couponInput, " Please enter a coupon code.");
      return;
    }

    setLoading(validateBtn, true);

    try {
      const res = await fetch(`${window.API_BASE}/api/validate/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, couponCode: coupon, courseId: selectedCourseId })
      });
      const data = await res.json();

      if (!data.success) {
        return showError(couponInput, data.message || "Invalid coupon");
      }

      sessionStorage.setItem("buyerEmail", email);
      sessionStorage.setItem("buyerCoupon", coupon);

      // NEW: update totals after coupon validation
      try {
        const priceEl = document.getElementById("totalAmount");
        const baseAmount = Number(priceEl.dataset.amount) || (course?.price || 0);
        const discount = Number(data?.coupon?.discount || 0);
        const final = Math.max(1, baseAmount - discount); // enforce >= ₹1

        priceEl.textContent = "₹" + final;
        priceEl.dataset.finalAmount = final;
      } catch (e) {
        console.warn("Failed to update totals after coupon validation:", e);
      }

      showSuccess("OTP sent! Please check your email.");
      otpInput.disabled = false;
      verifyOtpBtn.disabled = false;
    } catch (err) {
      showError(emailInput, "Server error. Try again.");
    } finally {
      setLoading(validateBtn, false, "Validate & Send OTP");
    }
  });

  // --- Step 2: Verify OTP ---
  verifyOtpBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const otp = otpInput.value.trim();

    setLoading(verifyOtpBtn, true);

    try {
      const res = await fetch(`${window.API_BASE}/api/checkout/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();

      if (!data.success) return showError(otpInput, data.message);

      showSuccess("OTP verified! You can now proceed to payment.");
      paymentBtn.disabled = false;
    } catch (err) {
      showError(otpInput, "Server error. Try again.");
    } finally {
      setLoading(verifyOtpBtn, false, "Verify OTP");
    }
  });

  // --- Step 3: Payment ---
  const form = document.getElementById("checkoutForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!course) return showError(null, "No course selected!");

    const email = emailInput.value.trim();
    const coupon = couponInput.value.trim();
    const finalAmount = parseFloat(document.getElementById("totalAmount").dataset.finalAmount) || course.price;

    setLoading(paymentBtn, true, "Processing Payment...");

    try {
      const res = await fetch(`${window.API_BASE}/api/payment/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalAmount,
          courseId: selectedCourseId,
          couponCode: coupon,
          email
        }),
      });

      const data = await res.json();
      if (!data.success) {
        return showError(couponInput, data.message || "Payment order creation failed");
      }

      const options = {
        key: data.keyId,
        amount: data.amountPaise,
        currency: data.currency,
        name: "Stribble",
        description: course.title,
        order_id: data.orderId,
        handler: async function (response) {
          const verifyRes = await fetch(`${window.API_BASE}/api/payment/verify`, {
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
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            showSuccess("Payment successful! 🎉 Course has been sent to your email.");
            sessionStorage.removeItem("buyerCoupon");
            sessionStorage.removeItem("buyerEmail");
          } else {
            showError(couponInput, "Payment verification failed");
          }
        },
        theme: { color: "#182A42" },
      };

      const rzp = new Razorpay(options);
      rzp.on("payment.failed", function () {
        showError(null, "Payment failed or cancelled. Please try again.");
      });
      rzp.open();
    } catch (err) {
      console.error(err);
      showError(null, "Payment failed. Try again!");
    } finally {
      setLoading(paymentBtn, false, "Proceed to Pay");
    }
  });
});
