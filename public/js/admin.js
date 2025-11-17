//C:\Ebook\public\js\admin.js
// =============================
// Sidebar Navigation
// =============================
const links = document.querySelectorAll(".sidebar-nav a");
const sections = document.querySelectorAll(".content-section");
const sectionTitle = document.getElementById("section-title");

links.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();

    // remove active state
    links.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");

    // hide all sections
    sections.forEach((sec) => sec.classList.add("hidden"));

    // show selected section
    const sectionId = link.getAttribute("data-section");
    document.getElementById(sectionId).classList.remove("hidden");

    // update page title text (strip emojis)
    sectionTitle.textContent = link.textContent.replace(/[^a-zA-Z]/g, "");
  });
});

// =============================
// Logout
// =============================
function logout() {
  authFetch(`${window.API_BASE}/api/admin/auth/logout`, { method: "POST" })
    .then(() => location.reload())
    .catch(() => location.reload());
}

// =============================
// Notification helper
// =============================
function showNotification(type, message) {
  const container = document.getElementById("notification");
  if (!container) return;

  const card = document.createElement("div");
  card.className = `notify-card ${type === "success" ? "notify-success" : "notify-error"}`;
  card.innerHTML = `
    <div class="icon">${type === "success" ? "✅" : "❌"}</div>
    <div class="msg">${message}</div>
  `;

  container.appendChild(card);
  container.style.display = "block";

  setTimeout(() => {
    card.classList.add("show");
  }, 20);

  setTimeout(() => {
    card.classList.remove("show");
    setTimeout(() => card.remove(), 300);
  }, 4000);
}

// =============================
// Authenticated Fetch Wrapper (cookie-based)
// =============================
async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    if (typeof showNotification === "function") {
      showNotification("error", "🔒 Unauthorized. Please log in again.");
    }
    const overlay = document.getElementById("login-overlay");
    if (overlay) overlay.style.display = "flex";
    throw new Error("Unauthorized");
  }

  return response;
}


// =============================
// Dashboard Charts
// =============================
async function loadSalesDashboard() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/sales`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Failed to load sales");

    // ====== LINE CHART: Daily Sales ======
    const dailyCtx = document.getElementById("salesChart");
    if (dailyCtx) {
      const labels = data.dailySales.map((d) => `${d._id.day}-${d._id.month}`);
      const values = data.dailySales.map((d) => d.total);

      new Chart(dailyCtx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Daily Sales (₹)",
              data: values,
              borderColor: "#3498db",
              backgroundColor: "rgba(52,152,219,0.2)",
              tension: 0.4,
              fill: true,
              pointRadius: 5,
              pointBackgroundColor: "#2980b9",
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: { y: { beginAtZero: true } },
        },
      });
    }

    // ====== TOTAL SALES PER COURSE ======
    const courseSalesDiv = document.getElementById("course-sales");
    if (courseSalesDiv) {
      courseSalesDiv.innerHTML = data.salesPerCourse
        .map((c) => `<div>${c.courseTitle}: ₹${c.totalSales} (${c.count} sales)</div>`)
        .join("");
    }

    // ====== COUPON USAGE ======
    const couponUsageDiv = document.getElementById("coupon-usage");
    if (couponUsageDiv) {
      couponUsageDiv.innerHTML = data.couponUsage
        .map(
          (c) =>
            `<div>Coupon ${c.code}: used ${c.usageCount} times, total discount ₹${c.totalDiscount}</div>`
        )
        .join("");
    }
  } catch (err) {
    console.error("❌ Load sales dashboard error:", err);
  }
}

// =============================
// Dashboard Stats
// =============================
async function fetchDashboardStats() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/stats`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) {
      document.getElementById("dashboard-courses").textContent = data.stats.courses;
      document.getElementById("dashboard-coupons").textContent = data.stats.coupons;
      document.getElementById("dashboard-sales").textContent = data.stats.sales;
    }
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

// =============================
// Courses Section
// =============================
const addCourseForm = document.getElementById("add-course-form");
const courseList = document.getElementById("course-list");

async function fetchCourses() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/courses`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) renderCourses(data.courses);
  } catch (err) {
    console.error("Fetch courses error:", err);
  }
}

function renderCourses(courses) {
  courseList.innerHTML = "";
  courses.forEach((course) => {
    const item = document.createElement("div");
    item.className = "course-item";
    item.innerHTML = `
      <img src="${course.thumbnail}" alt="${course.title}" width="80" />
      <div>
        <h4>${course.title}</h4>
        <p>${course.description}</p>
        <p><strong>₹${course.price}</strong></p>
      </div>
      <div class="actions">
        <button onclick="editCourse('${course._id}')">Edit</button>
        <button onclick="deleteCourse('${course._id}')">Delete</button>
      </div>
    `;
    courseList.appendChild(item);
  });
}

addCourseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(addCourseForm);
  try {
    const res = await authFetch(`${window.API_BASE}/api/courses`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) {
      showNotification("success", "Course added successfully");
      addCourseForm.reset();
      fetchCourses();
    } else {
      showNotification("error", data.message);
    }
  } catch {
    showNotification("error", "Server error while adding course");
  }
});

async function editCourse(id) {
  const title = prompt("Enter new title:");
  const description = prompt("Enter new description:");
  const price = prompt("Enter new price:");
  const googleDriveLink = prompt("Enter new Google Drive link:");
  if (!title || !description || !price || !googleDriveLink) return;

  try {
    const res = await authFetch(`${window.API_BASE}/api/courses/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, price, googleDriveLink }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) {
      showNotification("success", "Course updated");
      fetchCourses();
    } else {
      showNotification("error", data.message);
    }
  } catch {
    showNotification("error", "Server error while updating course");
  }
}

