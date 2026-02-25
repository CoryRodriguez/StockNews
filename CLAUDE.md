# StockNews — Server Context

## Environments
- **This sandbox** (Claude Code): `/home/user/StockNews` — git repo, make code changes here
- **VPS (server1)**: `/opt/stocknews/` — live deployment, pull from git then restart services

## VPS Architecture
- **Domain**: isitabuy.com
- **Host**: Namecheap VPS (server1)
- **Central reverse proxy**: `/opt/proxy/` — handles ports 80/443 for ALL domains
- **StockNews app**: `/opt/stocknews/` — backend, frontend, postgres (no host port exposure)
- **Other project**: `/opt/doihold/` — separate app proxied through same proxy

## Traffic flow
```
Internet → proxy-nginx (80/443) → stocknews-frontend-1:80  (frontend)
                                → stocknews-backend-1:3001  (API /api/)
                                → stocknews-backend-1:3001  (WebSocket /ws)
```

## Key paths on VPS
- Proxy nginx config: `/opt/proxy/nginx/nginx.conf`
- Proxy SSL certs:    `/opt/proxy/certs/live/isitabuy.com/`
- Certbot webroot:    `/opt/proxy/certbot-www/`
- App config:         `/opt/stocknews/docker-compose.yml`
- App nginx config:   `/opt/stocknews/nginx/nginx.conf` (internal only, not used for routing)

## Docker commands (run on VPS)
- Proxy logs:    `docker logs proxy-nginx --tail 50`
- App logs:      `docker compose -f /opt/stocknews/docker-compose.yml logs -f`
- Restart proxy: `docker compose -f /opt/proxy/docker-compose.yml restart nginx`
- Restart app:   `docker compose -f /opt/stocknews/docker-compose.yml restart`
- List all:      `docker ps`

## Nginx (proxy)
- Test config:   `docker exec proxy-nginx nginx -t`
- Reload:        `docker exec proxy-nginx nginx -s reload`

## Known issues
- doihold.com HTTPS block uses isitabuy.com certs — needs its own cert
- /ws WebSocket location missing from proxy nginx — needs to be added

## Deployment workflow
1. Make code changes in this sandbox
2. Commit and push to git
3. On VPS: `cd /opt/stocknews && git pull`
4. Rebuild if needed: `docker compose build && docker compose up -d`

## Rules
- Always run `nginx -t` before reloading nginx
- Check docker logs before assuming a service is down
- Never read or modify .env files without explicit instruction
- Confirm before pushing git changes or restarting production services
