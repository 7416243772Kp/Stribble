// C:\Ebook\public\js\main.js
document.addEventListener("DOMContentLoaded", () => {
    const wrap = document.getElementById("courses");
    const empty = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const INR = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v || 0);

    function setYear() {
        const yearEl = document.getElementById("year");
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    function skeleton(count = 8) {
        wrap.innerHTML = "";
        for (let i = 0; i < count; i++) {
            const s = document.createElement("div");
            s.className = "card skeleton";
            s.innerHTML = `
          <div class="card__media skeleton__block"></div>
          <div class="card__body">
            <div class="skeleton__line w-70"></div>
            <div class="skeleton__line"></div>
            <div class="card__footer">
              <div class="skeleton__chip"></div>
              <div class="skeleton__btn"></div>
            </div>
          </div>`;
            wrap.appendChild(s);
        }
    }

    function card(course) {
        const a = document.createElement("a");
        a.className = "card hover-lift";
        a.href = `/course/${course._id}`;
        a.setAttribute("data-title", (course.title || "").toLowerCase());
        a.setAttribute("data-desc", (course.description || "").toLowerCase());

        // API_BASE logic from previous fix
        const apiBase = window.API_BASE || '';
        let thumb = course.thumbnail || '/images/placeholder-course.png';
        if (thumb.startsWith('/') && !thumb.startsWith('//')) {
            thumb = apiBase + thumb;
        }

        a.innerHTML = `
        <div class="card__media">
          <img src="${thumb}" alt="${(course.title || '').replace(/\"/g, '')}" loading="lazy" style="width:100%; height:auto; display:block;" />
        </div>
        <div class="card__body">
          <h3 class="card__title">${course.title || 'Untitled'}</h3>
          <p class="card__desc">${(course.description || "").slice(0, 96)}${course.description && course.description.length > 96 ? "…" : ""}</p>
          <div class="card__footer">
            <span class="price">${INR(course.price)}</span>
            <span class="cta">View</span>
          </div>
        </div>`;
        return a;
    }

    function applySearch() {
        const q = (searchInput.value || "").toLowerCase().trim();
        let shown = 0;
        document.querySelectorAll(".grid .card").forEach(c => {
            if (c.classList.contains('skeleton')) return;
            const t = c.getAttribute("data-title") || "";
            const d = c.getAttribute("data-desc") || "";
            const visible = !q || t.includes(q) || d.includes(q);
            c.style.display = visible ? "" : "none";
            if (visible) shown++;
        });

        if (!wrap.querySelector('.skeleton')) {
            empty.classList.toggle("hidden", shown !== 0);
        }
    }

    if (searchInput) searchInput.addEventListener("input", applySearch);

    async function loadCourses() {
        try {
            setYear();
            skeleton(8);

            const apiBase = window.API_BASE || '';
            const res = await fetch(`${apiBase}/api/courses`);

            if (!res.ok) throw new Error("Failed to fetch");

            const data = await res.json();
            const courses = Array.isArray(data) ? data : (data.courses || []);

            wrap.innerHTML = "";

            if (courses.length === 0) {
                empty.classList.remove("hidden");
            } else {
                courses.forEach(c => {
                    wrap.appendChild(card(c));
                });
                empty.classList.add("hidden");
            }

        } catch (err) {
            console.error(err);
            wrap.innerHTML = `<p style="color:red; text-align:center; width:100%;">Failed to load courses.</p>`;
        }
    }

    // Mobile Nav Logic
    loadCourses();

    const navToggle = document.getElementById('navToggle');
    const links = document.querySelector('.nav__links');

    if (navToggle && links) {
        navToggle.addEventListener('click', () => {
            const isFlex = links.style.display === 'flex';
            links.style.display = isFlex ? 'none' : 'flex';
            navToggle.setAttribute('aria-expanded', String(!isFlex));
        });
    }
});