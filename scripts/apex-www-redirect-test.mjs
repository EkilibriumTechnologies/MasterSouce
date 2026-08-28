import assert from "node:assert/strict";

import { apexToWwwRedirectUrl } from "@/lib/http/apex-www-redirect";

function redirect(host, url, forwardedHost = null) {
  return apexToWwwRedirectUrl(host, url, forwardedHost)?.toString() ?? null;
}

// Host: mastersauce.ai
assert.equal(
  redirect("mastersauce.ai", "https://mastersauce.ai/"),
  "https://www.mastersauce.ai/"
);

// x-forwarded-host: mastersauce.ai (Railway: Host is the internal service domain)
assert.equal(
  redirect("c62ho1ek.up.railway.app", "https://c62ho1ek.up.railway.app/", "mastersauce.ai"),
  "https://www.mastersauce.ai/"
);
assert.equal(
  redirect("c62ho1ek.up.railway.app", "https://c62ho1ek.up.railway.app/?fbclid=test123", "mastersauce.ai:443"),
  "https://www.mastersauce.ai/?fbclid=test123"
);

// www.mastersauce.ai must never redirect
assert.equal(redirect("www.mastersauce.ai", "https://www.mastersauce.ai/"), null);
assert.equal(
  redirect("c62ho1ek.up.railway.app", "https://c62ho1ek.up.railway.app/", "www.mastersauce.ai"),
  null
);

// Path preservation
assert.equal(
  redirect("mastersauce.ai", "https://mastersauce.ai/song-architect"),
  "https://www.mastersauce.ai/song-architect"
);
assert.equal(
  redirect(
    "c62ho1ek.up.railway.app",
    "https://c62ho1ek.up.railway.app/test-path",
    "mastersauce.ai"
  ),
  "https://www.mastersauce.ai/test-path"
);

// fbclid preservation
assert.equal(
  redirect("mastersauce.ai:443", "https://mastersauce.ai/?fbclid=test123"),
  "https://www.mastersauce.ai/?fbclid=test123"
);

// utm parameter preservation
assert.equal(
  redirect(
    "MasterSauce.ai",
    "https://mastersauce.ai/test-path?utm_source=facebook&utm_campaign=test"
  ),
  "https://www.mastersauce.ai/test-path?utm_source=facebook&utm_campaign=test"
);
assert.equal(
  redirect(
    "c62ho1ek.up.railway.app",
    "https://c62ho1ek.up.railway.app/song-architect?utm_source=facebook",
    "mastersauce.ai"
  ),
  "https://www.mastersauce.ai/song-architect?utm_source=facebook"
);

// No redirect loop: www Host wins even if forwarded host is spoofed to apex
assert.equal(
  redirect("www.mastersauce.ai", "https://www.mastersauce.ai/?fbclid=test123", "mastersauce.ai"),
  null
);

// Localhost/dev is preserved even if x-forwarded-host is spoofed
assert.equal(redirect("localhost:3000", "http://localhost:3000/?fbclid=test123"), null);
assert.equal(
  redirect("localhost:3000", "http://localhost:3000/", "mastersauce.ai"),
  null
);
assert.equal(redirect("127.0.0.1:3456", "http://127.0.0.1:3456/", "mastersauce.ai"), null);

console.log("apex-www-redirect-test: ok");
