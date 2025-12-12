//C:\Ebook\public\js\admin.js
// =============================
// Sidebar Navigation
// =============================
const links = document.querySelectorAll(".sidebar-nav a:not([onclick]):not(#nav-logout)");
const sections = document.querySelectorAll(".content-section");
const sectionTitle = document.getElementById("section-title");

const editOverlay = document.getElementById('edit-course-overlay');
const editForm = document.getElementById('edit-course-form');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const editCouponOverlay = document.getElementById('edit-coupon-overlay');
const editCouponForm = document.getElementById('edit-coupon-form');
const cancelCouponBtn = document.getElementById('cancel-coupon-edit');

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

// -----------------------------
// NEW SECURE CSP FIX: Attach logout via JS
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  const logoutLink = document.getElementById("nav-logout");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent default link navigation
      logout();
    });
  }
});


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
  const courseList = document.getElementById("course-list");
  if (!courseList) return;

  courseList.innerHTML = "";

  if (courses.length === 0) {
    courseList.innerHTML = '<p style="color:#64748b; grid-column:1/-1; text-align:center;">No courses available.</p>';
    return;
  }

  courses.forEach((course) => {
    const item = document.createElement("div");
    item.className = "course-admin-card"; // New Class

    // Format price securely
    const price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(course.price || 0);

    item.innerHTML = `
      <div class="course-admin-media">
        <img src="${course.thumbnail || '/images/placeholder-course.png'}" alt="${course.title || 'Course'}" loading="lazy" />
      </div>
      
      <div class="course-admin-body">
        <h4 class="course-admin-title" title="${course.title}">${course.title}</h4>
        <p class="course-admin-desc">${course.description || 'No description provided.'}</p>
        <div class="course-admin-price">${price}</div>
        
        <div class="course-admin-actions">
          <button class="btn-action-edit" onclick="editCourse('${course._id}')">
            ✏️ Edit
          </button>
          <button class="btn-action-delete" onclick="deleteCourse('${course._id}')">
            🗑 Delete
          </button>
        </div>
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
  const submitBtn = editForm.querySelector('button[type="submit"]');
  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  // Show modal immediately
  editOverlay.classList.remove('hidden');
  editOverlay.setAttribute('aria-hidden', 'false');

  try {
    // Fetch current details
    const res = await fetch(`${window.API_BASE}/api/courses/${id}`);
    const data = await res.json();
    const course = data.course || data;

    // Fill fields
    document.getElementById('edit-course-id').value = course._id;
    document.getElementById('edit-title').value = course.title || '';
    document.getElementById('edit-desc').value = course.description || '';
    document.getElementById('edit-price').value = course.price || '';
    // Note: For security, backend might not return the link. User enters new one if they want to change it.
    document.getElementById('edit-link').value = course.googleDriveLink || '';

  } catch (err) {
    console.error("Failed to fetch course details", err);
    showNotification("error", "Failed to load course details");
    editOverlay.classList.add('hidden');
  } finally {
    submitBtn.textContent = "Save Changes";
    submitBtn.disabled = false;
  }
}

async function editCoupon(id) {
  console.log("--- EDIT COUPON START ---"); // Added Log 1
  console.log("Attempting to fetch coupon details for ID:", id); // Added Log 2

  const submitBtn = editCouponForm.querySelector('button[type="submit"]');
  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  editCouponOverlay.classList.remove('hidden');
  editCouponOverlay.setAttribute('aria-hidden', 'false');

  try {
    // CRITICAL: Check the API path being used
    const url = `${window.API_BASE}/api/admin/coupons/${id}`;
    console.log("Fetching from URL:", url); // Added Log 3

    const res = await authFetch(url); // Auth fetch ensures session is checked

    if (!res.ok) {
      console.error("Fetch failed with status:", res.status); // Added Log 4
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    console.log("API Response Success:", data.success); // Added Log 5

    if (data.success) {
      const c = data.coupon;
      // ... (rest of field filling logic is here, omitted for brevity) ...
      console.log("Coupon data loaded successfully."); // Added Log 6
    } else {
      throw new Error(data.message || "API reported failure.");
    }
  } catch (err) {
    console.error("❌ EDIT COUPON FAILED:", err); // Added Log 7
    showNotification("error", "Failed to load coupon details. See console.");
    editCouponOverlay.classList.add('hidden');
  } finally {
    submitBtn.textContent = "Save Changes";
    submitBtn.disabled = false;
    console.log("--- EDIT COUPON END ---"); // Added Log 8
  }
}

// 2. Save Changes
if (editCouponForm) {
  editCouponForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-coupon-id').value;
    const submitBtn = editCouponForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;

    const payload = {
      code: document.getElementById('edit-coupon-code').value,
      discount: Number(document.getElementById('edit-coupon-discount').value),
      influencerUPI: document.getElementById('edit-inf-upi').value,
      influencerCommission: Number(document.getElementById('edit-inf-comm').value),
      ebookCreatorUPI: document.getElementById('edit-cre-upi').value,
      ebookCreatorCommission: Number(document.getElementById('edit-cre-comm').value)
    };

    try {
      const res = await authFetch(`${window.API_BASE}/api/admin/coupons/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showNotification("success", "Coupon updated");
        editCouponOverlay.classList.add('hidden');
        loadCoupons(); // Refresh grid
      } else {
        showNotification("error", data.message || "Update failed");
      }
    } catch (err) {
      showNotification("error", "Server error");
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// 3. Cancel Button
if (cancelCouponBtn) {
  cancelCouponBtn.addEventListener('click', () => {
    editCouponOverlay.classList.add('hidden');
  });
}

// Close on click outside
if (editCouponOverlay) {
  editCouponOverlay.addEventListener('click', (e) => {
    if (e.target === editCouponOverlay) editCouponOverlay.classList.add('hidden');
  });
}

// 2. Handle Save (Submit)
if (editForm) {
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-course-id').value;
    const title = document.getElementById('edit-title').value;
    const description = document.getElementById('edit-desc').value;
    const price = document.getElementById('edit-price').value;
    const googleDriveLink = document.getElementById('edit-link').value;

    const submitBtn = editForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;

    try {
      const res = await authFetch(`${window.API_BASE}/api/courses/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, price, googleDriveLink }),
      });

      const data = await res.json();

      if (data.success) {
        showNotification("success", "Course updated successfully");
        editOverlay.classList.add('hidden'); // Close modal
        fetchCourses(); // Refresh grid
      } else {
        showNotification("error", data.message || "Update failed");
      }
    } catch (err) {
      showNotification("error", "Server error while updating");
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// 3. Handle Cancel
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => {
    editOverlay.classList.add('hidden');
    editOverlay.setAttribute('aria-hidden', 'true');
  });
}

// Close if clicking outside the box
if (editOverlay) {
  editOverlay.addEventListener('click', (e) => {
    if (e.target === editOverlay) {
      editOverlay.classList.add('hidden');
    }
  });
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
      if (data.coupons.length === 0) {
        couponList.innerHTML = '<p style="color:#64748b; grid-column:1/-1;">No coupons found.</p>';
        return;
      }

      couponList.innerHTML = data.coupons.map((c) => {
        const courseName = c.courseId?.title || "Unknown";
        let upiText = "No UPI details set";
        if (c.influencerUPI && c.ebookCreatorUPI) upiText = `INF: ${c.influencerUPI}<br>CRE: ${c.ebookCreatorUPI}`;
        else if (c.influencerUPI) upiText = `INF: ${c.influencerUPI}`;
        else if (c.ebookCreatorUPI) upiText = `CRE: ${c.ebookCreatorUPI}`;

        return `
            <div class="coupon-card">
              <div class="coupon-header">
                <div class="coupon-code-badge">${c.code}</div>
                <div class="coupon-course" title="${courseName}">${courseName}</div>
              </div>
              
              <div class="coupon-body">
                <div class="info-group">
                  <span class="info-label">Discount</span>
                  <span class="info-val" style="color:#10b981;">-₹${c.discount}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Inf. Comm.</span>
                  <span class="info-val">₹${c.influencerCommission}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Uses</span>
                  <span class="info-val">${c.uses || 0}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Creator</span>
                  <span class="info-val">₹${c.ebookCreatorCommission}</span>
                </div>
              </div>

              <div class="upi-info">
                ${upiText}
              </div>

              <div style="display:flex; gap:10px; margin-top:auto;">
                <button class="btn-action-edit" onclick="editCoupon('${c._id}')" style="flex:1; justify-content:center;">
                  ✏️ Edit
                </button>
                <button class="btn-action-delete" onclick="deleteCoupon('${c._id}')" style="flex:1; justify-content:center;">
                  🗑 Delete
                </button>
              </div>
            </div>
          `;
      })
        .join("");
    }
  } catch (err) {
    console.error("Error loading coupons:", err);
    couponList.innerHTML = '<p style="color:red;">Failed to load coupons</p>';
  }
}

addCouponForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  // collect form values
  const formEntries = Object.fromEntries(new FormData(addCouponForm).entries());

  // build payload — ensure numeric fields are numbers (not strings)
  const data = {
    ...formEntries,
    discount: Number(formEntries.discount || 0),
    influencerCommission: Number(formEntries.influencerCommission || 0),
    ebookCreatorCommission: Number(formEntries.ebookCreatorCommission || 0),
    // NOTE: isDefault removed from frontend payload (server no longer relies on default coupon)
  };

  // Normalize empty strings to undefined for optional fields so server sees intended defaults
  if (data.influencerUPI === "") delete data.influencerUPI;
  if (data.ebookCreatorUPI === "") delete data.ebookCreatorUPI;

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
      showNotification("error", result.message || "Failed to add coupon");
    }
  } catch (err) {
    console.error("Add coupon error:", err);
    showNotification("error", "Server error while adding coupon");
  }
});


async function deleteCoupon(id) {
  console.log("--- DELETE COUPON START ---"); // Added Log 9
  if (!confirm("Delete this coupon?")) {
    console.log("Delete canceled by user."); // Added Log 10
    return;
  }

  try {
    const url = `${window.API_BASE}/api/admin/coupons/${id}`;
    console.log("Attempting DELETE on URL:", url); // Added Log 11

    const res = await authFetch(url, { method: "DELETE" });

    if (!res.ok) {
      console.error("DELETE failed with status:", res.status); // Added Log 12
      throw new Error(`Server returned ${res.status}`);
    }

    const result = await res.json();

    if (result.success) {
      console.log("DELETE API Success. Refreshing list."); // Added Log 13
      showNotification("success", "Coupon deleted");
      loadCoupons();
    } else {
      console.error("DELETE API reported failure:", result.message); // Added Log 14
      showNotification("error", result.message);
    }
  } catch (err) {
    console.error("❌ DELETE COUPON FAILED:", err); // Added Log 15
    showNotification("error", "Server error while deleting coupon. See console.");
  }
  console.log("--- DELETE COUPON END ---"); // Added Log 16
}

window.deleteCoupon = deleteCoupon; // Around line 554
window.editCoupon = editCoupon;

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

// --- Append this to public/js/admin.js ---

document.addEventListener("DOMContentLoaded", function () {
  const root = document.getElementById('adminRoot');
  const btn = document.getElementById('toggleSidebar');

  if (btn && root) {
    btn.addEventListener('click', () => {
      root.classList.toggle('collapsed');
      btn.textContent = root.classList.contains('collapsed') ? '⟶' : '⟵';
    });
  }

  const sections = ['dashboard', 'courses', 'coupons', 'sales', 'promoters'];

  function showSection(name) {
    sections.forEach(s => {
      const el = document.getElementById(s);
      if (el) {
        el.classList.toggle('hidden', s !== name);
        if (s === name) {
          const titleEl = document.getElementById('section-title');
          if (titleEl) titleEl.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        }
      }
    });

    document.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-section') === name);
    });

    if (name === 'promoters' && typeof window.loadPromoters === 'function') {
      window.loadPromoters();
    }
  }

  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(a.getAttribute('data-section'));
    });
  });

  // Expose to window if needed by other scripts, 
  // though sticking to event listeners is better
  window.adminShowSection = showSection;
});