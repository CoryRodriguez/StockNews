# StockNews — Server Context

## Environments
- **This sandbox** (Claude Code): `/home/user/StockNews` — git repo, make code changes here
- **VPS (server1)**: `/opt/stocknews/` — live deployment, pull changes here after pushing

## VPS
- **Domain**: isitabuy.com
- **Host**: Namecheap VPS (`server1`)
- **Project root on VPS**: `/opt/stocknews/`
- **Other projects on VPS**: `/opt/doihold/`, `/opt/proxy/`

## Stack
- Docker Compose: postgres, backend (Node/port 3001), frontend, nginx
- Nginx config: `/opt/stocknews/nginx/nginx.conf`
- SSL certs: `/opt/stocknews/nginx/certs/`

## Key Docker commands (run on VPS)
- Start: `docker compose -f /opt/stocknews/docker-compose.yml up -d`
- Stop: `docker compose -f /opt/stocknews/docker-compose.yml down`
- Restart service: `docker compose -f /opt/stocknews/docker-compose.yml restart <service>`
- Logs: `docker logs <container> --tail 50`
- List containers: `docker ps`

## Nginx (run on VPS)
- Test config: `docker exec $(docker ps -qf name=nginx) nginx -t`
- Reload: `docker exec $(docker ps -qf name=nginx) nginx -s reload`

## SSL
- Certs not yet configured — need certbot for isitabuy.com
- Certbot volume: stocknews_certbot_www
- HTTPS server block in nginx.conf is commented out — enable after certs are in place

## Deployment workflow
1. Make changes in this sandbox
2. Commit and push to git
3. On VPS: `git pull` in `/opt/stocknews/`, then restart affected services

## Rules
- Always run `nginx -t` before reloading nginx
- Check docker logs before assuming a service is down
- Never read or modify .env files without explicit instruction
- Confirm before pushing git changes or restarting production services
