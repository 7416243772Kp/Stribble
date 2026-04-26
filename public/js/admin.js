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
const editThumbnailInput = document.getElementById('edit-thumbnail');
const editThumbnailPreview = document.getElementById('edit-thumbnail-preview');
const editThumbnailEmpty = document.getElementById('edit-thumbnail-empty');
const editThumbnailHelp = document.getElementById('edit-thumbnail-help');
const editPdfInput = document.getElementById('edit-pdf');

const editCouponOverlay = document.getElementById('edit-coupon-overlay');
const editCouponForm = document.getElementById('edit-coupon-form');
const cancelCouponBtn = document.getElementById('cancel-coupon-edit');

const EDIT_THUMBNAIL_HELP_TEXT = "Leave empty to keep existing thumbnail.";
let editThumbnailObjectUrl = "";

function adminIconSvg(name, className = "admin-inline-icon") {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m6 6 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  return `<span class="${className}" aria-hidden="true">${icons[name] || ""}</span>`;
}

function adminStatusPill(type, label) {
  const toneClass = type === "success" ? "admin-status-chip--success" : type === "error" ? "admin-status-chip--error" : "admin-status-chip--muted";
  const iconName = type === "success" ? "success" : type === "error" ? "error" : "mail";
  return `<span class="admin-status-chip ${toneClass}">${adminIconSvg(iconName, "admin-status-chip__icon")}<span>${label}</span></span>`;
}

function releaseEditThumbnailObjectUrl() {
  if (editThumbnailObjectUrl) {
    URL.revokeObjectURL(editThumbnailObjectUrl);
    editThumbnailObjectUrl = "";
  }
}

function setEditThumbnailPreview(src) {
  if (!editThumbnailPreview || !editThumbnailEmpty) return;

  if (src) {
    editThumbnailPreview.src = src;
    editThumbnailPreview.style.display = "block";
    editThumbnailEmpty.style.display = "none";
    return;
  }

  editThumbnailPreview.removeAttribute("src");
  editThumbnailPreview.style.display = "none";
  editThumbnailEmpty.style.display = "block";
}

