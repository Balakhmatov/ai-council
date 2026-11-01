from pathlib import Path
import shutil,subprocess,os,pwd,grp
src=Path('/root/ai-council');dest=Path('/opt/quorum')
try:pwd.getpwnam('quorum')
except KeyError:subprocess.run(['useradd','--system','--home-dir','/var/lib/quorum','--shell','/usr/sbin/nologin','quorum'],check=True)
uid=pwd.getpwnam('quorum').pw_uid;gid=grp.getgrnam('quorum').gr_gid
for folder in [dest,Path('/var/lib/quorum'),Path('/etc/quorum')]:folder.mkdir(parents=True,exist_ok=True)
os.chown('/var/lib/quorum',uid,gid);os.chmod('/var/lib/quorum',0o700);os.chmod('/etc/quorum',0o700)
for name in ['server.mjs','email-auth.mjs','password-auth.mjs','auth-sessions.mjs','telegram.mjs','economy.mjs','history.mjs','fx.mjs','package.json','package-lock.json']:
 shutil.copy2(src/name,dest/name);os.chmod(dest/name,0o644)
subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=dest,check=True)
for name in ['public','scripts']:
 shutil.copytree(src/name,dest/name,dirs_exist_ok=True)
 for item in (dest/name).rglob('*'):os.chmod(item,0o755 if item.is_dir() else 0o644)
# Build the private service configuration without printing values.
subprocess.run(['/usr/bin/node','--input-type=module','-e',r'''
import fs from 'node:fs';import {parseEnv} from 'node:util';import crypto from 'node:crypto';
const target='/etc/quorum/quorum.env';
const source=fs.existsSync(target)?target:'/root/ai-council/.env.private';const config=parseEnv(fs.readFileSync(source,'utf8'));
// Migrate the existing server-pinned OpenAI model without touching credentials or custom newer models.
if(!config.OPENAI_MODEL||/^gpt-(?:4|5)(?:[.-]|$)/.test(config.OPENAI_MODEL))config.OPENAI_MODEL='gpt-6-luna';
if(!config.MISTRAL_MODEL||config.MISTRAL_MODEL==='mistral-large-4'||config.MISTRAL_MODEL==='mistral-large-latest'||config.MISTRAL_MODEL==='mistral-small-latest')config.MISTRAL_MODEL='mistral-large-2512';
config.QUOTA_FILE='/var/lib/quorum/quota.json';config.ACCOUNTING_FILE='/var/lib/quorum/accounting.json';config.HISTORY_FILE='/var/lib/quorum/history.json';
config.SESSION_FILE='/var/lib/quorum/sessions.enc';config.PASSWORD_FILE='/var/lib/quorum/passwords.json';
config.ACCOUNT_MONTHLY_TASKS=(!config.ACCOUNT_MONTHLY_TASKS||config.ACCOUNT_MONTHLY_TASKS==='5')?'10':config.ACCOUNT_MONTHLY_TASKS;delete config.FREE_START_TASKS;delete config.GUEST_DAILY_TASKS;delete config.PUBLIC_IP_DAILY_LIMIT;delete config.FREE_START_COINS;delete config.TASK_COIN_COST;config.TELEGRAM_STATE_FILE='/var/lib/quorum/telegram-updates.json';
config.TELEGRAM_ADMIN_IDS=config.TELEGRAM_ADMIN_IDS||'1296951270';config.TELEGRAM_APP_URL='https://cityai.site/quorum/';
// Owner email stays in the private service configuration (not public HTML).
// This allowlist is only checked against an authenticated email session.
config.QUORUM_ADMIN_EMAILS=[...new Set(
  (String(config.QUORUM_ADMIN_EMAILS||'')+',ilya.balakhmatov@gmail.com')
  .replaceAll(';',',').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)
)].join(',');
config.TELEGRAM_WEBHOOK_SECRET=config.TELEGRAM_WEBHOOK_SECRET||crypto.randomBytes(32).toString('hex');
config.ALLOWED_ORIGINS=[...new Set((config.ALLOWED_ORIGINS||'').split(',').concat(['https://cityai.site','https://stage.cityai.site','https://balakhmatov.github.io']))].filter(Boolean).join(',');
const tokenFile='/root/ai-council/.telegram-token';
if(fs.existsSync(tokenFile)){const token=fs.readFileSync(tokenFile,'utf8').trim();if(!/^\d+:[a-zA-Z0-9_-]{20,}$/.test(token))throw Error('Invalid bot token format');config.TELEGRAM_BOT_TOKEN=token;}
fs.writeFileSync(target,Object.entries(config).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
'''],check=True)
old=src/'runtime/quota.json';new=Path('/var/lib/quorum/quota.json')
if old.exists() and not new.exists():shutil.copy2(old,new);os.chown(new,uid,gid);os.chmod(new,0o600)
# Add only the isolated application route to the existing HTTPS site.
nginx=Path('/etc/nginx/sites-enabled/cityai').resolve();before=nginx.read_text();changed='location ^~ /quorum/' not in before
if changed:
 shutil.copy2(nginx,src/'deploy/nginx-before-vps.backup')
 block='''    location = /quorum { return 301 /quorum/; }
    location ^~ /quorum/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 125s;
        proxy_send_timeout 125s;
        proxy_buffering off;
        client_max_body_size 150k;
    }

'''
 anchor='    location /uploads/ {'
 if anchor not in before:raise RuntimeError('Unexpected nginx configuration')
 nginx.write_text(before.replace(anchor,block+anchor,1))
try:subprocess.run(['nginx','-t'],check=True)
except:
 if changed:nginx.write_text(before)
 raise
shutil.copy2(src/'deploy/quorum-api.service','/etc/systemd/system/quorum-api.service')
shutil.copy2(src/'deploy/quorum-deploy.service','/etc/systemd/system/quorum-deploy.service')
shutil.copy2(src/'deploy/quorum-deploy.timer','/etc/systemd/system/quorum-deploy.timer')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','quorum-deploy.timer'],check=True)
subprocess.run(['systemctl','enable','quorum-api.service'],check=True)
subprocess.run(['systemctl','restart','quorum-api.service'],check=True)
subprocess.run(['systemctl','reload','nginx'],check=True)
subprocess.run(['systemctl','is-active','quorum-api.service'],check=True)
# The deploy controller records the revision only after HTTP readiness succeeds.
print('Quorum installed at https://cityai.site/quorum/; auto-deploy timer enabled; private credentials not displayed.')

