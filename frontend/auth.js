'use strict';

// ── Universal Portal Login: Email / Username + Password ──────────────────────
// Used by both Company Workspace (data-portal="company") and Parent Portal (data-portal="parent")
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.getElementById('login-status');
    const button = loginForm.querySelector('button[type="submit"]');
    message.textContent = 'Authenticating security credentials…';
    button.disabled = true;
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          username: loginForm.username.value.trim().toLowerCase(),
          password: loginForm.password.value,
          portal: document.body.dataset.portal
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Invalid login ID or password.');
      loginForm.reset();
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('portal-auth');
        channel.postMessage({portal: document.body.dataset.portal});
        channel.close();
      }
      location.replace(data.redirect);
    } catch(error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
