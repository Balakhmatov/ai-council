#!/usr/bin/env python3
"""Configure Timeweb SMTP without displaying or storing a password in shell history."""
import getpass
import json
import os
from pathlib import Path
import shutil
import smtplib
import ssl
import subprocess
import sys
import time


def main():
    if os.geteuid() != 0:
        sys.exit('Запустите команду от root на сервере Кворума.')
    target = Path('/etc/quorum/quorum.env')
    if not target.exists():
        sys.exit('Не найден /etc/quorum/quorum.env. Сначала установите Кворум.')
    password = getpass.getpass('Пароль ящика businesspulse@cityai.site (ввод скрыт): ')
    if not password:
        sys.exit('Пароль пустой. Конфигурация не изменена.')
    print('Проверяем подключение к SMTP Timeweb…')
    try:
        with smtplib.SMTP_SSL('smtp.timeweb.ru', 465, timeout=15, context=ssl.create_default_context()) as smtp:
            smtp.login('businesspulse@cityai.site', password)
    except smtplib.SMTPAuthenticationError:
        sys.exit('Timeweb отклонил вход. Проверьте пароль почтового ящика. Конфигурация не изменена.')
    except Exception:
        sys.exit('Не удалось подключиться к SMTP Timeweb. Конфигурация не изменена.')
    result = subprocess.run(['node', '--input-type=module', '-e',
        'import fs from "node:fs"; import {parseEnv} from "node:util"; process.stdout.write(JSON.stringify(parseEnv(fs.readFileSync("/etc/quorum/quorum.env","utf8"))));'],
        check=True, capture_output=True, text=True)
    config = json.loads(result.stdout)
    config.update(SMTP_HOST='smtp.timeweb.ru', SMTP_PORT='465',
                  SMTP_USER='businesspulse@cityai.site', SMTP_PASSWORD=password,
                  EMAIL_FROM='Кворум <businesspulse@cityai.site>')
    backup = target.with_name('quorum.env.before-smtp-' + str(time.time_ns()))
    shutil.copy2(target, backup)
    backup.chmod(0o600)
    temporary = target.with_name('quorum.env.smtp.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write(''.join(k + '=' + json.dumps(v, ensure_ascii=False) + '\n' for k, v in config.items()))
    os.replace(temporary, target)
    subprocess.run(['systemctl', 'restart', 'quorum-api'], check=True)
    print('SMTP проверен. Настройки сохранены, Кворум перезапущен. Попробуйте вход по email на сайте.')


if __name__ == '__main__':
    main()
