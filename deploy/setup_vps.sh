#!/bin/bash
# ==============================================================================
# cTrader AI Trading Hub - VPS Ubuntu Automated Setup & Deployment Script
# Supports Ubuntu 22.04 LTS, 24.04 LTS, 26.04+
# Installs: .NET 8 SDK, Spotware cTrader CLI, Python venv, Node.js, Nginx, Systemd
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================================${NC}"
echo -e "${GREEN}   [+] cTrader AI Trading Hub - Linux Ubuntu Automated Deployment${NC}"
echo -e "${BLUE}====================================================================${NC}"
echo ""

# 1. Verify Root Privileges
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}[ERROR] Vui lòng chạy script với quyền root (hoặc sudo bash $0)${NC}"
    exit 1
fi

APP_DIR="/opt/ctrader-ai-hub"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

echo -e "${YELLOW}[1/8] Updating Ubuntu packages and installing core tools...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get --fix-broken install -y
apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    file \
    git \
    tar \
    gzip \
    unzip \
    ufw \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    libicu-dev \
    nginx

# 2. Install .NET 8 SDK / Runtime (Required for cTrader CLI & cBots)
echo -e "${YELLOW}[2/8] Checking & Installing .NET 8 SDK / Runtime...${NC}"
if ! command -v dotnet &> /dev/null || ! dotnet --list-runtimes | grep -q "Microsoft.NETCore.App 8."; then
    echo -e "${BLUE}Installing .NET 8 SDK...${NC}"
    apt-get install -y dotnet-sdk-8.0 || {
        echo -e "${YELLOW}APT dotnet-sdk-8.0 failed. Using official Microsoft install script...${NC}"
        curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 8.0 --install-dir /usr/share/dotnet
        ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet
    }
fi
echo -e "${GREEN}[OK] .NET runtime: $(dotnet --version 2>/dev/null || echo 'installed')${NC}"

# 3. Install Spotware cTrader CLI (Official Linux Package)
echo -e "${YELLOW}[3/8] Installing Spotware cTrader CLI...${NC}"
ARCH=$(uname -m)
CTR_DIR="/opt/ctrader-cli"

if ! command -v ctrader-cli &> /dev/null; then
    mkdir -p "$CTR_DIR"
    if [ "$ARCH" = "x86_64" ]; then
        CLI_URL="https://getctrader.spotware.com/cli/homebrew/ctrader-cli-5.9.0-linux-x64.tar.gz"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        CLI_URL="https://getctrader.spotware.com/cli/homebrew/ctrader-cli-5.9.0-linux-arm64.tar.gz"
    else
        CLI_URL="https://getctrader.spotware.com/cli/homebrew/ctrader-cli-5.9.0-linux-x64.tar.gz"
    fi

    echo -e "${BLUE}Downloading official cTrader CLI from Spotware CDN...${NC}"
    if curl -fsSL "$CLI_URL" -o /tmp/ctrader-cli.tar.gz; then
        tar -xzf /tmp/ctrader-cli.tar.gz -C "$CTR_DIR"
        rm -f /tmp/ctrader-cli.tar.gz
        ln -sf "$CTR_DIR/ctrader-cli" /usr/local/bin/ctrader-cli
        chmod +x /usr/local/bin/ctrader-cli "$CTR_DIR/ctrader-cli"
        # Grant execute permissions to native host processes (algohost.netcore)
        find "$CTR_DIR" -type f -name "algohost.netcore" -exec chmod +x {} + 2>/dev/null || true
        find "$CTR_DIR" -type f -name "createdump" -exec chmod +x {} + 2>/dev/null || true
        # Ensure .NET 8 rolls forward for .NET 6 binaries
        python3 -c "
import glob, json
for p in glob.glob('$CTR_DIR/**/*.runtimeconfig.json', recursive=True):
    try:
        with open(p, 'r') as f:
            d = json.load(f)
        if 'runtimeOptions' in d:
            d['runtimeOptions']['rollForward'] = 'Major'
            with open(p, 'w') as f:
                json.dump(d, f, indent=2)
    except Exception:
        pass
