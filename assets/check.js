/* Free page check: posts a URL to the scanner and renders what came back.
 *
 * The result is written as evidence rather than as a score. The scanner
 * returns a grade and three pillar numbers, and it is tempting to lead with
 * them — but a letter set large is something a reader reacts to and then
 * stops, and the findings underneath it are the entire argument. So the
 * critical findings come first, the grade goes last and small.
 *
 * The heading-set-as-an-image finding is pulled to the top wherever it
 * appears. It is the one defect a practice owner can verify with their own
 * eyes in ten seconds, which makes it the one that carries the rest.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://preview.anakslabs.com/api/scan';
  var LEAD_CODE = 'seo_heading_is_image';

  var form = document.getElementById('check-form');
  if (!form) return;
  var status = document.getElementById('check-status');
  var button = document.getElementById('check-submit');
  var panel = document.getElementById('result');
  var after = document.getElementById('after');
  var lead = document.getElementById('result-lead');
  var list = document.getElementById('result-findings');
  var score = document.getElementById('result-score');
  var running = false;
  var lastUrl = '';

  function say(message, kind) {
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function normalise(value) {
    var v = value.trim();
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }

  function render(result) {
    var issues = (result.issues || []).slice();
    // critical before warn, and the image-heading finding before either
    var rank = { critical: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) {
      if (a.code === LEAD_CODE) return -1;
      if (b.code === LEAD_CODE) return 1;
      return (rank[a.severity] || 3) - (rank[b.severity] || 3);
    });

    list.textContent = '';
    if (!issues.length) {
      lead.textContent = 'Your page handed over everything we look for. That is rare, and it means the work left is the part this check cannot see.';
    } else {
      lead.textContent = 'Each line below is something the page did not hand over. A person looking at your site in a browser would not notice any of them.';
      issues.slice(0, 12).forEach(function (issue) {
        var li = document.createElement('li');
        var h = document.createElement('h3');
        h.textContent = issue.label || issue.code;
        var p = document.createElement('p');
        p.textContent = issue.detail || '';
        li.appendChild(h);
        li.appendChild(p);
        list.appendChild(li);
      });
    }

    var s = result.scores || {};
    score.textContent = 'Grade ' + (result.grade || '—') +
      '  ·  readable ' + (s.seo != null ? s.seo : '—') +
      ', answerable ' + (s.aeo != null ? s.aeo : '—') +
      ', quotable ' + (s.geo != null ? s.geo : '—') +
      '. The numbers are a summary of the lines above, not a verdict on your practice.';

    panel.hidden = false;
    // The offer only appears once there is evidence above it to justify it.
    if (after) {
      after.hidden = false;
      var site = document.getElementById('r-site');
      if (site && !site.value) site.value = lastUrl;   // they typed it once already
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (running) return;

    var url = normalise(form.elements.url.value);
    lastUrl = url;
    if (!url) return say('Put your address in first.', 'error');

    running = true;
    button.disabled = true;
    panel.hidden = true;
    // The scan fetches a live site; several seconds is normal, and silence
    // for that long reads as breakage.
    say('Fetching your page the way a search engine would…');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    })
      .then(function (response) {
        if (response.status === 429) {
          say('That is a lot of checks from here. Try again in a few minutes.', 'error');
          return null;
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data) return;
        say('');
        render(data.scan || data);
        if (window.va) window.va('event', { name: 'check_run' });
      })
      .catch(function () {
        say('We could not reach that page. If it is behind a login or a firewall, this check cannot see it either — and neither can a search engine.', 'error');
      })
      .then(function () {
        running = false;
        button.disabled = false;
      });
  });

  /* The rebuild request. Same endpoint as /contact/ — one inbox, whichever
     door they came through — but posted from under the result so the address
     is already known and the ask follows the evidence. */
  var rform = document.getElementById('rebuild-form');
  if (rform) {
    var rstatus = document.getElementById('rebuild-status');
    var rbutton = document.getElementById('rebuild-submit');
    var rsending = false;
    rform.addEventListener('submit', function (event) {
      event.preventDefault();
      if (rsending) return;
      var site = rform.elements.site.value.trim();
      var email = rform.elements.email.value.trim();
      if (!site) { rstatus.textContent = 'Tell us your website first.'; rstatus.className = 'form-status is-error'; return; }
      if (!email || email.indexOf('@') < 1) { rstatus.textContent = 'We need an address to send the site to.'; rstatus.className = 'form-status is-error'; return; }
      rsending = true; rbutton.disabled = true;
      rstatus.textContent = 'Sending…'; rstatus.className = 'form-status';
      fetch('https://preview.anakslabs.com/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: site, email: email,
          note: rform.elements.note.value.trim(),
          company: rform.elements.company.value,
          source: 'check'
        })
      })
        .then(function (r) {
          if (r.ok) {
            rform.reset();
            rstatus.textContent = 'We reply with the finished site, not a sales call.';
            rstatus.className = 'form-status is-ok';
            if (window.va) window.va('event', { name: 'rebuild_request' });
            return;
          }
          if (r.status === 429) {
            rstatus.textContent = 'That is a lot of requests from here. Try again in a few minutes.';
            rstatus.className = 'form-status is-error';
            return;
          }
          throw new Error('HTTP ' + r.status);
        })
        .catch(function () {
          rstatus.textContent = 'That did not go through. Write to contact@anakslabs.com and we will pick it up there.';
          rstatus.className = 'form-status is-error';
        })
        .then(function () { rsending = false; rbutton.disabled = false; });
    });
  }
})();
