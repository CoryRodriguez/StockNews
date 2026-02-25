# StockNews VPS — Server Context

## Stack
- **Domain**: isitabuy.com
- **OS**: Ubuntu on Namecheap VPS
- **Project root**: /home/user/StockNews
- **Services**: Docker Compose — postgres, backend (Node/port 3001), frontend, nginx

## Docker
- Start: `docker compose -f /home/user/StockNews/docker-compose.yml up -d`
- Stop: `docker compose -f /home/user/StockNews/docker-compose.yml down`
- Restart service: `docker compose -f /home/user/StockNews/docker-compose.yml restart <service>`
- Logs: `docker logs <container> --tail 50`
- List containers: `docker ps`

## Nginx
- Config: `/home/user/StockNews/nginx/nginx.conf`
- Certs: `/home/user/StockNews/nginx/certs/`
- Test config: `docker exec stocknews-nginx-1 nginx -t`
- Reload: `docker exec stocknews-nginx-1 nginx -s reload`

## SSL
- Certs not yet set up — need to run certbot for isitabuy.com
- Certbot volume: stocknews_certbot_www
- After getting certs, uncomment the HTTPS server block in nginx/nginx.conf

## Rules
- Always run `nginx -t` before reloading nginx
- Check docker logs before assuming a service is down
- Never read or modify .env files without explicit instruction
- Confirm before pushing any git changes
