const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: .12 })
  : null;
document.querySelectorAll('.reveal').forEach(element => observer ? observer.observe(element) : element.classList.add('visible'));

const form = document.querySelector('#quote-form');
if (form) {
  const setError = (field, message) => {
    const error = document.querySelector(`#${field.id}-error`);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) error.textContent = message;
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.website.value) return;
    let valid = true;
    ['name', 'email', 'service', 'project'].forEach(id => {
      const field = form.elements[id];
      let message = '';
      if (!field.value.trim()) message = 'Please complete this field.';
      if (id === 'email' && field.value && !field.validity.valid) message = 'Enter a valid email address.';
      setError(field, message);
      if (message) valid = false;
    });
    if (!valid) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    const subject = encodeURIComponent(`Project enquiry: ${form.service.value}`);
    const body = encodeURIComponent([
      `Name: ${form.name.value}`, `Email: ${form.email.value}`,
      `Phone: ${form.phone.value || 'Not provided'}`, `Service: ${form.service.value}`,
      '', 'Project description:', form.project.value
    ].join('\n'));
    window.location.href = `mailto:y1ksoftwaresupport@gmail.com?subject=${subject}&body=${body}`;
  });
}
