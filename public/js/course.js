//C:\Ebook\public\js\course.js
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get("id");
  const courseDetails = document.getElementById("course-details");

  if (!courseId) {
    courseDetails.innerHTML = "<p>⚠️ No course selected.</p>";
    return;
  }

  try {
    // Fetch course details
    const res = await fetch(`${window.API_BASE}/api/courses/${courseId}`);
    const course = await res.json();

    // Replace skeleton with real data
    courseDetails.innerHTML = `
      <img src="${course.thumbnail}" alt="${course.title}">
      <h1>${course.title}</h1>
      <p>${course.description}</p>
      <div class="price">Price: ₹${course.price}</div>
      <input type="email" id="email" class="email-input" placeholder="Enter your email" required />
      <button class="buy-btn" id="buyBtn">Buy Now</button>
    `;

    // Buy button logic remains same...
    document.getElementById("buyBtn").onclick = async () => {
      const email = document.getElementById("email").value;

      if (!email) {
        alert("Please enter your email before payment");
        return;
      }

      // Creates order
      const orderRes = await fetch(`${window.API_BASE}/api/payment/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: course.price * 100 })
      });
      const orderData = await orderRes.json();

      // Razorpay Checkout
      const options = {
        key: orderData.keyId, 
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Stribble",
        description: course.title,
        order_id: orderData.id,
        handler: async function (response) {
          const verifyRes = await fetch(`${window.API_BASE}/api/payment/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              courseId,
              amount: course.price,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            alert("✅ Payment successful! Check your email for the course link.");
          } else {
            alert("❌ Payment verification failed");
          }
        },
        theme: { color: "#182A42" }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    };

  } catch (err) {
    console.error("Error fetching course details:", err);
    courseDetails.innerHTML = "<p>⚠️ Failed to load course details.</p>";
  }
});

