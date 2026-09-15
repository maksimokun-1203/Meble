import paramiko
import tarfile
import os
import sys

# Налаштування
HOST = "194.28.86.88"
PORT = 22
USER = "root"
PASSWORD = "G^b22u5t#98A1Y"
ARCHIVE_NAME = "viyar_deploy_temp.tar.gz"

def create_archive():
    print("Stvorennya archivu proektu...")
    def exclude_filter(tarinfo):
        # Exclude unnecessary directories
        exclude_dirs = ['.git', '__pycache__', '.venv', '.agents']
        for exc in exclude_dirs:
            if exc in tarinfo.name:
                return None
        return tarinfo

    with tarfile.open(ARCHIVE_NAME, "w:gz") as tar:
        tar.add(".", arcname=".", filter=exclude_filter)
    print("Archiv stvoreno.")

def deploy():
    print(f"Pidkljuchennya do {HOST}...")
    
    # Ініціалізація SSH клієнта
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
        print("Pidkljucheno uspeshno!")
        
        # Завантаження файлу через SFTP
        print("Zavantazhennya archivu na server...")
        sftp = ssh.open_sftp()
        sftp.put(ARCHIVE_NAME, f"/tmp/{ARCHIVE_NAME}")
        sftp.close()
        print("Archiv zavantazheno.")
        
        # Виконання команд на сервері
        print("Vikonannya scriptu rozhortannya na serveri...")
        commands = f"mkdir -p /opt/ViyarApp && tar -xzf /tmp/{ARCHIVE_NAME} -C /opt/ViyarApp && rm -f /tmp/{ARCHIVE_NAME} && cd /opt/ViyarApp && chmod +x deploy.sh backup.sh && ./deploy.sh"
        
        stdin, stdout, stderr = ssh.exec_command(commands)
        
        # Виводимо логи в реальному часі
        exit_status = stdout.channel.recv_exit_status()
        
        for line in stdout.read().decode('utf-8').splitlines():
            print(line)
            
        err = stderr.read().decode('utf-8')
        if err:
            print("Errors / Warnings:")
            print(err)
            
        if exit_status == 0:
            print(f"\nROZHORTANNYA USPESHNE! Dodatok dostupny za adresou: http://{HOST}/")
        else:
            print(f"\nPOMYLKA rozhortannya. Exit code: {exit_status}")
            
    except Exception as e:
        print(f"Pomylka: {e}")
    finally:
        ssh.close()
        # Видаляємо локальний архів
        if os.path.exists(ARCHIVE_NAME):
            os.remove(ARCHIVE_NAME)

if __name__ == "__main__":
    create_archive()
    deploy()
