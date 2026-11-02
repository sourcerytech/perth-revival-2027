const form = document.querySelector('#interest-form');
const note = document.querySelector('#form-note');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector('#email');
  note.textContent = `Thank you — ${email.value} is marked as interested in this prototype. Connect a signup provider before launch.`;
  note.style.color = '#51361e';
  form.reset();
});