function resetEditCourseModal() {
  releaseEditThumbnailObjectUrl();

  if (editForm) editForm.reset();

  const courseIdInput = document.getElementById("edit-course-id");
  if (courseIdInput) courseIdInput.value = "";

  if (editThumbnailPreview) {
    editThumbnailPreview.dataset.originalSrc = "";
  }

  if (editThumbnailHelp) {
    editThumbnailHelp.textContent = EDIT_THUMBNAIL_HELP_TEXT;
  }

  setEditThumbnailPreview("");
}

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

  // Mobile Sidebar Toggle Logic
  const btnHamburger = document.getElementById('btn-hamburger');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  if (btnHamburger && adminSidebar) {
    const closeSidebarMobile = () => {
      adminSidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    };

    const toggleSidebar = () => {
      if (window.innerWidth > 1024) {
        // Desktop toggle
        adminSidebar.classList.toggle('collapsed');
      } else {
        // Mobile toggle
        adminSidebar.classList.toggle('open');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
      }
    };

    btnHamburger.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebarMobile);

    // Close sidebar when a navigation link is clicked (on mobile)
    links.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          closeSidebarMobile();
        }
      });
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
  card.setAttribute("role", type === "error" ? "alert" : "status");
  card.innerHTML = `
    <div class="icon">${adminIconSvg(type === "success" ? "success" : "error", "admin-notify-icon")}</div>
    <div class="msg">${message}</div>
  `;

  container.appendChild(card);
  container.style.display = "flex";

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
      showNotification("error", "Unauthorized. Please log in again.");
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
        .map((c) => `
          <div class="course-sales-item">
            <strong>${c.courseTitle}</strong>
            <span>₹${c.totalSales} (${c.count} sales)</span>
          </div>
        `)
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
    console.error("Load sales dashboard error:", err);
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
            ${adminIconSvg("edit", "admin-btn-icon")}<span>Edit</span>
          </button>
          <button class="btn-action-delete js-delete-course" type="button" data-id="${course._id}">
            ${adminIconSvg("delete", "admin-btn-icon")}<span>Delete</span>
          </button>
        </div>
      </div>
    `;
    courseList.appendChild(item);
  });
}

if (courseList) {
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

  resetEditCourseModal();

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

    const currentThumbnail = course.thumbnail || "";
    if (editThumbnailPreview) {
      editThumbnailPreview.dataset.originalSrc = currentThumbnail;
    }
    if (editThumbnailHelp) {
      editThumbnailHelp.textContent = EDIT_THUMBNAIL_HELP_TEXT;
    }
    setEditThumbnailPreview(currentThumbnail);

  } catch (err) {
    console.error("Failed to fetch course details", err);
    showNotification("error", "Failed to load course details");
    editOverlay.classList.add('hidden');
    editOverlay.setAttribute('aria-hidden', 'true');
    resetEditCourseModal();
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
    if (editThumbnailInput && editThumbnailInput.files[0]) {
        formData.append('thumbnail', editThumbnailInput.files[0]);
    }

    if (editPdfInput && editPdfInput.files[0]) {
        formData.append('coursePdf', editPdfInput.files[0]);
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
        editOverlay.setAttribute('aria-hidden', 'true');
        resetEditCourseModal();
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
    resetEditCourseModal();
  });
}

// Close if clicking outside the box
if (editOverlay) {
  editOverlay.addEventListener('click', (e) => {
    if (e.target === editOverlay) {
      editOverlay.classList.add('hidden');
      editOverlay.setAttribute('aria-hidden', 'true');
      resetEditCourseModal();
    }
  });
}

if (editThumbnailInput) {
  editThumbnailInput.addEventListener("change", () => {
    const selectedFile = editThumbnailInput.files && editThumbnailInput.files[0];

    releaseEditThumbnailObjectUrl();

    if (selectedFile) {
      editThumbnailObjectUrl = URL.createObjectURL(selectedFile);
      setEditThumbnailPreview(editThumbnailObjectUrl);

      if (editThumbnailHelp) {
        editThumbnailHelp.textContent = `Selected: ${selectedFile.name}`;
      }
      return;
    }

    const originalThumbnail = editThumbnailPreview?.dataset.originalSrc || "";
    setEditThumbnailPreview(originalThumbnail);

    if (editThumbnailHelp) {
      editThumbnailHelp.textContent = EDIT_THUMBNAIL_HELP_TEXT;
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

              <div class="card-actions-row">
                <button class="btn-action-edit js-edit-coupon" type="button" data-id="${c._id}">
                  ${adminIconSvg("edit", "admin-btn-icon")}<span>Edit</span>
                </button>
                <button class="btn-action-delete js-delete-coupon" type="button" data-id="${c._id}">
                  ${adminIconSvg("delete", "admin-btn-icon")}<span>Delete</span>
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
            ? `<span class="refund-status">Refunded</span>`
            : `<button onclick="processRefund('${order._id}')" class="refund-btn" type="button">Refund</button>`;

        return `
        <div class="refund-result-card">
          <div>
            <div class="refund-result-card__title">${order.courseId?.title || 'Unknown Course'}</div>
            <div class="refund-result-card__meta">
                Price: ₹${order.price || order.amount} • Ord: <code style="background:#f1f5f9; padding:2px 4px; border-radius:4px;">${order.razorpayOrderId}</code>
            </div>
            <div class="refund-result-card__date">
                Date: ${new Date(order.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div class="refund-result-card__action">${refundBtn}</div>
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
      tbody.innerHTML = `<tr class="failed-emails-empty"><td colspan="6" style="text-align:center;">No failed emails</td></tr>`;
      return;
    }

    // Build rows
    data.failedOrders.forEach((order) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Email">${order.buyerEmail || "N/A"}</td>
        <td data-label="Course">${order.courseId?.title || "N/A"}</td>
        <td data-label="Order ID">${order.razorpayOrderId || "N/A"}</td>
        <td data-label="Paid At">${order.paidAt ? new Date(order.paidAt).toLocaleString() : "N/A"}</td>
        <td data-label="Reason">${order.emailFailReason ? String(order.emailFailReason) : "—"}</td>
        <td data-label="Action"><button class="btn resend-btn" data-id="${order._id}">Resend</button></td>
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
    if (tbody) tbody.innerHTML = `<tr class="failed-emails-empty"><td colspan="6" style="text-align:center;color:#a00">Error loading failed emails</td></tr>`;
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
            <div class="message-card">
                <div class="message-card__header">
                    <strong style="color: #2c3e50;">From: ${msg.email}</strong>
                    <span style="font-size:0.85em; color:#7f8c8d;">${new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                <p class="message-card__body">${msg.message}</p>
                <div class="message-card__reply">
                    <a href="mailto:${msg.email}" class="btn-action-edit" style="text-decoration:none; font-size: 0.9em; display: inline-flex; align-items: center;">${adminIconSvg("mail", "admin-btn-icon")}<span>Reply via Email</span></a>
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
                            ? `${adminStatusPill("success", "Sent")}<span> at ${order.emailSentAt ? new Date(order.emailSentAt).toLocaleString() : "Unknown Time"}</span>`
                            : adminStatusPill("error", "Not Sent");
                    } else {
                        // If payment failed/pending, email is not expected
                        emailStatusHtml = adminStatusPill("muted", `N/A (Payment ${order.status})`);
                    }

                    // 3. Format Payment Status Color
                    const payStatusColor = order.status === 'completed' ? '#10b981' : (order.status === 'failed' ? '#ef4444' : '#f59e0b');

                    return `
            <div class="audit-card">
                <div class="audit-card__header">
                <div>
                    <h4 class="audit-card__title">${order.courseId?.title || "Unknown Course"}</h4>
                    <div class="audit-card__meta"><strong>Customer:</strong> ${order.buyerEmail}</div>
                    <div class="audit-card__order">Order ID: ${order.razorpayOrderId}</div>
                </div>
                <div class="audit-card__amount">
                    <strong>₹${order.ownerAmount + (order.influencerCommission || 0) + (order.ebookCreatorCommission || 0)}</strong>
                    <div class="audit-card__status" style="color:${payStatusColor};">${order.status}</div>
                    <div class="audit-card__date">${new Date(order.createdAt).toLocaleDateString()}</div>
                </div>
                </div>

                <div class="audit-card__grid">
                
                <div class="audit-card__section">
                    <h5>${adminIconSvg("mail", "admin-inline-icon")}<span>Email Delivery</span></h5>
                    <div class="audit-card__box">
                    ${emailStatusHtml}
                    </div>
                </div>

                <div class="audit-card__section">
                    <h5>${adminIconSvg("download", "admin-inline-icon")}<span>Download Attempts</span></h5>
                    <div class="audit-card__box">
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

// ===============================
// Drop-off Analytics
// ===============================
async function loadAnalytics() {
    const container = document.getElementById('analyticsContainer');
    if (!container) return;
    
    container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:40px;">Loading charts...</p>';

    try {
        const res = await authFetch(`${window.API_BASE}/api/admin/analytics/dropoff`);
        const data = await res.json();
        
        if (!data.success) throw new Error(data.message || "Failed to load analytics");

        if (!data.analytics || data.analytics.length === 0) {
            container.innerHTML = '<p style="color:#64748b; text-align:center; padding:40px;">No course data available.</p>';
            return;
        }

        container.innerHTML = ''; // clear

        let chartsRendered = 0;

        data.analytics.forEach((course) => {
            // Ignore courses with 0 readers
            if (course.totalReaders === 0) return;
            chartsRendered++;

            const wrapper = document.createElement('div');
            wrapper.className = 'analytics-card';

            const header = document.createElement('h3');
            header.textContent = `${course.title} (Max Pages: ${course.totalPages}, Active Readers: ${course.totalReaders})`;
            wrapper.appendChild(header);

            const subheader = document.createElement('p');
            subheader.className = 'analytics-card__subtext';
            subheader.innerHTML = `Avgerage Progress: <strong>${course.averageProgressPct}%</strong> | Highest Drop-off at: <strong>Page ${course.maxDropoffPage}</strong>`;
            wrapper.appendChild(subheader);

            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'analytics-card__canvas';
            
            const canvas = document.createElement('canvas');
            canvasWrapper.appendChild(canvas);
            wrapper.appendChild(canvasWrapper);
            
            container.appendChild(wrapper);

            // Setup Chart.js
            const labels = course.dropoffCurve.map((_, i) => `Page ${i + 1}`);
            
            // Background colors (redder as it drops off)
            const bgColors = course.dropoffCurve.map(val => {
                const pct = val / course.totalReaders;
                if (pct > 0.8) return 'rgba(34, 197, 94, 0.7)'; // Green
                if (pct > 0.5) return 'rgba(234, 179, 8, 0.7)'; // Yellow
                return 'rgba(239, 68, 68, 0.7)'; // Red
            });

            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: 'Trend',
                            data: course.dropoffCurve,
                            borderColor: '#3b82f6',
                            borderWidth: 2,
                            backgroundColor: 'transparent',
                            tension: 0.3,
                            pointRadius: 4,
                            pointBackgroundColor: '#2563eb'
                        },
                        {
                            type: 'bar',
                            label: 'Readers Reaching This Page',
                            data: course.dropoffCurve,
                            backgroundColor: bgColors,
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: course.totalReaders,
                            ticks: { precision: 0 } // Integer only
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const val = context.raw;
                                    const pct = Math.round((val / course.totalReaders) * 100);
                                    return `${val} readers (${pct}% of total)`;
                                }
                            }
                        }
                    }
                }
            });
        });

        if (chartsRendered === 0) {
            container.innerHTML = '<p style="color:#64748b; text-align:center; padding:40px;">No active readers tracked yet.</p>';
        }

    } catch (err) {
        console.error("Error loading analytics:", err);
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px;">Failed to load analytics data.</p>';
    }
}

// Hook into navigation clicks
document.addEventListener("DOMContentLoaded", () => {
    const navAnalytics = document.getElementById("nav-analytics");
    if (navAnalytics) {
        navAnalytics.addEventListener("click", () => {
            loadAnalytics();
        });
    }

    const navAnnouncements = document.getElementById("nav-announcements");
    if (navAnnouncements) {
        navAnnouncements.addEventListener("click", () => {
            loadAnnouncements();
        });
    }

    const announcementForm = document.getElementById('announcement-form');
    if (announcementForm) {
        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-send-announcement');
            const originalText = btn.textContent;
            
            btn.textContent = "Sending Emails...";
            btn.disabled = true;

            try {
                const formData = new FormData(announcementForm);
                const res = await authFetch(`${window.API_BASE}/api/admin/announcement`, {
                    method: 'POST',
                    body: formData // DO NOT set Content-Type, fetch sets it automatically with boundary for FormData
                });

                const data = await res.json();
                if (data.success) {
                    showNotification("success", data.message);
                    announcementForm.reset();
                } else {
                    showNotification("error", data.message);
                }
            } catch (err) {
                console.error("Announcement Error:", err);
                showNotification("error", "Failed to send announcements.");
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }
});

// ===============================
// Announcements
// ===============================
async function loadAnnouncements() {
    try {
        const res = await authFetch(`${window.API_BASE}/api/courses`);
        const data = await res.json();
        
        const select = document.getElementById('announcement-course-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select Course --</option>';
        if (data.success && data.courses) {
            data.courses.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c._id;
                opt.textContent = c.title;
                select.appendChild(opt);
            });
        }
    } catch(err) {
        console.error("Failed to load courses for announcements", err);
    }
}
