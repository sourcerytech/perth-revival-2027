const form = document.querySelector('#interest-form');
const note = document.querySelector('#form-note');
const signupEndpoint = 'https://perth-revival-signup.fragrant-brook-4404.workers.dev';
form.addEventListener('submit', (event) => {
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
    note.textContent = 'Thank you — your interest is received. Check your inbox for a quiet confirmation.';
    note.style.color = '#51361e';
    form.reset();
  }).catch(() => {
    note.textContent = 'We could not complete that just now. Please try again in a moment.';
    note.style.color = '#8d3028';
  });
});
