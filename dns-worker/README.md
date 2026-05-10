# Veil DNS Worker

DNS-over-HTTPS proxy with ad/tracker blocking. Runs on Cloudflare Workers (free tier).

## Deploy

```bash
cd dns-worker
npm install
npx wrangler login
npx wrangler deploy
```

After deploy, your endpoint will be:
```
https://veil-dns.<your-subdomain>.workers.dev/dns-query
```

## Update mobileconfig

Replace the DNS URL in `apps/ios/Veil-AdBlock-DNS.mobileconfig`:
```xml
<string>https://veil-dns.<your-subdomain>.workers.dev/dns-query</string>
```

## Update Android

Settings → Private DNS → `veil-dns.<your-subdomain>.workers.dev`

## How it works

1. Device sends DNS query via DoH
2. Worker checks domain against 80+ blocked ad/tracker domains
3. Blocked → returns 0.0.0.0
4. Allowed → forwards to Cloudflare 1.1.1.1

## Test

```bash
curl "https://veil-dns.<your-subdomain>.workers.dev/"
# {"service":"Veil DNS","status":"ok","blocked_domains":80}
```
