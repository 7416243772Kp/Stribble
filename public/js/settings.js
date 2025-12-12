// public/js/settings.js
(function () {
  try {
    const host = window.location.hostname;
    const proto = window.location.protocol;

    if (proto === 'file:') {
      // double-click opened file, assume dev backend
      window.API_BASE = 'http://localhost:5000';
    } else if (host === '127.0.0.1' || host === 'localhost') {
      window.API_BASE = 'http://localhost:5000';
    } else {
      // production: set to empty (same origin) or your API origin
      window.API_BASE = 'http://192.168.1.5:5000'; // OR 'https://api.yourdomain.com'
    }
  } catch (e) {
    // fallback safety
    window.API_BASE = '';
  }
  console.log('[settings] API_BASE =', window.API_BASE);
})();
