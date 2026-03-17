#!/bin/bash
# generate-certs.sh
# Generates a self-signed SSL certificate for local development.
#
# Usage — run from the PROJECT ROOT:
#   bash certs/generate-certs.sh

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$PROJECT_ROOT/certs"

echo "Project root : $PROJECT_ROOT"
echo "Cert output  : $CERT_DIR"
echo ""

mkdir -p "$CERT_DIR"

# Detect openssl location — Windows Git Bash often has it in a non-standard path
OPENSSL_CMD=""
for candidate in \
  "openssl" \
  "/usr/bin/openssl" \
  "/mingw64/bin/openssl" \
  "/c/Program Files/Git/usr/bin/openssl" \
  "/c/Program Files/OpenSSL-Win64/bin/openssl" \
  "/c/OpenSSL-Win64/bin/openssl"
do
  if command -v "$candidate" &>/dev/null 2>&1 || [ -f "$candidate" ]; then
    OPENSSL_CMD="$candidate"
    break
  fi
done

if [ -z "$OPENSSL_CMD" ]; then
  echo "❌  openssl not found. Install it:"
  echo "    Windows : Git Bash already includes it — make sure Git is installed"
  echo "              OR download from https://slproweb.com/products/Win32OpenSSL.html"
  echo "    Mac     : brew install openssl"
  echo "    Linux   : sudo apt install openssl"
  exit 1
fi

echo "Using openssl: $OPENSSL_CMD"
echo ""

# Write the config to a temp file to avoid -subj issues on Windows
CONF_FILE="$CERT_DIR/openssl-san.cnf"

cat > "$CONF_FILE" << EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = US
ST = Dev
L  = Local
O  = RoboAdvisor
CN = localhost

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
EOF

# Generate key + cert using config file (avoids -subj Windows issues)
"$OPENSSL_CMD" req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.cert" \
  -days 365 \
  -config "$CONF_FILE" 2>&1

# Remove temp config
rm -f "$CONF_FILE"

# Verify output
if [ -f "$CERT_DIR/server.key" ] && [ -f "$CERT_DIR/server.cert" ]; then
  echo ""
  echo "✅  Generated successfully:"
  echo "    $CERT_DIR/server.key"
  echo "    $CERT_DIR/server.cert"
  echo ""
  echo "⚠️   Self-signed certs for LOCAL DEV only."
  echo "    Your browser will warn — click Advanced → Proceed to localhost."
  echo "    Replace with real certificates before deploying to production."
else
  echo ""
  echo "❌  Files were not created. openssl may have failed silently."
  echo "    Try running manually:"
  echo "    openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/server.key -out certs/server.cert -days 365 -subj \"/CN=localhost\""
  exit 1
fi