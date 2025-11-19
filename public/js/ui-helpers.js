// ui-helpers.js
// - lazyLoadImages(): lazy loads <img data-src> into src and toggles skeleton class
// - toggleDarkMode() / initTheme()
// - manage skeleton placeholders

(function(){
  /* ---------- Lazy loading images with skeleton support ---------- */
  function lazyLoadImages(root = document) {
    const imgs = Array.from(root.querySelectorAll('img[data-src]'));
    if (!('IntersectionObserver' in window)) {
      // fallback: load all
      imgs.forEach(loadImg);
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          loadImg(img);
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '200px 0px' });

    imgs.forEach(img => io.observe(img));

    function loadImg(img) {
      // show small transition
      const src = img.getAttribute('data-src');
      const srcset = img.getAttribute('data-srcset');
      const type = img.getAttribute('data-type');

      // optional: if you host webp, prefer it via <picture> ideally
      if (srcset) img.srcset = srcset;
      if (src) img.src = src;
      if (type) img.type = type;

      img.addEventListener('load', () => {
        img.classList.remove('skeleton');
        img.style.opacity = 1;
      }, { once: true });

      // in case of error, remove skeleton after timeout
      setTimeout(() => {
        if (img.complete) return;
        img.classList.remove('skeleton');
        img.style.opacity = 1;
      }, 5000);
    }
  }

  /* ---------- Theme toggle (dark mode) ---------- */
  function setTheme(name) {
    if (name === 'dark') document.documentElement.dataset.theme = 'dark';
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('pref-theme', name || 'light'); } catch(e){}
  }
  function initTheme() {
    try {
      const pref = localStorage.getItem('pref-theme');
      if (pref === 'dark') setTheme('dark');
      else if (!pref && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
    } catch(e){}
  }
  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    setTheme(dark ? 'light' : 'dark');
  }

  /* ---------- Expose small API ---------- */
  window.UI = {
    lazyLoadImages,
    initTheme,
    toggleTheme,
    setTheme
  };

  /* ---------- Auto-init on DOM ready ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    lazyLoadImages(document);

    // wire up any theme toggle button with id "themeToggle"
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  });
})();
