#!/bin/bash
# generate-certs.sh
# Generates a self-signed SSL certificate for local development.
#
# Usage — run from the PROJECT ROOT (not from inside certs/):
#   bash certs/generate-certs.sh
#
# In production replace these files with real certs from
# Let's Encrypt, AWS ACM, or your CA.

# Always resolve certs/ relative to the project root
# regardless of where the script is called from
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$PROJECT_ROOT/certs"

echo "Project root : $PROJECT_ROOT"
echo "Cert output  : $CERT_DIR"
echo ""

# Create certs/ if it somehow doesn't exist
mkdir -p "$CERT_DIR"

# Generate private key + self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.cert" \
  -days 365 \
  -subj "/C=US/ST=Dev/L=Local/O=RoboAdvisor/CN=localhost"

# Confirm files were created
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
  echo "❌  Generation failed. Make sure openssl is installed:"
  echo "    Windows : install Git Bash or OpenSSL for Windows"
  echo "    Mac     : brew install openssl"
  echo "    Linux   : sudo apt install openssl"
  exit 1
fi