" 2>/dev/null || true
    else
        echo -e "${YELLOW}Direct download failed. Checking Homebrew...${NC}"
        if command -v brew &> /dev/null; then
            brew tap spotware/tap https://github.com/spotware/homebrew-tap
            brew install spotware/tap/ctrader-cli
            ln -sf "$(brew --prefix)/bin/ctrader-cli" /usr/local/bin/ctrader-cli
        fi
    fi
fi

if command -v ctrader-cli &> /dev/null; then
    echo -e "${GREEN}[OK] cTrader CLI installed: $(ctrader-cli --version 2>/dev/null || echo 'Ready')${NC}"
else
    echo -e "${RED}[WARN] cTrader CLI binary could not be initialized automatically. Please check network.${NC}"
fi

# 4. Install Node.js LTS (for building frontend)
echo -e "${YELLOW}[4/8] Checking Node.js and npm...${NC}"
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo -e "${BLUE}Installing Node.js 20.x LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo -e "${GREEN}[OK] Node: $(node -v) | NPM: $(npm -v)${NC}"

# 5. Setup Python Virtual Environment and Install Dependencies
echo -e "${YELLOW}[5/8] Configuring Python Virtual Environment...${NC}"
if [ ! -d "$APP_DIR/venv" ]; then
    python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install --upgrade pip
if [ -f "$APP_DIR/requirements.txt" ]; then
    "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"
fi
echo -e "${GREEN}[OK] Python dependencies installed successfully.${NC}"

# 6. Build React Frontend for Production
echo -e "${YELLOW}[6/8] Building React Frontend for Production...${NC}"
if [ -d "$APP_DIR/frontend" ]; then
    cd "$APP_DIR/frontend"
    npm install --silent
    npm run build
    cd "$APP_DIR"
    echo -e "${GREEN}[OK] Frontend built to $APP_DIR/frontend/dist${NC}"
else
    echo -e "${YELLOW}[WARN] No frontend folder found in $APP_DIR${NC}"
fi

# 7. Configure Nginx Reverse Proxy
echo -e "${YELLOW}[7/8] Configuring Nginx Web Server...${NC}"
if [ -f "$APP_DIR/deploy/nginx_ctrader_hub.conf" ]; then
    cp "$APP_DIR/deploy/nginx_ctrader_hub.conf" /etc/nginx/sites-available/ctrader-hub
    ln -sf /etc/nginx/sites-available/ctrader-hub /etc/nginx/sites-enabled/ctrader-hub
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx || systemctl restart nginx
    echo -e "${GREEN}[OK] Nginx configured and active on Port 80.${NC}"
fi

# 8. Configure Systemd Service & Firewall
echo -e "${YELLOW}[8/8] Configuring Systemd Service and Firewall...${NC}"
if [ -f "$APP_DIR/deploy/ctrader-hub.service" ]; then
    cp "$APP_DIR/deploy/ctrader-hub.service" /etc/systemd/system/ctrader-hub.service
    systemctl daemon-reload
    systemctl enable ctrader-hub
    systemctl restart ctrader-hub
    echo -e "${GREEN}[OK] ctrader-hub.service is enabled and running.${NC}"
fi

# Allow HTTP and SSH in UFW firewall
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true

echo ""
echo -e "${GREEN}====================================================================${NC}"
echo -e "${GREEN}   [SUCCESS] cTrader AI Trading Hub is now live on this VPS!${NC}"
echo -e "${BLUE}   - Web Dashboard:   http://$(curl -s https://api.ipify.org || echo 'YOUR_VPS_IP')${NC}"
echo -e "${BLUE}   - FastAPI Backend: http://127.0.0.1:8181${NC}"
echo -e "${BLUE}   - Service Status:  systemctl status ctrader-hub${NC}"
echo -e "${BLUE}   - Service Logs:    journalctl -u ctrader-hub -f -n 50${NC}"
echo -e "${GREEN}====================================================================${NC}"
