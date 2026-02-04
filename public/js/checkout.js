// public/js/checkout.js

// 1. Get Params & API Base
const urlParams = new URLSearchParams(window.location.search);
let selectedCourseId = urlParams.get("courseId");

if (!selectedCourseId) {
  const pathParts = window.location.pathname.split('/');
  const segments = pathParts.filter(p => p.trim() !== "");
  if (segments.length >= 2 && segments[segments.length - 2] === 'checkout') {
     selectedCourseId = segments[segments.length - 1];
  }
}

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

document.addEventListener("DOMContentLoaded", async () => {
  // 2. CHECK SESSION (User MUST be logged in)
  let currentUser = null;
  try {
      const res = await safeJsonFetch(`${API_BASE}/auth/me`);
      if (res.success) {
          currentUser = res.user;
          console.log("[checkout] User logged in:", currentUser.email);

          // CHECK OWNERSHIP (Double Purchase Prevention)
          // We need selectedCourseId to be defined. It is defined at top of file.
          if (selectedCourseId && currentUser.purchasedCourses) {
              const isOwned = currentUser.purchasedCourses.some(c => (c._id || c) === selectedCourseId);
              if (isOwned) {
                  alert("You have already purchased this course!");
                  window.location.href = `/read.html?id=${selectedCourseId}`;
                  return;
              }
          }
      } else {
          // Not logged in -> Redirect to home/login
          alert("Please login to purchase courses.");
          window.location.href = "/";
          return;
      }
  } catch (e) {
      console.error("Session check failed", e);
      window.location.href = "/";
      return;
  }

  // 3. Initialize 'course'
  let course = JSON.parse(localStorage.getItem("selectedCourse") || "null");

  // FIX: If no course in localStorage but ID exists in URL, fetch it immediately
  if (!course && selectedCourseId) {
    try {
      const data = await safeJsonFetch(`${API_BASE}/api/courses/${selectedCourseId}`, { credentials: 'include' });
      course = data.course || data;
      console.log("[checkout] Course fetched from API:", course.title);
    } catch (err) {
      console.error("[checkout] Failed to fetch course details:", err);
    }
  }

  // Fallback: Use localStorage ID if URL ID is missing
  if (!selectedCourseId && course?._id) {
    selectedCourseId = course._id;
  }

  // Elements mapping
  const couponInput = document.getElementById("coupon");
  const paymentBtn = document.getElementById("payment-btn");
  // if(paymentBtn) paymentBtn.disabled = true; // No longer blocking by default
  const termsCheckbox = document.getElementById("termsCheckbox");
  
  // if (termsCheckbox && paymentBtn) {
  //     termsCheckbox.addEventListener('change', (e) => {
  //         paymentBtn.disabled = !e.target.checked;
  //     });
  // }
  const form = document.getElementById("checkoutForm");

  // Price display elements
  const priceBeforeEl = document.getElementById("priceBefore");
  const priceNowEl = document.getElementById("priceNow");
  const priceSavingsEl = document.getElementById("priceSavings");
  const totalAmtEl = document.getElementById('totalAmount'); // Helper for storing raw price

  // mini course info
  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");

  // coupon UI elements
  const applyCouponBtn = document.getElementById("apply-coupon-btn");
  const couponHint = document.getElementById("couponHint");
  const defaultCouponTag = document.getElementById("defaultCouponTag");

  // Notification Box Logic
  let notificationBox = document.getElementById("notification");
  if (!notificationBox) {
    const checkoutCard = document.querySelector(".checkout-form");
    if (checkoutCard) {
      notificationBox = document.createElement("div");
      notificationBox.id = "notification";
      notificationBox.style.marginBottom = "8px";
      checkoutCard.insertBefore(notificationBox, checkoutCard.firstChild);
    }
  }

  // 4. Initialize Price Dataset
  let priceDataset = {
    amount: 0,       // base price
    finalAmount: 0   // amount after coupon
  };

  // Populate UI with course data (Now works even if fetched from API)
  if (course) {
    const base = Number(course.price || 0);
    priceDataset.amount = base;
    priceDataset.finalAmount = base;
    
    // Update visual elements
    if (priceNowEl) priceNowEl.textContent = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(base);
    if (priceBeforeEl) priceBeforeEl.style.display = "none";
    if (priceSavingsEl) priceSavingsEl.style.display = "none";
    
    // Store raw amount in DOM for reliability
    if (totalAmtEl) {
        totalAmtEl.dataset.amount = base;
        totalAmtEl.dataset.finalAmount = base;
    }

    // Mini Info
    if (miniTitle) miniTitle.textContent = course.title || "Untitled course";
    const placeholderThumb = "/images/placeholder-course.png";
    if (miniThumb) {
      if (course.thumbnail && typeof course.thumbnail === "string") {
        if (course.thumbnail.startsWith("http") || course.thumbnail.startsWith("//")) {
             miniThumb.src = course.thumbnail;
        } else {
             miniThumb.src = API_BASE ? `${API_BASE}${course.thumbnail}` : course.thumbnail;
        }
        miniThumb.style.display = "";
      } else {
        miniThumb.src = placeholderThumb;
      }
    }
  } else {
    // Nothing selected
    if (priceNowEl) priceNowEl.textContent = "₹0";
  }

  // --- Notification Helpers ---
  let _notifyTimer = null;
  function clearNotifications() {
    if (!notificationBox) return;
    notificationBox.innerHTML = "";
    notificationBox.style.display = "none";
  }
  function showNotification(type, message, autoHideMs = 3000) {
    if (!notificationBox) { console.log(type, message); return; }
    clearNotifications();
    notificationBox.style.display = "block";
    
    // Clean CSS-class based HTML
    const icon = type === "success" 
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` 
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    notificationBox.innerHTML = `
      <div class="msg-toast msg-toast--${type}">
         ${icon} <span>${message}</span>
      </div>
    `;

    if (_notifyTimer) clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(() => { clearNotifications(); }, autoHideMs);
  }

  function showError(inputElOrMsg, msgMaybe) {
    let msg = typeof inputElOrMsg === "string" ? inputElOrMsg : msgMaybe;
    let inputEl = typeof inputElOrMsg !== "string" ? inputElOrMsg : null;
    
    if (inputEl) {
       inputEl.classList.add("input-error", "shake");
       setTimeout(() => inputEl.classList.remove("shake"), 500);
       const errDiv = document.getElementById("err-" + inputEl.id);
       if (errDiv) { 
         errDiv.innerHTML = `<div class="field-msg error">⚠️ ${msg}</div>`; 
         errDiv.style.display = "block"; 
         return; 
       }
    }
    showNotification("error", msg || "Something went wrong");
  }

  function clearError(id) {
     const el = document.getElementById(id);
     if(el) el.classList.remove("input-error");
     const err = document.getElementById("err-"+id);
     if(err) err.style.display="none";
  }

  function showInlineSuccess(id, msg) {
      const el = document.getElementById(id);
      if(el) { 
        // Use CSS class instead of inline style
        el.innerHTML = `<div class="field-msg success">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
           ${msg}
        </div>`; 
        el.style.display="block"; 
        
        // Auto-hide inline success after 3 seconds
        if(el.dataset.timer) clearTimeout(el.dataset.timer);
        el.dataset.timer = setTimeout(() => {
            el.style.display = "none";
        }, 3000); // Increased to 3s for better readability
      }
  }
  function setLoading(btn, isLoading, text) {
      if(!btn) return;
      if(isLoading) { btn.dataset.orig = btn.textContent; btn.textContent=text; btn.disabled=true; }
      else { btn.textContent = btn.dataset.orig || btn.textContent; btn.disabled=false; }
  }

  // --- Coupon Logic ---
  async function applyCoupon() {
    const code = (couponInput.value || "").trim();
    if (!code) { showError(couponInput, "Enter coupon code"); return; }
    // Ensure ID is set
    if (!selectedCourseId && course?._id) selectedCourseId = course._id;
    
    setLoading(applyCouponBtn, true, "Checking…");
    try {
      const result = await safeJsonFetch(`${API_BASE}/api/validate/coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponCode: code, courseId: selectedCourseId })
      });

      const coupon = result.coupon || result;
      if (!coupon) throw new Error("Invalid coupon");

      // Calculate logic
      const base = priceDataset.amount; // Use the robust dataset amount
      let savings = 0;
      const pct = Number(coupon?.percent || 0);
      const fixed = Number(coupon?.discount || coupon?.amount || 0);

      if (pct > 0) savings = Math.round((base * pct) / 100);
      else savings = fixed;

      const final = Math.max(0, base - savings);
      priceDataset.finalAmount = final;

      // Update UI
      if (priceBeforeEl) { priceBeforeEl.style.display = ""; priceBeforeEl.textContent = "₹" + base; }
      if (priceNowEl) priceNowEl.textContent = "₹" + final;
      if (priceSavingsEl) { priceSavingsEl.style.display = ""; priceSavingsEl.textContent = `You saved ₹${savings}`; }

      showInlineSuccess("couponMessage", `Coupon '${code}' applied! Saved ₹${savings}`);
      sessionStorage.setItem("buyerCoupon", code);
      clearError('coupon');
    } catch (err) {
      showError(couponInput, err.message || "Invalid coupon");
      // Reset price
      priceDataset.finalAmount = priceDataset.amount;
      if (priceNowEl) priceNowEl.textContent = "₹" + priceDataset.amount;
    } finally {
      setLoading(applyCouponBtn, false, "Apply");
    }
  }
  if (applyCouponBtn) applyCouponBtn.addEventListener("click", applyCoupon);



  // --- PAYMENT SUBMIT ---
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!course) { 
          showError(null, "No course selected! (Try refreshing)"); 
          return; 
      }

      if (!document.getElementById("termsCheckbox")?.checked) {
          // Show error on click
          showError(null, "Please accept the Terms & Privacy Policy");
           // Also highlight the checkbox area
           const termContainer = document.querySelector('.terms-container');
           if(termContainer) {
              termContainer.style.border = "1px solid red";
              termContainer.style.borderRadius = "8px";
              termContainer.style.padding = "8px";
              setTimeout(() => { 
                  termContainer.style.border = "none"; 
                  termContainer.style.padding = "0";
              }, 2000);
           }
          return;
      }

      // Use logged in user email
      const email = currentUser.email;
      const finalAmount = Number(priceDataset.finalAmount || course.price || 0);

      if(!selectedCourseId && course?._id) selectedCourseId = course._id;

      setLoading(paymentBtn, true, "Processing Payment...");

      try {
        const payload = { 
            email, // From session user
            courseId: selectedCourseId, 
            couponCode: couponInput.value.trim() 
        };
        
        const data = await safeJsonFetch(`${API_BASE}/api/payment/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!data.success) throw new Error(data.message || "Order creation failed");

        // Razorpay Options
        const options = {
          key: data.keyId,
          amount: data.amountPaise || data.amount * 100,
          currency: data.currency,
          name: "Stribble",
          description: course.title,
          order_id: data.orderId || data.razorpayOrder.id,
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

                const downloadUrl = verifyData.downloadLink || "#";

                // Inject Styles + HTML
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
                    
                    /* Primary Action: Read Now */
                    .btn-read {
                      display: inline-flex; align-items: center; justify-content: center;
                      background-color: #10b981; /* Emerald Green */
                      color: white; width: 100%; max-width: 280px;
                      padding: 16px 24px; border-radius: 12px; text-decoration: none;
                      font-weight: 700; font-size: 1.1rem;
                      transition: all 0.2s; box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.4);
                      margin-bottom: 16px;
                      cursor: pointer;
                    }
                    .btn-read:hover { transform: translateY(-3px); box-shadow: 0 15px 30px -5px rgba(16, 185, 129, 0.5); }
                    
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

                // Render the Success Page
                document.body.innerHTML = successStyles + `
                  <div class="payment-success-wrapper">
                    <div class="success-card">
                      
                      <svg class="checkmark-circle" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark-circle-bg" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                      </svg>

                      <h1 class="success-title">Payment Successful!</h1>
                      
                      <p class="success-desc">
                        Thank you for your purchase. You can now access your course.
                      </p>

                      <a href="/read.html?id=${selectedCourseId}" class="btn-read">
                        📖 Read Confirmation
                      </a>
                      
                      </a>
                      
                      <a href="/my-courses.html" class="btn-home">Go to My Courses</a>
                      
                      <div style="margin-top:20px; border-top:1px solid #f1f5f9; padding-top:10px;">
                        <a href="#" onclick="window.print()" style="color:#94a3b8; font-size:0.8rem;">Print Receipt</a>
                      </div>

                    </div>
                  </div>
                `;
                
                // No more download logging required here as it is streaming.

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
          showError(null, "Payment failed.");
        });
        rzp.open();

      } catch (err) {
        showError(null, err.message || "Payment init failed");
      } finally {
        setLoading(paymentBtn, false, "Proceed to Pay");
      }
    });
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
