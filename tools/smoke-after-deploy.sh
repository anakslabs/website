#!/usr/bin/env bash
# Post-deploy smoke check for the contact form and the pages it lives on.
#
# Run this against production only after both deploys are live — the app
# first, then the site, because the form on the site posts to the app and a
# site deployed ahead of its endpoint fails in exactly the way this script
# is meant to catch.
#
# The submission is real: it writes a row to inbound_inquiries and, if the
# key is set, sends one notification. That is the point — a probe that stops
# short of the write proves nothing about the write. The row it creates is
# marked so it can be found and deleted afterwards, and the last step prints
# the SQL to do that rather than running it.
#
#   ./tools/smoke-after-deploy.sh                 # against production
#   SITE=http://localhost:8787 ./tools/smoke-after-deploy.sh
set -uo pipefail

SITE="${SITE:-https://anakslabs.com}"
API="${API:-https://preview.anakslabs.com}"
STAMP="smoke-$(date +%Y%m%d-%H%M%S)"
fails=0

check () {  # label expected actual
  if [ "$2" = "$3" ]; then printf "  ok    %-42s %s\n" "$1" "$3"
  else printf "  FAIL  %-42s got %s, wanted %s\n" "$1" "$3" "$2"; fails=$((fails+1)); fi
}

# Deliberately no -L. Following the redirect on a protected preview lands on
# an SSO login page that answers 200, and reporting that as "the page is up"
# is exactly the mistake this script exists to prevent: it once passed six
# paths green while none of them were reachable.
echo "== pages reachable ($SITE)"
for p in / /clinics/ /contact/ /about/ /sources/ /articles/ /check/; do
  check "$p" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$SITE$p")"
done

# A status code says a response arrived, not that it is the page we shipped.
echo "== the page that arrived is ours"
expect_text () {  # path needle label
  if curl -s "$SITE$1" | grep -qF "$2"; then printf "  ok    %-42s %s\n" "$3" "found"
  else printf "  FAIL  %-42s %s\n" "$3" "missing: $2"; fails=$((fails+1)); fi
}
expect_text /          'Build from $990. Then $1,490 a month.' "home carries both figures"
expect_text /          'See your site first'                   "home CTA"
expect_text /check/    'id="check-form"'                       "check page has the form"
expect_text /clinics/  'One practice per area'                 "clinics states the cap"
expect_text /contact/  'id="contact-form"'                     "contact page has the form"

echo "== no mailto left in the shipped HTML"
# Only our own address matters; the specimen clinic keeps its own on purpose.
found=$(for p in / /clinics/ /contact/ /about/ /sources/ /articles/; do
          curl -s "$SITE$p" | grep -o 'mailto:contact@anakslabs.com'; done | wc -l | tr -d ' ')
check "mailto:contact@anakslabs.com occurrences" 0 "$found"

echo "== JSON-LD parses and carries the figures"
for p in / /clinics/; do
  out=$(curl -s "$SITE$p" | python3 -c '
import sys, re, json
m = re.search(r"<script type=\"application/ld\+json\">\s*(\{.*?\})\s*</script>", sys.stdin.read(), re.S)
if not m: print("no-block"); raise SystemExit
g = json.loads(m.group(1))["@graph"]
svc = [n for n in g if n.get("@type") == "Service"]
if not svc or "offers" not in svc[0]: print("no-offers"); raise SystemExit
print(",".join(str(s["minPrice"]) for s in svc[0]["offers"]["priceSpecification"]))' 2>&1)
  check "JSON-LD $p" "990,1490" "$out"
done

echo "== contact endpoint"
check "OPTIONS preflight" 204 "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API/api/contact")"

body="{\"site\":\"$STAMP.example\",\"email\":\"$STAMP@example.com\",\"note\":\"automated smoke check\",\"company\":\"\",\"source\":\"smoke\"}"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/contact" \
       -H 'Content-Type: application/json' -d "$body")
check "POST /api/contact (real submission)" 201 "$code"

# A filled honeypot must look identical to success from the outside.
hp=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/contact" \
     -H 'Content-Type: application/json' \
     -d "{\"site\":\"bot.example\",\"email\":\"bot@example.com\",\"company\":\"filled\"}")
check "POST with honeypot filled" 202 "$hp"

echo
if [ "$fails" -eq 0 ]; then echo "PASS — all checks green"; else echo "$fails CHECK(S) FAILED"; fi
cat <<EOF

Still to confirm by hand (needs the DB and the mailbox, not curl):
  1. the row landed —
       supabase db query --linked "select id, subject, email, source, created_at
         from inbound_inquiries where subject = '$STAMP.example'"
  2. the honeypot POST wrote nothing —
       the same query for 'bot.example' must return zero rows
  3. one notification arrived at the address in REPORT_FROM_EMAIL
       (absent RESEND_API_KEY in the deploy env, no mail is expected and
        the 201 above is still correct)
  4. remove the probe row when done —
       supabase db query --linked "delete from inbound_inquiries
         where subject = '$STAMP.example'"
EOF
exit "$fails"
