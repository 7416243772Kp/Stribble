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
      const { 
        courses, coupons, sales, 
        todaySales, todayCount, weekSales, monthSales, lastMonthSales,
        perCourseSales = [], perCouponSales = [] 
      } = data.stats;

      const grid = document.querySelector("#dashboard .stats-grid");
      if (grid) {
        // Formatter for currency
        const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

        // Build HTML for all cards
        let html = `
          <div class="stat-card" style="flex: 1; min-width: 200px;">
            <h3>${courses}</h3>
            <p>Total Courses</p>
          </div>
          <div class="stat-card" style="flex: 1; min-width: 200px;">
            <h3>${coupons}</h3>
            <p>Total Coupons</p>
          </div>
          <div class="stat-card" style="flex: 1; min-width: 200px;">
            <h3>${sales}</h3>
            <p>Total Sales (Count)</p>
          </div>
          
          <!-- New Time-based Sales -->
          <div class="stat-card" style="flex: 1; min-width: 200px; border-color: #3b82f6;">
            <h3 style="color:#2563eb;">${fmt(todaySales)}</h3>
            <p>Today's Sales <strong>(${todayCount || 0} sold)</strong></p>
          </div>
          <div class="stat-card" style="flex: 1; min-width: 200px; border-color: #8b5cf6;">
            <h3 style="color:#7c3aed;">${fmt(weekSales)}</h3>
            <p>This Week's Sales</p>
          </div>
          <div class="stat-card" style="flex: 1; min-width: 200px; border-color: #10b981;">
            <h3 style="color:#059669;">${fmt(monthSales)}</h3>
            <p>This Month's Sales</p>
          </div>
          <div class="stat-card" style="flex: 1; min-width: 200px; border-color: #f59e0b;">
            <h3 style="color:#d97706;">${fmt(lastMonthSales || 0)}</h3>
            <p>Last Month's Sales</p>
          </div>
        `;

        // Append Per-Course Sales
        perCourseSales.forEach(c => {
           html += `
            <div class="stat-card" style="flex: 1; min-width: 250px;">
              <h4 style="font-size:1.1rem; margin-bottom:4px; color:#1e293b;">${c.title}</h4>
              <h3 style="font-size:1.5rem;">${fmt(c.total)}</h3>
              <p style="font-size:0.85rem;">${c.count} orders</p>
            </div>
           `; 
        });

        // Append Per-Coupon Sales
        perCouponSales.forEach(c => {
           html += `
            <div class="stat-card" style="flex: 1; min-width: 200px;">
              <h4 style="font-size:1.1rem; margin-bottom:4px; color:#1e293b;">Coupon: <span style="font-family:monospace; background:#f1f5f9; padding:2px 4px; border-radius:4px;">${c.code}</span></h4>
              <h3 style="font-size:1.5rem;">${fmt(c.total)}</h3>
              <p style="font-size:0.85rem;">${c.count} uses</p>
            </div>
           `; 
        });

        grid.innerHTML = html;
      }
    }
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

// C:\Ebook\public\js\admin.js (Courses Section Update)

// =============================
// Courses Section
// =============================
const addCourseForm = document.getElementById("add-course-form");
const courseList = document.getElementById("course-list");

