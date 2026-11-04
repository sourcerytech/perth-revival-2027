const form = document.querySelector('#interest-form');
const note = document.querySelector('#form-note');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const signupEndpoint = 'https://perth-revival-signup.fragrant-brook-4404.workers.dev';

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    siteNav.classList.toggle('is-open', !open);
  });
}

if (form) form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector('#email');
  const consent = document.querySelector('#consent');
  note.textContent = 'Sending your interest…';
  fetch(signupEndpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: email.value, consent: consent.checked, source: 'perth-revival-2027'})
  }).then(async (response) => {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Signup failed');
    note.textContent = 'Thank you — your interest is received. We will be in touch with event updates.';
    note.style.color = '#51361e';
    form.reset();
  }).catch((error) => {
    note.textContent = error.message || 'We could not complete that just now. Please try again in a moment.';
    note.style.color = '#8d3028';
  });
});
