# SSL Certificates

Place your SSL certificate files here:

```
certs/
├── server.key    ← private key
└── server.cert   ← certificate
```

## Generate self-signed certificates (development only)

Run this command from the project root:

```bash
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.cert -days 365 -nodes -subj "/CN=localhost"
```

## Production

In production, use certificates issued by a trusted CA (e.g. Let's Encrypt).
Never commit real private keys to source control — certs/*.key is in .gitignore.