// 1. Fetch & Render Courses
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

  if (!courses || courses.length === 0) {
    courseList.innerHTML = '<p style="color:#64748b; grid-column:1/-1; text-align:center;">No courses available.</p>';
    return;
  }

  courses.forEach((course) => {
    const item = document.createElement("div");
    item.className = "course-admin-card";

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
          <button class="btn-action-edit js-edit-course" type="button" data-id="${course._id}">
            ✏️ Edit
          </button>
          <button class="btn-action-delete js-delete-course" type="button" data-id="${course._id}">
            🗑 Delete
          </button>
        </div>
      </div>
    `;
    courseList.appendChild(item);
  });

  // Event Delegation for Courses
  courseList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.js-edit-course');
    const deleteBtn = e.target.closest('.js-delete-course');

    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      editCourse(id);
    } else if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-id');
      deleteCourse(id);
    }
  });
}

// 2. Add Course Listener
if (addCourseForm) {
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
}

// 3. Edit Course Function (Exposed to Window)
// 3. Edit Course Function (Exposed to Window)
async function editCourse(id) {
  console.log("editCourse called with id:", id);
  const editOverlay = document.getElementById('edit-course-overlay');
  const editForm = document.getElementById('edit-course-form');
  const submitBtn = editForm.querySelector('button[type="submit"]');

  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  // Show modal
  editOverlay.classList.remove('hidden');
  editOverlay.setAttribute('aria-hidden', 'false');

  try {
    const res = await fetch(`${window.API_BASE}/api/courses/${id}`);
    const data = await res.json();
    const course = data.course || data;
    console.log("Course details loaded:", course);

    // Fill fields
    document.getElementById('edit-course-id').value = course._id;
    document.getElementById('edit-title').value = course.title || '';
    document.getElementById('edit-desc').value = course.description || '';
    document.getElementById('edit-price').value = course.price || '';
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

// 4. Handle Edit Save
// [Duplicate course logic removed to fix redeclaration error]

// 2. Handle Save (Submit)
if (editForm) {
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Edit form submitted");

    const id = document.getElementById('edit-course-id').value;
    const submitBtn = editForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;

    // Create FormData object (Required for file uploads)
    const formData = new FormData();
    formData.append('title', document.getElementById('edit-title').value);
    formData.append('description', document.getElementById('edit-desc').value);
    formData.append('price', document.getElementById('edit-price').value);

    // Only append files if the user selected a new one
    const pdfInput = document.getElementById('edit-pdf'); 
    if (pdfInput && pdfInput.files[0]) {
        formData.append('coursePdf', pdfInput.files[0]);
    }

    try {
      // Do NOT set Content-Type header when sending FormData! Browser sets it automatically.
      const res = await authFetch(`${window.API_BASE}/api/courses/${id}`, {
        method: "PUT",
        body: formData, 
      });

      const data = await res.json();
      console.log("Update response:", data);

      if (data.success) {
        showNotification("success", "Course updated successfully");
        editOverlay.classList.add('hidden'); // Close modal
        fetchCourses(); // Refresh grid
      } else {
        showNotification("error", data.message || "Update failed");
      }
    } catch (err) {
      console.error("Update error:", err);
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
  console.log("deleteCourse called with id:", id);
  
  showConfirmModal(
      "Delete Course?", 
      "Are you sure you want to permanently delete this course? This action cannot be undone.",
      async () => {
          try {
            const res = await authFetch(`${window.API_BASE}/api/courses/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data = await res.json();
            console.log("Delete response:", data);
            if (data.success) {
              showNotification("success", "Course deleted");
              fetchCourses();
            } else {
              showNotification("error", data.message);
            }
          } catch (err) {
            console.error("Delete error:", err);
            showNotification("error", "Server error while deleting course");
          }
      }
  );
}

// CRITICAL: Attach to window so HTML onclick="..." can find them
window.editCourse = editCourse;
window.deleteCourse = deleteCourse;

