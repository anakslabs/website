/* Contact form submission.
 *
 * The static site cannot take a POST, so the form hands off to the app on
 * another origin. Two things follow from that and are worth stating: the
 * request is a cross-origin fetch, not a native form submit, so the page
 * must report its own success and failure; and if the script never runs the
 * form is inert, which is why the page also carries the address in a
 * <noscript> rather than relying on this file being reached.
 *
 * ENDPOINT is deliberately a single constant. The receiving route is not
 * built yet — where an inquiry is stored is still being decided — so this
 * is the one line to change when it lands.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://preview.anakslabs.com/api/contact';

  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('contact-status');
  var button = document.getElementById('contact-submit');
  var sending = false;

  function say(message, kind) {
    if (!status) return;
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return;

    var site = form.elements.site.value.trim();
    var email = form.elements.email.value.trim();
    if (!site) return say('Tell us your website or your business name first.', 'error');
    // Deliberately loose: the browser already ran type="email", and a stricter
    // pattern here would reject valid addresses to catch typos it cannot see.
    if (!email || email.indexOf('@') < 1) return say('We need an address to send the site to.', 'error');

    sending = true;
    button.disabled = true;
    say('Sending…');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site: site,
        email: email,
        note: form.elements.note.value.trim(),
        company: form.elements.company.value
      })
    })
      .then(function (response) {
        if (response.ok) {
          form.reset();
          say('Got it. We build it and send it back — no meeting to book.', 'ok');
          if (window.va) window.va('event', { name: 'contact_submit' });
          return;
        }
        if (response.status === 429) {
          say('That is a lot of requests from here. Try again in a few minutes.', 'error');
          return;
        }
        throw new Error('HTTP ' + response.status);
      })
      .catch(function () {
        say('That did not go through. Write to contact@anakslabs.com and we will pick it up there.', 'error');
      })
      .then(function () {
        sending = false;
        button.disabled = false;
      });
  });
})();
