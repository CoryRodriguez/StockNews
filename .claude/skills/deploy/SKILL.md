---
name: deploy
description: Commit, push, and deploy StockNews to the live VPS at isitabuy.com
---

Deploy the current changes to the live VPS. Follow these steps exactly:

## 1. Commit & push
- Run `git status` to see what's changed
- Stage all modified tracked files: `git add -u`
- If there are untracked files that belong in the build, stage those too
- Commit with a concise message describing the changes
- Push to `origin master`

## 2. SSH into VPS and deploy
Use Python paramiko (already installed) to SSH in. Always use this pattern:

```python
import paramiko, os
os.environ['PYTHONIOENCODING'] = 'utf-8'
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('159.198.44.6', username='root', password='F7yg9KiPFrK106kQ6h', timeout=30)
_, stdout, _ = client.exec_command('COMMAND 2>&1')
stdout.channel.recv_exit_status()
print(stdout.read().decode('utf-8', errors='replace'))
client.close()
```

Run these commands on the VPS in order:
1. `cd /opt/stocknews && git pull origin master`
2. `cd /opt/stocknews && docker compose build` — set timeout=300, show last 15 lines of output
3. `cd /opt/stocknews && docker compose up -d`
4. Wait 3 seconds, then `cd /opt/stocknews && docker compose logs --tail=15 backend` to confirm healthy startup

## 3. Confirm
Report back: what was committed, exit codes from each step, and the final backend log lines.
If any step fails (non-zero exit code), stop and report the full error.