// ===============================
// 2. Save Coupon Changes
// ===============================
if (editCouponForm) {
  editCouponForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-coupon-id').value;
    const submitBtn = editCouponForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = "Saving...";
    submitBtn.disabled = true;

    // Payload uses keys that the Backend Route expects
    const payload = {
      code: document.getElementById('edit-coupon-code').value,
      discount: Number(document.getElementById('edit-coupon-discount').value), // Send as 'discount'
      influencerUPI: document.getElementById('edit-inf-upi').value,           // Send as 'influencerUPI'
      influencerCommission: Number(document.getElementById('edit-inf-comm').value),
      ebookCreatorUPI: document.getElementById('edit-cre-upi').value,         // Send as 'ebookCreatorUPI'
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
        showNotification("success", "Coupon updated successfully");
        editCouponOverlay.classList.add('hidden');
        loadCoupons(); // Refresh the grid
      } else {
        showNotification("error", data.message || "Update failed");
      }
    } catch (err) {
      console.error("Save coupon error:", err);
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
  const couponList = document.getElementById("coupon-list");
  if (!couponList) return;

  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/coupons`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();

    if (data.success) {
      if (!data.coupons || data.coupons.length === 0) {
        couponList.innerHTML = '<p style="color:#64748b; grid-column:1/-1;">No coupons found.</p>';
        return;
      }

      couponList.innerHTML = data.coupons.map((c) => {
        const courseName = c.courseId?.title || "Unknown";
        
        // --- DATA NORMALIZATION FIX ---
        // We check for NEW name (e.g. discountValue) first. 
        // If missing, we fallback to OLD name (e.g. discount).
        // This fixes the "undefined" issue for old coupons.
        const discountVal = c.discountValue ?? c.discount ?? 0;
        const infComm     = c.influencerCommission ?? 0;
        const creComm     = c.creatorCommission ?? c.ebookCreatorCommission ?? 0;
        
        // Handle UPI camelCase vs uppercase variations
        const infUpi = c.influencerUpi || c.influencerUPI || "";
        const creUpi = c.creatorUpi || c.ebookCreatorUPI || "";
        // -----------------------------

        let upiText = "No UPI details set";
        if (infUpi && creUpi) upiText = `INF: ${infUpi}<br>CRE: ${creUpi}`;
        else if (infUpi) upiText = `INF: ${infUpi}`;
        else if (creUpi) upiText = `CRE: ${creUpi}`;

        return `
            <div class="coupon-card">
              <div class="coupon-header">
                <div class="coupon-code-badge">${c.code}</div>
                <div class="coupon-course" title="${courseName}">${courseName}</div>
              </div>
              
              <div class="coupon-body">
                <div class="info-group">
                  <span class="info-label">Discount</span>
                  <span class="info-val" style="color:#10b981;">-₹${discountVal}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Inf. Comm.</span>
                  <span class="info-val">₹${infComm}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Uses</span>
                  <span class="info-val">${c.usageCount || 0}</span>
                </div>
                <div class="info-group">
                  <span class="info-label">Creator</span>
                  <span class="info-val">₹${creComm}</span>
                </div>
              </div>

              <div class="upi-info">
                ${upiText}
              </div>

              <div style="display:flex; gap:10px; margin-top:auto;">
                <button class="btn-action-edit js-edit-coupon" type="button" data-id="${c._id}" style="flex:1; justify-content:center;">
                  ✏️ Edit
                </button>
                <button class="btn-action-delete js-delete-coupon" type="button" data-id="${c._id}" style="flex:1; justify-content:center;">
                  🗑 Delete
                </button>
              </div>
            </div>
          `;
      }).join("");

      // Event Delegation for Coupons
      couponList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.js-edit-coupon');
        const deleteBtn = e.target.closest('.js-delete-coupon');

        if (editBtn) {
          const id = editBtn.getAttribute('data-id');
          editCoupon(id);
        } else if (deleteBtn) {
          const id = deleteBtn.getAttribute('data-id');
          deleteCoupon(id);
        }
      });
    }
  } catch (err) {
    console.error("Error loading coupons:", err);
    couponList.innerHTML = '<p style="color:red;">Failed to load coupons</p>';
  }
}

// 2. Add Coupon Listener (RESTORED)
if (addCouponForm) {
  addCouponForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(addCouponForm);
    
    // Convert FormData to JSON object because API expects JSON
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await authFetch(`${window.API_BASE}/api/admin/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.success) {
        showNotification("success", "Coupon created successfully");
        addCouponForm.reset();
        loadCoupons();
      } else {
        showNotification("error", data.message);
      }
    } catch (err) {
      console.error("Add coupon error:", err);
      showNotification("error", "Server error while creating coupon");
    }
  });
}