async function deleteCourse(id) {
  if (!confirm("Delete this course?")) return;
  try {
    const res = await authFetch(`${window.API_BASE}/api/courses/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) {
      showNotification("success", "Course deleted");
      fetchCourses();
    } else {
      showNotification("error", data.message);
    }
  } catch {
    showNotification("error", "Server error while deleting course");
  }
}

// =============================
// Coupons Section
// =============================
const couponCourseSelect = document.getElementById("coupon-course-select");
const couponList = document.getElementById("coupon-list");
const addCouponForm = document.getElementById("add-coupon-form");

async function loadCoursesForCoupons() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/courses`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    couponCourseSelect.innerHTML = `<option value="">-- Select Course --</option>`;
    if (data.success) {
      data.courses.forEach(
        (c) =>
          (couponCourseSelect.innerHTML += `<option value="${c._id}">${c.title} (₹${c.price})</option>`)
      );
    }
  } catch (err) {
    console.error("Error loading courses:", err);
  }
}

async function loadCoupons() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/coupons`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.success) {
      couponList.innerHTML = data.coupons
        .map(
          (c) => `
        <div class="coupon-card">
          <h4>${c.code} - ${c.courseId?.title || "Unknown Course"}</h4>
          <p>Discount: ₹${c.discount}</p>
          <p>Influencer UPI: ${c.influencerUPI || "-"} (₹${c.influencerCommission || 0})</p>
          <p>Ebook Creator UPI: ${c.ebookCreatorUPI || "-"} (₹${c.ebookCreatorCommission || 0})</p>
          <button onclick="deleteCoupon('${c._id}')">❌ Delete</button>
        </div>
      `
        )
        .join("");
    }
  } catch (err) {
    console.error("Error loading coupons:", err);
  }
}

addCouponForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formEntries = Object.fromEntries(new FormData(addCouponForm).entries());
  const data = {
    ...formEntries,
    discount: Number(formEntries.discount || 0),
    influencerCommission: Number(formEntries.influencerCommission || 0),
    ebookCreatorCommission: Number(formEntries.ebookCreatorCommission || 0),
    // read the checkbox explicitly to get a boolean
    isDefault: !!document.getElementById("addCouponDefault") && document.getElementById("addCouponDefault").checked,
  };
  data.discount = Number(data.discount);
  data.influencerCommission = Number(data.influencerCommission || 0);
  data.ebookCreatorCommission = Number(data.ebookCreatorCommission || 0);

  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/coupons`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const result = await res.json();
    if (result.success) {
      showNotification("success", "Coupon added");
      addCouponForm.reset();
      loadCoupons();
    } else {
      showNotification("error", result.message);
    }
  } catch {
    showNotification("error", "Server error while adding coupon");
  }
});

async function deleteCoupon(id) {
  if (!confirm("Delete this coupon?")) return;
  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/coupons/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const result = await res.json();
    if (result.success) {
      showNotification("success", "Coupon deleted");
      loadCoupons();
    } else {
      showNotification("error", result.message);
    }
  } catch {
    showNotification("error", "Server error while deleting coupon");
  }
}
window.deleteCoupon = deleteCoupon;

// =============================
// Failed Emails Section
// =============================
const resendAllBtn = document.getElementById("resendAllBtn");

async function loadFailedEmails() {
  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/failed-emails`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    const tbody = document.getElementById("failedEmailsList");
    tbody.innerHTML = "";

    if (!data.success || !data.failedOrders || !data.failedOrders.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">✅ No failed emails</td></tr>`;
      return;
    }

    // Build rows
    data.failedOrders.forEach((order) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${order.buyerEmail || "N/A"}</td>
        <td>${order.courseId?.title || "N/A"}</td>
        <td>${order.razorpayOrderId || "N/A"}</td>
        <td>${order.paidAt ? new Date(order.paidAt).toLocaleString() : "N/A"}</td>
        <td>${order.emailFailReason ? String(order.emailFailReason) : "—"}</td>
        <td><button class="btn resend-btn" data-id="${order._id}">Resend</button></td>
      `;
      tbody.appendChild(tr);
    });

    // Attach handlers to the dynamically-created buttons
    document.querySelectorAll(".resend-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.id;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Resending...";
        try {
          const res = await authFetch(`${window.API_BASE}/api/admin/resend-email/${orderId}`, { method: "POST" });
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          const result = await res.json();
          if (result.success) {
            showNotification("success", "Email resent successfully");
            // Refresh the list so the order disappears (or update the row)
            await loadFailedEmails();
          } else {
            showNotification("error", result.message || "Resend failed");
          }
        } catch (err) {
          console.error("Resend error", err);
          showNotification("error", "Server error");
        } finally {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  } catch (err) {
    console.error("Failed to load failed emails:", err);
    const tbody = document.getElementById("failedEmailsList");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#a00">Error loading failed emails</td></tr>`;
  }
}


if (resendAllBtn) {
  resendAllBtn.addEventListener("click", async () => {
    if (!confirm("Resend ALL failed emails?")) return;
    try {
      const res = await authFetch(`${window.API_BASE}/api/admin/resend-all-emails`, { method: "POST" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.success) {
        showNotification("success", data.message);
        loadFailedEmails();
      } else {
        showNotification("error", data.message);
      }
    } catch {
      showNotification("error", "Server error while resending all emails");
    }
  });
}
