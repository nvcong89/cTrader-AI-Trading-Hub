import os
import sys
import paramiko

def setup_key():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vps_file = os.path.join(base_dir, "VPS_Linux.txt")
    if not os.path.exists(vps_file):
        print(f"[ERROR] Không tìm thấy {vps_file}")
        sys.exit(1)

    config = {}
    with open(vps_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                config[k.strip().upper()] = v.strip()

    ip = config.get("IP")
    user = config.get("USERNAME", "root")
    password = config.get("PASSWORD")
    port = int(config.get("PORT_SSH", 22))

    ssh_dir = os.path.expanduser("~/.ssh")
    os.makedirs(ssh_dir, exist_ok=True)
    pub_key_path = os.path.join(ssh_dir, "id_ed25519.pub")
    if not os.path.exists(pub_key_path):
        pub_key_path = os.path.join(ssh_dir, "id_rsa.pub")
    
    if not os.path.exists(pub_key_path):
        print("[INFO] Tạo SSH Key mới trên máy tính...")
        os.system(f'ssh-keygen -t ed25519 -N "" -f "{os.path.join(ssh_dir, "id_ed25519")}"')
        pub_key_path = os.path.join(ssh_dir, "id_ed25519.pub")

    pub_key = open(pub_key_path, "r", encoding="utf-8").read().strip()

    print(f"[INFO] Đang thiết lập SSH Public Key lên VPS {user}@{ip}:{port}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(ip, port=port, username=user, password=password, timeout=10)
        cmd = f"mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qF '{pub_key}' ~/.ssh/authorized_keys 2>/dev/null || echo '{pub_key}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
        client.exec_command(cmd)
        print("[OK] Đã cấu hình SSH Key trên VPS thành công! Mọi kết nối từ nay không cần password.")
    except Exception as e:
        print(f"[WARN] Không thể tự động đẩy SSH key qua paramiko: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    setup_key()