// ===============================
// EDITOR: Open Edit Popup
// ===============================
async function editCoupon(id) {
  const submitBtn = document.getElementById('edit-coupon-form').querySelector('button[type="submit"]');
  submitBtn.textContent = "Loading...";
  submitBtn.disabled = true;

  const editCouponOverlay = document.getElementById('edit-coupon-overlay');
  editCouponOverlay.classList.remove('hidden');
  editCouponOverlay.setAttribute('aria-hidden', 'false');

  try {
    const res = await authFetch(`${window.API_BASE}/api/admin/coupons/${id}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const data = await res.json();
    if (data.success) {
      const c = data.coupon;

      // --- DATA NORMALIZATION FOR EDITOR ---
      const discountVal = c.discountValue ?? c.discount ?? 0;
      const infUpi      = c.influencerUpi || c.influencerUPI || "";
      const creUpi      = c.creatorUpi || c.ebookCreatorUPI || "";
      const creComm     = c.creatorCommission ?? c.ebookCreatorCommission ?? 0;
      // ------------------------------------

      document.getElementById('edit-coupon-id').value = c._id;
      document.getElementById('edit-coupon-code').value = c.code || "";
      document.getElementById('edit-coupon-discount').value = discountVal;
      document.getElementById('edit-inf-upi').value = infUpi;
      document.getElementById('edit-inf-comm').value = c.influencerCommission || 0;
      document.getElementById('edit-cre-upi').value = creUpi;
      document.getElementById('edit-cre-comm').value = creComm;

    } else {
      showNotification("error", data.message || "Failed to load coupon");
      editCouponOverlay.classList.add('hidden');
    }
  } catch (err) {
    console.error("Edit coupon error:", err);
    showNotification("error", "Server error while loading coupon");
    editCouponOverlay.classList.add('hidden');
  } finally {
    submitBtn.textContent = "Save Changes";
    submitBtn.disabled = false;
  }
}

// ===============================
// ACTION: Delete Coupon
// ===============================
// ===============================
// ACTION: Delete Coupon
// ===============================
async function deleteCoupon(id) {
  showConfirmModal(
      "Delete Coupon?",
      "Are you sure you want to PERMANENTLY delete this coupon?",
      async () => {
          try {
            const url = `${window.API_BASE}/api/admin/coupons/${id}`;
            const res = await authFetch(url, { method: "DELETE" });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.message || `Server Error (${res.status})`);
            }

            const result = await res.json();
            if (result.success) {
              showNotification("success", "Coupon deleted successfully");
              loadCoupons(); 
            } else {
              showNotification("error", result.message || "Failed to delete");
            }
          } catch (err) {
            console.error("Delete Coupon Failed:", err);
            showNotification("error", "Error: " + err.message);
          }
      }
  );
}

// ===============================
// EXPOSE TO WINDOW (Critical for onclick to work)
// ===============================
window.loadCoupons = loadCoupons;
window.editCoupon = editCoupon;

// ===============================
// REFUND SYSTEM LOGIC
// ===============================
const btnSearchUserOrders = document.getElementById('btn-search-user-orders');
const refundSearchEmailInput = document.getElementById('refund-search-email');
const userPurchaseList = document.getElementById('user-purchase-list');

if (btnSearchUserOrders) {
  btnSearchUserOrders.addEventListener('click', async () => {
    const email = refundSearchEmailInput.value.trim();
    if(!email) return showNotification("error", "Please enter an email");

    const originalText = btnSearchUserOrders.textContent;
    btnSearchUserOrders.textContent = "Searching...";
    btnSearchUserOrders.disabled = true;

    try {
      const res = await authFetch(`${window.API_BASE}/api/admin/user-orders-by-email?email=${email}`);
      const data = await res.json();

      if(data.orders.length === 0) {
        userPurchaseList.innerHTML = `
            <div style="text-align:center; padding:20px; color:#64748b; background:#f8fafc; border-radius:8px;">
                No completed purchases found for this email.
            </div>`;
        return;
      }

      userPurchaseList.innerHTML = data.orders.map(order => {
        const isRefunded = (order.refundStatus === "processed");
        const refundBtn = isRefunded 
            ? `<span style="color:#64748b; font-size:0.9rem; font-weight:600;">Refunded</span>`
            : `<button onclick="processRefund('${order._id}')" class="btn" style="background:#ef4444; color:white; padding:6px 14px; font-size:0.9rem;">Refund</button>`;

        return `
        <div style="border:1px solid #e2e8f0; padding:16px; border-radius:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; background:#fff;">
          <div>
            <div style="font-weight:600; color:#0f172a; font-size:1.05rem;">${order.courseId?.title || 'Unknown Course'}</div>
            <div style="color:#64748b; font-size:0.9rem; margin-top:4px;">
                Price: ₹${order.price || order.amount} • Ord: <code style="background:#f1f5f9; padding:2px 4px; border-radius:4px;">${order.razorpayOrderId}</code>
            </div>
            <div style="color:#94a3b8; font-size:0.8rem; margin-top:2px;">
                Date: ${new Date(order.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div>${refundBtn}</div>
        </div>
      `}).join('');
      
    } catch (err) {
      console.error(err);
      showNotification("error", "Search failed");
    } finally {
      btnSearchUserOrders.textContent = originalText;
      btnSearchUserOrders.disabled = false;
    }
  });
}

// Global function for onclick
async function processRefund(orderId) {
  showConfirmModal(
    "Confirm Refund?", 
    "This will revoke course access and refund the payment immediately. Continue?", 
    async () => {
        try {
        const res = await authFetch(`${window.API_BASE}/api/admin/process-refund`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId })
        });
        const data = await res.json();
        if(data.success) {
            showNotification("success", "Refund successful");
            // Refresh list
            document.getElementById('btn-search-user-orders').click(); 
        } else {
            showNotification("error", data.message);
        }
        } catch (err) {
            showNotification("error", "Refund failed");
        }
  });
}
window.processRefund = processRefund;
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

// public/js/admin.js

// 1. Single, Correct Load Function
async function loadMessages() {
    const list = document.getElementById('messagesList');
    if (!list) return;

    try {
        const res = await authFetch(`${window.API_BASE}/api/admin/messages`);
        console.log("Admin messages fetch status:", res.status);
        
        // Safety check to prevent the "Unexpected token <" error
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            console.error("Server returned non-JSON:", text.slice(0, 100));
            throw new TypeError("Server returned HTML instead of JSON. Check backend logs.");
        }

        const messages = await res.json();
        console.log("Admin messages data:", messages);

        if (!messages || messages.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px;">No messages received yet. (DB is empty)</p>';
            return;
        }

        list.innerHTML = messages.map(msg => `
            <div class="message-card" style="border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:8px; background:#fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong style="color: #2c3e50;">From: ${msg.email}</strong>
                    <span style="font-size:0.85em; color:#7f8c8d;">${new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                <p style="background:#f8f9fa; padding:12px; border-radius:6px; color: #34495e; border-left: 4px solid #3498db;">${msg.message}</p>
                <div style="margin-top: 10px;">
                    <a href="mailto:${msg.email}" class="btn-action-edit" style="text-decoration:none; font-size: 0.9em; display: inline-block;">✉️ Reply via Email</a>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading messages:', error);
        list.innerHTML = `<p style="color:red; text-align:center;">Failed to load messages. ${error.message}</p>`;
    }
}

// 2. Correct Navigation Listener
document.addEventListener("DOMContentLoaded", () => {
    // Look for the "Inquiries" link in your sidebar
    const inquiriesLink = document.getElementById("nav-inquiries") || document.getElementById("inquiriesBtn");
    
    if (inquiriesLink) {
        inquiriesLink.addEventListener("click", (e) => {
            e.preventDefault();
            // Use your existing section switcher
            if (typeof window.adminShowSection === 'function') {
                window.adminShowSection('messagesSection');
                loadMessages(); 
            }
        });
    }
});

// Update your existing showSection function to trigger the load
function showSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    
    if (sectionId === 'messagesSection') {
        loadMessages();
    }
}

// Wrap in DOMContentLoaded to ensure the button exists before searching for it
document.addEventListener('DOMContentLoaded', () => {
    const inquiriesBtn = document.getElementById('inquiriesBtn');

    if (inquiriesBtn) {
        inquiriesBtn.addEventListener('click', () => {
            // Call the existing function manually
            showSection('messagesSection');
        });
    }
});



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

    if (name === 'coupons') {
      if (typeof window.loadCoupons === 'function') window.loadCoupons();
      if (typeof window.loadCoursesForCoupons === 'function') window.loadCoursesForCoupons();
    }

    if (name === 'sales' || name === 'dashboard') {
      if (typeof window.loadSalesDashboard === 'function') window.loadSalesDashboard();
    }

    if (name === 'courses') {
      if (typeof window.fetchCourses === 'function') window.fetchCourses();
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


// =============================
// DISPUTE RESOLUTION LOGIC
// =============================
// Must appear AFTER the DOM is loaded or inside a DOMContentLoaded

document.addEventListener("DOMContentLoaded", () => {
    const disputeSearchBtn = document.getElementById("btn-dispute-search");
    const disputeInput = document.getElementById("dispute-email-input");
    const disputeResults = document.getElementById("dispute-results");

    if (disputeSearchBtn) {
        disputeSearchBtn.addEventListener("click", async () => {
            const email = disputeInput.value.trim();
            if (!email) return showNotification("error", "Please enter an email address");

            const originalText = disputeSearchBtn.textContent;
            disputeSearchBtn.textContent = "Searching...";
            disputeSearchBtn.disabled = true;

            try {
                const res = await authFetch(`${window.API_BASE}/api/admin/search-orders?email=${encodeURIComponent(email)}`);
                const data = await res.json();

                if (!data.success) throw new Error(data.message);

                if (data.orders.length === 0) {
                    disputeResults.innerHTML = `<p style="text-align:center; padding:20px; color:#64748b;">No orders found for <strong>${email}</strong></p>`;
                    return;
                }

                // Render Audit Cards
                disputeResults.innerHTML = data.orders.map(order => {

                    // 1. Format Download Logs
                    let downloadLogsHtml = `<span style="color:#94a3b8; font-style:italic;">No downloads recorded</span>`;
                    if (order.downloadHistory && order.downloadHistory.length > 0) {
                        downloadLogsHtml = `
                <ul style="margin:0; padding-left:20px; font-size:0.9rem; color:#475569;">
                ${order.downloadHistory.map(log => `
                    <li>
                    <strong>${new Date(log.timestamp).toLocaleString()}</strong> 
                    <span style="color:#64748b; font-size:0.85em;">(IP: ${log.ip || 'Unknown'})</span>
                    </li>
                `).join('')}
                </ul>`;
                    }

                    // 2. Format Email Status (UPDATED LOGIC)
                    // Only show "Not Sent" warning if the payment was actually completed.
                    let emailStatusHtml;
                    if (order.status === 'completed') {
                        emailStatusHtml = order.emailSent
                            ? `<span style="color:#10b981; font-weight:bold;">✅ Sent</span> at ${order.emailSentAt ? new Date(order.emailSentAt).toLocaleString() : "Unknown Time"}`
                            : `<span style="color:#ef4444; font-weight:bold;">❌ Not Sent</span>`;
                    } else {
                        // If payment failed/pending, email is not expected
                        emailStatusHtml = `<span style="color:#64748b;">— N/A (Payment ${order.status})</span>`;
                    }

                    // 3. Format Payment Status Color
                    const payStatusColor = order.status === 'completed' ? '#10b981' : (order.status === 'failed' ? '#ef4444' : '#f59e0b');

                    return `
            <div style="border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin-bottom:16px; background:#f8fafc;">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                <div>
                    <h4 style="margin:0; color:#0f172a;">${order.courseId?.title || "Unknown Course"}</h4>
                    <div style="font-size:0.9rem; color:#334155; margin-top:4px;"><strong>Customer:</strong> ${order.buyerEmail}</div>
                    <div style="font-size:0.85rem; color:#64748b; margin-top:2px;">Order ID: ${order.razorpayOrderId}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:#0f172a;">₹${order.ownerAmount + (order.influencerCommission || 0) + (order.ebookCreatorCommission || 0)}</div>
                    <div style="font-size:0.85rem; color:${payStatusColor}; font-weight:600; text-transform:capitalize;">${order.status}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">${new Date(order.createdAt).toLocaleDateString()}</div>
                </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                
                <div>
                    <h5 style="margin:0 0 8px 0; color:#334155; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.5px;">📧 Email Delivery</h5>
                    <div style="background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:6px;">
                    ${emailStatusHtml}
                    </div>
                </div>

                <div>
                    <h5 style="margin:0 0 8px 0; color:#334155; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.5px;">⬇️ Download Attempts</h5>
                    <div style="background:#fff; padding:10px; border:1px solid #e2e8f0; border-radius:6px; max-height:150px; overflow-y:auto;">
                    ${downloadLogsHtml}
                    </div>
                </div>

                </div>
            </div>
            `;
                }).join('');

            } catch (err) {
                console.error(err);
                showNotification("error", "Search failed");
                disputeResults.innerHTML = `<p style="text-align:center; color:#ef4444;">Error fetching records.</p>`;
            } finally {
                disputeSearchBtn.textContent = originalText;
                disputeSearchBtn.disabled = false;
            }
        });
    }
  
});

// ===============================
// CUSTOM CONFIRMATION MODAL HELPER
// ===============================
window.showConfirmModal = function(title, message, onConfirmCallback) {
    const overlay = document.getElementById('confirm-overlay');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const btnProceed = document.getElementById('btn-proceed-confirm');
    const btnCancel = document.getElementById('btn-cancel-confirm');

    if (!overlay) {
        // Fallback if modal missing
        if (confirm(`${title}\n\n${message}`)) {
            onConfirmCallback();
        }
        return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    
    // Remove old listeners to prevent stacking (Clone node trick)
    const newProceed = btnProceed.cloneNode(true);
    const newCancel = btnCancel.cloneNode(true);
    btnProceed.parentNode.replaceChild(newProceed, btnProceed);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);

    newProceed.addEventListener('click', async () => {
        const originalText = newProceed.textContent;
        newProceed.textContent = "Processing...";
        newProceed.disabled = true;
        try {
            await onConfirmCallback();
        } catch (e) {
            console.error(e);
        } finally {
            overlay.classList.add('hidden');
            newProceed.textContent = originalText;
            newProceed.disabled = false;
        }
    });

    newCancel.addEventListener('click', () => {
        overlay.classList.add('hidden');
    });

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    };

    overlay.classList.remove('hidden');
};
